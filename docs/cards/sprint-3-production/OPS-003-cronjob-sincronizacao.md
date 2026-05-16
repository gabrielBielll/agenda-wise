# [OPS-003] Cronjob de sincronização de status (sair do startup)

**Severidade:** 🟡 Medium
**Sprint:** 3
**Esforço:** M (meio dia)
**Área:** Backend / Infra
**Status:** TODO

## Contexto

Hoje há dois mecanismos de sincronização de status de agendamentos:

1. **No boot** — `sincronizar-status-global!` atualiza TODOS os agendamentos passados de TODAS as clínicas (`status: 'agendado' → 'realizado'`, `status_pagamento: 'pendente' → 'pago'`)
2. **Sob demanda** — endpoint `POST /api/agendamentos/sincronizar` chamado pelo frontend ao acessar a página de Financeiro

Problemas:
- No boot: não escala (milhares de rows, locks na tabela), só roda quando reinicia
- Sob demanda: gera latência desnecessária na navegação do usuário, e só atualiza a clínica logada (não as outras)

Esse comportamento está documentado em [TECHNICAL_NOTES.md](../../../TECHNICAL_NOTES.md) como dívida técnica conhecida.

## Solução proposta

Mover a sincronização para um job agendado independente da aplicação.

### Opção A — Render cron jobs (recomendado se em Render)

`render.yaml`:
```yaml
services:
  # ... web services ...

  - type: cron
    name: sincronizar-status
    runtime: docker
    dockerfilePath: ./deep-saude-plataforma-api/deep-saude-backend/Dockerfile
    schedule: "*/15 * * * *"  # a cada 15min
    dockerCommand: ["lein", "run", "cron:sincronizar"]
    envVars:
      - key: DATABASE_URL
        sync: false
```

No `core.clj`, adicionar handler de CLI:

```clojure
(defn -main [& args]
  (case (first args)
    "cron:sincronizar" (do (init-sentry!)
                           (sincronizar-status-global!)
                           (println "Sincronização concluída")
                           (System/exit 0))
    "migrate"          (migratus/migrate (load-config))
    (start-server)))
```

### Opção B — quartzite (in-process scheduler no backend)

```clojure
[clojurewerkz/quartzite "2.2.0"]
```

```clojure
(require '[clojurewerkz.quartzite.scheduler :as qs]
         '[clojurewerkz.quartzite.triggers :as t]
         '[clojurewerkz.quartzite.schedule.cron :as cron]
         '[clojurewerkz.quartzite.jobs :as j])

(j/defjob SincronizarStatusJob [_ctx]
  (sincronizar-status-global!))

(defn schedule-jobs! []
  (let [scheduler (qs/start (qs/initialize))
        job (j/build (j/of-type SincronizarStatusJob) (j/with-identity "sync-status"))
        trigger (t/build (t/with-identity "sync-status-trigger")
                          (t/with-schedule (cron/schedule (cron/cron-schedule "0 */15 * * * ?"))))]
    (qs/schedule scheduler job trigger)))
```

**Vantagem:** sem infra extra. **Desvantagem:** se a app tiver várias instâncias, vai rodar várias vezes (precisa coordenação ou leader election).

### Opção C — pgcron (no banco)

Se CockroachDB Cloud não suporta `pg_cron`, descartar. Para Postgres puro, é a opção mais elegante:

```sql
SELECT cron.schedule('sincronizar-status', '*/15 * * * *', $$
  UPDATE agendamentos
  SET status = 'realizado'
  WHERE data_hora_sessao < NOW()
    AND (status IS NULL OR status = 'agendado');

  UPDATE agendamentos
  SET status_pagamento = 'pago'
  WHERE data_hora_sessao < NOW()
    AND status != 'cancelado'
    AND (status_pagamento IS NULL OR status_pagamento = 'pendente');
$$);
```

### Recomendação

**Opção A (Render cron)** se em Render. Simples, isolado, escala junto com a plataforma.

### Limpeza

Após cronjob em produção:
- Remover chamada de `sincronizar-status-global!` do `init-db`
- Remover endpoint `POST /api/agendamentos/sincronizar` (ou manter como fallback opcional sem chamar no frontend)
- Atualizar [TECHNICAL_NOTES.md](../../../TECHNICAL_NOTES.md)

### Bonus: outras tarefas pro cronjob

Aproveitar a infra de cron pra outras coisas que vão precisar:
- Limpeza de `idempotency_keys` > 24h ([ROB-006](../sprint-2-robustness/ROB-006-double-click-protection.md))
- Lembretes de sessão por email (futuro)
- Backups de banco (se não for nativo do provider)

## Critérios de aceitação

- [ ] Cronjob rodando a cada 15min na plataforma de deploy
- [ ] `sincronizar-status-global!` removida do startup
- [ ] Endpoint manual mantido apenas como recurso de admin (não chamado pelo frontend)
- [ ] TECHNICAL_NOTES.md atualizado
- [ ] Smoke test: criar agendamento no passado com status 'agendado', esperar próxima execução do cron, conferir que ficou 'realizado'

## Riscos / dependências

- **Dependência forte:** [OPS-001](OPS-001-decidir-deploy.md) — opção depende da plataforma escolhida.
- **Atenção:** se múltiplas instâncias do backend rodam in-process scheduler (Opção B), garantir leader election ou usar advisory lock no DB.
- **Cuidado com idempotência:** o SQL deve ser idempotente (`status = 'agendado'` antes de mudar pra `realizado`). Já está, mas verificar antes de mover.

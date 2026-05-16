# [ROB-004] Migrar para Migratus (versionamento de schema)

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** L (1-2 dias)
**Área:** Backend / Infra
**Status:** TODO

## Contexto

Hoje a evolução de schema é feita por:

1. Arquivos `.sql` na raiz (`setup_db.sql`, `update_schema.sql`, `add_observacoes.sql`, `add_recorrencia_id.sql`) — execução manual
2. Função `init-db` no backend ([core.clj:1224-1287](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1224-L1287)) — `ALTER TABLE IF NOT EXISTS` rodando em todo boot

Problemas:
- Sem versão registrada (não dá pra saber qual schema está em qual ambiente)
- Sem rollback (se um ALTER quebrar produção, não há ferramenta)
- Risco de lock em tabelas grandes (ALTER TABLE no boot pode travar leituras)
- Vários paths divergentes (dev pode rodar setup_db.sql, prod nunca rodou)
- `ALTER TABLE` no boot é antipattern: aplicação roda migrations, em vez de ferramenta dedicada

## Solução proposta

### Passo 1 — adicionar Migratus

`project.clj`:
```clojure
[migratus "1.5.7"]
```

`migratus.edn` (ou config no `core.clj`):
```clojure
{:store :database
 :migration-dir "migrations/"
 :db {:dbtype "postgresql" :jdbcUrl (System/getenv "DATABASE_URL")}}
```

### Passo 2 — capturar estado atual

Gerar uma migration "baseline" que representa o schema atual:

```bash
# Dump apenas do schema do banco atual (estado conhecido bom)
pg_dump --schema-only --no-owner --no-privileges $DATABASE_URL > baseline.sql
```

Criar `migrations/20260515000000-baseline.up.sql` com o conteúdo.
Criar `migrations/20260515000000-baseline.down.sql` (DROP de tudo — provavelmente vazio na prática).

Marcar como aplicada nos ambientes existentes (Migratus tem `migratus.core/init`).

### Passo 3 — converter as migrations soltas em arquivos Migratus

| Arquivo atual | Migration nova |
|---|---|
| `setup_db.sql` | absorvida no baseline |
| `update_schema.sql` | `20260515000100-update-schema-misc.up.sql` |
| `add_observacoes.sql` | `20260515000200-add-observacoes.up.sql` |
| `add_recorrencia_id.sql` | `20260515000300-add-recorrencia-id.up.sql` |
| ALTERs do `init-db` | `20260515000400-init-db-alters.up.sql` |

Cada uma com seu `.down.sql` correspondente.

### Passo 4 — remover ALTER TABLE do init-db

```clojure
;; remover de core.clj:
(execute-query! ["ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao INTEGER DEFAULT 50"])
;; ...

;; substituir por:
(defn -main [& args]
  (case (first args)
    "migrate" (migratus/migrate (load-config))
    "rollback" (migratus/rollback (load-config))
    (do
      (when-not (skip-migrate?)
        (migratus/migrate (load-config)))
      (start-server))))
```

Em produção: rodar `lein run migrate` como step separado do `lein run` (server start).

### Passo 5 — workflow novo

```bash
# Criar nova migration:
lein migratus create add-coluna-X

# Aplicar:
lein migratus migrate

# Reverter última:
lein migratus rollback
```

### Passo 6 — documentar no README

Adicionar seção "Migrações" no README do backend.

## Critérios de aceitação

- [ ] Migratus configurada e funcional em dev
- [ ] Baseline criada representando schema atual
- [ ] Migrations soltas convertidas pra arquivos Migratus com up/down
- [ ] `init-db` não roda mais `ALTER TABLE`
- [ ] README documenta o fluxo
- [ ] CI/CD ([OPS-006](../sprint-3-production/OPS-006-ci-cd.md)) roda `migratus migrate` antes do server start

## Riscos / dependências

- **Risco:** se ambientes estão divergentes (dev tem X colunas, prod tem Y), o baseline tem que ser do estado-alvo, e migrations adicionais reconciliar. Auditar antes.
- **Sequência:** rodar localmente primeiro, depois staging, depois prod. Cada uma com backup antes.
- **Dependência:** [OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md) — fluxo de migration no deploy depende da plataforma (Render tem release commands, Fly tem deploy hooks, etc.).

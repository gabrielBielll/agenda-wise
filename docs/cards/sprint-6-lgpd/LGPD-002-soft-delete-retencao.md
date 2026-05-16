# [LGPD-002] Soft delete + retenção legal CFM/LGPD

**Severidade:** 🟠 High (compliance)
**Sprint:** 6
**Esforço:** M (meio dia)
**Área:** Backend / DB
**Status:** TODO

## Contexto

Os handlers atuais fazem **hard delete**:

```clojure
;; core.clj:~726
(sql/delete! @datasource :agendamentos {:id id})
```

Problemas:

1. **CFM Resolução 1.821/2007 + Lei 13.787/2019:** prontuário deve ser preservado por **20 anos** (mínimo) após o último registro. Hard delete imediato viola a norma.
2. **LGPD art. 18, VI:** direito à eliminação tem condições — não se aplica quando há obrigação legal de guardar (saúde tem).
3. **Auditoria quebra:** após `DELETE FROM agendamentos WHERE id = ?`, o `audit_log` (LGPD-001) ainda referencia um `recurso_id` que não existe mais — perde rastreabilidade.

Solução padrão: soft delete via coluna `deleted_at TIMESTAMPTZ` + filtro em todas as queries; hard delete só por job de retenção após período legal.

## Localização

- Schema atual: [setup_db.sql](../../../setup_db.sql) — sem `deleted_at`
- Handlers que deletam:
  - `agendamentos`: [core.clj:~726, ~736](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L726)
  - `pacientes`: provavelmente similar
  - `prontuarios`: idem
  - `bloqueios_agenda`: ok deletar de verdade (não é dado de saúde)

## Solução proposta

### Passo 1 — migration

```sql
ALTER TABLE pacientes      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE agendamentos   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE prontuarios    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- também deleted_by para rastreabilidade
ALTER TABLE pacientes      ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE agendamentos   ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE prontuarios    ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- índice parcial: agendamentos ativos
CREATE INDEX IF NOT EXISTS idx_agendamentos_ativos
  ON agendamentos (clinica_id, data_hora_sessao DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_ativos
  ON pacientes (clinica_id, psicologo_id)
  WHERE deleted_at IS NULL;
```

### Passo 2 — convenção de query

**Toda** query de leitura SELECT em `agendamentos`, `pacientes`, `prontuarios` precisa `AND deleted_at IS NULL`.

Centralize em helper:

```clojure
(defn active-only [table-alias]
  (str table-alias ".deleted_at IS NULL"))

;; uso:
["SELECT * FROM agendamentos a
  WHERE a.clinica_id = ?
    AND " (active-only "a")
  clinica-id]
```

### Passo 3 — soft delete handler

```clojure
(defn deletar-agendamento-handler [request]
  (let [{:keys [usuario-id clinica-id]} (:identity request)
        id (parse-uuid (get-in request [:params :id]))]
    (jdbc/with-transaction [tx @datasource]
      (let [antes (execute-one! tx
                    ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ? AND deleted_at IS NULL"
                     id clinica-id])]
        (when antes
          (sql/update! tx :agendamentos
            {:deleted_at (java.time.Instant/now)
             :deleted_by usuario-id}
            {:id id}))
        (audit! {:clinica-id clinica-id :usuario-id usuario-id
                 :acao "DELETE_AGENDAMENTO" :recurso-tipo "agendamentos" :recurso-id id
                 :resultado (if antes "SUCCESS" "NOT_FOUND")
                 :dados-antes antes})
        (if antes
          {:status 204}
          {:status 404 :body {:erro "não encontrado"}})))))
```

### Passo 4 — restauração (undo)

Por 30 dias após soft delete, admin pode restaurar:

```
POST /api/admin/agendamentos/{id}/restaurar
```

Limpa `deleted_at`/`deleted_by`. Audit `RESTORE_AGENDAMENTO`.

### Passo 5 — job de retenção (hard delete)

Cronjob diário ([OPS-003](../sprint-3-production/OPS-003-cronjob-sincronizacao.md)):

```clojure
(defn purge-expired! []
  ;; Agendamentos podem ser hard-deletados após 5 anos de soft delete
  (jdbc/execute! @datasource
    ["DELETE FROM agendamentos
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '5 years'"])

  ;; Prontuários: 20 anos
  (jdbc/execute! @datasource
    ["DELETE FROM prontuarios
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '20 years'"])

  ;; Pacientes inativos: 20 anos após inativação (mesma janela do prontuário)
  ;; ... mas só se não houver prontuários ativos referenciando
  )
```

### Passo 6 — frontend

- Lista de agendamentos: nunca mostra `deleted_at IS NOT NULL` (já filtrado pelo backend)
- Admin tem aba "Lixeira" mostrando soft-deleted dos últimos 30 dias com botão "Restaurar"
- Indicador visual de "deletado em DD/MM/AAAA por Fulano" no detalhe

## Critérios de aceitação

- [ ] Migration adiciona `deleted_at`, `deleted_by` em `pacientes`, `agendamentos`, `prontuarios`
- [ ] Índices parciais `WHERE deleted_at IS NULL` para queries do dia-a-dia
- [ ] Todos os handlers de listagem/busca filtram `deleted_at IS NULL`
- [ ] DELETE vira UPDATE de `deleted_at`
- [ ] Endpoint de restaurar (admin)
- [ ] Job de retenção implementado (mesmo que ainda não tenha registros para purgar)
- [ ] Documentação `docs/lgpd/retencao.md` com prazos por entidade

## Riscos / dependências

- **Performance:** queries existentes precisam adicionar filtro. Risco de esquecer em algum endpoint → leak de dados deletados. Auditoria manual + grep depois.
- **FKs:** se outra tabela tem FK para `pacientes.id` e essa FK não permite "deletado", verificar. Soft delete não quebra FK (a row ainda existe), mas semanticamente pode confundir.
- **Storage:** soft delete acumula. Job de retenção é essencial.
- **Dependência:** [LGPD-001](LGPD-001-audit-log.md) — audit log registra a operação de delete e referencia `recurso_id` que continua existindo.
- **Conversa com:** [OPS-003](../sprint-3-production/OPS-003-cronjob-sincronizacao.md) — job de purge usa a mesma infra.

# [PERF-001] Criar índices secundários no banco

**Severidade:** 🔴 Critical
**Sprint:** 5
**Esforço:** S (≤2h)
**Área:** Backend / DB
**Status:** TODO

## Contexto

`setup_db.sql` e os dumps em `backups/` mostram que o schema atual tem **zero índices secundários** além das PKs, UNIQUE constraints e FKs. Toda query que filtra por `clinica_id`, `psicologo_id` ou range de `data_hora_sessao` está fazendo *sequential scan* (full table scan).

Hoje, com poucas centenas de rows, não dói. Em escala "milhares de pacientes ativos" passa rapidamente a custar segundos por request. Combinado com a ausência de pool ([ROB-001](../sprint-2-robustness/ROB-001-pool-hikari.md)), vira o gargalo dominante.

Este é o item de **maior razão custo/benefício** da Sprint 5: 30 minutos de SQL trazem ganho de uma ordem de magnitude.

## Localização

- Schema: [setup_db.sql](../../../setup_db.sql)
- Queries que sofrem:
  - [core.clj:820-851](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L820-L851) — `listar-agendamentos-handler` filtra `clinica_id` + ORDER BY `data_hora_sessao`
  - [core.clj:487-509](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L487-L509) — `criar-agendamento-handler` faz `WHERE psicologo_id = ? AND data_hora_sessao BETWEEN ? AND ?` em loop
  - [core.clj:572-576](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L572-L576) — update por `recorrencia_id`
  - [core.clj:1086-1093](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1086-L1093) — `listar-prontuarios` por `paciente_id`
  - Listagem de bloqueios por `psicologo_id`

## Solução proposta

### Migration (via [ROB-004](../sprint-2-robustness/ROB-004-migratus.md) Migratus, ou SQL avulso se ainda não migrou)

```sql
-- agendamentos: índices compostos para os filtros mais comuns
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_data
  ON agendamentos (clinica_id, data_hora_sessao DESC);

CREATE INDEX IF NOT EXISTS idx_agendamentos_psicologo_data
  ON agendamentos (psicologo_id, data_hora_sessao);

CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente
  ON agendamentos (paciente_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_recorrencia
  ON agendamentos (recorrencia_id) WHERE recorrencia_id IS NOT NULL;

-- bloqueios_agenda: filtro padrão é (psicologo_id, data_inicio, data_fim)
CREATE INDEX IF NOT EXISTS idx_bloqueios_psicologo_periodo
  ON bloqueios_agenda (psicologo_id, data_inicio, data_fim);

CREATE INDEX IF NOT EXISTS idx_bloqueios_clinica
  ON bloqueios_agenda (clinica_id);

-- pacientes: psicólogo lista os próprios; admin lista da clínica
CREATE INDEX IF NOT EXISTS idx_pacientes_psicologo
  ON pacientes (psicologo_id);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_status
  ON pacientes (clinica_id, status);

-- prontuários
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_data
  ON prontuarios (paciente_id, data_registro DESC);

CREATE INDEX IF NOT EXISTS idx_prontuarios_clinica
  ON prontuarios (clinica_id);

-- usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_clinica
  ON usuarios (clinica_id);
```

### Verificação com EXPLAIN

Antes e depois, rodar no Postgres/CRDB:

```sql
EXPLAIN ANALYZE
  SELECT * FROM agendamentos
  WHERE clinica_id = '...'
    AND data_hora_sessao BETWEEN '2026-05-01' AND '2026-05-31'
  ORDER BY data_hora_sessao DESC
  LIMIT 50;
```

Antes: `Seq Scan on agendamentos`. Depois: `Index Scan using idx_agendamentos_clinica_data`.

### CockroachDB — diferenças

CRDB cria índices online (sem locktable), seguro em prod. Mas índice composto em CRDB tem ordering distributed; preferir `data_hora_sessao DESC` quando o uso dominante é ordenar do mais recente.

CRDB também aceita índices **STORING** (cobertura), para evitar leitura da row principal:

```sql
CREATE INDEX idx_agendamentos_clinica_data_covered
  ON agendamentos (clinica_id, data_hora_sessao DESC)
  STORING (paciente_id, psicologo_id, status, duracao);
```

Só vale para colunas pequenas. Avaliar depois do baseline.

## Critérios de aceitação

- [ ] Migration criada (Migratus ou .sql temporário) com todos os índices acima
- [ ] `EXPLAIN ANALYZE` de listagem de agendamentos mostra `Index Scan` (não Seq Scan)
- [ ] Bench: listar 1000 agendamentos da clínica leva <50ms (era >300ms estimado)
- [ ] Bench: conflict detection em criação de agendamento (50 sessões recorrentes) leva <500ms total (era >2s estimado)
- [ ] Migration aplicada em prod (após backup)

## Riscos / dependências

- **Atenção em prod:** `CREATE INDEX` (não-CONCURRENTLY) **locka** a tabela em Postgres puro. Em CockroachDB Cloud é online. Em Postgres usar `CREATE INDEX CONCURRENTLY` se houver tráfego.
- **Espaço em disco:** cada índice consome ~10-30% do tamanho da tabela. Avaliar `pg_indexes_size('agendamentos')` antes e depois.
- **Dependência:** [ROB-004](../sprint-2-robustness/ROB-004-migratus.md) (Migratus) facilita versionamento dessa mudança. Sem Migratus, aplicar SQL diretamente e documentar.
- **Conversa com:** [PERF-002](PERF-002-paginacao-listagens.md) — a paginação tira proveito direto desses índices.

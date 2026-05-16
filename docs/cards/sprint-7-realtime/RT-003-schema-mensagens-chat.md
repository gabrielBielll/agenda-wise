# [RT-003] Schema de mensagens de chat (persistência + presença)

**Severidade:** 🟠 High
**Sprint:** 7
**Esforço:** M (meio dia)
**Área:** DB / Backend
**Status:** TODO

## Contexto

O chat psicólogo↔paciente precisa de **persistência** (não dá para perder mensagens). Pub/sub Redis é o canal de entrega real-time; o banco é a fonte de verdade. Estimativa: ~100 msgs/dia por par ativo, ~50k pares em escala milhares = ~5M msgs/dia.

Esta tabela cresce rápido — design precisa considerar particionamento desde o início.

Presença ("psicólogo online", "paciente digitando") é volátil e fica em Redis ([RT-002](RT-002-redis-infra.md)), **não** em SQL.

## Localização

Novo: nenhuma tabela hoje. Migration via [ROB-004](../sprint-2-robustness/ROB-004-migratus.md).

## Solução proposta

### Modelo de dados

```sql
-- canal de chat: 1-1 entre psicólogo e paciente, escopo de clínica
CREATE TABLE IF NOT EXISTS chat_canais (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    UUID NOT NULL REFERENCES clinicas(id),
  psicologo_id  UUID NOT NULL REFERENCES usuarios(id),
  paciente_id   UUID NOT NULL REFERENCES pacientes(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  arquivado_em  TIMESTAMPTZ,
  UNIQUE (clinica_id, psicologo_id, paciente_id)
);

CREATE INDEX idx_chat_canais_psi ON chat_canais (psicologo_id) WHERE arquivado_em IS NULL;
CREATE INDEX idx_chat_canais_pac ON chat_canais (paciente_id) WHERE arquivado_em IS NULL;

-- mensagens
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id      UUID NOT NULL REFERENCES chat_canais(id),
  remetente_id  UUID NOT NULL REFERENCES usuarios(id),
  remetente_tipo TEXT NOT NULL CHECK (remetente_tipo IN ('psicologo', 'paciente')),
  conteudo      TEXT NOT NULL,
  enviada_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lida_em       TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
) PARTITION BY RANGE (enviada_em);

-- partições por mês
CREATE TABLE chat_mensagens_2026_06 PARTITION OF chat_mensagens
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- ... (criar via job mensal)

CREATE INDEX idx_chat_msgs_canal_data
  ON chat_mensagens (canal_id, enviada_em DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_chat_msgs_nao_lidas
  ON chat_mensagens (canal_id, remetente_tipo)
  WHERE lida_em IS NULL AND deleted_at IS NULL;
```

### Por que canal separado de agendamento

Considerei `agendamento_id` na mensagem (chat associado à sessão). Decisão: **chat é contínuo entre psi-paciente**, não por sessão. Anexar a `agendamento` complica busca de histórico. Mantém-se canal 1-1; mensagens podem opcionalmente ter `agendamento_id` se for contextual.

### Anexos

MVP: só texto. Anexos vêm em sprint futuro:

```sql
CREATE TABLE chat_mensagem_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL REFERENCES chat_mensagens(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('imagem', 'audio', 'pdf')),
  s3_key TEXT NOT NULL,
  tamanho_bytes BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Storage: MinIO/S3. Mensagem pode ter 0+ anexos.

### CockroachDB e particionamento

CRDB não suporta `PARTITION BY RANGE` nativo do Postgres; usa `PARTITION BY RANGE (...)` como **table partitioning** em sintaxe próxima mas com semântica diferente. Alternativa em CRDB: usar **regional by row** + locality, ou simplesmente uma tabela grande com índice tempo-particionado.

Se em CRDB, schema simplifica:
```sql
CREATE TABLE chat_mensagens (
  ...  -- sem PARTITION BY
);
CREATE INDEX idx_chat_msgs_canal_data ON chat_mensagens (canal_id, enviada_em DESC);
-- a "partição" é o próprio índice; cleanup vira DELETE com batch
```

Decisão final dependendo do DB final em prod.

### Presença em Redis

```
ds:presenca:user:{user-id} → {last_seen_ts, status: online|away|offline}  -- TTL 60s

ds:presenca:canal:{canal-id}:digitando → set de user-ids  -- TTL 5s
```

Heartbeat do cliente WebSocket atualiza a cada 30s. Sem heartbeat por 60s → offline.

### Audit log

Mensagem de chat **NÃO** é prontuário (a princípio), mas dado pessoal sensível. Mesmo tratamento que [LGPD-001](../sprint-6-lgpd/LGPD-001-audit-log.md):
- VIEW_CHAT (abrir conversa)
- SEND_MESSAGE
- READ_MESSAGE (marcação de leitura)
- DELETE_MESSAGE

Não logar `dados_depois` com o conteúdo (sensível); só metadado (canal, tamanho, tipo).

### Retenção

LGPD aplica: enquanto canal ativo, manter. Após arquivamento, retenção legal a definir com clínica. Default conservador: 5 anos. Job de limpeza ([LGPD-002](../sprint-6-lgpd/LGPD-002-soft-delete-retencao.md)).

## Critérios de aceitação

- [ ] Migration cria `chat_canais` e `chat_mensagens`
- [ ] Particionamento por mês (Postgres) ou índice tempo-ordenado (CRDB)
- [ ] Job mensal pré-cria partição do próximo mês
- [ ] Índice para "mensagens não lidas" por canal
- [ ] Convenção de keys Redis para presença documentada
- [ ] Audit log instrumentado nos handlers de chat (após [LGPD-001](../sprint-6-lgpd/LGPD-001-audit-log.md))
- [ ] Retenção e soft delete alinhados com [LGPD-002](../sprint-6-lgpd/LGPD-002-soft-delete-retencao.md)

## Riscos / dependências

- **Particionamento:** se CRDB, simplificar conforme nota. Se Postgres puro, garantir job de criação de partição mensal (sem ele, INSERTs falham depois da última partição existente).
- **Volume:** 5M msgs/dia = ~150M/mês — partição mensal de ~10-20GB. Manageable, mas índices crescem.
- **Anexos S3:** se MVP texto-only, deixar anexos para sprint posterior. Mas reservar o slot no schema.
- **Dependência:** [ROB-004](../sprint-2-robustness/ROB-004-migratus.md), [RT-002](RT-002-redis-infra.md), [LGPD-001](../sprint-6-lgpd/LGPD-001-audit-log.md).
- **Conversa com:** [RT-004](RT-004-websocket-chat-pubsub.md) — implementação do canal real-time usa este schema.

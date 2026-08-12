-- Schema da integração com Google Agenda.
-- Ver docs/GOOGLE_CALENDAR_ARQUITETURA.md — seções 3, 4 (D8/D10/D12) e 5.
--
-- Tudo aqui é aditivo. Nenhuma tabela existente muda de significado.

-- ---------------------------------------------------------------------------
-- Conexão OAuth: uma por clínica (spec D1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_conexao (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id             UUID NOT NULL REFERENCES clinicas(id),
  google_account_email   TEXT NOT NULL,
  refresh_token_cifrado  TEXT NOT NULL,   -- ⚠️ NUNCA em texto claro. Envelope encryption / KMS.
  access_token_cifrado   TEXT,            -- cache; expira em ~1h
  access_token_expira_em TIMESTAMPTZ,
  escopos                TEXT NOT NULL,   -- lista separada por espaço, como o Google devolve
  status                 TEXT NOT NULL DEFAULT 'ativa',  -- ativa | invalida | revogada
  ultimo_erro            TEXT,
  ultimo_erro_em         TIMESTAMPTZ,
  criada_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_conexao_clinica_unica UNIQUE (clinica_id)
);
--;;
-- ---------------------------------------------------------------------------
-- Vínculo agenda do Google <-> psicólogo. É o "seam" do híbrido A/B (D14):
-- só o provisionamento olha `topologia`; o motor de sync lê google_calendar_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vinculo_agenda (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id         UUID NOT NULL REFERENCES clinicas(id),
  usuario_id         UUID REFERENCES usuarios(id),  -- NULL enquanto pendente de mapeamento
  google_calendar_id TEXT NOT NULL,
  nome_no_google     TEXT,
  access_role        TEXT NOT NULL,                 -- owner | writer | reader | freeBusyReader
  topologia          TEXT NOT NULL DEFAULT 'modelo_a',  -- modelo_a | modelo_b
  status             TEXT NOT NULL DEFAULT 'pendente',
    -- pendente | ativo | orfao | sem_acesso | pausado | convite_pendente
  sync_token         TEXT,
  ultima_sync_em     TIMESTAMPTZ,
  vinculado_por      UUID REFERENCES usuarios(id),
  vinculado_em       TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vinculo_agenda_calendario_unico UNIQUE (clinica_id, google_calendar_id)
);
--;;
CREATE INDEX IF NOT EXISTS idx_vinculo_agenda_usuario ON vinculo_agenda (usuario_id);
--;;
CREATE INDEX IF NOT EXISTS idx_vinculo_agenda_status ON vinculo_agenda (clinica_id, status);
--;;
-- ---------------------------------------------------------------------------
-- Canais de watch (webhook). Expiram em ~7 dias e não têm endpoint de renovação.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_canal_watch (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vinculo_agenda_id UUID NOT NULL REFERENCES vinculo_agenda(id) ON DELETE CASCADE,
  channel_id        UUID NOT NULL,
  resource_id       TEXT NOT NULL,   -- devolvido pelo Google; necessário para channels.stop
  channel_token     TEXT NOT NULL,   -- segredo validado no header X-Goog-Channel-Token
  expira_em         TIMESTAMPTZ NOT NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_canal_watch_channel_unico UNIQUE (channel_id)
);
--;;
CREATE INDEX IF NOT EXISTS idx_canal_watch_expira ON google_canal_watch (expira_em);
--;;
-- ---------------------------------------------------------------------------
-- Série recorrente. Materializa o recorrencia_id que já era gerado solto.
-- 1 linha aqui = 1 evento-mãe com RRULE no Google (D10).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recorrencias (
  id              UUID PRIMARY KEY,   -- reaproveita agendamentos.recorrencia_id
  clinica_id      UUID NOT NULL REFERENCES clinicas(id),
  psicologo_id    UUID NOT NULL REFERENCES usuarios(id),
  paciente_id     UUID NOT NULL REFERENCES pacientes(id),
  rrule           TEXT NOT NULL,
  dtstart         TIMESTAMPTZ NOT NULL,
  duracao_minutos INT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  google_event_id TEXT,
  google_etag     TEXT,
  google_updated  TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'ativa',   -- ativa | encerrada
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
--;;
CREATE INDEX IF NOT EXISTS idx_recorrencias_clinica ON recorrencias (clinica_id, status);
--;;
-- ---------------------------------------------------------------------------
-- Colunas de sync em agendamentos.
--
-- ⚠️ NÃO existe FK de agendamentos.recorrencia_id -> recorrencias(id) ainda.
-- As linhas legadas têm recorrencia_id sem linha correspondente; criar a FK
-- agora faria a migration falhar em produção. O backfill de `recorrencias` a
-- partir do legado é ação explícita de admin, depois da Fase 2 — e a FK entra
-- em migration própria depois disso.
-- ---------------------------------------------------------------------------
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS original_start_time TIMESTAMPTZ;
--;;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS google_event_id TEXT;
--;;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS google_etag TEXT;
--;;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS google_updated TIMESTAMPTZ;
--;;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS origem_ultima_alteracao TEXT;
--;;
-- sync_status: nao_sincronizado | pendente | sincronizado | divergente
--
-- ⚠️ Este comentário fica ACIMA do comando de propósito. O migratus remove
-- comentário só quando o `--` está na coluna 0 (regex `^--.*`), e ele faz isso
-- ANTES de tirar a indentação. Comentário indentado depois do `;` sobrevive à
-- limpeza, e aí o driver lê "comando; comentário" como DOIS comandos e devolve
-- dois resultados para uma entrada de batch: "Too many update results were
-- returned". Isso derrubava esta migration inteira.
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'nao_sincronizado';
--;;
-- Baseline da chave de reconciliação: para o que já existe, a ocorrência
-- nunca foi remarcada do lado do Google, então original_start_time = início.
UPDATE agendamentos
   SET original_start_time = data_hora_sessao
 WHERE original_start_time IS NULL;
--;;
CREATE INDEX IF NOT EXISTS idx_agendamentos_recorrencia_ost
  ON agendamentos (recorrencia_id, original_start_time);
--;;
CREATE INDEX IF NOT EXISTS idx_agendamentos_google_event
  ON agendamentos (google_event_id);
--;;
-- ---------------------------------------------------------------------------
-- Eventos criados fora da plataforma viram bloqueio de disponibilidade (D12).
-- ---------------------------------------------------------------------------
ALTER TABLE bloqueios_agenda ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'plataforma';
--;;
ALTER TABLE bloqueios_agenda ADD COLUMN IF NOT EXISTS google_event_id TEXT;
--;;
ALTER TABLE bloqueios_agenda ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
--;;
ALTER TABLE bloqueios_agenda ADD COLUMN IF NOT EXISTS google_etag TEXT;
--;;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bloqueios_google_event
  ON bloqueios_agenda (google_event_id) WHERE google_event_id IS NOT NULL;
--;;
-- ---------------------------------------------------------------------------
-- Outbox transacional (D8). O handler grava aqui na mesma transação do
-- agendamento; um worker drena com backoff. Nunca chamar o Google no request.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_sync_outbox (
  id            BIGSERIAL PRIMARY KEY,
  clinica_id    UUID NOT NULL REFERENCES clinicas(id),
  psicologo_id  UUID REFERENCES usuarios(id),   -- vira quotaUser na chamada
  entidade      TEXT NOT NULL,                  -- recorrencia | agendamento | bloqueio
  entidade_id   UUID NOT NULL,
  operacao      TEXT NOT NULL,                  -- criar | atualizar | cancelar | remover
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pendente',  -- pendente | processando | ok | erro | descartado
  tentativas    INT NOT NULL DEFAULT 0,
  proxima_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_erro   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em TIMESTAMPTZ
);
--;;
CREATE INDEX IF NOT EXISTS idx_outbox_fila ON google_sync_outbox (status, proxima_em);
--;;
CREATE INDEX IF NOT EXISTS idx_outbox_entidade ON google_sync_outbox (entidade, entidade_id);
--;;
-- ---------------------------------------------------------------------------
-- Permissão dedicada. Só admin mexe em vínculo agenda<->psicólogo (spec 5.4):
-- vincular errado expõe a agenda de pacientes de um profissional a outro.
-- Não depender do bypass global de admin, que SEC-006 vai remover.
-- ---------------------------------------------------------------------------
INSERT INTO permissoes (nome_permissao)
VALUES ('gerenciar_integracao_google')
ON CONFLICT DO NOTHING;
--;;
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'admin_clinica'
   AND per.nome_permissao = 'gerenciar_integracao_google'
ON CONFLICT DO NOTHING;

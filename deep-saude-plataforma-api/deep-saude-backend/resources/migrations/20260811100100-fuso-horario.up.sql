-- Fuso horário explícito no caminho de agendamento.
--
-- Antes: data_hora_sessao / data_inicio / data_fim eram TIMESTAMP (sem fuso),
-- gravados via java.sql.Timestamp/valueOf a partir de uma string de horário de
-- parede vinda do frontend. O fuso existia só implicitamente ("é São Paulo").
--
-- Isso quebra na primeira integração com o Google Calendar, que trafega RFC3339
-- com offset — e já causa divergência entre as views do frontend hoje.
--
-- A conversão abaixo interpreta os dados existentes como horário de parede de
-- São Paulo, que é o que de fato são.
--
-- ESCOPO DELIBERADO: só as colunas do caminho de agendamento.
-- prontuarios.data_registro e bloqueios_agenda.created_at NÃO são convertidos —
-- eles vêm de CURRENT_TIMESTAMP (relógio do servidor), não de horário de parede
-- do usuário. Converter com 'America/Sao_Paulo' deslocaria esses registros em 3h.
--
-- ⚠️ CockroachDB: ALTER COLUMN ... TYPE pode exigir
--    SET enable_experimental_alter_column_type_general = true;
--    na sessão antes de rodar esta migration.

ALTER TABLE clinicas
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
--;;
ALTER TABLE agendamentos
  ALTER COLUMN data_hora_sessao TYPE TIMESTAMPTZ
  USING data_hora_sessao AT TIME ZONE 'America/Sao_Paulo';
--;;
ALTER TABLE bloqueios_agenda
  ALTER COLUMN data_inicio TYPE TIMESTAMPTZ
  USING data_inicio AT TIME ZONE 'America/Sao_Paulo';
--;;
ALTER TABLE bloqueios_agenda
  ALTER COLUMN data_fim TYPE TIMESTAMPTZ
  USING data_fim AT TIME ZONE 'America/Sao_Paulo';

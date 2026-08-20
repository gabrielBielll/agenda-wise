-- Reverte para TIMESTAMP sem fuso, reinterpretando em São Paulo.
-- Só é lossless enquanto todos os dados forem do fuso America/Sao_Paulo.

ALTER TABLE bloqueios_agenda
  ALTER COLUMN data_fim TYPE TIMESTAMP
  USING data_fim AT TIME ZONE 'America/Sao_Paulo';
--;;
ALTER TABLE bloqueios_agenda
  ALTER COLUMN data_inicio TYPE TIMESTAMP
  USING data_inicio AT TIME ZONE 'America/Sao_Paulo';
--;;
ALTER TABLE agendamentos
  ALTER COLUMN data_hora_sessao TYPE TIMESTAMP
  USING data_hora_sessao AT TIME ZONE 'America/Sao_Paulo';
--;;
ALTER TABLE clinicas DROP COLUMN IF EXISTS timezone;

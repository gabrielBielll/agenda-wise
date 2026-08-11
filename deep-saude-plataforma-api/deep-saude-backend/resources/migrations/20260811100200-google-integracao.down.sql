-- Remove a integração com Google Agenda.
-- Não desfaz o backfill de original_start_time (é dado derivado e inofensivo).

DROP TABLE IF EXISTS google_sync_outbox;
--;;
DROP TABLE IF EXISTS google_canal_watch;
--;;
DROP TABLE IF EXISTS vinculo_agenda;
--;;
DROP TABLE IF EXISTS google_conexao;
--;;
DROP TABLE IF EXISTS recorrencias;
--;;
DROP INDEX IF EXISTS idx_bloqueios_google_event;
--;;
ALTER TABLE bloqueios_agenda DROP COLUMN IF EXISTS google_etag;
--;;
ALTER TABLE bloqueios_agenda DROP COLUMN IF EXISTS google_calendar_id;
--;;
ALTER TABLE bloqueios_agenda DROP COLUMN IF EXISTS google_event_id;
--;;
ALTER TABLE bloqueios_agenda DROP COLUMN IF EXISTS origem;
--;;
DROP INDEX IF EXISTS idx_agendamentos_google_event;
--;;
DROP INDEX IF EXISTS idx_agendamentos_recorrencia_ost;
--;;
ALTER TABLE agendamentos DROP COLUMN IF EXISTS sync_status;
--;;
ALTER TABLE agendamentos DROP COLUMN IF EXISTS origem_ultima_alteracao;
--;;
ALTER TABLE agendamentos DROP COLUMN IF EXISTS google_updated;
--;;
ALTER TABLE agendamentos DROP COLUMN IF EXISTS google_etag;
--;;
ALTER TABLE agendamentos DROP COLUMN IF EXISTS google_event_id;
--;;
ALTER TABLE agendamentos DROP COLUMN IF EXISTS original_start_time;
--;;
DELETE FROM papel_permissoes
 WHERE permissao_id IN (SELECT id FROM permissoes WHERE nome_permissao = 'gerenciar_integracao_google');
--;;
DELETE FROM permissoes WHERE nome_permissao = 'gerenciar_integracao_google';

CREATE TABLE IF NOT EXISTS google_oauth_state (
  state_hash  VARCHAR(64) PRIMARY KEY,
  clinica_id  UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   TIMESTAMPTZ NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
--;;
-- ⚠️ O `--;;` nao e enfeite: e o separador de statements do migratus.
--
-- Sem ele, os dois comandos abaixo sobem no MESMO lote e o driver responde
-- `PSQLException: Too many update results were returned` — que nao aponta para
-- SQL nenhum. Em 19/08 isso derrubou SEIS namespaces de teste de uma vez
-- (agendamentos, desconectar, isolamento, permissoes, plataforma, prontuarios),
-- porque o erro acontece na fixture que roda as migrations, antes de qualquer
-- teste. As outras oito migrations do projeto ja usavam o separador.
CREATE INDEX IF NOT EXISTS idx_google_oauth_state_expira_em
  ON google_oauth_state (expira_em);

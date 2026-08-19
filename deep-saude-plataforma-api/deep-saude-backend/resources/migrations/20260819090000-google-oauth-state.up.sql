CREATE TABLE IF NOT EXISTS google_oauth_state (
  state_hash  VARCHAR(64) PRIMARY KEY,
  clinica_id  UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   TIMESTAMPTZ NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_state_expira_em
  ON google_oauth_state (expira_em);

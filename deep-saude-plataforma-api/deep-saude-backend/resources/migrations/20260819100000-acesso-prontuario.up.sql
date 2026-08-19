CREATE TABLE acesso_prontuario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  UUID NOT NULL REFERENCES clinicas(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  papel       TEXT NOT NULL,
  motivo      TEXT NOT NULL DEFAULT 'flag_super_admin',
  lido_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
--;;
CREATE INDEX idx_acesso_prontuario_paciente
  ON acesso_prontuario (paciente_id, lido_em DESC);

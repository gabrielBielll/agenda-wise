-- GC-012 / D-015: o Modelo C tem uma conexão Google por psicóloga.
--
-- Destino explícito do legado: as conexões antigas eram da clínica e não há
-- informação que permita atribuí-las com segurança a uma pessoa. O staging é
-- descartável (D-013), então linhas sem usuario_id são descartadas em vez de
-- escolher uma psicóloga por palpite e entregar a ela tokens alheios.
ALTER TABLE google_conexao
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id);
--;;
DELETE FROM google_conexao WHERE usuario_id IS NULL;
--;;
ALTER TABLE google_conexao
  DROP CONSTRAINT IF EXISTS google_conexao_clinica_unica;
--;;
DROP INDEX IF EXISTS google_conexao_clinica_unica;
--;;
ALTER TABLE google_conexao ALTER COLUMN usuario_id SET NOT NULL;
--;;
CREATE UNIQUE INDEX IF NOT EXISTS google_conexao_usuario_unica
  ON google_conexao (usuario_id);
--;;
CREATE INDEX IF NOT EXISTS idx_google_conexao_clinica
  ON google_conexao (clinica_id);
--;;
INSERT INTO permissoes (nome_permissao)
VALUES ('conectar_agenda_propria')
ON CONFLICT DO NOTHING;
--;;
-- Reexecutável de propósito: a matriz é fonte da verdade. Remove qualquer
-- concessão acidental desta permissão estreita antes de concedê-la somente ao
-- papel psicólogo; gerenciar_integracao_google continua exclusiva do admin.
DELETE FROM papel_permissoes
 WHERE permissao_id = (
       SELECT id FROM permissoes WHERE nome_permissao = 'conectar_agenda_propria');
--;;
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'psicologo'
   AND per.nome_permissao = 'conectar_agenda_propria'
ON CONFLICT DO NOTHING;

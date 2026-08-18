DELETE FROM papel_permissoes
 WHERE permissao_id = (
       SELECT id FROM permissoes WHERE nome_permissao = 'conectar_agenda_propria');
--;;
DELETE FROM permissoes WHERE nome_permissao = 'conectar_agenda_propria';
--;;
-- Não existe conversão segura de N conexões pessoais para uma conexão da
-- clínica. O rollback descarta as linhas antes de restaurar a unicidade antiga.
DELETE FROM google_conexao;
--;;
DROP INDEX IF EXISTS google_conexao_usuario_unica;
--;;
DROP INDEX IF EXISTS idx_google_conexao_clinica;
--;;
ALTER TABLE google_conexao DROP COLUMN IF EXISTS usuario_id;
--;;
CREATE UNIQUE INDEX IF NOT EXISTS google_conexao_clinica_unica
  ON google_conexao (clinica_id);

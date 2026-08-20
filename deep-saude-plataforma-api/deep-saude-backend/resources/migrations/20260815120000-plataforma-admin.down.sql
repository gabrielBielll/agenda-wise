DROP INDEX IF EXISTS idx_usuarios_plataforma_admin;
--;;
ALTER TABLE usuarios DROP COLUMN IF EXISTS plataforma_admin;

-- Recuperação de senha por e-mail: o token que prova "sou eu, deixe eu trocar".
--
-- Mesma disciplina segura do `state` do OAuth (google_oauth_state): guarda-se
-- SÓ o hash SHA-256 do token, nunca o token em claro. Um vazamento desta tabela
-- não entrega nenhum link de redefinição — só hashes, que não voltam a ser
-- token. O token em claro existe apenas no e-mail que sai para a pessoa.
--
-- 🔴 `usado_em` é o que faz o uso ser ÚNICO. O consumo é um
--    `UPDATE ... SET usado_em = now() WHERE usado_em IS NULL AND expira_em > now()`
--    atômico (ver auth_recuperacao.clj): dois pedidos concorrentes com o mesmo
--    token não redefinem a senha duas vezes, porque só o primeiro casa a linha.
--
-- `ON DELETE CASCADE`: se a conta some, seus tokens somem junto — não fica
-- resto de credencial pendurado apontando para um usuário que não existe mais.
--
-- Compatível com CockroachDB: `gen_random_uuid()` (não a extensão uuid-ossp),
-- sem `ALTER COLUMN TYPE`, sem nada experimental. Cada statement é separado por
-- `--;;`, que é o separador do migratus — sem ele os comandos sobem no mesmo
-- lote e o driver responde `Too many update results were returned`, longe do SQL.

CREATE TABLE IF NOT EXISTS senha_reset_token (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
--;;
-- O consumo filtra por `expira_em > now()` e a limpeza apaga `expira_em < now()`:
-- os dois caminhos batem nesta coluna, então ela é indexada.
CREATE INDEX IF NOT EXISTS idx_senha_reset_token_expira_em
  ON senha_reset_token (expira_em);
--;;
-- Ao pedir um token novo, apagam-se os anteriores do MESMO usuário (uso único de
-- verdade). Esse DELETE filtra por usuario_id.
CREATE INDEX IF NOT EXISTS idx_senha_reset_token_usuario_id
  ON senha_reset_token (usuario_id);
--;;
-- O consumo do token (o redefinir) filtra por `token_hash = ?`. Índice para não
-- varrer a tabela a cada redefinição — a limpeza a mantém pequena, mas o índice
-- é barato e o caminho é quente numa campanha de redefinição.
CREATE INDEX IF NOT EXISTS idx_senha_reset_token_token_hash
  ON senha_reset_token (token_hash);

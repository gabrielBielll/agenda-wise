-- Operador da plataforma — o painel de superadmin.
--
-- O sistema passa a ser vendido a outras clínicas, então aparece um papel que
-- não existia: quem administra a PLATAFORMA, não uma clínica. Ele cria clínica,
-- acompanha uso e, no futuro, cobra.
--
-- ⚠️ É uma coluna, e não um papel novo em `papeis`, de propósito.
--
-- Os papéis de `papeis` são papéis DENTRO de uma clínica, e todo handler
-- clínico deriva a autorização de `clinica_id` + `papel_id` do token. Criar um
-- papel 'superadmin' ali colocaria o operador da plataforma no mesmo eixo dos
-- outros — e a primeira consequência seria alguém precisar decidir o que
-- `clinica_id` significa para ele. Deixar `clinica_id` nulo quebraria o
-- `wrap-jwt-autenticacao`, que faz `UUID/fromString` no claim; e pior do que
-- quebrar, se um dia parasse de quebrar, viraria um token sem clínica passando
-- por handlers que filtram por clínica.
--
-- Com uma flag ortogonal, o operador continua sendo um usuário normal de uma
-- clínica normal — o Gabriel usa uma das clínicas para atender — e ganha acesso
-- a um conjunto SEPARADO de rotas, `/api/plataforma/*`, que não tocam em dado
-- clínico. O invariante que o `isolamento_test` provou continua valendo sem
-- alteração: todo handler clínico exige `clinica_id`, sempre.
--
-- ⚠️ **Nenhum endpoint concede esta flag.** Não há rota de promoção, nem tela,
-- nem parâmetro. Vira superadmin quem for marcado direto no banco:
--
--     UPDATE usuarios SET plataforma_admin = true WHERE email = '...';
--
-- É a mesma inconveniência deliberada da R-012: privilégio que se concede pela
-- interface é privilégio que alguém concede sem pensar. E como não existe
-- caminho de código que escreva `true` aqui, escalada de privilégio por bug de
-- handler fica fora de alcance por construção, não por revisão.
--
-- ⚠️ **Isto NÃO dá acesso a prontuário.** A R-012 diz que prontuário é do
-- psicólogo autor, e o operador da plataforma não é exceção — ele opera o
-- negócio, não atende. A saída de emergência continua sendo a flag em código
-- (`super-admin-le-prontuario?`), separada desta. Há teste garantindo que
-- `plataforma_admin` não abre prontuário.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plataforma_admin BOOLEAN NOT NULL DEFAULT false;
--;;

-- Índice parcial: a lista de operadores é minúscula perto da de usuários, e
-- toda consulta a ela pergunta por `plataforma_admin = true`.
CREATE INDEX IF NOT EXISTS idx_usuarios_plataforma_admin
  ON usuarios (plataforma_admin) WHERE plataforma_admin;

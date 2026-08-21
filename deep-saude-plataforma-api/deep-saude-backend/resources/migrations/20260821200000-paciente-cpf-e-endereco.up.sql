-- Os dados que faltavam no cadastro do paciente: CPF e endereço com CEP.
--
-- Pedido do Gabriel em 21/08, repassando a conversa com a clínica: *"hoje os
-- pacientes só têm esses dados, aí ficaria faltando adicionar o CPF, e CEP,
-- foto"*.
--
-- 📌 **Foto não entra nesta migration**: a coluna `avatar_url` já existe desde a
-- baseline e a tela já a exibe. O que falta lá não é schema, é onde hospedar o
-- arquivo — e isso é decisão de infraestrutura, não de tabela.
--
-- 🔴 **O `endereco` de texto livre FICA, e não é indecisão.**
--
-- Ele já tem dado de paciente real dentro. Trocar por campos estruturados numa
-- migration exigiria adivinhar onde termina a rua e começa o bairro em cada
-- linha escrita à mão — e adivinhar errado num endereço é mandar a psicóloga
-- para o lugar errado. Os campos novos nascem vazios; a tela passa a preencher
-- os estruturados, e quem tiver só o texto antigo continua enxergando o que
-- escreveu.
--
-- ⚠️ Quem for consolidar isso um dia precisa de uma decisão do Gabriel sobre o
-- que fazer com as linhas antigas, não de um `UPDATE` esperto.

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cpf VARCHAR(11);
--;;

-- 🔴 Guardado **só com dígitos**, sem máscara.
--
-- Máscara é apresentação, e apresentação no banco vira dois registros para a
-- mesma pessoa: `123.456.789-09` e `12345678909` não são iguais para o UNIQUE
-- abaixo, e o duplicado passaria batido. O `dominio.clj` normaliza na entrada.
ALTER TABLE pacientes
  ADD CONSTRAINT pacientes_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
--;;

-- Duas pessoas com o mesmo CPF na mesma clínica são a mesma pessoa cadastrada
-- duas vezes. O UNIQUE recusa antes de virar prontuário dividido em dois.
--
-- ⚠️ **NULL não colide com NULL** em Postgres nem em Cockroach — então clínica
-- com muitos pacientes sem CPF continua funcionando. É a mesma propriedade que
-- o `unique_email_clinica` da baseline já usa.
--
-- 📌 Consequência conhecida: a importação de pacientes (`portabilidade`) passa a
-- recusar planilha com CPF repetido. É o comportamento certo — mas é MUDANÇA de
-- comportamento, e quem for depurar aquele fluxo merece encontrar isto escrito.
ALTER TABLE pacientes
  ADD CONSTRAINT unique_cpf_clinica UNIQUE (cpf, clinica_id);
--;;

-- Endereço estruturado. Os nomes seguem os do ViaCEP (`logradouro`, `bairro`,
-- `localidade`, `uf`) porque é de lá que eles vêm preenchidos — traduzir no meio
-- do caminho só cria um lugar a mais para errar.
--
-- 📌 `numero` e `complemento` NÃO vêm do ViaCEP: são da pessoa, não do CEP.
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cep VARCHAR(8);
--;;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
--;;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero VARCHAR(20);
--;;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS complemento VARCHAR(120);
--;;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS bairro VARCHAR(120);
--;;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cidade VARCHAR(120);
--;;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS uf CHAR(2);
--;;

ALTER TABLE pacientes
  ADD CONSTRAINT pacientes_cep_formato
  CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');

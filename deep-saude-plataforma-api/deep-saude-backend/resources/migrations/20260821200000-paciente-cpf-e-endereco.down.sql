-- ⚠️ Descer isto APAGA CPF e endereço estruturado de todos os pacientes.
--
-- O `endereco` de texto livre sobrevive porque nunca foi tocado — foi essa a
-- razão de preservá-lo na subida. Mas o que a psicóloga digitou nos campos
-- novos vai embora e não volta.
ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_cep_formato;
--;;
ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS unique_cpf_clinica;
--;;
ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_cpf_formato;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS uf;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS cidade;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS bairro;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS complemento;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS numero;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS logradouro;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS cep;
--;;
ALTER TABLE pacientes DROP COLUMN IF EXISTS cpf;

-- Desfaz a paleta por clínica. Nada mais depende dela: a leitura mescla com o
-- padrão do `dominio.clj`, então sem a tabela toda clínica volta ao "Padrão
-- Deep Saúde" e a agenda continua pintando.
DROP TABLE IF EXISTS paleta_clinica;

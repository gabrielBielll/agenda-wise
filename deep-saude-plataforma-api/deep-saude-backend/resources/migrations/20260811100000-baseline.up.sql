-- Baseline: schema atual da plataforma, em forma idempotente.
--
-- Em banco já existente (produção) esta migration é um no-op completo: tudo é
-- CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Em banco novo, ela cria
-- o schema inteiro.
--
-- A partir daqui, migrations são a única fonte da verdade do schema.
-- setup_db.sql permanece apenas como referência histórica e seed de dev.
-- A função ensure-finance-columns! do core.clj foi substituída por esta migration.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--;;
CREATE TABLE IF NOT EXISTS clinicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_da_clinica VARCHAR(255) NOT NULL,
  limite_psicologos INT DEFAULT 10
);
--;;
CREATE TABLE IF NOT EXISTS papeis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_papel VARCHAR(50) UNIQUE NOT NULL
);
--;;
CREATE TABLE IF NOT EXISTS permissoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_permissao VARCHAR(100) UNIQUE NOT NULL
);
--;;
CREATE TABLE IF NOT EXISTS papel_permissoes (
  papel_id UUID REFERENCES papeis(id),
  permissao_id UUID REFERENCES permissoes(id),
  PRIMARY KEY (papel_id, permissao_id)
);
--;;
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  papel_id UUID REFERENCES papeis(id),
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  cpf VARCHAR(14),
  telefone VARCHAR(20),
  data_nascimento DATE,
  endereco TEXT,
  crp VARCHAR(20),
  registro_e_psi VARCHAR(50),
  abordagem VARCHAR(100),
  area_de_atuacao VARCHAR(100)
);
--;;
CREATE TABLE IF NOT EXISTS pacientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(50),
  data_nascimento DATE,
  endereco TEXT,
  avatar_url TEXT,
  psicologo_id UUID REFERENCES usuarios(id),
  historico_familiar TEXT,
  uso_medicamentos TEXT,
  diagnostico TEXT,
  contatos_emergencia TEXT,
  status VARCHAR(10) DEFAULT 'ativo',
  nota_fiscal BOOLEAN DEFAULT false,
  origem VARCHAR(50),
  vencimento_pagamento VARCHAR(100),
  tipo_pagamento VARCHAR(20) DEFAULT 'avulso',
  CONSTRAINT unique_email_clinica UNIQUE (email, clinica_id)
);
--;;
CREATE TABLE IF NOT EXISTS agendamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  paciente_id UUID REFERENCES pacientes(id),
  psicologo_id UUID REFERENCES usuarios(id),
  data_hora_sessao TIMESTAMP,
  valor_consulta DECIMAL(10, 2),
  duracao INTEGER DEFAULT 50,
  status VARCHAR(20) DEFAULT 'agendado',
  recorrencia_id UUID,
  observacoes TEXT
);
--;;
-- Colunas financeiras (antes criadas por ensure-finance-columns! no startup)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_repasse DECIMAL(10, 2);
--;;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status_repasse VARCHAR(20) DEFAULT 'pendente';
--;;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) DEFAULT 'pendente';
--;;
CREATE TABLE IF NOT EXISTS prontuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  paciente_id UUID REFERENCES pacientes(id),
  psicologo_id UUID REFERENCES usuarios(id),
  data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  conteudo TEXT NOT NULL,
  tipo VARCHAR(20) DEFAULT 'sessao',
  queixa_principal TEXT,
  resumo_tecnico TEXT,
  observacoes_estado_mental TEXT,
  encaminhamentos_tarefas TEXT,
  agendamento_id UUID REFERENCES agendamentos(id),
  humor INTEGER
);
--;;
CREATE TABLE IF NOT EXISTS bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  psicologo_id UUID REFERENCES usuarios(id),
  data_inicio TIMESTAMP NOT NULL,
  data_fim TIMESTAMP NOT NULL,
  motivo VARCHAR(255),
  dia_inteiro BOOLEAN DEFAULT false,
  recorrencia_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
--;;
INSERT INTO papeis (nome_papel) VALUES ('admin_clinica') ON CONFLICT DO NOTHING;
--;;
INSERT INTO papeis (nome_papel) VALUES ('psicologo') ON CONFLICT DO NOTHING;
--;;
INSERT INTO papeis (nome_papel) VALUES ('secretario') ON CONFLICT DO NOTHING;
--;;
INSERT INTO permissoes (nome_permissao) VALUES
('gerenciar_psicologos'),
('visualizar_todos_agendamentos'),
('gerenciar_pacientes'),
('visualizar_pacientes'),
('gerenciar_agendamentos_clinica'),
('gerenciar_usuarios'),
('gerenciar_prontuarios')
ON CONFLICT DO NOTHING;

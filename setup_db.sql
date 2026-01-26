-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tables
CREATE TABLE IF NOT EXISTS clinicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_da_clinica VARCHAR(255) NOT NULL,
  limite_psicologos INT DEFAULT 10
);

CREATE TABLE IF NOT EXISTS papeis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_papel VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS permissoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_permissao VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS papel_permissoes (
  papel_id UUID REFERENCES papeis(id),
  permissao_id UUID REFERENCES permissoes(id),
  PRIMARY KEY (papel_id, permissao_id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  papel_id UUID REFERENCES papeis(id),
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL
);

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
  CONSTRAINT unique_email_clinica UNIQUE (email, clinica_id)
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  paciente_id UUID REFERENCES pacientes(id),
  psicologo_id UUID REFERENCES usuarios(id),
  data_hora_sessao TIMESTAMP,
  valor_consulta DECIMAL(10, 2)
);

CREATE TABLE IF NOT EXISTS prontuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id UUID REFERENCES clinicas(id),
  paciente_id UUID REFERENCES pacientes(id),
  psicologo_id UUID REFERENCES usuarios(id),
  data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  conteudo TEXT NOT NULL,
  tipo VARCHAR(20) DEFAULT 'sessao' -- 'sessao' ou 'anotacao'
);

-- Seeds: Roles
INSERT INTO papeis (nome_papel) VALUES ('admin_clinica') ON CONFLICT DO NOTHING;
INSERT INTO papeis (nome_papel) VALUES ('psicologo') ON CONFLICT DO NOTHING;
INSERT INTO papeis (nome_papel) VALUES ('secretario') ON CONFLICT DO NOTHING;

-- Seeds: Permissions
INSERT INTO permissoes (nome_permissao) VALUES 
('gerenciar_psicologos'),
('visualizar_todos_agendamentos'),
('gerenciar_pacientes'),
('visualizar_pacientes'),
('gerenciar_agendamentos_clinica'),
('gerenciar_agendamentos_clinica'),
('gerenciar_usuarios'),
('gerenciar_prontuarios')
ON CONFLICT DO NOTHING;

-- Seeds: Role Permissions (Mapping inferred from code)
-- Admin Clinica: CAN DO EVERYTHING
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id FROM papeis p, permissoes per WHERE p.nome_papel = 'admin_clinica' ON CONFLICT DO NOTHING;

-- Psicologo: Can view/manage specific things (adjust as needed)
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id FROM papeis p, permissoes per 
WHERE p.nome_papel = 'psicologo' 
AND per.nome_permissao IN ('visualizar_pacientes', 'visualizar_todos_agendamentos', 'gerenciar_agendamentos_clinica', 'gerenciar_pacientes', 'gerenciar_prontuarios') -- Minimal set
ON CONFLICT DO NOTHING;

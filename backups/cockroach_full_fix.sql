












CREATE TABLE agendamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinica_id uuid,
    paciente_id uuid,
    psicologo_id uuid,
    data_hora_sessao timestamp without time zone,
    valor_consulta numeric(10,2),
    duracao integer DEFAULT 50,
    status character varying(20) DEFAULT 'agendado',
    recorrencia_id uuid,
    observacoes text,
    valor_repasse numeric(10,2),
    status_repasse character varying(20) DEFAULT 'pendente',
    status_pagamento character varying(20) DEFAULT 'pendente'
);



CREATE TABLE bloqueios_agenda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinica_id uuid NOT NULL,
    psicologo_id uuid NOT NULL,
    data_inicio timestamp without time zone NOT NULL,
    data_fim timestamp without time zone NOT NULL,
    motivo character varying(255),
    dia_inteiro boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    recorrencia_id uuid
);



CREATE TABLE clinicas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_da_clinica character varying(255) NOT NULL,
    limite_psicologos integer DEFAULT 10
);



CREATE TABLE pacientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinica_id uuid,
    nome character varying(255) NOT NULL,
    email character varying(255),
    telefone character varying(50),
    data_nascimento date,
    endereco text,
    avatar_url text,
    psicologo_id uuid,
    historico_familiar text,
    uso_medicamentos text,
    diagnostico text,
    contatos_emergencia text,
    status character varying(10) DEFAULT 'ativo',
    nota_fiscal boolean DEFAULT false,
    origem character varying(50),
    vencimento_pagamento character varying(100),
    tipo_pagamento character varying(20) DEFAULT 'avulso'
);



CREATE TABLE papeis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_papel character varying(50) NOT NULL
);



CREATE TABLE papel_permissoes (
    papel_id uuid NOT NULL,
    permissao_id uuid NOT NULL
);



CREATE TABLE permissoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_permissao character varying(100) NOT NULL
);



CREATE TABLE prontuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinica_id uuid,
    paciente_id uuid,
    psicologo_id uuid,
    data_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    conteudo text NOT NULL,
    tipo character varying(20) DEFAULT 'sessao',
    queixa_principal text,
    resumo_tecnico text,
    observacoes_estado_mental text,
    encaminhamentos_tarefas text,
    agendamento_id uuid,
    humor integer
);



CREATE TABLE usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinica_id uuid,
    papel_id uuid,
    nome character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    cpf character varying(14),
    telefone character varying(20),
    data_nascimento date,
    endereco text,
    crp character varying(20),
    registro_e_psi character varying(50),
    abordagem character varying(100),
    area_de_atuacao character varying(100)
);



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



-- COPY REMOVED



ALTER TABLE ONLY agendamentos
    ADD CONSTRAINT agendamentos_pkey PRIMARY KEY (id);



ALTER TABLE ONLY bloqueios_agenda
    ADD CONSTRAINT bloqueios_agenda_pkey PRIMARY KEY (id);



ALTER TABLE ONLY clinicas
    ADD CONSTRAINT clinicas_pkey PRIMARY KEY (id);



ALTER TABLE ONLY pacientes
    ADD CONSTRAINT pacientes_pkey PRIMARY KEY (id);



ALTER TABLE ONLY papeis
    ADD CONSTRAINT papeis_nome_papel_key UNIQUE (nome_papel);



ALTER TABLE ONLY papeis
    ADD CONSTRAINT papeis_pkey PRIMARY KEY (id);



ALTER TABLE ONLY papel_permissoes
    ADD CONSTRAINT papel_permissoes_pkey PRIMARY KEY (papel_id, permissao_id);



ALTER TABLE ONLY permissoes
    ADD CONSTRAINT permissoes_nome_permissao_key UNIQUE (nome_permissao);



ALTER TABLE ONLY permissoes
    ADD CONSTRAINT permissoes_pkey PRIMARY KEY (id);



ALTER TABLE ONLY prontuarios
    ADD CONSTRAINT prontuarios_pkey PRIMARY KEY (id);



ALTER TABLE ONLY pacientes
    ADD CONSTRAINT unique_email_clinica UNIQUE (email, clinica_id);



ALTER TABLE ONLY usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);



ALTER TABLE ONLY usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);



ALTER TABLE ONLY agendamentos
    ADD CONSTRAINT agendamentos_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);



ALTER TABLE ONLY agendamentos
    ADD CONSTRAINT agendamentos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES pacientes(id);



ALTER TABLE ONLY agendamentos
    ADD CONSTRAINT agendamentos_psicologo_id_fkey FOREIGN KEY (psicologo_id) REFERENCES usuarios(id);



ALTER TABLE ONLY pacientes
    ADD CONSTRAINT pacientes_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);



ALTER TABLE ONLY pacientes
    ADD CONSTRAINT pacientes_psicologo_id_fkey FOREIGN KEY (psicologo_id) REFERENCES usuarios(id);



ALTER TABLE ONLY papel_permissoes
    ADD CONSTRAINT papel_permissoes_papel_id_fkey FOREIGN KEY (papel_id) REFERENCES papeis(id);



ALTER TABLE ONLY papel_permissoes
    ADD CONSTRAINT papel_permissoes_permissao_id_fkey FOREIGN KEY (permissao_id) REFERENCES permissoes(id);



ALTER TABLE ONLY prontuarios
    ADD CONSTRAINT prontuarios_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);



ALTER TABLE ONLY prontuarios
    ADD CONSTRAINT prontuarios_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES pacientes(id);



ALTER TABLE ONLY prontuarios
    ADD CONSTRAINT prontuarios_psicologo_id_fkey FOREIGN KEY (psicologo_id) REFERENCES usuarios(id);



ALTER TABLE ONLY usuarios
    ADD CONSTRAINT usuarios_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);



ALTER TABLE ONLY usuarios
    ADD CONSTRAINT usuarios_papel_id_fkey FOREIGN KEY (papel_id) REFERENCES papeis(id);





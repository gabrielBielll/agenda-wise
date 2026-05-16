












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



















', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
































































































-- DATA LOAD (ORDERED BY DEPENDENCY) --


-- Data for: clinicas
INSERT INTO clinicas VALUES ('967b3f16-04c2-489c-90d4-306bd967844e', 'Deep Saúde Demo', 5);

-- Data for: papeis
INSERT INTO papeis VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'admin_clinica');
INSERT INTO papeis VALUES ('2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'psicologo');
INSERT INTO papeis VALUES ('ae02a006-875b-478f-95a6-fc5119a7e3bb', 'secretario');

-- Data for: permissoes
INSERT INTO permissoes VALUES ('c037aa8b-4cf5-4e9e-af76-fb0e53d908b0', 'gerenciar_psicologos');
INSERT INTO permissoes VALUES ('0a885a41-8161-47a0-913e-5833b920d568', 'visualizar_todos_agendamentos');
INSERT INTO permissoes VALUES ('e40cf58b-cb9d-47cf-bf8c-a2b64ba0b5e2', 'gerenciar_pacientes');
INSERT INTO permissoes VALUES ('ab77488b-5680-40a6-9614-917dd6e0ba35', 'visualizar_pacientes');
INSERT INTO permissoes VALUES ('fc95b709-4764-4ab5-8939-3e0009093941', 'gerenciar_agendamentos_clinica');
INSERT INTO permissoes VALUES ('385df50a-8a10-4519-8bb0-6186a4d2ecd1', 'gerenciar_usuarios');
INSERT INTO permissoes VALUES ('f4a4f818-677f-445e-b931-4359c19d20fc', 'gerenciar_prontuarios');

-- Data for: papel_permissoes
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'c037aa8b-4cf5-4e9e-af76-fb0e53d908b0');
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', '0a885a41-8161-47a0-913e-5833b920d568');
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'e40cf58b-cb9d-47cf-bf8c-a2b64ba0b5e2');
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'ab77488b-5680-40a6-9614-917dd6e0ba35');
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'fc95b709-4764-4ab5-8939-3e0009093941');
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', '385df50a-8a10-4519-8bb0-6186a4d2ecd1');
INSERT INTO papel_permissoes VALUES ('1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'f4a4f818-677f-445e-b931-4359c19d20fc');
INSERT INTO papel_permissoes VALUES ('2a3b8aec-2348-4eb1-847a-a82516cfe6b6', '0a885a41-8161-47a0-913e-5833b920d568');
INSERT INTO papel_permissoes VALUES ('2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'e40cf58b-cb9d-47cf-bf8c-a2b64ba0b5e2');
INSERT INTO papel_permissoes VALUES ('2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'ab77488b-5680-40a6-9614-917dd6e0ba35');
INSERT INTO papel_permissoes VALUES ('2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'fc95b709-4764-4ab5-8939-3e0009093941');
INSERT INTO papel_permissoes VALUES ('2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'f4a4f818-677f-445e-b931-4359c19d20fc');

-- Data for: usuarios
INSERT INTO usuarios VALUES ('912e8b25-845d-45d0-bcd9-a6a300d78aff', '967b3f16-04c2-489c-90d4-306bd967844e', '1f512630-1e2f-43b0-97fb-5df3dfffc8fe', 'Gabriel Admin', 'admin@deepsaude.com', 'bcrypt+sha512$81440725041e19d5ccd0d3aec925283f$12$440d56e9582db82e45f2833db73f2744fc6451ac9e558201', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('9819cdc9-264e-452f-8f82-0324ea3225fd', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'psi4', 'psi4@gmail.com', 'bcrypt+sha512$ffd8df42a8bf41386468a46834bbf522$12$2bf02f0b2531a59c32ab71486218ec85480abf9a6a64dd8e', NULL, NULL, NULL, NULL, NULL, NULL, 'tcc', NULL);
INSERT INTO usuarios VALUES ('b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'psi2', 'psi2@gmail.com', 'bcrypt+sha512$7fe7ed1897e1eb096184a115db5cfa78$12$c79ca8974d06acf18109bc95b1490165802a4a1853a0602b', NULL, NULL, NULL, NULL, NULL, NULL, 'tcc', NULL);
INSERT INTO usuarios VALUES ('64d97988-cbaf-4650-acde-0836b0d4cb77', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Manda-Chuva', 'Manda-Chuva@gmail.com', 'bcrypt+sha512$b5e6f8a824a37758e53beeece090159e$12$7654036f6791f4d86162be8b182727dd1b97510b90133768', '00000000000', '21999999999', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('ac0680d7-7739-4dc1-b57b-b885ec889b01', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Fred Flintstone', 'FredFlintstone@gmail.com', 'bcrypt+sha512$27dbc3e1ecc1b58fa3acb74920bef1c0$12$9d84581394ad237b63851e62b19d928fd21092544ee02139', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('310e4e6d-8c32-4ce8-8768-b8b17ed0c30a', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Zé Colmeia', 'ZeColmeia@gmail.com', 'bcrypt+sha512$c24e81b094b210a34360ac5b2e13e3cf$12$33ed1dfbfb4bfd9cfaf8d540e073b345ae00f60c403a6dd0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('059124d1-3c56-4dd8-b4e1-f52cbd156168', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'PepeLegal ', 'PepeLegal@gmail.com', 'bcrypt+sha512$f8f2cf7564d8ea8bacb2e0f44fcbd2c8$12$afae71d864b6ad8019e4d9d10c5a1ce4f8852b7bdf947703', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('26489230-7e26-4c10-ae65-56a8d2a6e8f1', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Ricochete', 'Ricochete@gmail.com', 'bcrypt+sha512$5e08f1161903d856c156e0855927b23b$12$1778f600e7914e467fa4a73d9d49df75227e21f733bd1985', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('0c1df130-7025-45fa-bc34-d321da973071', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Formiga Atômica', 'FormigaAtomica@gmail.com', 'bcrypt+sha512$def6a48063997313d4d19b761a4f3d4c$12$65a07aeec32ae38451a9f5822f6572b3b3c23cddb1e33b1e', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('0444136b-bd59-40ad-aebc-cbad47551edf', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Pernalonga', 'Pernalonga@gmail.com', 'bcrypt+sha512$28358d53e8e5dc6b6cd58b1c590e87e6$12$3a559e2382b1a94c31a51a7424483cde53a07f46c135f2dc', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('f638985e-798f-4355-bbec-a825b948a672', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Patolino', 'Patolino@gmail.com', 'bcrypt+sha512$1c466b5683b314bdf13175b21129c1c5$12$20b21e74245e4207bf6b1f675e2ff4495b2a2034ef74203a', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('48e6b249-f976-45f1-b724-7ac12413a5e0', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Gaguinho', 'Gaguinho@gmail.com', 'bcrypt+sha512$5a828f8e248509316239065ba2227b31$12$ca60facd7a4ab96f9f3666f6642ecb009cd89b53dbe97b92', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('a65bdfcf-2d74-4ddf-9ef8-dd8aa3c61682', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Frangolino', 'Frangolino@gmail.com', 'bcrypt+sha512$faf80261d82c20df91f17fe001678ee5$12$4dae4f2ccefa4ac97739f683b3dc0fb3f3b9f459bf0c4b74', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO usuarios VALUES ('ddf89084-1524-4748-93fd-dad6df68e399', '967b3f16-04c2-489c-90d4-306bd967844e', '2a3b8aec-2348-4eb1-847a-a82516cfe6b6', 'Dr. Psicólogo Teste', 'psi@deepsaude.com', 'bcrypt+sha512$75ee3ade5840b7d44097c19bb3cb4a23$12$a1ee6ef03540863f8c95f990e707cff0272a0b54b98f802a', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- Data for: pacientes
INSERT INTO pacientes VALUES ('cbd3b04b-753d-480d-a2e8-5c957eff617e', '967b3f16-04c2-489c-90d4-306bd967844e', 'paciente 2', 'email2@gmail.com', '24998364520', '2000-01-26', 'teste de texto', NULL, 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('7e2b85ec-5fb1-4ec6-a278-98190b576145', '967b3f16-04c2-489c-90d4-306bd967844e', 'pedro pedra', 'pedropedra@gmail.com', '2188888888', '2001-01-01', 'enderco
INSERT INTO pacientes VALUES ('91d02e21-9e3e-4fbb-a938-69d5afa1d788', '967b3f16-04c2-489c-90d4-306bd967844e', 'peter perfeito', 'peterperfeito@gmail.com', '2167896543', '2001-01-01', '', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('2769c58b-41ae-4cba-858a-70349c863e92', '967b3f16-04c2-489c-90d4-306bd967844e', 'Penelope Charmosa', 'penelope@gmail.com', '216584734598', '1996-01-27', '', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('cd2b8e9d-980e-4a01-8bd4-af8a1d879839', '967b3f16-04c2-489c-90d4-306bd967844e', 'Dick vigarista', 'dickvigarista@gmail.com', '21999999999', '1995-02-01', '', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('f5527915-0fde-4ded-aa7c-ad82d0fcda26', '967b3f16-04c2-489c-90d4-306bd967844e', 'Tiao gaviao', 'tiao@gmail.com', '2188888888', '2000-01-01', '', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('5e8dd743-5406-4162-8476-a500415297f6', '967b3f16-04c2-489c-90d4-306bd967844e', 'capitao caverna', 'capitaocaverna@gmail.com', '2188888888', '2000-01-01', '', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('f7443e27-1025-4223-883d-7be34b993382', '967b3f16-04c2-489c-90d4-306bd967844e', 'teste', 'email@email.com', '24998364520', '2011-01-26', 'teste', NULL, NULL, NULL, NULL, NULL, NULL, 'inativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('6adae9fe-b1b2-4335-8554-b8fadab3b304', '967b3f16-04c2-489c-90d4-306bd967844e', 'primeiro paciente ', 'primeiro@gmail.com', '24998364520', '2000-01-26', 'teste de texto', NULL, NULL, NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('159ed458-6680-4b18-8b1a-dbb73a17676e', '967b3f16-04c2-489c-90d4-306bd967844e', 'segundo paciente teste', 'segundo@gmail.com', '24998364520', '2001-01-01', 'dnonyrnwhcn', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', 'hgkjghkjg', 'kjgkghkgh', 'dhbfjdshgghkgkjhg', 'jhgkjg', 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('3ed85875-d2dc-457a-8900-a927a6391a79', '967b3f16-04c2-489c-90d4-306bd967844e', 'Testeedit', 'teste@gmail.com', '24998364520', '2005-01-26', 'teste de texto', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, NULL, NULL, 'avulso');
INSERT INTO pacientes VALUES ('101b3d51-6945-4ff7-8b40-06f949ac3b3a', '967b3f16-04c2-489c-90d4-306bd967844e', 'joao limao', 'joaolimao@gmail.com', '21999999999', '2001-01-01', 'endereço', NULL, 'ddf89084-1524-4748-93fd-dad6df68e399', NULL, NULL, NULL, NULL, 'ativo', false, 'google', NULL, 'mensal');
INSERT INTO pacientes VALUES ('4e14ddbb-7060-4dcd-8a22-5f5d003ecd72', '967b3f16-04c2-489c-90d4-306bd967844e', 'pacientepsi2', 'pacientepsi2@gmail.com', '24998364520', '2000-02-02', 'teste oiaaaa', NULL, 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', NULL, NULL, NULL, NULL, 'ativo', false, 'instagram', NULL, 'avulso');
INSERT INTO pacientes VALUES ('69c1a0f3-60fd-48e3-8e60-af00e27258b2', '967b3f16-04c2-489c-90d4-306bd967844e', 'pacientecriadonoadminpsi2', 'pacientepsi2feitonoadmin@gmail.com', '21000000000', '2007-01-26', 'tcvgdjvtevcgmgsvcd', NULL, 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', NULL, NULL, NULL, NULL, 'ativo', true, NULL, NULL, 'avulso');

-- Data for: agendamentos
INSERT INTO agendamentos VALUES ('62744227-ab20-4286-a5e9-5f7c50fcac02', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-29 07:00:00', 80.00, 170, 'cancelado', NULL, NULL, 40.00, 'pago', 'pendente');
INSERT INTO agendamentos VALUES ('cf151209-83e4-44bb-94cb-4959d3372fb7', '967b3f16-04c2-489c-90d4-306bd967844e', '6adae9fe-b1b2-4335-8554-b8fadab3b304', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-03 16:24:00', 0.00, 50, 'cancelado', NULL, NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('c6402a60-1891-4dc2-9b25-577866ccbcc7', '967b3f16-04c2-489c-90d4-306bd967844e', '69c1a0f3-60fd-48e3-8e60-af00e27258b2', 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', '2026-01-31 05:21:00', 0.00, 50, 'realizado', NULL, NULL, 50.00, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('9383636d-f3dd-470d-994b-fded50231956', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-29 08:00:00', 200.00, 50, 'realizado', NULL, NULL, 0.00, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('39869764-8f4f-4d10-847c-49d6f6e397fa', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 18:30:00', 0.00, 50, 'cancelado', NULL, NULL, NULL, 'transferido', 'pendente');
INSERT INTO agendamentos VALUES ('96c93f28-44e9-40d3-8c2f-9b6840a7f865', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-28 11:00:00', 0.00, 50, 'realizado', NULL, '', 100.00, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('d0d0da50-3da2-4c49-b2ed-1089b1755cbe', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-28 06:00:00', 0.00, 219, 'realizado', NULL, NULL, 0.00, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('6936f617-3d91-4edb-bca9-2a6cd50f0138', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 20:03:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('0af4fbab-81bd-4ddc-809d-f5e31561aa96', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 18:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('0704b3ae-d418-4d9c-9360-0ced4a33bd4d', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 10:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('7ae20e70-f74b-4e86-be65-af51de76776c', '967b3f16-04c2-489c-90d4-306bd967844e', '69c1a0f3-60fd-48e3-8e60-af00e27258b2', 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', '2026-01-27 01:26:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('77448687-1fa1-47f2-946b-85cbd2bde501', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-26 21:08:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('6769d018-00c4-4796-b3c3-8b2493236a3d', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-26 18:59:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('0ce27c0d-416f-489d-8837-e39e0b2c2e55', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-26 13:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('f651a41c-e0ca-4cc7-a621-c156a55b3933', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-25 13:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('4da06d8b-435e-4265-bea4-018f6576e3c3', '967b3f16-04c2-489c-90d4-306bd967844e', '6adae9fe-b1b2-4335-8554-b8fadab3b304', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-24 21:51:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('7e117825-f230-45d8-8c5f-8f7181fd249f', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-20 13:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('9945744f-9e8a-441f-8a3a-a0b860939227', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-20 12:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('64070170-e145-4d87-9bfa-b582c13d8ab5', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-20 11:00:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('4bd50114-f9c8-4e27-a519-350a4671f4f9', '967b3f16-04c2-489c-90d4-306bd967844e', 'cbd3b04b-753d-480d-a2e8-5c957eff617e', 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', '2026-01-08 19:49:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('c06eee15-1462-4ef6-90c8-2450239a805c', '967b3f16-04c2-489c-90d4-306bd967844e', '4e14ddbb-7060-4dcd-8a22-5f5d003ecd72', 'b84ec3cb-fae8-4a96-8ca4-aec5f290a0ca', '2026-01-26 22:07:00', 0.00, 50, 'realizado', NULL, NULL, NULL, 'pendente', 'pago');
INSERT INTO agendamentos VALUES ('662c0e96-7b48-4839-a799-3219aacfa800', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-30 09:00:00', 150.00, 1490, 'realizado', NULL, '', NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('ab79ebad-714b-440a-b6a7-0ae45ee031e2', '967b3f16-04c2-489c-90d4-306bd967844e', '101b3d51-6945-4ff7-8b40-06f949ac3b3a', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-26 09:00:00', 0.00, 50, 'cancelado', NULL, 'teste de observaçao', NULL, 'transferido', 'pago');
INSERT INTO agendamentos VALUES ('1374c5c9-b826-4079-b16d-e1779bd98a85', '967b3f16-04c2-489c-90d4-306bd967844e', 'cbd3b04b-753d-480d-a2e8-5c957eff617e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-08 09:57:00', 0.00, 50, 'cancelado', 'bfc4bd6b-068a-40ec-a183-de896e0b10d1', NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('9ee65a03-3ffc-4871-be09-352e107e21d4', '967b3f16-04c2-489c-90d4-306bd967844e', 'cbd3b04b-753d-480d-a2e8-5c957eff617e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-15 09:57:00', 0.00, 50, 'cancelado', 'bfc4bd6b-068a-40ec-a183-de896e0b10d1', NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('2fe47f89-89b5-4fbc-8489-2e127357d640', '967b3f16-04c2-489c-90d4-306bd967844e', 'cbd3b04b-753d-480d-a2e8-5c957eff617e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-22 09:57:00', 0.00, 50, 'cancelado', 'bfc4bd6b-068a-40ec-a183-de896e0b10d1', NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('1e6eb682-2d90-46d9-8f94-7e37931c6ae3', '967b3f16-04c2-489c-90d4-306bd967844e', 'cbd3b04b-753d-480d-a2e8-5c957eff617e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-03-01 09:57:00', 0.00, 50, 'cancelado', 'bfc4bd6b-068a-40ec-a183-de896e0b10d1', NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('41bebb5d-1006-438c-ad97-c34919db63bb', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-08 10:39:00', 100.00, 50, 'agendado', NULL, NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('4ff70dbb-b790-4518-bbb7-95f0f4dc6f30', '967b3f16-04c2-489c-90d4-306bd967844e', '2769c58b-41ae-4cba-858a-70349c863e92', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-22 07:00:00', 100.00, 50, 'agendado', '6349cad7-28f1-42da-a19c-b914cf59401b', '', NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('11ca0911-72b5-4eb7-a651-45d07c0af3c0', '967b3f16-04c2-489c-90d4-306bd967844e', '5e8dd743-5406-4162-8476-a500415297f6', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-07 17:42:00', 5.00, 50, 'realizado', '6700b8a9-0aef-44e6-befd-51940f2b16c8', NULL, NULL, 'pendente', 'pago');
INSERT INTO agendamentos VALUES ('dade1497-0b31-4e44-a074-a3f3df2653c7', '967b3f16-04c2-489c-90d4-306bd967844e', '2769c58b-41ae-4cba-858a-70349c863e92', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-01 07:00:00', 120.00, 50, 'realizado', '6349cad7-28f1-42da-a19c-b914cf59401b', '', NULL, 'pendente', 'pago');
INSERT INTO agendamentos VALUES ('95aacad4-9320-4177-a939-ee65135bb83f', '967b3f16-04c2-489c-90d4-306bd967844e', '2769c58b-41ae-4cba-858a-70349c863e92', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-08 07:00:00', 120.00, 50, 'agendado', '6349cad7-28f1-42da-a19c-b914cf59401b', '', NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('17408ca3-4476-4abd-88c8-650937a552a9', '967b3f16-04c2-489c-90d4-306bd967844e', '2769c58b-41ae-4cba-858a-70349c863e92', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-15 07:00:00', 150.00, 50, 'agendado', '6349cad7-28f1-42da-a19c-b914cf59401b', '', NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('5c3c41d0-6436-4961-9510-3d3b68e13903', '967b3f16-04c2-489c-90d4-306bd967844e', '5e8dd743-5406-4162-8476-a500415297f6', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-14 17:42:00', 5.00, 50, 'agendado', '6700b8a9-0aef-44e6-befd-51940f2b16c8', NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('c55a45c4-b253-4b60-9cfb-7001d8078b3a', '967b3f16-04c2-489c-90d4-306bd967844e', '5e8dd743-5406-4162-8476-a500415297f6', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-21 17:42:00', 5.00, 50, 'agendado', '6700b8a9-0aef-44e6-befd-51940f2b16c8', NULL, NULL, 'pendente', 'pendente');
INSERT INTO agendamentos VALUES ('c30a0807-9d88-407a-a79b-d5325b4f2cdf', '967b3f16-04c2-489c-90d4-306bd967844e', '5e8dd743-5406-4162-8476-a500415297f6', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-02-28 17:42:00', 5.00, 50, 'agendado', '6700b8a9-0aef-44e6-befd-51940f2b16c8', NULL, NULL, 'pendente', 'pendente');

-- Data for: bloqueios_agenda
INSERT INTO bloqueios_agenda VALUES ('16e1d3dc-47f9-4a98-874e-27d340344c8a', '967b3f16-04c2-489c-90d4-306bd967844e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-03-30 08:00:00', '2026-03-30 09:00:00', NULL, false, '2026-01-29 19:10:51.512814', '5cf48be6-7b7f-48fd-ba76-85415c65ddb8');
INSERT INTO bloqueios_agenda VALUES ('4c9b0be0-587b-4c13-8d50-8dc0fb8edf38', '967b3f16-04c2-489c-90d4-306bd967844e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-04-13 08:00:00', '2026-04-13 09:00:00', NULL, false, '2026-01-29 19:10:51.613678', '5cf48be6-7b7f-48fd-ba76-85415c65ddb8');
INSERT INTO bloqueios_agenda VALUES ('9d283f98-7a64-4665-82df-314c25c623e4', '967b3f16-04c2-489c-90d4-306bd967844e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-05-04 09:00:00', '2026-05-04 10:00:00', NULL, false, '2026-01-29 19:47:20.300289', '31893ac3-9707-4ec0-9f12-576126670d7d');
INSERT INTO bloqueios_agenda VALUES ('6990d7d4-ae45-48fa-b855-d93c64696ea7', '967b3f16-04c2-489c-90d4-306bd967844e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-05-11 09:00:00', '2026-05-11 10:00:00', NULL, false, '2026-01-29 19:47:20.350036', '31893ac3-9707-4ec0-9f12-576126670d7d');
INSERT INTO bloqueios_agenda VALUES ('5074ad88-1ae3-4571-b345-052ef5da3850', '967b3f16-04c2-489c-90d4-306bd967844e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-05-18 09:00:00', '2026-05-18 10:00:00', NULL, false, '2026-01-29 19:47:20.393321', '31893ac3-9707-4ec0-9f12-576126670d7d');
INSERT INTO bloqueios_agenda VALUES ('5e158b46-7322-4f2b-92d9-6574c15443fa', '967b3f16-04c2-489c-90d4-306bd967844e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-26 07:00:00', '2026-01-26 08:00:00', NULL, false, '2026-01-29 20:43:57.299077', '26a09d0b-0b2d-4fab-82a6-d5d9a26ee171');

-- Data for: prontuarios
INSERT INTO prontuarios VALUES ('7236938f-71e1-4e68-8758-a7029a3b5845', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 08:34:50.07038', 'etsbkdhj', 'sessao', 'teste', 'teste', 'teste', 'tese', 'e34acfb0-eca5-4089-9588-9e264cb971ae', 3);
INSERT INTO prontuarios VALUES ('ca3fbbdc-4877-49ab-b060-ea73955ad5a7', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 08:47:33.854559', 'jbkjbbkh', 'sessao', 'teste', 'jbhkbhb', 'jbhkbhb', 'jhbjkbkjb', '77448687-1fa1-47f2-946b-85cbd2bde501', 3);
INSERT INTO prontuarios VALUES ('feb606a5-8728-464e-971f-fd34cbd26f18', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 12:58:55.099924', 'bkhghkgh', 'sessao', '', '', '', '', '39869764-8f4f-4d10-847c-49d6f6e397fa', 5);
INSERT INTO prontuarios VALUES ('97c46c63-376f-473e-8f70-4f972bed475c', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-27 08:32:47.57379', 'teste', 'sessao', '', '', '', 'tednjknbb', '6769d018-00c4-4796-b3c3-8b2493236a3d', 5);
INSERT INTO prontuarios VALUES ('09b86999-8baf-48c4-a39f-2d425acb2ec1', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-28 06:58:49.28929', 'fdhfdghfgh', 'sessao', '', '', '', '', 'cf151209-83e4-44bb-94cb-4959d3372fb7', 5);
INSERT INTO prontuarios VALUES ('a55874ed-d2d6-44c4-ace9-5081a659744d', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-28 06:59:08.230888', 'etretwet', 'sessao', '', '', '', '', 'c3e1af7c-9e6e-466b-9219-a13d3ca82dad', 4);
INSERT INTO prontuarios VALUES ('0efa783b-8048-49b0-a805-9f8c085354b6', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-28 06:59:25.386673', 'trewtete', 'sessao', '', '', '', '', 'd0d0da50-3da2-4c49-b2ed-1089b1755cbe', NULL);
INSERT INTO prontuarios VALUES ('0a04838a-5761-4013-bc2e-d443b431e374', '967b3f16-04c2-489c-90d4-306bd967844e', '159ed458-6680-4b18-8b1a-dbb73a17676e', 'ddf89084-1524-4748-93fd-dad6df68e399', '2026-01-28 07:03:53.614837', 'yuiyoo', 'sessao', '', '', '', '', '22577608-0ddc-41e1-a30e-924699f9d077', NULL);

-- CONSTRAINTS (FKs) --

ALTER TABLE agendamentos
    ADD CONSTRAINT agendamentos_pkey PRIMARY KEY (id);
ALTER TABLE bloqueios_agenda
    ADD CONSTRAINT bloqueios_agenda_pkey PRIMARY KEY (id);
ALTER TABLE clinicas
    ADD CONSTRAINT clinicas_pkey PRIMARY KEY (id);
ALTER TABLE pacientes
    ADD CONSTRAINT pacientes_pkey PRIMARY KEY (id);
ALTER TABLE papeis
    ADD CONSTRAINT papeis_nome_papel_key UNIQUE (nome_papel);
ALTER TABLE papeis
    ADD CONSTRAINT papeis_pkey PRIMARY KEY (id);
ALTER TABLE papel_permissoes
    ADD CONSTRAINT papel_permissoes_pkey PRIMARY KEY (papel_id, permissao_id);
ALTER TABLE permissoes
    ADD CONSTRAINT permissoes_nome_permissao_key UNIQUE (nome_permissao);
ALTER TABLE permissoes
    ADD CONSTRAINT permissoes_pkey PRIMARY KEY (id);
ALTER TABLE prontuarios
    ADD CONSTRAINT prontuarios_pkey PRIMARY KEY (id);
ALTER TABLE pacientes
    ADD CONSTRAINT unique_email_clinica UNIQUE (email, clinica_id);
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE agendamentos
    ADD CONSTRAINT agendamentos_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);
ALTER TABLE agendamentos
    ADD CONSTRAINT agendamentos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES pacientes(id);
ALTER TABLE agendamentos
    ADD CONSTRAINT agendamentos_psicologo_id_fkey FOREIGN KEY (psicologo_id) REFERENCES usuarios(id);
ALTER TABLE pacientes
    ADD CONSTRAINT pacientes_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);
ALTER TABLE pacientes
    ADD CONSTRAINT pacientes_psicologo_id_fkey FOREIGN KEY (psicologo_id) REFERENCES usuarios(id);
ALTER TABLE papel_permissoes
    ADD CONSTRAINT papel_permissoes_papel_id_fkey FOREIGN KEY (papel_id) REFERENCES papeis(id);
ALTER TABLE papel_permissoes
    ADD CONSTRAINT papel_permissoes_permissao_id_fkey FOREIGN KEY (permissao_id) REFERENCES permissoes(id);
ALTER TABLE prontuarios
    ADD CONSTRAINT prontuarios_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);
ALTER TABLE prontuarios
    ADD CONSTRAINT prontuarios_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES pacientes(id);
ALTER TABLE prontuarios
    ADD CONSTRAINT prontuarios_psicologo_id_fkey FOREIGN KEY (psicologo_id) REFERENCES usuarios(id);
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES clinicas(id);
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_papel_id_fkey FOREIGN KEY (papel_id) REFERENCES papeis(id);
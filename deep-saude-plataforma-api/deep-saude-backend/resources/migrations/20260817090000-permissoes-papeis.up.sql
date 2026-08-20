INSERT INTO permissoes (nome_permissao)
VALUES ('gerenciar_pagamentos')
ON CONFLICT DO NOTHING;
--;;
DELETE FROM papel_permissoes
 WHERE permissao_id IN (
   SELECT id FROM permissoes
    WHERE nome_permissao IN (
      'gerenciar_psicologos', 'gerenciar_usuarios', 'gerenciar_pacientes',
      'visualizar_pacientes', 'gerenciar_agendamentos_clinica',
      'visualizar_todos_agendamentos', 'gerenciar_prontuarios',
      'gerenciar_integracao_google', 'gerenciar_pagamentos'));
--;;
-- Admin recebe tudo explicitamente: SEC-006 removerá o bypass do código.
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'admin_clinica'
   AND per.nome_permissao IN (
     'gerenciar_psicologos', 'gerenciar_usuarios', 'gerenciar_pacientes',
     'visualizar_pacientes', 'gerenciar_agendamentos_clinica',
     'visualizar_todos_agendamentos', 'gerenciar_prontuarios',
     'gerenciar_integracao_google', 'gerenciar_pagamentos')
ON CONFLICT DO NOTHING;
--;;
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'psicologo'
   AND per.nome_permissao IN (
     'gerenciar_pacientes', 'visualizar_pacientes',
     'gerenciar_agendamentos_clinica', 'gerenciar_prontuarios')
ON CONFLICT DO NOTHING;
--;;
-- O nome é amplo, mas o handler limita a psicóloga à própria agenda.
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'secretario'
   AND per.nome_permissao IN (
     'gerenciar_pacientes', 'visualizar_pacientes',
     'gerenciar_agendamentos_clinica', 'visualizar_todos_agendamentos')
ON CONFLICT DO NOTHING;

DELETE FROM papel_permissoes
 WHERE permissao_id IN (
   SELECT id FROM permissoes
    WHERE nome_permissao IN (
      'gerenciar_psicologos', 'gerenciar_usuarios', 'gerenciar_pacientes',
      'visualizar_pacientes', 'gerenciar_agendamentos_clinica',
      'visualizar_todos_agendamentos', 'gerenciar_prontuarios',
      'gerenciar_integracao_google', 'gerenciar_pagamentos'));
--;;
DELETE FROM permissoes WHERE nome_permissao = 'gerenciar_pagamentos';
--;;
-- Estado anterior desta permissão, criada pela migration do Google.
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'admin_clinica'
   AND per.nome_permissao = 'gerenciar_integracao_google'
ON CONFLICT DO NOTHING;

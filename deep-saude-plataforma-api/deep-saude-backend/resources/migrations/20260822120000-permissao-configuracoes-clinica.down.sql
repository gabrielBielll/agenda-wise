DELETE FROM papel_permissoes
 WHERE permissao_id IN (
   SELECT id FROM permissoes WHERE nome_permissao = 'gerenciar_configuracoes_clinica');
--;;
DELETE FROM permissoes WHERE nome_permissao = 'gerenciar_configuracoes_clinica';

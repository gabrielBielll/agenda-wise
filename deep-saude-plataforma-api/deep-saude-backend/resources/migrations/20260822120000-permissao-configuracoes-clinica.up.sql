-- SEC-006 (metade segura, autorizada como conserto; a remoção do bypass NÃO
-- entra aqui). A permissão `gerenciar_configuracoes_clinica` guarda a paleta da
-- clínica em `paleta-routes` (PUT/DELETE), e nunca existiu em migration nenhuma.
-- Hoje o efeito "só admin" vem do BYPASS de admin no código
-- (core.clj, `wrap-checar-permissao`): como ninguém possui essa permissão e o
-- admin ignora a checagem, a paleta funciona por acidente. No dia em que o
-- bypass for removido (SEC-006), a paleta quebraria EM SILÊNCIO para o admin —
-- a mesma família de defeito que este projeto já pagou caro.
--
-- Esta migration registra a permissão e a concede ao admin_clinica, de modo que
-- a remoção futura do bypass não dependa de ninguém lembrar deste buraco.
INSERT INTO permissoes (nome_permissao)
VALUES ('gerenciar_configuracoes_clinica')
ON CONFLICT DO NOTHING;
--;;
INSERT INTO papel_permissoes (papel_id, permissao_id)
SELECT p.id, per.id
  FROM papeis p, permissoes per
 WHERE p.nome_papel = 'admin_clinica'
   AND per.nome_permissao = 'gerenciar_configuracoes_clinica'
ON CONFLICT DO NOTHING;

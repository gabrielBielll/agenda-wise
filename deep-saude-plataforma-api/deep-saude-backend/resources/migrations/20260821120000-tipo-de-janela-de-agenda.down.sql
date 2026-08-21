-- ⚠️ Descer isto APAGA a distinção, não a preserva.
--
-- Toda janela `disponivel` vira indistinguível de bloqueio — e como as checagens
-- de conflito voltam a tratar qualquer linha como proibição, os horários que a
-- psicóloga ofereceu passam a impedir agendamento. Se houver linha
-- `tipo = 'disponivel'` no banco, APAGUE-AS antes de descer, ou o rollback deixa
-- a agenda mentindo em silêncio.
--
--   DELETE FROM bloqueios_agenda WHERE tipo = 'disponivel';
--
-- Não faço isso aqui de propósito: rollback que apaga dado do usuário sem ele
-- pedir é pior que rollback que recusa.
ALTER TABLE bloqueios_agenda DROP CONSTRAINT IF EXISTS bloqueios_agenda_tipo_check;
--;;
DROP INDEX IF EXISTS idx_bloqueios_tipo;
--;;
ALTER TABLE bloqueios_agenda DROP COLUMN IF EXISTS tipo;

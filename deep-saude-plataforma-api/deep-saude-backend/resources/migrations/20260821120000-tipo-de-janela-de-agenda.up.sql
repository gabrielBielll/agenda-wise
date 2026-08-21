-- D-024 — o `disponível` entra, e ele mora AQUI, não em `agendamentos`.
--
-- 🔴 Por que nesta tabela, e não numa nova nem no vocabulário de sessão.
--
-- `disponível` é estado de JANELA DE AGENDA, não de sessão. Pô-lo em
-- `status-sessao` criaria linha em `agendamentos` sem paciente, sem valor e sem
-- psicóloga responsável — o caminho que o `dominio.clj` já registra como o
-- desastre do `status_repasse`. E tabela nova duplicaria o intervalo
-- (clinica, psicologo, inicio, fim) que esta já modela: o disponível é o
-- bloqueio com o sinal invertido, não outra coisa.
--
-- 🔴 A ARMADILHA QUE ESTA MIGRATION EXISTE PARA NÃO ABRIR — leia antes de mexer.
--
-- Até hoje, TODA linha desta tabela significa proibição. As duas checagens de
-- conflito (`core.clj`, na criação e na atualização de agendamento) fazem
-- `SELECT id FROM bloqueios_agenda WHERE ... intervalo sobreposto` e recusam se
-- vier qualquer coisa. Gravar `disponivel` aqui SEM filtrar por tipo faz um
-- horário OFERECIDO passar a IMPEDIR o agendamento — o oposto exato do que ele
-- significa.
--
-- É a mesma forma da GC-009 (evento externo do Google virando bloqueio, e um
-- `[DISPONÍVEL]` importado por essa regra escondendo as horas que a psicóloga
-- acabou de oferecer), só que acontecendo dentro do nosso próprio banco. E o
-- sintoma é uma AUSÊNCIA: sem erro, sem log, sem ninguém perceber.
--
-- Por isso o `DEFAULT 'bloqueio'`: toda linha que já existe continua sendo
-- proibição, e nenhuma leitura antiga muda de significado ao subir isto. A
-- migration sozinha não altera comportamento nenhum — quem altera é o filtro
-- `tipo = 'bloqueio'` que entra nas duas checagens, no mesmo commit.
ALTER TABLE bloqueios_agenda
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'bloqueio';
--;;

-- Vocabulário fechado no BANCO, pelo mesmo motivo da `paleta_clinica`: coluna de
-- estado sem validação é campo de texto livre com nome bonito. O handler devolve
-- 422 legível; isto é a rede embaixo dele, para escrita que não passe pelo
-- handler — o semeador, por exemplo.
ALTER TABLE bloqueios_agenda
  ADD CONSTRAINT bloqueios_agenda_tipo_check
  CHECK (tipo IN ('bloqueio', 'disponivel'));
--;;

-- As duas checagens de conflito filtram por (clinica, psicologo, intervalo) e
-- agora também por tipo. O índice cobre o caminho quente das duas.
CREATE INDEX IF NOT EXISTS idx_bloqueios_tipo
  ON bloqueios_agenda (clinica_id, psicologo_id, tipo);

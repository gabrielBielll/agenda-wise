-- Índices das tabelas de negócio.
--
-- Antes desta migration, `agendamentos`, `pacientes`, `prontuarios`,
-- `usuarios` e `bloqueios_agenda` tinham APENAS as chaves primárias e os
-- unique constraints. Nenhum índice de acesso.
--
-- Como toda query do sistema filtra por clinica_id, e nenhuma delas pode usar a
-- PK (que é o UUID da linha), qualquer listagem de agenda era varredura
-- completa da tabela. Pior: a checagem de conflito na criação de série roda uma
-- vez POR OCORRÊNCIA — criar uma recorrência de 40 sessões fazia 40 varreduras
-- completas de `agendamentos`.
--
-- Isso não aparece com o banco de demonstração e aparece de uma vez quando a
-- clínica acumula alguns anos de histórico.

-- ---------------------------------------------------------------------------
-- agendamentos — a tabela quente
-- ---------------------------------------------------------------------------

-- Listagem do calendário: WHERE clinica_id = ? ORDER BY data_hora_sessao DESC
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_data
  ON agendamentos (clinica_id, data_hora_sessao DESC);
--;;
-- Checagem de conflito e agenda do psicólogo:
-- WHERE clinica_id = ? AND psicologo_id = ? AND data_hora_sessao < ? AND (...) > ?
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_psi_data
  ON agendamentos (clinica_id, psicologo_id, data_hora_sessao);
--;;
-- Histórico do paciente e filtro por paciente na listagem
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_data
  ON agendamentos (paciente_id, data_hora_sessao DESC);
--;;
-- Job de sincronização de status: varre sessões passadas ainda 'agendado'.
-- Parcial, porque só interessa a fatia pendente — que é pequena e não cresce
-- junto com o histórico.
CREATE INDEX IF NOT EXISTS idx_agendamentos_status_pendente
  ON agendamentos (data_hora_sessao)
  WHERE status = 'agendado' OR status IS NULL;
--;;
-- ---------------------------------------------------------------------------
-- bloqueios_agenda — consultado junto com todo agendamento
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bloqueios_clinica_psi_periodo
  ON bloqueios_agenda (clinica_id, psicologo_id, data_inicio, data_fim);
--;;
CREATE INDEX IF NOT EXISTS idx_bloqueios_recorrencia
  ON bloqueios_agenda (recorrencia_id)
  WHERE recorrencia_id IS NOT NULL;
--;;
-- ---------------------------------------------------------------------------
-- pacientes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_status
  ON pacientes (clinica_id, status);
--;;
-- Psicólogo só enxerga os próprios pacientes: filtro presente em toda listagem
CREATE INDEX IF NOT EXISTS idx_pacientes_psicologo
  ON pacientes (psicologo_id);
--;;
-- ---------------------------------------------------------------------------
-- prontuarios
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_data
  ON prontuarios (paciente_id, data_registro DESC);
--;;
CREATE INDEX IF NOT EXISTS idx_prontuarios_agendamento
  ON prontuarios (agendamento_id)
  WHERE agendamento_id IS NOT NULL;
--;;
-- ---------------------------------------------------------------------------
-- usuarios — listagem de psicólogos da clínica
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_usuarios_clinica_papel
  ON usuarios (clinica_id, papel_id);

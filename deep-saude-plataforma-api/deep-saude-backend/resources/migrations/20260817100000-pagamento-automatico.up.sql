ALTER TABLE clinicas
  ADD COLUMN IF NOT EXISTS pagamento_automatico BOOLEAN NOT NULL DEFAULT false;
--;;

-- Preserva o comportamento das clínicas que já existiam antes de o modo virar
-- uma configuração explícita. Clínicas criadas depois desta migration herdam
-- o default seguro (desligado).
UPDATE clinicas SET pagamento_automatico = true;
--;;

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS status_pagamento_origem VARCHAR(20)
  NOT NULL DEFAULT 'desconhecido';

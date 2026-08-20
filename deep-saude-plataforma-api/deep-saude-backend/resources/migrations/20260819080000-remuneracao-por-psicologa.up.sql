-- A-004 / R-023: remuneração é configuração da psicóloga e o cálculo aplicado
-- vira snapshot da sessão. Alterar a regra atual nunca reescreve o passado.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS modalidade_repasse VARCHAR(20) NOT NULL DEFAULT 'percentual';
--;;
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS percentual_repasse DECIMAL(5, 2) DEFAULT 50.00;
--;;
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS valor_fixo_repasse DECIMAL(10, 2);
--;;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_modalidade_repasse_check
  CHECK (modalidade_repasse IN ('percentual', 'fixo'));
--;;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_regra_repasse_check
  CHECK (
    (modalidade_repasse = 'percentual'
      AND percentual_repasse >= 0 AND percentual_repasse <= 100
      AND valor_fixo_repasse IS NULL)
    OR
    (modalidade_repasse = 'fixo'
      AND valor_fixo_repasse >= 0
      AND percentual_repasse IS NULL)
  );
--;;
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS modalidade_repasse_aplicada VARCHAR(20);
--;;
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS percentual_repasse_aplicado DECIMAL(5, 2);
--;;
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS valor_fixo_repasse_aplicado DECIMAL(10, 2);
--;;
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS repasse_calculado_em TIMESTAMPTZ;
--;;
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_modalidade_repasse_check
  CHECK (modalidade_repasse_aplicada IS NULL
         OR modalidade_repasse_aplicada IN ('percentual', 'fixo'));

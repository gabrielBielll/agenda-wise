-- GC-016 — a cor de cada estado, por clínica.
--
-- 🔴 A tabela QUENTE não muda. `agendamentos` não ganha coluna de cor: a cor é
-- função de (estado, clínica), não do agendamento. São no máximo 5 linhas por
-- clínica, e isso tira este cartão do caminho crítico da migration no Cockroach
-- — que já nos mordeu uma vez com a reserva órfã do migratus.
--
-- 📌 A tabela guarda apenas o que a clínica ESCOLHEU. Quem não escolheu não tem
-- linha, e a leitura mescla com o "Padrão Deep Saúde" do `dominio.clj`.
-- Isso é deliberado: se a paleta dependesse de o provisionamento lembrar de
-- semear, clínica nova nasceria sem cor nenhuma — exatamente o defeito do
-- `pagamento_automatico` (A-026), onde `provisionar-clinica` não ligava a flag e
-- ninguém sabia. Aqui não há o que lembrar.
CREATE TABLE IF NOT EXISTS paleta_clinica (
  clinica_id   UUID NOT NULL REFERENCES clinicas(id),
  estado       TEXT NOT NULL,
  cor          TEXT NOT NULL,
  definida_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, estado)
);
--;;

-- Vocabulário fechado no BANCO, não só no código.
--
-- ⚠️ O motivo está na docstring do `dominio.clj`: `status_repasse` chegou a ter
-- cinco valores de três vocabulários diferentes na mesma coluna, porque o
-- servidor aceitava qualquer string. Coluna de estado sem validação é campo de
-- texto livre com nome bonito. O `dominio.clj` continua sendo a autoridade para
-- devolver 422 com mensagem legível; isto aqui é a rede embaixo dela, para
-- escrita que não passe pelo handler.
ALTER TABLE paleta_clinica
  ADD CONSTRAINT paleta_estado_valido
  CHECK (estado IN ('agendado', 'confirmado', 'realizado', 'cancelado', 'falta'));
--;;

ALTER TABLE paleta_clinica
  ADD CONSTRAINT paleta_cor_valida
  CHECK (cor IN ('lavanda', 'salvia', 'uva', 'flamingo', 'banana', 'tangerina',
                 'pavao', 'grafite', 'blueberry', 'manjericao', 'tomate'));
--;;

-- 📌 NÃO há semente aqui, e é de propósito.
--
-- Semear 5 linhas por clínica agora deixaria a tabela dizendo que toda clínica
-- "escolheu" a cor padrão — e aí não haveria como distinguir quem escolheu de
-- quem nunca abriu a tela. A ausência de linha É a informação "usa o padrão".
--
-- Consequência prática: subir esta migration não muda a aparência de ninguém,
-- porque o padrão do `dominio.clj` reproduz exatamente o que a agenda já pinta.
CREATE INDEX IF NOT EXISTS idx_paleta_clinica ON paleta_clinica (clinica_id);

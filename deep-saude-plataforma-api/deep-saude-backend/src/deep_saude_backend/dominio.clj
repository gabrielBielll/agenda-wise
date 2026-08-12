(ns deep-saude-backend.dominio
  "Vocabulários dos campos de estado, num lugar só.

   Motivo de existir: `status_repasse` chegou a ter cinco valores vindos de três
   vocabulários diferentes gravados na mesma coluna, porque o backend aceitava
   qualquer string que o cliente mandasse e cada tela tinha a própria ideia do
   que era um estado válido.

   Coluna de estado sem validação no servidor não é um campo, é um campo de
   texto livre com nome bonito. Estes conjuntos são a autoridade — o frontend
   pode duplicá-los por conveniência, mas quem decide é aqui."
  (:require [clojure.string :as str]))

(def status-sessao
  "Ciclo de vida da sessão."
  #{"agendado" "realizado" "cancelado" "falta"})

(def status-pagamento
  "Pagamento do paciente para a clínica."
  #{"pendente" "pago"})

(def status-repasse
  "Repasse da clínica para o psicólogo.

   `pendente` é o default do banco (ainda não liberado).
   `bloqueado` é derivado na exibição a partir do pagamento — aceito por
   compatibilidade, mas a UI não grava."
  #{"pendente" "bloqueado" "disponivel" "transferido"})

(def campos-validados
  "Campo -> conjunto de valores aceitos."
  {:status           status-sessao
   :status_pagamento status-pagamento
   :status_repasse   status-repasse})

(defn valor-invalido
  "Devolve uma mensagem se `valor` não pertence ao vocabulário de `campo`.
   nil quando está tudo certo (inclusive quando o valor é nil — campo ausente
   significa 'não mexer neste campo')."
  [campo valor]
  (when-let [permitidos (get campos-validados campo)]
    (when (and (some? valor) (not (contains? permitidos valor)))
      (str "Valor inválido para " (name campo) ": '" valor
           "'. Aceitos: " (str/join ", " (sort permitidos)) "."))))

(defn validar
  "Confere todos os campos de estado presentes em `body`.
   Devolve a primeira mensagem de erro, ou nil se está tudo válido."
  [body]
  (some (fn [campo] (valor-invalido campo (get body campo)))
        (keys campos-validados)))

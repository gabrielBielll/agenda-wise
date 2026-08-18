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

;; ---------------------------------------------------------------------------
;; Datas vindas de formulário
;; ---------------------------------------------------------------------------

(defn data-de-formulario
  "Converte `yyyy-mm-dd` vindo de formulário em `java.sql.Date`, ou `nil`.

   🔴 Existe por um defeito medido em 18/08: os quatro pontos que gravavam
   `data_nascimento` faziam `(when data_nascimento (Date/valueOf data_nascimento))`.

   **Em Clojure a string vazia é verdadeira** — só `nil` e `false` são falsos.
   Um `<input type=\"date\">` não preenchido chega como `\"\"`, o `when` deixa
   passar, e `java.sql.Date/valueOf \"\"` lança `IllegalArgumentException`
   (medido, não deduzido). O handler não tem `try`, então vira **500**.

   ⚠️ Efeito para quem usa: **cadastrar paciente sem preencher a data de
   nascimento derrubava a requisição** — e a tela não dizia qual campo era.

   ✅ **Medido no CI antes do conserto** (run 32153384721): `0 failures, 2 errors`
   — *errors*, não *failures*, porque a chamada **estoura** em vez de devolver
   errado. É a assinatura de um valor que nunca deveria ter chegado ali.

   ⚠️ Branco vira `nil`; **lixo continua lançando**. Engolir `\"10/05/1990\"`
   devolvendo `nil` gravaria paciente sem data de nascimento sem ninguém saber —
   trocar um 500 barulhento por perda silenciosa de dado é pior que o defeito."
  [s]
  (when-not (str/blank? s)
    (java.sql.Date/valueOf s)))

(defn uuid-de-formulario
  "Converte um id vindo de formulário em `java.util.UUID`, ou `nil`.

   🔴 Irmã da `data-de-formulario`, e ela existe porque eu varri a categoria
   errada. Em 18/08 consertei os quatro `Date/valueOf` e **declarei a categoria
   fechada** — mas a categoria não é *\"Date/valueOf\"*, é **parser estrito
   recebendo string vazia de formulário**. `UUID/fromString` é o mesmo caso:

     java.util.UUID/fromString \"\"  ->  IllegalArgumentException   (medido)

   Um `<Select>` não tocado manda `\"\"`, não ausente. O `criar-paciente-handler`
   fazia `(when psicologo_id (UUID/fromString psicologo_id))` e virava **500** —
   enquanto o `atualizar`, três funções abaixo, **já tinha** a guarda de branco.
   A mesma assimetria do `deletePaciente`: dois caminhos, um consertado.

   ⚠️ Branco vira `nil`; **id malformado continua lançando**. Engolir um id
   errado devolvendo `nil` gravaria paciente **sem psicólogo** em silêncio — e
   paciente sem psicólogo é paciente que ninguém atende."
  [s]
  (when-not (str/blank? s)
    (java.util.UUID/fromString s)))

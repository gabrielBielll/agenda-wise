(ns deep-saude-backend.remuneracao
  "Regra financeira da R-023.

   A configuração vive na psicóloga; o resultado e a regra aplicada vivem na
   sessão. Esta separação é o que torna o passado explicável e imutável."
  (:require [next.jdbc :as jdbc]
            [deep-saude-backend.db :refer [datasource]]))

(def modalidades #{"percentual" "fixo"})

(defn validar-regra
  [{:keys [modalidade_repasse percentual_repasse valor_fixo_repasse]}]
  (cond
    (not (contains? modalidades modalidade_repasse))
    "modalidade_repasse deve ser 'percentual' ou 'fixo'."

    (= "percentual" modalidade_repasse)
    (cond
      (nil? percentual_repasse) "percentual_repasse é obrigatório."
      (neg? (bigdec percentual_repasse)) "percentual_repasse não pode ser negativo."
      (> (bigdec percentual_repasse) 100M) "percentual_repasse não pode ser maior que 100."
      (some? valor_fixo_repasse) "valor_fixo_repasse deve ficar vazio na modalidade percentual."
      :else nil)

    (= "fixo" modalidade_repasse)
    (cond
      (nil? valor_fixo_repasse) "valor_fixo_repasse é obrigatório."
      (neg? (bigdec valor_fixo_repasse)) "valor_fixo_repasse não pode ser negativo."
      (some? percentual_repasse) "percentual_repasse deve ficar vazio na modalidade fixa."
      :else nil)))

(defn calcular
  "Calcula o valor e devolve também a regra que precisa ser copiada para a
   sessão. Não arredonda silenciosamente: DECIMAL(10,2) faz isso no banco."
  [valor-consulta regra]
  (when-let [erro (validar-regra regra)]
    (throw (ex-info erro {:regra regra})))
  (let [valor (bigdec (or valor-consulta 0))]
    (case (:modalidade_repasse regra)
      "percentual"
      {:valor_repasse (* valor (/ (bigdec (:percentual_repasse regra)) 100M))
       :modalidade_repasse_aplicada "percentual"
       :percentual_repasse_aplicado (bigdec (:percentual_repasse regra))
       :valor_fixo_repasse_aplicado nil}

      "fixo"
      {:valor_repasse (bigdec (:valor_fixo_repasse regra))
       :modalidade_repasse_aplicada "fixo"
       :percentual_repasse_aplicado nil
       :valor_fixo_repasse_aplicado (bigdec (:valor_fixo_repasse regra))})))

(defn calcular-pendentes!
  "Cria snapshots somente para sessões realizadas, passadas e ainda sem
   cálculo. O `IS NULL` é a trava da R-004: executar de novo ou mudar a regra da
   psicóloga não recalcula dinheiro histórico."
  ([clinica-id] (calcular-pendentes! @datasource clinica-id))
  ([ds clinica-id]
   (jdbc/execute-one!
    ds
    ["UPDATE agendamentos AS a
         SET valor_repasse = CASE u.modalidade_repasse
               WHEN 'percentual' THEN a.valor_consulta * u.percentual_repasse / 100
               WHEN 'fixo' THEN u.valor_fixo_repasse
             END,
             modalidade_repasse_aplicada = u.modalidade_repasse,
             percentual_repasse_aplicado = CASE WHEN u.modalidade_repasse = 'percentual'
                                                 THEN u.percentual_repasse END,
             valor_fixo_repasse_aplicado = CASE WHEN u.modalidade_repasse = 'fixo'
                                                 THEN u.valor_fixo_repasse END,
             repasse_calculado_em = now()
        FROM usuarios AS u
       WHERE a.psicologo_id = u.id
         AND a.clinica_id = ?
         AND u.clinica_id = a.clinica_id
         AND a.status = 'realizado'
         AND a.data_hora_sessao < now()
         AND a.valor_repasse IS NULL"
     clinica-id])))

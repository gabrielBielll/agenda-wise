(ns deep-saude-backend.remuneracao-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.remuneracao :as remuneracao]))

(deftest calcula-as-duas-modalidades-por-sessao
  (testing "percentual acompanha o valor da sessão"
    (is (= {:valor_repasse 100.0M
            :modalidade_repasse_aplicada "percentual"
            :percentual_repasse_aplicado 50M
            :valor_fixo_repasse_aplicado nil}
           (remuneracao/calcular 200M
                                {:modalidade_repasse "percentual"
                                 :percentual_repasse 50M
                                 :valor_fixo_repasse nil}))))

  (testing "fixo independe do valor da sessão"
    (doseq [valor [100M 200M]]
      (is (= 40M
             (:valor_repasse
              (remuneracao/calcular valor
                                   {:modalidade_repasse "fixo"
                                    :percentual_repasse nil
                                    :valor_fixo_repasse 40M})))))))

(deftest regra-invalida-nao-decide-dinheiro
  (doseq [[regra trecho] [[{:modalidade_repasse "percentual"
                            :percentual_repasse 101M}
                           "maior que 100"]
                          [{:modalidade_repasse "fixo"
                            :valor_fixo_repasse -1M}
                           "negativo"]
                          [{:modalidade_repasse "inventada"}
                           "modalidade_repasse"]]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          (re-pattern trecho)
                          (remuneracao/calcular 200M regra)))))

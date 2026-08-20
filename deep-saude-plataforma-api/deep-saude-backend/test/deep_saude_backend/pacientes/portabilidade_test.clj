(ns deep-saude-backend.pacientes.portabilidade-test
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.pacientes.portabilidade :as portabilidade]))

(def ^:private clinica-id #uuid "aaaaaaaa-0000-0000-0000-00000000000a")
(def ^:private psicologo-id #uuid "aaaaaaaa-0000-0000-0000-0000000000c1")
(def ^:private paciente-id #uuid "aaaaaaaa-0000-0000-0000-0000000000d1")

(def ^:private paciente
  {:id paciente-id
   :clinica_id clinica-id
   :psicologo_id psicologo-id
   :psicologo_email "psi@teste.local"
   :nome "=Ana O'Brien"
   :email "ana@teste.local"
   :telefone "+55 11 99999-0000"
   :data_nascimento (java.sql.Date/valueOf "1990-05-12")
   :status "ativo"
   :nota_fiscal true})

(deftest exportacao-respeita-escopo-e-formato
  (let [query (atom nil)
        request {:identity {:clinica_id clinica-id
                            :user_id psicologo-id
                            :role "psicologo"}}
        executar (fn [formato]
                   (with-redefs [db/execute-query! (fn [q] (reset! query q) [paciente])]
                     (portabilidade/exportar-handler
                      (assoc request :params {:formato formato}))))]
    (testing "a psicóloga exporta somente a própria carteira"
      (let [resp (executar "json")
            corpo (json/parse-string (:body resp) true)]
        (is (= 200 (:status resp)))
        (is (= "agenda-wise/pacientes@1" (:schema corpo)))
        (is (= 1 (:quantidade corpo)))
        (is (= (str paciente-id) (get-in corpo [:pacientes 0 :agenda_wise_id])))
        (is (= [clinica-id psicologo-id] (vec (rest @query))))))

    (testing "CSV neutraliza fórmulas sem perder a opção fiel em JSON/SQL"
      (let [corpo (:body (executar "csv"))]
        (is (str/starts-with? corpo "\uFEFFagenda_wise_id,"))
        (is (str/includes? corpo "\"'=Ana O'Brien\""))))

    (testing "SQL é backup válido e carrega o envelope que o upload seguro reconhece"
      (let [corpo (:body (executar "sql"))]
        (is (str/includes? corpo "-- AGENDAWISE_PORTABLE_JSON_BASE64 "))
        (is (str/includes? corpo "INSERT INTO pacientes"))
        (is (str/includes? corpo "O''Brien") "aspas de dado precisam continuar dentro do literal SQL")
        (is (str/includes? corpo "ON CONFLICT (id) DO NOTHING"))))))

(deftest importacao-recusa-registro-malformado-antes-do-banco
  (let [request {:identity {:clinica_id clinica-id
                            :user_id psicologo-id
                            :role "psicologo"}
                 :body {:registros [{:linha_arquivo 7
                                     :nome ""
                                     :email "não-é-email"
                                     :data_nascimento "31/12/1990"
                                     :status "qualquer"
                                     :nota_fiscal "talvez"}]
                        :validar_apenas true}}
        resp (portabilidade/importar-handler request)
        erros (get-in resp [:body :erros])]
    (is (= 422 (:status resp)))
    (is (= "patient_import_validation_failed" (get-in resp [:body :code])))
    (is (= #{"nome" "email" "data_nascimento" "status" "nota_fiscal"}
           (set (map :campo erros))))
    (is (every? #(= 7 (:linha %)) erros))))

(deftest importacao-limita-o-lote-antes-de-abrir-transacao
  (let [resp (portabilidade/importar-handler
              {:body {:registros (vec (repeat 101 {:nome "Pessoa"}))}})]
    (is (= 413 (:status resp)))
    (is (= "patient_import_batch_too_large" (get-in resp [:body :code])))))

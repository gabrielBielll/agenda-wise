(ns deep-saude-backend.permissoes-test
  (:require [clojure.test :refer :all]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.agendamentos-test :as agtest]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]))

(def clinica #uuid "cccccccc-0000-0000-0000-000000000001")
(def psicologo #uuid "cccccccc-0000-0000-0000-000000000002")
(def secretario #uuid "cccccccc-0000-0000-0000-000000000003")
(def paciente #uuid "cccccccc-0000-0000-0000-000000000004")
(def agendamento #uuid "cccccccc-0000-0000-0000-000000000005")

(defn- papel [nome]
  (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" nome])))

(defn- preparar! []
  (doseq [t ["agendamentos" "pacientes" "usuarios" "clinicas"]]
    (db/execute-one! [(str "DELETE FROM " t " WHERE id::text LIKE 'cccccccc-%'")]))
  (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Permissoes')" clinica])
  (doseq [[id nome role email] [[psicologo "Psi" "psicologo" "psi-permissoes@teste.local"]
                                [secretario "Secretaria" "secretario" "sec-permissoes@teste.local"]]]
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                       VALUES (?, ?, ?, ?, ?, 'x')"
                      id clinica (papel role) nome email]))
  (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                     VALUES (?, ?, 'Paciente', ?)" paciente clinica psicologo])
  (db/execute-one! ["INSERT INTO agendamentos
                     (id, clinica_id, paciente_id, psicologo_id, data_hora_sessao, duracao, valor_consulta)
                     VALUES (?, ?, ?, ?, '2027-09-01 14:00:00', 50, 200)"
                    agendamento clinica paciente psicologo]))

(defn- com-banco [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (preparar!)
        (f)))
    (println "\n  [permissoes-test] TEST_DATABASE_URL não definida — testes pulados.\n")))

(use-fixtures :once com-banco)

(deftest psicologo-passa-na-guarda-de-listar-pacientes
  (let [handler (core/wrap-checar-permissao (fn [_] {:status 200}) "visualizar_pacientes")
        resp (handler {:identity {:papel_id (papel "psicologo") :role "psicologo"}})]
    (is (= 200 (:status resp)))))

(deftest secretario-nao-altera-campo-financeiro
  (let [resp (core/atualizar-agendamento-handler
              {:identity {:clinica_id clinica
                          :papel_id (papel "secretario")
                          :role "secretario"}
               :params {:id (str agendamento)}
               :body {:status_pagamento "pago"}})]
    (is (= 403 (:status resp)))
    (is (= "pendente" (:status_pagamento
                        (db/execute-one! ["SELECT status_pagamento FROM agendamentos WHERE id = ?"
                                          agendamento]))))))

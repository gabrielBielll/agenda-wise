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

(deftest gc012-conexao-google-e-permissao-sao-por-psicologa
  (testing "a permissão estreita pertence à psicóloga, sem entregar a gestão da clínica"
    (let [permissoes (set (map :nome_permissao
                               (db/execute-query!
                                ["SELECT per.nome_permissao
                                    FROM papel_permissoes pp
                                    JOIN papeis p ON p.id = pp.papel_id
                                    JOIN permissoes per ON per.id = pp.permissao_id
                                   WHERE p.nome_papel = 'psicologo'"])))]
      (is (contains? permissoes "conectar_agenda_propria"))
      (is (not (contains? permissoes "gerenciar_integracao_google")))))

  (testing "duas psicólogas da mesma clínica têm conexões independentes"
    (let [outra #uuid "cccccccc-0000-0000-0000-000000000006"]
      (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                         VALUES (?, ?, ?, 'Psi 2', 'psi2-permissoes@teste.local', 'x')"
                        outra clinica (papel "psicologo")])
      (doseq [usuario [psicologo outra]]
        (db/execute-one!
         ["INSERT INTO google_conexao
             (clinica_id, usuario_id, google_account_email, refresh_token_cifrado, escopos)
           VALUES (?, ?, ?, 'cifrado', 'calendar')"
          clinica usuario (str usuario "@google.local")]))
      (is (= 2 (:total (db/execute-one!
                        ["SELECT count(*) AS total FROM google_conexao WHERE clinica_id = ?"
                         clinica]))))
      (is (thrown? Exception
                   (db/execute-one!
                    ["INSERT INTO google_conexao
                        (clinica_id, usuario_id, google_account_email, refresh_token_cifrado, escopos)
                      VALUES (?, ?, 'duplicada@google.local', 'cifrado', 'calendar')"
                     clinica psicologo]))
          "a mesma pessoa não pode ganhar duas conexões"))))

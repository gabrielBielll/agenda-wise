(ns deep-saude-backend.google.desconectar-test
  "A desconexão é destrutiva e precisa provar no banco qual pessoa ela alcança."
  (:require [clojure.test :refer :all]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.agendamentos-test :as agtest]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.google.cripto :as cripto]
            [deep-saude-backend.google.handlers :as handlers]
            [deep-saude-backend.google.oauth :as oauth]))

(def clinica #uuid "dededede-0000-0000-0000-000000000001")
(def alvo #uuid "dededede-0000-0000-0000-000000000002")
(def outra #uuid "dededede-0000-0000-0000-000000000003")

(defn- limpar! []
  (db/execute-one! ["DELETE FROM vinculo_agenda WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM google_conexao WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM usuarios WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM clinicas WHERE id = ?" clinica]))

(defn- preparar! []
  (limpar!)
  (let [papel (:id (db/execute-one!
                    ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))]
    (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Desconectar')"
                      clinica])
    (doseq [[id nome email] [[alvo "Ana Alvo" "ana-alvo@teste.local"]
                             [outra "Bia Outra" "bia-outra@teste.local"]]]
      (db/execute-one!
       ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
         VALUES (?, ?, ?, ?, ?, 'x')" id clinica papel nome email])
      (db/execute-one!
       ["INSERT INTO google_conexao
           (clinica_id, usuario_id, google_account_email, refresh_token_cifrado, escopos)
         VALUES (?, ?, ?, ?, 'calendar')"
        clinica id email (str "cifrado-" id)])
      (db/execute-one!
       ["INSERT INTO vinculo_agenda
           (clinica_id, usuario_id, google_calendar_id, access_role, status)
         VALUES (?, ?, ?, 'owner', 'ativo')"
        clinica id (str "agenda-" id)]))))

(defn- com-banco [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (preparar!)
        (try (f) (finally (limpar!)))))
    (println "\n  [desconectar-test] TEST_DATABASE_URL não definida — teste pulado.\n")))

(use-fixtures :once com-banco)

(deftest desconectar-atinge-so-a-psicologa-nomeada
  (let [revogados (atom [])]
    (with-redefs [cripto/decifrar-token identity
                  oauth/revogar #(swap! revogados conj %)]
      (let [resp (handlers/desconectar-handler
                  {:identity {:clinica_id clinica}
                   :body {:usuario_id (str alvo)}})]
        (is (= 200 (:status resp)))
        (is (= [(str "cifrado-" alvo)] @revogados))
        (is (nil? (handlers/conexao-do-usuario clinica alvo)))
        (is (= "ativa" (:status (handlers/conexao-do-usuario clinica outra))))
        (is (= "pausado"
               (:status (db/execute-one!
                         ["SELECT status FROM vinculo_agenda
                            WHERE clinica_id = ? AND usuario_id = ?" clinica alvo]))))
        (is (= "ativo"
               (:status (db/execute-one!
                         ["SELECT status FROM vinculo_agenda
                            WHERE clinica_id = ? AND usuario_id = ?" clinica outra]))))))))

(deftest desconectar-nao-aceita-alvo-sem-conexao-na-clinica
  (let [revogados (atom [])
        inexistente #uuid "dededede-0000-0000-0000-000000000099"]
    (with-redefs [oauth/revogar #(swap! revogados conj %)]
      (let [resp (handlers/desconectar-handler
                  {:identity {:clinica_id clinica}
                   :body {:usuario_id (str inexistente)}})]
        (is (= 404 (:status resp)))
        (is (= "conexao_nao_encontrada" (get-in resp [:body :code])))
        (is (empty? @revogados))
        (is (= 2 (:total (db/execute-one!
                          ["SELECT count(*) AS total FROM google_conexao
                             WHERE clinica_id = ?" clinica]))))))))

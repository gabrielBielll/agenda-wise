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

(deftest paleta-tem-permissao-propria-concedida-so-ao-admin
  ;; SEC-006 (metade segura): `gerenciar_configuracoes_clinica` guarda a paleta e
  ;; nunca existia em migration — o "só admin" vinha do bypass de admin no código.
  ;; A migration nova a registra e concede ao admin, para a remoção futura do
  ;; bypass não quebrar a paleta em silêncio.
  (let [perms-de (fn [papel-nome]
                   (set (map :nome_permissao
                             (db/execute-query!
                              ["SELECT per.nome_permissao FROM papel_permissoes pp
                                  JOIN papeis p ON p.id = pp.papel_id
                                  JOIN permissoes per ON per.id = pp.permissao_id
                                 WHERE p.nome_papel = ?" papel-nome]))))]
    (is (contains? (perms-de "admin_clinica") "gerenciar_configuracoes_clinica"))
    (is (not (contains? (perms-de "psicologo") "gerenciar_configuracoes_clinica")))
    (is (not (contains? (perms-de "secretario") "gerenciar_configuracoes_clinica")))))

(deftest ler-por-id-respeita-o-dono
  ;; 🔴 T2.2 — obter por id só filtrava clínica, não o dono. Uma psicóloga que não
  ;; é a responsável lia o `SELECT *` (diagnóstico, medicação, histórico) por id,
  ;; enquanto listar/editar/excluir já checavam o dono.
  (testing "paciente — outra psicóloga não lê (403)"
    (is (= 403 (:status (core/obter-paciente-handler
                         {:identity {:clinica_id clinica :user_id secretario :role "psicologo"}
                          :params {:id (str paciente)}})))))
  (testing "agendamento — outra psicóloga não lê (404, não confirma existência)"
    (is (= 404 (:status (core/obter-agendamento-handler
                         {:identity {:clinica_id clinica :user_id secretario :role "psicologo"}
                          :params {:id (str agendamento)}})))))
  (testing "CONTROLE — a psicóloga dona lê os dois"
    (is (= 200 (:status (core/obter-paciente-handler
                         {:identity {:clinica_id clinica :user_id psicologo :role "psicologo"}
                          :params {:id (str paciente)}}))))
    (is (= 200 (:status (core/obter-agendamento-handler
                         {:identity {:clinica_id clinica :user_id psicologo :role "psicologo"}
                          :params {:id (str agendamento)}})))))
  (testing "admin/secretário alcançam a clínica inteira"
    (is (= 200 (:status (core/obter-paciente-handler
                         {:identity {:clinica_id clinica :user_id secretario :role "secretario"}
                          :params {:id (str paciente)}}))))
    (is (= 200 (:status (core/obter-agendamento-handler
                         {:identity {:clinica_id clinica :user_id secretario :role "admin_clinica"}
                          :params {:id (str agendamento)}}))))))

(deftest sincronizar-agendamentos-exige-gerenciar-pagamentos
  ;; 🔴 T2.4 — a rota dispara `UPDATE ... status_pagamento = 'pago'` em lote. Só
  ;; tinha autenticação; passa a exigir `gerenciar_pagamentos` como as outras
  ;; rotas de dinheiro. Testado pela guarda, como os demais deste arquivo.
  (let [wrapped (core/wrap-checar-permissao core/sincronizar-status-agendamentos-handler
                                            "gerenciar_pagamentos")]
    (testing "secretário não sincroniza (não move dinheiro)"
      (is (= 403 (:status (wrapped {:identity {:clinica_id clinica
                                               :papel_id (papel "secretario") :role "secretario"}})))))
    (testing "CONTROLE — o admin (bypass de permissão) passa"
      (is (not= 403 (:status (wrapped {:identity {:clinica_id clinica
                                                  :papel_id (papel "admin_clinica")
                                                  :role "admin_clinica"}})))))))

(deftest criar-usuario-exige-senha-de-oito-e-modalidade
  ;; 🔴 T1.4 + T2.8(b). Antes, `criar-usuario-handler` só checava `str/blank?` na
  ;; senha (então "x" criava a conta) e não exigia `modalidade_repasse` da
  ;; psicóloga (então ela herdava o default de 50% do schema em silêncio).
  (let [criar (fn [extra]
                (core/criar-usuario-handler
                 {:identity {:clinica_id clinica}
                  :body (merge {:nome "Nova"
                                :email (str "u-" (java.util.UUID/randomUUID) "@teste.local")
                                :papel "psicologo"}
                               extra)}))]
    (testing "T1.4 — senha de 1 caractere é recusada"
      (is (= 400 (:status (criar {:senha "x"
                                  :modalidade_repasse "percentual" :percentual_repasse 50})))))
    (testing "T2.8b — psicóloga sem modalidade de repasse é recusada, sem cair no default"
      (let [resp (criar {:senha "senha-de-teste-123"})]
        (is (= 422 (:status resp)))
        (is (= "modalidade_repasse_obrigatoria" (:code (:body resp))))))
    (testing "CONTROLE — com senha de 8+ e modalidade declarada, cria"
      (let [resp (criar {:senha "senha-de-teste-123"
                         :modalidade_repasse "percentual" :percentual_repasse 50})]
        (is (= 201 (:status resp)))
        (db/execute-one! ["DELETE FROM usuarios WHERE id = ?" (:id (:body resp))])))))

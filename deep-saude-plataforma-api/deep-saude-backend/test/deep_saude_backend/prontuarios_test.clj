(ns deep-saude-backend.prontuarios-test
  "R-012 — prontuário é do psicólogo. Guardas de leitura e exclusão.

   Cobre a A-003 (`docs/REVISAO_PRE_PRODUCAO.md`): o admin da clínica lia
   prontuário sem flag nenhuma. A escrita já estava certa; era a leitura que
   estava aberta — e, achado ao corrigir, também a exclusão.

   ⚠️ Escrito pela `orla` (Claude na sandbox), que **não compila Clojure** —
   Clojars é bloqueado pela política de saída do ambiente. Estes testes nunca
   foram executados por quem os escreveu. Se algum falhar por detalhe de
   escrita, o defeito é do teste: o comportamento esperado é o que está nos
   `testing` e vem da R-012, não do código.

   ## Como rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5432/deep_teste?user=u&password=p' lein test

   Sem a variável, os testes deste namespace são **pulados**, igual aos de
   agendamento."
  (:require [clojure.test :refer :all]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [taoensso.timbre :as log]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.prontuarios :as prontuarios]
            ;; Só pela guarda `exigir-banco-de-teste!`. Ela é o que impede um
            ;; DELETE de cair no banco errado, e duplicar função de segurança é
            ;; pior do que depender de outro namespace de teste.
            [deep-saude-backend.agendamentos-test :as agtest]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica    #uuid "aaaaaaaa-0000-0000-0000-00000000000a")
(def psicologo  #uuid "aaaaaaaa-0000-0000-0000-0000000000c1")
(def colega     #uuid "aaaaaaaa-0000-0000-0000-0000000000c3")
(def admin      #uuid "aaaaaaaa-0000-0000-0000-0000000000c9")
(def paciente   #uuid "aaaaaaaa-0000-0000-0000-0000000000d1")

(defn- semear! []
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))]
    (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Clinica R012')
                       ON CONFLICT (id) DO NOTHING" clinica])
    (doseq [[id nome email] [[psicologo "Psi Autor"  "autor@teste.local"]
                             [colega    "Psi Colega" "colega@teste.local"]
                             [admin     "Admin"      "admin@teste.local"]]]
      (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                         VALUES (?, ?, ?, ?, ?, 'x') ON CONFLICT (id) DO NOTHING"
                        id clinica papel nome email]))
    (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                       VALUES (?, ?, 'Paciente', ?) ON CONFLICT (id) DO NOTHING"
                      paciente clinica psicologo])))

(defn- limpar! []
  (db/execute-one! ["DELETE FROM acesso_prontuario"])
  (db/execute-one! ["DELETE FROM prontuarios"]))

(defn com-banco-de-teste [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        ;; ⚠️ Antes de qualquer DELETE. Ver a docstring dela em agendamentos-test.
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (limpar!)
        (semear!)
        (f)))
    (println (str "\n  [prontuarios-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val) (ns-publics *ns*)))
                  " testes de banco PULADOS.\n"))))

(defn entre-testes [f]
  (if (env :test-database-url) (do (limpar!) (f)) (f)))

(use-fixtures :once com-banco-de-teste)
(use-fixtures :each entre-testes)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- identidade [usuario-id papel]
  {:clinica_id clinica :user_id usuario-id :role papel})

(defn- criar-como [usuario-id papel conteudo]
  (core/criar-prontuario-handler
   {:identity (identidade usuario-id papel)
    :body {:paciente_id (str paciente) :conteudo conteudo}}))

(defn- listar-como [usuario-id papel]
  (core/listar-prontuarios-handler
   {:identity (identidade usuario-id papel)
    :params {:paciente-id (str paciente)}}))

(defn- remover-como [usuario-id papel prontuario-id]
  (core/remover-prontuario-handler
   {:identity (identidade usuario-id papel)
    :params {:id (str prontuario-id)}}))

(defn- semear-prontuario! []
  (criar-como psicologo "psicologo" "Primeira sessão.")
  (:id (db/execute-one! ["SELECT id FROM prontuarios LIMIT 1"])))

(defn- quantos [] (:c (db/execute-one! ["SELECT count(*) AS c FROM prontuarios"])))

(defn- quantos-acessos []
  (:c (db/execute-one! ["SELECT count(*) AS c FROM acesso_prontuario"])))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Leitura — A-003
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest psicologo-le-o-prontuario-do-proprio-paciente
  (semear-prontuario!)
  (let [resp (listar-como psicologo "psicologo")]
    (is (= 200 (:status resp)))
    (is (= 1 (count (:body resp))))))

(deftest admin-nao-le-prontuario
  ;; A-003. O `wrap-checar-permissao` da rota exige `visualizar_pacientes`, que
  ;; o admin tem — permissão de tela não é autorização clínica, e era por aí
  ;; que a leitura passava.
  (semear-prontuario!)
  (let [resp (listar-como admin "admin_clinica")]
    (is (= 403 (:status resp))
        "R-012: nem o admin da clínica lê prontuário sem a flag")))

(deftest outro-psicologo-da-mesma-clinica-nao-le
  (semear-prontuario!)
  (is (= 403 (:status (listar-como colega "psicologo")))
      "R-012 exclui explicitamente outro psicólogo da mesma clínica"))

(deftest a-saida-de-emergencia-existe-e-funciona
  ;; A R-012 prevê uma flag de super-admin ligada em código. Guarda sem teste é
  ;; guarda que ninguém sabe se funciona — e esta nunca dispara no caminho
  ;; normal, porque nasce desligada.
  (semear-prontuario!)
  (let [v #'deep-saude-backend.core/super-admin-le-prontuario?]
    (is (false? @v) "a flag tem que nascer desligada")
    (alter-var-root v (constantly true))
    (try
      (is (= 200 (:status (listar-como admin "admin_clinica")))
          "com a flag ligada em código, o super-admin lê")
      (finally
        (alter-var-root v (constantly false))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Auditoria da saída de emergência
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest flag-decisiva-grava-o-acesso
  (semear-prontuario!)
  (let [resp (prontuarios/listar-handler
              {:identity (identidade admin "admin_clinica")
               :params {:paciente-id (str paciente)}} true)
        acesso (db/execute-one!
                ["SELECT clinica_id, paciente_id, usuario_id, papel, motivo, lido_em
                    FROM acesso_prontuario LIMIT 1"])]
    (is (= 200 (:status resp)))
    (is (= 1 (quantos-acessos)))
    (is (= clinica (:clinica_id acesso)))
    (is (= paciente (:paciente_id acesso)))
    (is (= admin (:usuario_id acesso)))
    (is (= "admin_clinica" (:papel acesso)))
    (is (= "flag_super_admin" (:motivo acesso)))
    (is (some? (:lido_em acesso)))))

(deftest flag-ligada-nao-grava-acesso-normal-do-autor
  (semear-prontuario!)
  (let [resp (prontuarios/listar-handler
              {:identity (identidade psicologo "psicologo")
               :params {:paciente-id (str paciente)}} true)]
    (is (= 200 (:status resp)))
    (is (zero? (quantos-acessos)))))

(deftest leitura-negada-nao-grava-acesso
  (semear-prontuario!)
  (is (= 403 (:status (listar-como admin "admin_clinica"))))
  (is (zero? (quantos-acessos))))
(deftest falha-ao-gravar-auditoria-nao-derruba-leitura-e-aparece-no-log
  (semear-prontuario!)
  (let [execute-original db/execute-one!
        eventos (atom [])]
    (log/with-config {:min-level :trace
                      :appenders {:captura {:enabled? true
                                            :fn #(swap! eventos conj %)}}}
      (with-redefs [db/execute-one!
                    (fn [sql-params]
                      (if (re-find #"INSERT INTO acesso_prontuario" (first sql-params))
                        (throw (ex-info "falha de auditoria de teste" {}))
                        (execute-original sql-params)))]
        (is (= 200 (:status
                    (prontuarios/listar-handler
                     {:identity (identidade admin "admin_clinica")
                      :params {:paciente-id (str paciente)}} true))))))
    (is (some #(= "prontuario_audit_write_failed" (force (:msg_ %))) @eventos)
        "falha de auditoria precisa aparecer no log estruturado")))
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Exclusão
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest admin-nao-exclui-prontuario-alheio
  ;; Achado ao corrigir a A-003: a guarda de exclusão só disparava para
  ;; `papel` "psicologo", então o admin apagava registro clínico de outro.
  (let [id (semear-prontuario!)
        resp (remover-como admin "admin_clinica" id)]
    (is (= 403 (:status resp)))
    (is (= 1 (quantos)) "o prontuário continua lá")))

(deftest colega-nao-exclui-prontuario-alheio
  (let [id (semear-prontuario!)]
    (is (= 403 (:status (remover-como colega "psicologo" id))))
    (is (= 1 (quantos)))))

(deftest autor-exclui-o-proprio
  (let [id (semear-prontuario!)]
    (is (= 204 (:status (remover-como psicologo "psicologo" id))))
    (is (zero? (quantos)))))

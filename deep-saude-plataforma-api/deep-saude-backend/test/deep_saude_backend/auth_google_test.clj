(ns deep-saude-backend.auth-google-test
  "Login com conta Google (autenticação), contra banco de verdade.

   A verificação criptográfica do id_token é INJETADA — os testes redefinem
   `verificar-id-token-google` para NÃO bater na rede (a JWKS do Google é
   inalcançável e irrelevante para o que se quer provar aqui). O que se prova é o
   comportamento a partir de claims já verificados:

   - e-mail conhecido e claims aceitos -> 200 com a MESMA sessão do login;
   - e-mail desconhecido               -> 403, SEM criar conta;
   - `aud` de outro cliente            -> 401 (a lógica real de `aud` é exercida);
   - sem client_id configurado         -> 503, e a verificação nem é chamada.

   ## Rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5432/deep_teste?user=u&password=p' lein test"
  (:require [clojure.test :refer :all]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [buddy.sign.jwt :as jwt]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.sessao :as sessao]
            [deep-saude-backend.auth-google :as ag]
            [deep-saude-backend.agendamentos-test :as agtest]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica #uuid "dddddddd-0000-0000-0000-00000000000d")
(def usuario #uuid "dddddddd-0000-0000-0000-0000000000d1")
(def email-do-usuario "google-user@teste.local")
(def client-id-de-teste "client-de-teste.apps.googleusercontent.com")

(defn- papel-id [nome]
  (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" nome])))

(defn- semear! []
  (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Clinica do Login Google')
                     ON CONFLICT (id) DO NOTHING" clinica])
  (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                     VALUES (?, ?, ?, 'Dra. Google', ?, 'x')
                     ON CONFLICT (id) DO NOTHING"
                    usuario clinica (papel-id "psicologo") email-do-usuario]))

(defn- limpar! []
  (db/execute-one! ["DELETE FROM usuarios WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM clinicas WHERE id = ?" clinica]))

(defn com-banco-de-teste [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource     (delay ds)
                    sessao/jwt-secret (delay "segredo-apenas-para-google-test")
                    core/jwt-secret   (delay "segredo-apenas-para-google-test")]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (limpar!)
        (semear!)
        (f)))
    (println (str "\n  [auth-google-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val)
                                 (ns-publics 'deep-saude-backend.auth-google-test)))
                  " testes de banco PULADOS.\n"))))

(use-fixtures :once com-banco-de-teste)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- com-client-id [m] (assoc environ.core/env :google-login-client-id client-id-de-teste))
(defn- sem-client-id []  (dissoc environ.core/env :google-login-client-id))

(defn- claims-validos [email]
  {:iss "https://accounts.google.com"
   :aud client-id-de-teste
   :email email
   :email_verified true})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Testes
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest email-conhecido-emite-sessao-no-shape-do-login
  (with-redefs [environ.core/env (com-client-id nil)
                ag/verificar-id-token-google (constantly (claims-validos email-do-usuario))]
    (let [resp (ag/login-google-handler {:body {:id_token "qualquer-coisa-assinada"}})]
      (is (= 200 (:status resp)))
      (testing "o corpo tem o mesmo shape do /api/auth/login"
        (is (= "Usuário autenticado com sucesso." (get-in resp [:body :message])))
        (is (string? (get-in resp [:body :token])))
        (let [u (get-in resp [:body :user])]
          (is (= usuario (:id u)))
          (is (= email-do-usuario (:email u)))
          (is (= "psicologo" (:role u)))
          (is (contains? u :clinica_id))
          (is (contains? u :papel_id))
          (is (contains? u :nome))))
      (testing "o token é um JWT de verdade, assinado com o segredo, com os claims da sessão"
        (let [claims (jwt/unsign (get-in resp [:body :token]) @sessao/jwt-secret)]
          (is (= (str usuario) (:user_id claims)))
          (is (= "psicologo" (:role claims)))
          (is (contains? claims :sessao_iniciada_em))
          (is (contains? claims :exp)))))))

(deftest email-desconhecido-nao-cria-conta-e-da-403
  (with-redefs [environ.core/env (com-client-id nil)
                ag/verificar-id-token-google (constantly (claims-validos "nao-cadastrado@teste.local"))]
    (let [resp (ag/login-google-handler {:body {:id_token "assinado-mas-sem-conta"}})]
      (is (= 403 (:status resp)))
      (is (= "conta_nao_encontrada" (get-in resp [:body :code])))
      (is (nil? (db/execute-one! ["SELECT id FROM usuarios WHERE email = ?" "nao-cadastrado@teste.local"]))
          "🔴 sem auto-cadastro: a conta NÃO pode ter sido criada"))))

(deftest aud-de-outro-cliente-da-401
  ;; Exercita a lógica REAL de `aud`: a assinatura é aceita (injetada), mas o
  ;; token foi emitido para outro client_id. Não pode autenticar.
  (with-redefs [environ.core/env (com-client-id nil)
                ag/verificar-id-token-google
                (constantly (assoc (claims-validos email-do-usuario)
                                   :aud "cliente-diferente.apps.googleusercontent.com"))]
    (let [resp (ag/login-google-handler {:body {:id_token "assinado-para-outro-aud"}})]
      (is (= 401 (:status resp)))
      (is (= "id_token_invalido" (get-in resp [:body :code]))))))

(deftest email-nao-verificado-da-401
  ;; Complemento do controle de claims: assinatura ok, mas `email_verified=false`.
  (with-redefs [environ.core/env (com-client-id nil)
                ag/verificar-id-token-google
                (constantly (assoc (claims-validos email-do-usuario) :email_verified false))]
    (let [resp (ag/login-google-handler {:body {:id_token "assinado-mas-email-nao-verificado"}})]
      (is (= 401 (:status resp)))
      (is (= "id_token_invalido" (get-in resp [:body :code]))))))

(deftest sem-client-id-da-503-e-nem-verifica
  (let [verificou (atom false)]
    (with-redefs [environ.core/env (sem-client-id)
                  ag/verificar-id-token-google (fn [_] (reset! verificou true) nil)]
      (let [resp (ag/login-google-handler {:body {:id_token "tanto-faz"}})]
        (is (= 503 (:status resp)))
        (is (= "google_login_nao_configurado" (get-in resp [:body :code])))
        (is (false? @verificou) "503 tem que curto-circuitar ANTES de tentar verificar")))))

(deftest id-token-ausente-da-401
  (with-redefs [environ.core/env (com-client-id nil)]
    (let [resp (ag/login-google-handler {:body {}})]
      (is (= 401 (:status resp)))
      (is (= "id_token_invalido" (get-in resp [:body :code]))))))

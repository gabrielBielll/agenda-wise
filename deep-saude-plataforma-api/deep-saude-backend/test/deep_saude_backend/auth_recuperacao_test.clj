(ns deep-saude-backend.auth-recuperacao-test
  "Recuperação de senha, contra banco de verdade.

   O que importa aqui só o banco prova: o consumo ATÔMICO do token (um
   `UPDATE ... RETURNING` que casa a linha uma única vez), a expiração pela
   cláusula temporal do próprio SQL, e a troca do `senha_hash` que um login
   posterior tem que aceitar. Mock devolveria o que o teste mandasse e não
   provaria nenhum dos três.

   🔴 O par de controle deste arquivo é `recuperar`: e-mail existente MANDA
   e-mail e grava token; e-mail inexistente responde IGUAL, mas não manda nada e
   não grava nada. É esse par que garante que a resposta genérica não está
   escondendo um 'não fiz nada' — a família de defeito que este projeto pagou caro.

   ## Rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5432/deep_teste?user=u&password=p' lein test"
  (:require [clojure.test :refer :all]
            [clojure.string :as str]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [buddy.hashers :as hashers]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.sessao :as sessao]
            [deep-saude-backend.email :as email]
            [deep-saude-backend.auth-recuperacao :as recup]
            [deep-saude-backend.agendamentos-test :as agtest]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica #uuid "cccccccc-0000-0000-0000-00000000000c")
(def usuario #uuid "cccccccc-0000-0000-0000-0000000000c1")
(def email-do-usuario "recupera@teste.local")
(def senha-inicial "senha-antiga-123")

(defn- papel-id [nome]
  (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" nome])))

(defn- semear! []
  (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Clinica da Recuperacao')
                     ON CONFLICT (id) DO NOTHING" clinica])
  (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                     VALUES (?, ?, ?, 'Dra. Recupera', ?, ?)
                     ON CONFLICT (id) DO UPDATE SET senha_hash = EXCLUDED.senha_hash"
                    usuario clinica (papel-id "psicologo") email-do-usuario
                    (hashers/encrypt senha-inicial)]))

(defn- limpar! []
  (db/execute-one! ["DELETE FROM senha_reset_token WHERE usuario_id = ?" usuario])
  (db/execute-one! ["DELETE FROM usuarios WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM clinicas WHERE id = ?" clinica]))

(defn com-banco-de-teste [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      ;; `sessao/jwt-secret` é o segredo que `emitir-sessao` usa; o login desta
      ;; suíte passa por lá. Redefino também `core/jwt-secret` por ser o mesmo
      ;; alias e não deixar nenhum caminho lendo um segredo nulo.
      (with-redefs [db/datasource   (delay ds)
                    sessao/jwt-secret (delay "segredo-apenas-para-recuperacao-test")
                    core/jwt-secret   (delay "segredo-apenas-para-recuperacao-test")]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (limpar!)
        (semear!)
        (f)))
    (println (str "\n  [auth-recuperacao-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val)
                                 (ns-publics 'deep-saude-backend.auth-recuperacao-test)))
                  " testes de banco PULADOS.\n"))))

(defn- reset-estado-por-teste [f]
  ;; Cada teste começa sem token e com a senha inicial: os testes mexem nos dois,
  ;; e o valor do outro não pode contaminar o vizinho.
  (when (env :test-database-url)
    (db/execute-one! ["DELETE FROM senha_reset_token WHERE usuario_id = ?" usuario])
    (db/execute-one! ["UPDATE usuarios SET senha_hash = ? WHERE id = ?"
                      (hashers/encrypt senha-inicial) usuario]))
  (f))

(use-fixtures :once com-banco-de-teste)
(use-fixtures :each reset-estado-por-teste)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def token-fixo "TOKEN-FIXO-PARA-TESTE")

(defn- contar-tokens []
  (:c (db/execute-one! ["SELECT count(*) AS c FROM senha_reset_token WHERE usuario_id = ?" usuario])))

(defn- senha-hash-atual []
  (:senha_hash (db/execute-one! ["SELECT senha_hash FROM usuarios WHERE id = ?" usuario])))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; recuperar — o par de controle
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest recuperar-email-existente-gera-token-e-manda-email
  (let [enviado (atom nil)]
    (with-redefs [recup/gerar-token-de-recuperacao (constantly token-fixo)
                  email/enviar-email! (fn [m] (reset! enviado m) {:enviado true})]
      (let [resp (recup/recuperar-handler {:body {:email email-do-usuario}})]
        (is (= 200 (:status resp)))
        (is (true? (get-in resp [:body :ok])))
        (is (= 1 (contar-tokens)) "gravou exatamente um token para o usuário")
        (testing "mandou e-mail, com o link no formato que o front espera"
          (is (some? @enviado))
          (is (= email-do-usuario (:para @enviado)))
          (is (str/includes? (:link @enviado) (str "/redefinir-senha?token=" token-fixo))))
        (testing "guardou só o HASH, nunca o token em claro"
          (let [linha (db/execute-one! ["SELECT token_hash FROM senha_reset_token WHERE usuario_id = ?" usuario])]
            (is (not= token-fixo (:token_hash linha)))
            (is (= 64 (count (:token_hash linha))) "SHA-256 em hex tem 64 caracteres")))))))

(deftest recuperar-email-inexistente-responde-igual-mas-nao-faz-nada
  ;; 🔴 O CONTROLE. Mesma resposta do caso de sucesso, mas nenhum efeito: sem
  ;; e-mail e sem token. Sem este par, o 200 genérico esconderia 'não fiz nada'.
  (let [enviado (atom nil)]
    (with-redefs [email/enviar-email! (fn [m] (reset! enviado m) {:enviado true})]
      (let [resp (recup/recuperar-handler {:body {:email "ninguem-aqui@teste.local"}})]
        (is (= 200 (:status resp)) "responde 200")
        (is (= "Se o e-mail existir, enviamos as instruções." (get-in resp [:body :mensagem]))
            "corpo IDÊNTICO ao do caso existente")
        (is (nil? @enviado) "não pode ter mandado e-mail para conta inexistente")
        (is (= 0 (contar-tokens)) "não pode ter gravado token nenhum")))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; redefinir
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest redefinir-troca-a-senha-e-o-login-passa-a-aceitar-a-nova
  (with-redefs [recup/gerar-token-de-recuperacao (constantly token-fixo)
                email/enviar-email! (fn [_] nil)]
    (recup/recuperar-handler {:body {:email email-do-usuario}}))
  (let [hash-antes (senha-hash-atual)
        resp (recup/redefinir-handler {:body {:token token-fixo :nova_senha "novasenha-forte-1"}})]
    (is (= 200 (:status resp)))
    (is (true? (get-in resp [:body :ok])))
    (testing "o senha_hash mudou de verdade"
      (is (not= hash-antes (senha-hash-atual))))
    (testing "e o login clássico aceita a nova senha"
      (let [login (core/login-handler {:body {:email email-do-usuario :senha "novasenha-forte-1"}
                                       :headers {}})]
        (is (= 200 (:status login)))
        (is (string? (get-in login [:body :token])))))
    (testing "a senha antiga deixou de valer"
      (is (= 401 (:status (core/login-handler {:body {:email email-do-usuario :senha senha-inicial}
                                               :headers {}})))))))

(deftest redefinir-token-ja-usado-nao-vale-de-novo
  (with-redefs [recup/gerar-token-de-recuperacao (constantly token-fixo)
                email/enviar-email! (fn [_] nil)]
    (recup/recuperar-handler {:body {:email email-do-usuario}}))
  (is (= 200 (:status (recup/redefinir-handler {:body {:token token-fixo :nova_senha "primeira-troca-1"}})))
      "primeiro uso funciona")
  (let [resp (recup/redefinir-handler {:body {:token token-fixo :nova_senha "segunda-troca-2"}})]
    (is (= 400 (:status resp)) "segundo uso do mesmo token é recusado")
    (is (= "token_invalido" (get-in resp [:body :code])))))

(deftest redefinir-token-expirado-e-recusado
  ;; Grava direto um token já vencido (expira_em no passado): o `expira_em > now()`
  ;; do consumo tem que barrar.
  (db/execute-one! ["INSERT INTO senha_reset_token (usuario_id, token_hash, expira_em)
                     VALUES (?, ?, now() - interval '1 minute')"
                    usuario (#'recup/sha-256-hex token-fixo)])
  (let [resp (recup/redefinir-handler {:body {:token token-fixo :nova_senha "nao-deveria-passar-1"}})]
    (is (= 400 (:status resp)))
    (is (= "token_invalido" (get-in resp [:body :code])))))

(deftest redefinir-token-inexistente-e-recusado
  (let [resp (recup/redefinir-handler {:body {:token "nunca-existiu" :nova_senha "senha-valida-123"}})]
    (is (= 400 (:status resp)))
    (is (= "token_invalido" (get-in resp [:body :code])))))

(deftest redefinir-senha-curta-e-422-e-nao-queima-o-token
  (with-redefs [recup/gerar-token-de-recuperacao (constantly token-fixo)
                email/enviar-email! (fn [_] nil)]
    (recup/recuperar-handler {:body {:email email-do-usuario}}))
  (let [resp (recup/redefinir-handler {:body {:token token-fixo :nova_senha "1234567"}})]
    (is (= 422 (:status resp)) "sete caracteres não bastam")
    (is (= "senha_curta" (get-in resp [:body :code]))))
  (testing "o token continua válido — senha curta não pode consumi-lo"
    (is (= 200 (:status (recup/redefinir-handler {:body {:token token-fixo :nova_senha "agora-tem-oito-1"}}))))))

(ns deep-saude-backend.auth-recuperacao
  "Recuperação de senha por e-mail — o fluxo público de 'esqueci minha senha'.

   Desenho copiado da disciplina segura do `state` do OAuth
   (google/handlers.clj): guarda-se SÓ o hash SHA-256 do token, a expiração é
   curta (30 min), o uso é único e o consumo é atômico. Um vazamento da tabela
   `senha_reset_token` não entrega nenhum link de redefinição — só hashes.

   🔴 O `recuperar` responde SEMPRE a mesma coisa, exista ou não a conta.
   Revelar se a conta existe transformaria este endpoint num verificador de
   e-mails cadastrados — a mesma disciplina do login, que responde 401 igual
   para senha errada e para usuário inexistente."
  (:require [clojure.string :as str]
            [next.jdbc :as jdbc]
            [next.jdbc.sql :as sql]
            [next.jdbc.result-set :as rs]
            [buddy.hashers :as hashers]
            [taoensso.timbre :as log]
            [deep-saude-backend.db :refer [datasource execute-one!]]
            [deep-saude-backend.email :as email])
  (:import (java.nio.charset StandardCharsets)
           (java.security MessageDigest SecureRandom)
           (java.util Base64)))

(def ^:const senha-minima
  ;; O mesmo piso de 8 que criar-usuario-handler, reset-senha! e o
  ;; provisionamento já exigem. Um caminho NOVO de definir senha não pode ser a
  ;; porta larga por onde entra a senha de um caractere que as outras fecham.
  8)

(defn- sha-256-hex
  "Hash hexadecimal do token. Mesma forma do `hash-state` da integração Google:
   só o hash entra no banco; o token em claro só existe no e-mail que sai."
  [^String s]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256")
                        (.getBytes s StandardCharsets/UTF_8))]
    (apply str (map #(format "%02x" (bit-and (int %) 0xff)) digest))))

(defn gerar-token-de-recuperacao
  "Token aleatório de 32 bytes em base64url sem padding.

   `SecureRandom`, não `Math/random`: token previsível é o mesmo que não ter
   token. É uma `defn` de topo (e não um `let` interno) de propósito — os testes
   a redefinem para um valor fixo e conferem o consumo atômico sem precisar
   capturar o e-mail que sai."
  []
  (let [bytes (byte-array 32)]
    (.nextBytes (SecureRandom.) bytes)
    (.encodeToString (.withoutPadding (Base64/getUrlEncoder)) bytes)))

(defn- base-url
  "Origem do link de redefinição. O front monta o caminho
   `/redefinir-senha?token=...`; a origem (https://app-da-clinica) muda por
   implantação, então vem do ambiente. Sem ela, manda-se o caminho relativo e o
   front prefixa a própria origem."
  []
  (some-> (System/getenv "APP_BASE_URL") str/trim not-empty))

(defn recuperar-handler
  "POST /api/auth/recuperar — body {email}. SEMPRE 200 genérico."
  [request]
  (let [email-informado (some-> (get-in request [:body :email]) str str/trim)
        ;; 🔴 A MESMA resposta, sempre. Montada uma vez e devolvida em todos os
        ;; caminhos — inclusive e-mail em branco e conta inexistente. É o que
        ;; impede o endpoint de virar oráculo de contas.
        resposta {:status 200
                  :body {:ok true
                         :mensagem "Se o e-mail existir, enviamos as instruções."}}]
    (when-not (str/blank? email-informado)
      (when-let [usuario (execute-one! ["SELECT id, nome, email FROM usuarios WHERE email = ?"
                                        email-informado])]
        (let [token (gerar-token-de-recuperacao)
              link  (str (base-url) "/redefinir-senha?token=" token)]
          ;; Uso único de verdade: apaga qualquer token anterior DESTE usuário
          ;; (e os vencidos de todos, para a tabela não crescer) antes de gravar
          ;; o novo. Dois pedidos seguidos => só o último vale.
          (execute-one! ["DELETE FROM senha_reset_token WHERE usuario_id = ? OR expira_em < now()"
                         (:id usuario)])
          (execute-one! ["INSERT INTO senha_reset_token (usuario_id, token_hash, expira_em)
                          VALUES (?, ?, now() + interval '30 minutes')"
                         (:id usuario) (sha-256-hex token)])
          (log/info "password_reset_requested")
          (let [{:keys [assunto corpo]} (email/email-de-recuperacao {:nome (:nome usuario) :link link})]
            ;; enviar-email! não estoura quando não há provedor — ver o contrato
            ;; dele. Por isso a resposta genérica sai igual com ou sem e-mail.
            (email/enviar-email! {:para (:email usuario) :assunto assunto
                                  :corpo corpo :link link})))))
    resposta))

(defn redefinir-handler
  "POST /api/auth/redefinir — body {token, nova_senha}."
  [request]
  (let [{:keys [token nova_senha]} (:body request)
        token (some-> token str str/trim)
        nova  (str nova_senha)]
    (cond
      (str/blank? token)
      {:status 400 :body {:erro "Token de redefinição ausente ou inválido."
                          :code "token_invalido"}}

      (< (count nova) senha-minima)
      ;; Checado ANTES de consumir o token: senha curta não pode queimar um token
      ;; válido — a pessoa corrige a senha e reusa o mesmo link.
      {:status 422 :body {:erro (str "A senha deve ter ao menos " senha-minima " caracteres.")
                          :code "senha_curta"}}

      :else
      ;; Consumo ATÔMICO e transacional. O próprio UPDATE é a trava de uso único:
      ;; o WHERE `usado_em IS NULL AND expira_em > now()` garante que dois pedidos
      ;; concorrentes com o mesmo token não redefinam a senha duas vezes — só o
      ;; primeiro casa a linha e volta com o `usuario_id`. Expirado, já usado ou
      ;; inexistente caem todos no mesmo `nil`, e num `code` só.
      ;;
      ;; Os dois passos — queimar o token e trocar a senha — vão na MESMA
      ;; transação: um crash entre eles não pode deixar o token gasto com a senha
      ;; intacta (a pessoa ficaria sem link e sem troca). Ou os dois, ou nenhum.
      (jdbc/with-transaction [tx @datasource]
        (if-let [linha (jdbc/execute-one!
                        tx
                        ["UPDATE senha_reset_token
                            SET usado_em = now()
                          WHERE token_hash = ? AND usado_em IS NULL AND expira_em > now()
                          RETURNING usuario_id"
                         (sha-256-hex token)]
                        {:builder-fn rs/as-unqualified-lower-maps})]
          (do
            (sql/update! tx :usuarios
                         {:senha_hash (hashers/encrypt nova)}
                         {:id (:usuario_id linha)})
            (log/info "password_reset_completed")
            {:status 200 :body {:ok true}})
          {:status 400 :body {:erro "Token inválido, expirado ou já utilizado."
                              :code "token_invalido"}})))))

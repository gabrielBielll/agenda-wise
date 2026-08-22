(ns deep-saude-backend.auth-google
  "Login com conta Google — AUTENTICAÇÃO, e nada além disso.

   ⚠️ Isto NÃO é a integração com o Google Agenda. Aquela vive em
   `deep-saude-backend.google.*`, usa OAuth de CALENDÁRIO e não tem relação
   nenhuma com este arquivo. Aqui só se prova 'quem é você' a partir de um
   id_token do Google e se casa por e-mail com uma conta JÁ existente.

   Decisão do Gabriel: SEM auto-cadastro. O Google não cria conta — só
   autentica quem o administrador da clínica já cadastrou. E-mail que não casa
   com nenhum usuário recebe 403, não uma conta nova.

   🔴 O id_token é validado NO BACKEND, sem confiar no que o front manda:
   assinatura RS256 contra a JWKS do Google, `iss`, `aud`, `exp` e
   `email_verified`. O front detém o secret do cliente OAuth; o backend só
   precisa do client_id, para conferir o `aud`."
  (:require [clojure.string :as str]
            [cheshire.core :as json]
            [environ.core :refer [env]]
            [buddy.sign.jwt :as jwt]
            [taoensso.timbre :as log]
            [deep-saude-backend.sessao :as sessao]
            [deep-saude-backend.db :refer [execute-one!]])
  (:import (java.nio.charset StandardCharsets)
           (java.security KeyFactory)
           (java.security.spec RSAPublicKeySpec)
           (java.util Base64)))

;; `iss` que o Google emite. Os dois valores são legítimos e o Google usa ambos.
(def ^:private emissores-validos
  #{"accounts.google.com" "https://accounts.google.com"})

(def ^:private jwks-uri "https://www.googleapis.com/oauth2/v3/certs")

;; ---------------------------------------------------------------------------
;; Verificação do id_token (a parte que bate na rede — INJETÁVEL nos testes)
;; ---------------------------------------------------------------------------

(defn- decodificar-base64url [^String s]
  (.decode (Base64/getUrlDecoder) s))

(defn- cabecalho-do-jwt
  "Cabeçalho (1ª parte) de um JWT: base64url de um JSON {alg, kid}."
  [id-token]
  (-> (str/split id-token #"\.")
      first
      decodificar-base64url
      (String. StandardCharsets/UTF_8)
      (json/parse-string true)))

(defn- baixar-jwks-google
  "As chaves públicas atuais do Google. ⚠️ ÚNICO ponto de rede do módulo — nos
   testes `verificar-id-token-google` é redefinido e isto nunca roda."
  []
  (-> (slurp jwks-uri) (json/parse-string true) :keys))

(defn- jwk->chave-publica
  "Reconstrói a RSAPublicKey a partir do módulo (n) e do expoente (e) da JWK,
   ambos em base64url. Feito com java.security puro para não depender de mais
   nada no classpath."
  [{:keys [n e]}]
  (let [modulo   (BigInteger. 1 (decodificar-base64url n))
        expoente (BigInteger. 1 (decodificar-base64url e))
        spec     (RSAPublicKeySpec. modulo expoente)]
    (.generatePublic (KeyFactory/getInstance "RSA") spec)))

(defn verificar-id-token-google
  "Verifica a ASSINATURA RS256 do id_token contra a JWKS do Google e devolve os
   claims decodificados, ou `nil` se a assinatura/o formato não fecha.

   🔴 INJETÁVEL: é a var que os testes redefinem com `with-redefs`, justamente
   para NÃO bater na rede. O `jwt/unsign` já valida o `exp` aqui; `iss`, `aud`
   e `email_verified` são conferidos no handler, contra a configuração da
   plataforma (ver `claims-aceitos?`)."
  [id-token]
  (try
    (let [kid (:kid (cabecalho-do-jwt id-token))
          jwk (first (filter #(= kid (:kid %)) (baixar-jwks-google)))]
      (when jwk
        (jwt/unsign id-token (jwk->chave-publica jwk) {:alg :rs256})))
    (catch Exception _e
      ;; Assinatura inválida, token malformado, expirado, kid desconhecido:
      ;; tudo cai aqui e vira "não verificado". Não logar o token.
      (log/warn "google_id_token_verificacao_falhou")
      nil)))

;; ---------------------------------------------------------------------------
;; Validação de claims (pura — testável sem rede)
;; ---------------------------------------------------------------------------

(defn- email-verificado? [v]
  ;; Google manda `email_verified` como boolean no id_token, mas alguns fluxos
  ;; mandam a string "true". Aceita os dois; qualquer outra coisa é não.
  (or (true? v) (= "true" v)))

(defn claims-aceitos?
  "Os claims já com assinatura confirmada satisfazem iss/aud/email_verified?
   `aud` tem que bater com o client_id configurado na plataforma."
  [claims client-id]
  (and (contains? emissores-validos (:iss claims))
       (= client-id (:aud claims))
       (email-verificado? (:email_verified claims))))

;; ---------------------------------------------------------------------------
;; Handler
;; ---------------------------------------------------------------------------

(defn login-google-handler
  "POST /api/auth/google — body {id_token}."
  [request]
  (let [client-id (some-> (env :google-login-client-id) str str/trim not-empty)
        id-token  (some-> (get-in request [:body :id_token]) str str/trim not-empty)]
    (cond
      ;; Dormant-but-ready: sem o client_id não há como conferir o `aud`, então
      ;; não há como validar nada. 503 é a resposta honesta — "existe, mas não
      ;; está ligado" — o mesmo padrão da integração com o Google.
      (str/blank? client-id)
      {:status 503 :body {:erro "Login com Google não está configurado."
                          :code "google_login_nao_configurado"}}

      (str/blank? id-token)
      {:status 401 :body {:erro "id_token ausente ou inválido."
                          :code "id_token_invalido"}}

      :else
      (if-let [claims (verificar-id-token-google id-token)]
        (if (claims-aceitos? claims client-id)
          ;; Assinatura + iss/aud/exp/email_verified OK. Casa por e-mail com uma
          ;; conta existente e emite a MESMA sessão que o login clássico.
          (if-let [usuario (execute-one! ["SELECT * FROM usuarios WHERE email = ?"
                                          (:email claims)])]
            (if-let [papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?"
                                          (:papel_id usuario)])]
              (sessao/emitir-sessao usuario papel)
              (do
                ;; Mesma guarda de integridade do login clássico.
                (log/error "login_role_missing")
                {:status 500 :body {:erro "Erro de integridade: Papel do usuário não encontrado."}}))
            ;; 🔴 SEM auto-cadastro. E-mail válido, mas não existe conta.
            {:status 403 :body {:erro "Conta não encontrada. Peça ao administrador da clínica para cadastrá-la."
                                :code "conta_nao_encontrada"}})
          ;; Assinatura confere, mas iss/aud/email_verified não. É token de outro
          ;; cliente, ou e-mail não verificado — não autentica.
          {:status 401 :body {:erro "id_token inválido."
                              :code "id_token_invalido"}})
        ;; A assinatura não fechou.
        {:status 401 :body {:erro "id_token inválido."
                            :code "id_token_invalido"}}))))

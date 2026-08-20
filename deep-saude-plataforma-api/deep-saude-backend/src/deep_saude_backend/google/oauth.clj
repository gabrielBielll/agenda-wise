(ns deep-saude-backend.google.oauth
  "Fluxo OAuth da clínica (uma conexão por clínica — D1 da spec).

   O psicólogo nunca passa por aqui: as agendas dele já estão compartilhadas com
   a conta da clínica, e é o token da clínica que dá acesso a todas."
  (:require [clojure.string :as str]
            [deep-saude-backend.google.http :as http]))

;; Endpoints com override por ambiente — mesmo motivo do api.clj: sem costura,
;; o fluxo OAuth só roda com projeto real no Google Cloud. O padrão é o Google
;; de verdade; produção não muda.
;;
;; ⚠️ Só os ENDPOINTS são configuráveis. Os escopos abaixo continuam fixos de
;; propósito: escopo é contrato de privacidade com a clínica, não configuração
;; de ambiente. Um `GOOGLE_SCOPES` em variável de ambiente seria um jeito de
;; pedir acesso a mais coisa sem passar por revisão de código.
(def auth-endpoint
  (or (System/getenv "GOOGLE_AUTH_ENDPOINT")
      "https://accounts.google.com/o/oauth2/v2/auth"))

(def token-endpoint
  (or (System/getenv "GOOGLE_TOKEN_ENDPOINT")
      "https://oauth2.googleapis.com/token"))

(def revoke-endpoint
  (or (System/getenv "GOOGLE_REVOKE_ENDPOINT")
      "https://oauth2.googleapis.com/revoke"))

;; Escopos — ver D14/D15.
;;
;; Modelo A precisa de escrita em eventos e de listar as agendas visíveis.
;; O escopo de criação de agenda (Modelo B) é pedido na MESMA verificação,
;; mesmo antes de existir implementação: acrescentar escopo depois custa nova
;; rodada de verificação (semanas) e novo consentimento da clínica.
;;
;; ❓ `calendar.app.created` precisa ser confirmado no OAuth Playground: ele
;; cobre apenas agendas criadas pelo próprio app, então NÃO substitui
;; `calendar.events` para as agendas legadas do Modelo A. Se não autorizar
;; `acl.insert`, testar somar `calendar.acls`; `calendar` completo é o último
;; recurso.
;; `openid` e `email` são escopos BÁSICOS: não passam por verificação, não contam
;; para o teto de 100 usuários e não dão acesso a nada. Servem para o painel
;; mostrar QUAL conta Google está conectada — sem isso o admin não tem como
;; saber se conectou a conta certa da clínica ou a conta pessoal dele.
(def escopos-identidade
  ["openid" "email"])

(def escopos-modelo-a
  ["https://www.googleapis.com/auth/calendar.events"
   "https://www.googleapis.com/auth/calendar.calendarlist.readonly"])

(def escopos-modelo-b
  ["https://www.googleapis.com/auth/calendar.app.created"])

(defn escopos [] (concat escopos-identidade escopos-modelo-a escopos-modelo-b))

(defn url-de-autorizacao
  "URL para onde o admin da clínica é mandado.

   ⚠️ `prompt=consent` só aqui, na conexão inicial, porque é a única chamada em
   que precisamos garantir o refresh token. Repetir isso em todo login queima os
   100 slots de refresh token por usuário/client e invalida silenciosamente as
   conexões mais antigas (spec 8.4)."
  [{:keys [client-id redirect-uri state login-hint]}]
  (http/url-com-query
   auth-endpoint
   {:client_id client-id
    :redirect_uri redirect-uri
    :response_type "code"
    :scope (str/join " " (escopos))
    :access_type "offline"
    :prompt "consent"
    :include_granted_scopes "true"
    :state state
    :login_hint login-hint}))

(defn- form-body [params]
  (str/join "&" (map (fn [[k v]]
                       (str (name k) "=" (java.net.URLEncoder/encode (str v) "UTF-8")))
                     (remove (comp nil? val) params))))

(defn trocar-codigo
  "Troca o `code` do callback por access token + refresh token."
  [{:keys [client-id client-secret redirect-uri code]}]
  (http/requisitar :post token-endpoint
                   {:headers {"Content-Type" "application/x-www-form-urlencoded"}
                    :body (form-body {:code code
                                      :client_id client-id
                                      :client_secret client-secret
                                      :redirect_uri redirect-uri
                                      :grant_type "authorization_code"})}))

(defn renovar-access-token
  "Usa o refresh token para obter um access token novo.

   `invalid_grant` aqui significa que a clínica removeu o app da Conta Google,
   ou que o token expirou por inatividade. Não adianta repetir: tem que virar
   alerta no painel, porque a conexão cobre todos os profissionais (spec 8.4)."
  [{:keys [client-id client-secret refresh-token]}]
  (http/requisitar :post token-endpoint
                   {:headers {"Content-Type" "application/x-www-form-urlencoded"}
                    :body (form-body {:client_id client-id
                                      :client_secret client-secret
                                      :refresh_token refresh-token
                                      :grant_type "refresh_token"})}))

(defn invalid-grant?
  "Detecta a resposta que exige reconexão manual da clínica."
  [resposta]
  (= "invalid_grant" (get-in resposta [:json :error])))

(defn revogar
  "Revoga o token no Google. Usado na tela de desconexão — desconectar sem
   revogar deixa o acesso vivo do lado do Google (spec seção 7)."
  [token]
  (http/requisitar :post revoke-endpoint
                   {:headers {"Content-Type" "application/x-www-form-urlencoded"}
                    :body (form-body {:token token})}))

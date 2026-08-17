(ns deep-saude-backend.google.handlers
  "Endpoints da integração com Google Agenda — Fase 1 (conexão e mapeamento).

   ⚠️ Todas as rotas daqui são de admin. Vincular a agenda errada a um
   profissional expõe o histórico de pacientes de outro — por isso a permissão
   dedicada `gerenciar_integracao_google` e a confirmação humana obrigatória.
   Nunca oferecer ao próprio psicólogo uma lista de agendas para ele escolher
   qual é a dele (spec 5.4)."
  (:require [clojure.string :as str]
            [environ.core :refer [env]]
            [next.jdbc :as jdbc]
            [next.jdbc.sql :as sql]
            [taoensso.timbre :as log]
            [deep-saude-backend.db :refer [datasource execute-query! execute-one!]]
            [deep-saude-backend.google.api :as api]
            [deep-saude-backend.google.cripto :as cripto]
            [deep-saude-backend.google.oauth :as oauth]
            [deep-saude-backend.google.vinculos :as vinculos])
  (:import (java.time Instant)))

(defn- config []
  {:client-id     (env :google-client-id)
   :client-secret (env :google-client-secret)
   :redirect-uri  (env :google-redirect-uri)})

(defn- configurado? []
  (let [c (config)]
    (every? #(not (str/blank? %)) [(:client-id c) (:client-secret c) (:redirect-uri c)])))

;; ---------------------------------------------------------------------------
;; Conexão OAuth da clínica
;; ---------------------------------------------------------------------------

(defn conexao-da-clinica [clinica-id]
  (execute-one! ["SELECT * FROM google_conexao WHERE clinica_id = ?" clinica-id]))

(defn- marcar-conexao-invalida! [conexao-id motivo]
  (sql/update! @datasource :google_conexao
               {:status "invalida"
                :ultimo_erro motivo
                :ultimo_erro_em (java.sql.Timestamp/from (Instant/now))}
               {:id conexao-id}))

(defn access-token-valido
  "Devolve um access token utilizável, renovando se necessário.

   ⚠️ `invalid_grant` significa que a clínica removeu o app da Conta Google ou
   que o token morreu. Não adianta repetir: marca a conexão como inválida para
   o painel alertar. Falhar em silêncio aqui derruba a sincronização de todos os
   profissionais da clínica sem ninguém perceber (spec 8.4)."
  [conexao]
  (let [agora (Instant/now)
        expira (some-> (:access_token_expira_em conexao) .toInstant)
        valido? (and (:access_token_cifrado conexao)
                     expira
                     (.isAfter expira (.plusSeconds agora 60)))]
    (if valido?
      (cripto/decifrar-token (:access_token_cifrado conexao))
      (let [resp (oauth/renovar-access-token
                  (assoc (config) :refresh-token (cripto/decifrar-token (:refresh_token_cifrado conexao))))]
        (cond
          (oauth/invalid-grant? resp)
          (do (marcar-conexao-invalida! (:id conexao) "invalid_grant — a clínica precisa reconectar")
              nil)

          (not (contains? (:json resp) :access_token))
          (do (marcar-conexao-invalida! (:id conexao)
                                        (str "falha ao renovar access token (HTTP " (:status resp) ")"))
              nil)

          :else
          (let [token (get-in resp [:json :access_token])
                expira-em (java.sql.Timestamp/from
                           (.plusSeconds agora (long (get-in resp [:json :expires_in] 3600))))]
            (sql/update! @datasource :google_conexao
                         {:access_token_cifrado (cripto/cifrar-token token)
                          :access_token_expira_em expira-em
                          :status "ativa"
                          :atualizada_em (java.sql.Timestamp/from agora)}
                         {:id (:id conexao)})
            token))))))

(defn iniciar-conexao-handler
  "Devolve a URL de consentimento. O `state` amarra o callback à clínica."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])]
    (if-not (configurado?)
      {:status 503 :body {:erro "Integração com Google não configurada neste ambiente."
                          :code "google_nao_configurado"}}
      (if-not (cripto/chave-valida? (cripto/chave-do-ambiente))
        ;; Sem chave não dá para guardar o refresh token cifrado — e guardar em
        ;; texto claro não é opção (é acesso à agenda de todos os pacientes).
        {:status 503 :body {:erro "GOOGLE_TOKEN_KEY ausente ou inválida."
                            :code "chave_ausente"}}
        (let [state (str clinica-id ":" (java.util.UUID/randomUUID))]
          {:status 200
           :body {:url (oauth/url-de-autorizacao (assoc (config) :state state))
                  :state state}})))))

(defn callback-handler
  "Recebe o `code` do Google e grava a conexão da clínica."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        code (get-in request [:params :code])]
    (cond
      (str/blank? code)
      {:status 400 :body {:erro "code é obrigatório."}}

      (not (configurado?))
      {:status 503 :body {:erro "Integração com Google não configurada neste ambiente."}}

      :else
      (let [resp (oauth/trocar-codigo (assoc (config) :code code))
            {:keys [access_token refresh_token expires_in scope]} (:json resp)]
        (cond
          (not access_token)
          {:status 400 :body {:erro "Falha ao trocar o código pelo token."
                              :detalhe (get-in resp [:json :error_description])}}

          ;; Sem refresh token não há integração: o access token morre em 1h e
          ;; não há como renovar. Acontece quando a conta já autorizou antes e o
          ;; consentimento não foi repetido.
          (not refresh_token)
          {:status 400 :body {:erro "O Google não devolveu refresh token. Remova o acesso do app na Conta Google e conecte novamente."
                              :code "sem_refresh_token"}}

          :else
          (let [agora (Instant/now)
                dados {:clinica_id clinica-id
                       :google_account_email (or (api/conta-conectada access_token) "")
                       :refresh_token_cifrado (cripto/cifrar-token refresh_token)
                       :access_token_cifrado (cripto/cifrar-token access_token)
                       :access_token_expira_em (java.sql.Timestamp/from
                                                (.plusSeconds agora (long (or expires_in 3600))))
                       :escopos (or scope "")
                       :status "ativa"
                       :ultimo_erro nil
                       :ultimo_erro_em nil
                       :atualizada_em (java.sql.Timestamp/from agora)}]
            (if-let [existente (conexao-da-clinica clinica-id)]
              (sql/update! @datasource :google_conexao dados {:id (:id existente)})
              (sql/insert! @datasource :google_conexao dados))
            {:status 200 :body {:message "Google Agenda conectado."}}))))))

(defn status-handler
  "Estado da integração para o painel do admin."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        conexao (conexao-da-clinica clinica-id)
        vincs (execute-query! ["SELECT status, count(*) AS total FROM vinculo_agenda
                                WHERE clinica_id = ? GROUP BY status" clinica-id])]
    {:status 200
     :body {:conectada (boolean conexao)
            :status_conexao (:status conexao)
            :conta (:google_account_email conexao)
            :ultimo_erro (:ultimo_erro conexao)
            :agendas (into {} (map (juxt :status :total)) vincs)
            ;; O painel precisa gritar nestes dois casos: conexão inválida para
            ;; toda a clínica, e agenda descompartilhada sem ninguém saber.
            :precisa_atencao (boolean
                              (or (and conexao (not= "ativa" (:status conexao)))
                                  (some #(= "sem_acesso" (:status %)) vincs)))}}))

(defn desconectar-handler
  "Desconecta de verdade: revoga no Google antes de apagar localmente.

   Apagar só a linha deixaria o acesso vivo do lado do Google — desconexão que
   não desconecta (spec seção 7)."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])]
    (if-let [conexao (conexao-da-clinica clinica-id)]
      (do
        (try
          (oauth/revogar (cripto/decifrar-token (:refresh_token_cifrado conexao)))
          (catch Exception e
            (log/warn e "google_token_revoke_failed")))
        (jdbc/with-transaction [tx @datasource]
          (sql/update! tx :vinculo_agenda {:status "pausado"} {:clinica_id clinica-id})
          (sql/delete! tx :google_conexao {:id (:id conexao)}))
        {:status 200 :body {:message "Google Agenda desconectado."}})
      {:status 404 :body {:erro "Nenhuma conexão com o Google para esta clínica."}})))

;; ---------------------------------------------------------------------------
;; Agendas e vínculos
;; ---------------------------------------------------------------------------

(defn sincronizar-agendas-handler
  "Lê o calendarList e reconcilia com vinculo_agenda.

   É o 'Buscar novas agendas' do painel, e também o que detecta
   descompartilhamento."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])]
    (if-let [conexao (conexao-da-clinica clinica-id)]
      (if-let [token (access-token-valido conexao)]
        (let [resultado (api/listar-calendarios token)]
          (if (:erro resultado)
            {:status 502 :body {:erro "Falha ao listar agendas no Google."
                                :detalhe (:detalhe resultado)}}
            (let [atuais (execute-query! ["SELECT * FROM vinculo_agenda WHERE clinica_id = ?" clinica-id])
                  plano (vinculos/reconciliar (:calendarios resultado) atuais)]
              (jdbc/with-transaction [tx @datasource]
                (doseq [novo (:novos plano)]
                  (sql/insert! tx :vinculo_agenda (assoc novo :clinica_id clinica-id)))
                (doseq [{:keys [id]} (:sem-acesso plano)]
                  (sql/update! tx :vinculo_agenda {:status "sem_acesso"} {:id id}))
                (doseq [{:keys [id status access_role]} (:reativados plano)]
                  (sql/update! tx :vinculo_agenda
                               {:status status :access_role access_role} {:id id}))
                (doseq [{:keys [id para]} (:papel-mudou plano)]
                  (sql/update! tx :vinculo_agenda {:access_role para} {:id id})))
              {:status 200
               :body {:novas (count (:novos plano))
                      :sem_acesso (count (:sem-acesso plano))
                      :reativadas (count (:reativados plano))
                      :papel_alterado (:papel-mudou plano)
                      :ignoradas (:ignorados plano)}})))
        {:status 409 :body {:erro "Conexão com o Google inválida. É necessário reconectar."
                            :code "conexao_invalida"}})
      {:status 404 :body {:erro "Nenhuma conexão com o Google para esta clínica."}})))

(defn listar-agendas-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])]
    {:status 200
     :body (execute-query!
            ["SELECT v.*, u.nome AS nome_psicologo, u.email AS email_psicologo
                FROM vinculo_agenda v
                LEFT JOIN usuarios u ON u.id = v.usuario_id
               WHERE v.clinica_id = ?
               ORDER BY v.status, v.nome_no_google" clinica-id])}))

(defn sugerir-vinculo-handler
  "Sugestões de quem é o dono de uma agenda. **Sugestão apenas.**

   O admin confirma no endpoint de vincular. Nunca aplicar isto sozinho."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        vinculo-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [vinculo (execute-one! ["SELECT * FROM vinculo_agenda WHERE id = ? AND clinica_id = ?"
                                    vinculo-id clinica-id])]
      (let [conexao (conexao-da-clinica clinica-id)
            token (some-> conexao access-token-valido)
            criadores (if token
                        (:criadores (api/listar-eventos-recentes token (:google_calendar_id vinculo)))
                        #{})
            usuarios (execute-query!
                      ["SELECT u.id, u.nome, u.email FROM usuarios u
                          JOIN papeis p ON p.id = u.papel_id
                         WHERE u.clinica_id = ? AND p.nome_papel = 'psicologo'" clinica-id])]
        {:status 200
         :body {:sugestoes (vinculos/sugerir-usuario
                            {:summary (:nome_no_google vinculo) :criadores (or criadores #{})}
                            usuarios)
                :aviso "Sugestão automática. A confirmação é obrigatória — vincular a agenda errada expõe dados de pacientes."}})
      {:status 404 :body {:erro "Vínculo não encontrado."}})))

(defn vincular-handler
  "Confirma o vínculo agenda <-> psicólogo. Só admin chega aqui."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        admin-id (get-in request [:identity :user_id])
        vinculo-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [usuario_id]} (:body request)]
    (cond
      (str/blank? (str usuario_id))
      {:status 400 :body {:erro "usuario_id é obrigatório."}}

      (not (execute-one! ["SELECT id FROM vinculo_agenda WHERE id = ? AND clinica_id = ?"
                          vinculo-id clinica-id]))
      {:status 404 :body {:erro "Vínculo não encontrado."}}

      ;; O psicólogo tem que ser da mesma clínica. Sem esta checagem, um id de
      ;; outra clínica vincularia a agenda para fora do tenant.
      (not (execute-one! ["SELECT id FROM usuarios WHERE id = ? AND clinica_id = ?"
                          (java.util.UUID/fromString (str usuario_id)) clinica-id]))
      {:status 422 :body {:erro "Psicólogo não pertence a esta clínica."}}

      ;; Uma agenda por psicólogo: duas agendas ativas para a mesma pessoa
      ;; duplicariam toda sessão.
      (execute-one! ["SELECT id FROM vinculo_agenda
                       WHERE clinica_id = ? AND usuario_id = ? AND id != ? AND status = 'ativo'"
                     clinica-id (java.util.UUID/fromString (str usuario_id)) vinculo-id])
      {:status 409 :body {:erro "Este psicólogo já tem uma agenda vinculada e ativa."}}

      :else
      (do
        (sql/update! @datasource :vinculo_agenda
                     {:usuario_id (java.util.UUID/fromString (str usuario_id))
                      :status "ativo"
                      :vinculado_por admin-id
                      :vinculado_em (java.sql.Timestamp/from (Instant/now))}
                     {:id vinculo-id})
        ;; Trilha de auditoria: quem vinculou qual agenda a quem, e quando
        ;; (spec seção 7). Vai para o log até existir tabela de auditoria.
        (log/info "google_calendar_linked")
        {:status 200 :body {:message "Agenda vinculada."}}))))

(defn desvincular-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        admin-id (get-in request [:identity :user_id])
        vinculo-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if (execute-one! ["SELECT id FROM vinculo_agenda WHERE id = ? AND clinica_id = ?"
                       vinculo-id clinica-id])
      (do
        (sql/update! @datasource :vinculo_agenda
                     {:usuario_id nil :status "pendente" :vinculado_por nil :vinculado_em nil}
                     {:id vinculo-id})
        (log/info "google_calendar_unlinked")
        {:status 200 :body {:message "Vínculo removido."}})
      {:status 404 :body {:erro "Vínculo não encontrado."}})))

(defn pausar-handler
  "Liga/desliga a sincronização de uma agenda sem desfazer o vínculo."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        vinculo-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [pausado]} (:body request)]
    (if-let [v (execute-one! ["SELECT * FROM vinculo_agenda WHERE id = ? AND clinica_id = ?"
                              vinculo-id clinica-id])]
      (do
        (sql/update! @datasource :vinculo_agenda
                     {:status (if pausado "pausado" (if (:usuario_id v) "ativo" "pendente"))}
                     {:id vinculo-id})
        {:status 200 :body {:message (if pausado "Sincronização pausada." "Sincronização retomada.")}})
      {:status 404 :body {:erro "Vínculo não encontrado."}})))

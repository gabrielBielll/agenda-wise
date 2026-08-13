(ns deep-saude-backend.google.api
  "Chamadas à API do Google Calendar.

   Toda chamada leva `quotaUser` com o id do psicólogo. O limite relevante para
   nós é o de 600 req/min POR USUÁRIO, e como tudo passa pela mesma conta da
   clínica, sem `quotaUser` a clínica inteira compartilha um só balde. Custa
   nada agora e evita refatoração depois (spec seção 9)."
  (:require [deep-saude-backend.google.http :as http]))

;; Endpoints com override por ambiente.
;;
;; O padrão é o Google de verdade e não muda nada em produção. O override existe
;; porque, sem ele, este namespace só é exercitável com credencial real do Google
;; Cloud — e foi exatamente isso que deixou o Gate 4 inteiro sem verificação.
;; Com a costura, dá para apontar para um dublê e testar paginação, tratamento
;; de 403 e o caminho de `sem_acesso` sem depender de conta nenhuma.
;;
;; `System/getenv` em vez de environ pelo mesmo motivo do cripto.clj: manter o
;; namespace sem dependência externa.
(def base
  (or (System/getenv "GOOGLE_API_BASE")
      "https://www.googleapis.com/calendar/v3"))

(def userinfo-endpoint
  (or (System/getenv "GOOGLE_USERINFO_URL")
      "https://www.googleapis.com/oauth2/v3/userinfo"))

(defn- auth-headers [access-token]
  {"Authorization" (str "Bearer " access-token)
   "Content-Type"  "application/json"})

(defn conta-conectada
  "E-mail da conta Google que autorizou.

   O painel precisa mostrar isso: sem ver a conta, o admin não tem como
   perceber que conectou a conta pessoal dele em vez da conta da clínica — e o
   sintoma disso é 'nenhuma agenda aparece', que parece outro problema."
  [access-token]
  (let [resp (http/requisitar :get userinfo-endpoint
                              {:headers (auth-headers access-token)})]
    (when (http/ok? resp)
      (get-in resp [:json :email]))))

(defn listar-calendarios
  "calendarList.list — todas as agendas que a conta da clínica enxerga.

   Pagina até o fim: uma clínica com muitos psicólogos passa do maxResults
   padrão, e parar na primeira página faria agendas sumirem do mapeamento —
   que a reconciliação leria como descompartilhamento."
  [access-token]
  (loop [page-token nil, acc []]
    (let [resp (http/requisitar
                :get
                (http/url-com-query (str base "/users/me/calendarList")
                                    {:maxResults 250
                                     :showHidden true
                                     :pageToken page-token})
                {:headers (auth-headers access-token)})]
      (if-not (http/ok? resp)
        {:erro true :status (:status resp) :detalhe (get-in resp [:json :error])}
        (let [itens (concat acc (get-in resp [:json :items] []))
              proximo (get-in resp [:json :nextPageToken])]
          (if proximo
            (recur proximo itens)
            {:calendarios (mapv #(select-keys % [:id :summary :accessRole :primary :timeZone])
                                itens)}))))))

(defn listar-eventos-recentes
  "Alguns eventos da agenda, só para descobrir quem os criou.

   Serve de insumo para a sugestão de vínculo (spec 5.4): com accessRole=writer
   não há como perguntar ao Google quem é o dono da agenda, e o `creator.email`
   dos eventos é a melhor pista disponível. Continua sendo pista — a
   confirmação é humana."
  [access-token calendar-id & {:keys [quota-user max-results] :or {max-results 10}}]
  (let [resp (http/requisitar
              :get
              (http/url-com-query (str base "/calendars/" (java.net.URLEncoder/encode calendar-id "UTF-8") "/events")
                                  {:maxResults max-results
                                   :orderBy "updated"
                                   :singleEvents true
                                   :quotaUser quota-user})
              {:headers (auth-headers access-token)})]
    (if-not (http/ok? resp)
      {:erro true :status (:status resp)}
      {:criadores (->> (get-in resp [:json :items] [])
                       (mapcat (juxt #(get-in % [:creator :email])
                                     #(get-in % [:organizer :email])))
                       (remove nil?)
                       set)})))

(defn sem-acesso?
  "403/404 numa agenda que antes funcionava = descompartilhada ou apagada."
  [resposta]
  (contains? #{403 404} (:status resposta)))

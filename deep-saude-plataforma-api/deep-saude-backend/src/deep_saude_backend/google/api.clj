(ns deep-saude-backend.google.api
  "Chamadas à API do Google Calendar.

   Toda chamada leva `quotaUser` com o id do psicólogo. O limite relevante para
   nós é o de 600 req/min POR USUÁRIO, e como tudo passa pela mesma conta da
   clínica, sem `quotaUser` a clínica inteira compartilha um só balde. Custa
   nada agora e evita refatoração depois (spec seção 9)."
  (:require [cheshire.core :as json]
            [deep-saude-backend.google.http :as http]))

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

;; ---------------------------------------------------------------------------
;; Escrita
;;
;; 🔴 Até 2026-08-22 este namespace só lia — as três chamadas acima são GET. As
;; duas abaixo são as primeiras que ESCREVEM na conta Google de uma pessoa de
;; verdade, e é isso que muda o custo de errar: um GET errado devolve dado
;; errado, um POST errado deixa lixo na agenda de quem trabalha com ela.
;;
;; Escopo usado: `calendar.app.created`, que é **não confidencial** e alcança
;; `calendars.insert` mais `events.*` **apenas nas agendas que o próprio app
;; criou**. É o que faz a GC-013 (criar a agenda no ato da conexão) ser
;; pré-requisito de tudo o mais: sem a agenda criada por nós, este escopo não
;; escreve em lugar nenhum.
;; ---------------------------------------------------------------------------

(def nome-da-agenda
  "O nome que a psicóloga vai ver na lista de agendas dela, para sempre.

   ⚠️ **Agenda Wise**, não \"Deep Saúde\" — o nome do produto mudou e a GC-013
   (`docs/GOOGLE_CARDS.md`) ainda carrega o texto antigo. Renomear depois é
   possível pela API, mas quem já tiver visto a agenda com o nome errado terá o
   nome errado na memória e nos e-mails de convite."
  "Agenda Wise")

(defn criar-agenda!
  "calendars.insert — cria a agenda dedicada dentro da conta da psicóloga (GC-013).

   Devolve `{:agenda {:id … :summary … :timeZone …}}` ou o mesmo
   `{:erro true :status … :detalhe …}` de `listar-calendarios`, para que o
   chamador não precise aprender dois formatos.

   `timezone` é opcional e vai como o fuso da clínica: sem ele a agenda nasce no
   fuso da **conta Google**, que é o relógio de quem clicou em conectar e não o
   da clínica — a mesma classe de erro que o `tempo.clj` existe para evitar.

   ⚠️ Chamada de rede não cabe em transação de banco (GC-013): grave a intenção,
   chame isto, confirme depois. Morrer no meio deixa agenda sem vínculo, e isso é
   reconciliável por `listar-calendarios`; o contrário — vínculo apontando para
   agenda que não existe — não é."
  [access-token & {:keys [quota-user timezone nome]}]
  (let [corpo (cond-> {:summary (or nome nome-da-agenda)}
                timezone (assoc :timeZone timezone))
        resp (http/requisitar
              :post
              (http/url-com-query (str base "/calendars") {:quotaUser quota-user})
              {:headers (auth-headers access-token)
               :body (json/generate-string corpo)})]
    (if-not (http/ok? resp)
      {:erro true :status (:status resp) :detalhe (get-in resp [:json :error])}
      {:agenda (select-keys (:json resp) [:id :summary :timeZone])})))

(defn duplicado?
  "O 409 do Google para id de evento que já existe.

   Separado da função de escrita porque é **regra**, não detalhe de transporte:
   quem ler o outbox precisa poder fazer a mesma pergunta sobre uma resposta
   guardada."
  [{:keys [status json]}]
  (boolean
   (and (= 409 status)
        ;; O `reason` é o que distingue "esse id já existe" de outros 409. Se o
        ;; Google não mandar corpo, o 409 sozinho já basta: neste endpoint, com
        ;; id nosso, não há outro motivo plausível.
        (let [motivos (->> (get-in json [:error :errors] [])
                           (map :reason)
                           set)]
          (or (empty? motivos) (contains? motivos "duplicate"))))))

(defn criar-evento!
  "events.insert — escreve a sessão na agenda.

   `corpo` é o `:corpo` de `google.evento/agendamento->evento`, que já traz o
   `id` determinístico (D9) e a marca `origem = plataforma` (D12).

   🔴 **409 Duplicate é SUCESSO, não erro.** Com id determinístico, um worker de
   outbox que escreveu no Google e morreu antes de commitar o etag reprocessa e
   recebe 409 — que é exatamente a idempotência funcionando: o evento está lá,
   uma vez só. Tratar isso como falha faz o worker repetir para sempre, a linha
   nunca sair de `pendente`, e o alerta de fila parada acusar um sistema que está
   certo.

   Devolve:
     `{:evento {…} :duplicado? false}`  criado agora (2xx)
     `{:evento nil :duplicado? true :google-event-id \"ds…\"}`  já existia (409)
     `{:erro true :status … :detalhe …}`  qualquer outra coisa

   ⚠️ No caminho do 409 o Google **não** devolve o evento, logo não devolve
   `etag`. Quem precisar do etag (spec §6.5, `If-Match` no update) tem de ler o
   evento depois — não dá para deduzir. Por isso `:evento` é `nil` aqui em vez de
   um mapa remendado: mapa remendado sem etag seria indistinguível de um evento
   recém-criado, e o update seguinte iria sem `If-Match`."
  [access-token calendar-id corpo & {:keys [quota-user]}]
  (let [resp (http/requisitar
              :post
              (http/url-com-query
               (str base "/calendars/"
                    (java.net.URLEncoder/encode (str calendar-id) "UTF-8")
                    "/events")
               {:quotaUser quota-user})
              {:headers (auth-headers access-token)
               :body (json/generate-string corpo)})]
    (cond
      (http/ok? resp)
      {:evento (:json resp) :duplicado? false}

      (duplicado? resp)
      {:evento nil :duplicado? true :google-event-id (:id corpo)}

      :else
      {:erro true :status (:status resp) :detalhe (get-in resp [:json :error])})))

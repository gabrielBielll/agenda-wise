(ns deep-saude-backend.google.api-escrita-test
  "As duas chamadas que ESCREVEM na conta Google de uma pessoa de verdade.

   ⚠️ **Isto não é mock de `http/requisitar`.** Sobe um `HttpServer` de verdade
   na porta 0 e faz o `api.clj` falar com ele pelo mesmo `java.net.http` e pelo
   mesmo caminho de código que usaria contra o Google. Um `with-redefs` no
   cliente HTTP provaria que a função chama a função — e não que o corpo sai,
   que a query vai junto, ou que um 409 atravessa o retry sem virar cinco
   tentativas.

   O que este arquivo **não** cobre: o Google de verdade, a restrição do escopo
   `calendar.app.created` (só escreve em agenda que o app criou) e a validação de
   payload. Para o resto do que falta, ver o rodapé de `dev/google_duble.py`."
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.google.api :as api]
            [deep-saude-backend.google.evento :as evento]
            [deep-saude-backend.google.http :as http])
  (:import (com.sun.net.httpserver HttpExchange HttpHandler HttpServer)
           (java.net InetSocketAddress)))

;; ---------------------------------------------------------------------------
;; Um Google de mentira, em processo
;; ---------------------------------------------------------------------------

(defn- responder [^HttpExchange troca codigo corpo]
  (let [^bytes bytes (.getBytes (json/generate-string corpo) "UTF-8")]
    (.add (.getResponseHeaders troca) "Content-Type" "application/json")
    (.sendResponseHeaders troca codigo (alength bytes))
    (with-open [saida (.getResponseBody troca)]
      (.write saida bytes))))

(defn- com-servidor
  "Sobe o servidor, roda `f` com a base apontada para ele, derruba.

   `f` recebe o atom de registro: cada requisição vira
   `{:metodo :caminho :query :corpo :auth}`. O registro é o que permite afirmar
   *quantas* chamadas saíram — a pergunta que separa idempotência de repetição."
  [handler f]
  (let [registro (atom [])
        servidor (HttpServer/create (InetSocketAddress. "127.0.0.1" 0) 0)]
    (.createContext
     servidor "/"
     (reify HttpHandler
       (handle [_ troca]
         (let [uri (.getRequestURI troca)
               corpo (slurp (.getRequestBody troca))
               req {:metodo (.getRequestMethod troca)
                    ;; `getPath` decodifica o %40 do calendarId; o cru é o que
                    ;; de fato saiu no fio, e é ele que prova o escape.
                    :caminho (.getPath uri)
                    :caminho-cru (.getRawPath uri)
                    :query (.getQuery uri)
                    :corpo (when (seq corpo) (json/parse-string corpo true))
                    :auth (.getFirst (.getRequestHeaders troca) "Authorization")}]
           (swap! registro conj req)
           (handler req troca)))))
    (.start servidor)
    (try
      (with-redefs [api/base (str "http://127.0.0.1:" (.getPort (.getAddress servidor))
                                  "/calendar/v3")]
        (f registro))
      (finally (.stop servidor 0)))))

(defn- google-que-guarda-eventos
  "O mínimo do Google que importa aqui: guarda o id do evento e recusa repetido.

   É a mesma regra que `dev/google_duble.py` aprendeu — duplicada de propósito,
   porque a suíte não pode depender de haver um python rodando ao lado."
  []
  (let [eventos (atom #{})]
    (fn [{:keys [caminho corpo]} troca]
      (cond
        (= "/calendar/v3/calendars" caminho)
        (responder troca 200 {:id "agenda-nova@group.calendar.google.com"
                              :summary (:summary corpo)
                              :timeZone (or (:timeZone corpo) "America/Sao_Paulo")
                              :etag "\"agenda-1\""})

        (re-find #"/events$" caminho)
        (let [id (:id corpo)]
          (if (contains? @eventos id)
            (responder troca 409 {:error {:errors [{:domain "global"
                                                    :reason "duplicate"
                                                    :message "The requested identifier already exists."}]
                                          :code 409
                                          :message "The requested identifier already exists."}})
            (do (swap! eventos conj id)
                (responder troca 200 (assoc corpo :status "confirmed"
                                            :etag (str "\"etag-" id "\""))))))

        :else
        (responder troca 404 {:error {:code 404 :message "não implementado"}})))))

(def agendamento
  {:id               #uuid "4821aaaa-bbbb-cccc-dddd-eeeeffff0000"
   :clinica_id       #uuid "00030000-0000-0000-0000-000000000001"
   :paciente_id      #uuid "13700000-0000-0000-0000-000000000001"
   :data_hora_sessao "2026-08-17 14:00:00"
   :duracao          50
   :status           "agendado"})

(defn- corpo-do-evento []
  (:corpo (evento/agendamento->evento agendamento "Maria da Silva" "America/Sao_Paulo" nil)))

;; ---------------------------------------------------------------------------
;; GC-013 — a agenda nasce na conta da psicóloga
;; ---------------------------------------------------------------------------

(deftest criar-agenda-manda-o-nome-certo
  (com-servidor
   (google-que-guarda-eventos)
   (fn [registro]
     (let [resp (api/criar-agenda! "tok-123" :quota-user "psi-1"
                                   :timezone "America/Sao_Paulo")
           req (first @registro)]
       (testing "🔴 o nome é Agenda Wise — a GC-013 ainda diz 'Deep Saúde', e essa agenda nasce na conta de gente real"
         (is (= "Agenda Wise" (get-in req [:corpo :summary]))))

       (testing "POST em /calendars, com token e quotaUser"
         (is (= "POST" (:metodo req)))
         (is (= "/calendar/v3/calendars" (:caminho req)))
         (is (= "Bearer tok-123" (:auth req)))
         (is (= "quotaUser=psi-1" (:query req))))

       (testing "o fuso vai explícito — senão a agenda nasce no relógio de quem clicou"
         (is (= "America/Sao_Paulo" (get-in req [:corpo :timeZone]))))

       (testing "o retorno segue o formato de listar-calendarios"
         (is (= "agenda-nova@group.calendar.google.com" (get-in resp [:agenda :id])))
         (is (= "Agenda Wise" (get-in resp [:agenda :summary])))
         (is (not (:erro resp))))))))

(deftest criar-agenda-devolve-erro-no-formato-conhecido
  (com-servidor
   (fn [_ troca] (responder troca 403 {:error {:code 403 :message "insufficientPermissions"}}))
   (fn [_]
     (let [resp (api/criar-agenda! "tok-123")]
       (is (:erro resp))
       (is (= 403 (:status resp)))
       (is (= "insufficientPermissions" (get-in resp [:detalhe :message])))
       (is (nil? (:agenda resp)) "erro não devolve agenda pela metade")))))

;; ---------------------------------------------------------------------------
;; events.insert e o 409
;; ---------------------------------------------------------------------------

(deftest criar-evento-manda-o-corpo-inteiro
  (com-servidor
   (google-que-guarda-eventos)
   (fn [registro]
     (let [corpo (corpo-do-evento)
           resp (api/criar-evento! "tok-123" "psi-ana@clinica.example" corpo
                                   :quota-user "psi-1")
           req (first @registro)]
       (testing "a URL leva o calendarId escapado e o quotaUser"
         (is (= "POST" (:metodo req)))
         (is (= "/calendar/v3/calendars/psi-ana%40clinica.example/events" (:caminho-cru req)))
         (is (= "/calendar/v3/calendars/psi-ana@clinica.example/events" (:caminho req))
             "e o Google recebe o id de volta decodificado")
         (is (= "quotaUser=psi-1" (:query req))))

       (testing "o corpo chega inteiro do outro lado — inclusive a marca de origem"
         (is (= (:id corpo) (get-in req [:corpo :id])))
         (is (= "Maria da Silva" (get-in req [:corpo :summary])))
         (is (= "plataforma" (get-in req [:corpo :extendedProperties :private :origem])))
         (is (= "private" (get-in req [:corpo :visibility]))))

       (testing "sucesso devolve o evento e o etag, e diz que não era duplicado"
         (is (false? (:duplicado? resp)))
         (is (= (:id corpo) (get-in resp [:evento :id])))
         (is (some? (get-in resp [:evento :etag])) "o etag é o que o If-Match do update vai usar")
         (is (not (:erro resp))))))))

(deftest reentrega-do-outbox-recebe-409-e-isso-e-sucesso
  (com-servidor
   (google-que-guarda-eventos)
   (fn [registro]
     ;; ⚠️ O corpo é montado DE NOVO na segunda entrega, de propósito. O worker
     ;; do outbox relê a linha e remonta o payload a cada tentativa; reusar o
     ;; mesmo mapa aqui provaria só que o `api.clj` entende 409, e deixaria
     ;; passar um `evento.clj` que gerasse id novo a cada montagem — que é
     ;; exatamente a duplicata que a D9 existe para impedir. Medido: com o id
     ;; aleatório este teste passava, e passou a falhar depois desta linha.
     (let [corpo (corpo-do-evento)
           primeira (api/criar-evento! "tok-123" "agenda@x" corpo)
           segunda  (api/criar-evento! "tok-123" "agenda@x" (corpo-do-evento))]

       (testing "🔴 a segunda entrega NÃO é erro"
         (is (not (:erro segunda)) "409 tratado como erro faz o worker repetir para sempre")
         (is (true? (:duplicado? segunda)))
         (is (= (:id corpo) (:google-event-id segunda))))

       (testing "o evento existe uma vez só — é isto que a idempotência protege"
         (is (false? (:duplicado? primeira)))
         (is (= 2 (count @registro)) "duas chamadas saíram")
         (is (= 1 (count (distinct (map #(get-in % [:corpo :id]) @registro))))
             "com o mesmo id determinístico — o Google é que dedupe"))

       (testing "no 409 não há etag para guardar, e o retorno não finge que há"
         (is (nil? (:evento segunda))))))))

(deftest o-409-nao-entra-no-retry
  ;; Se `deve-repetir?` respondesse sim ao 409, a reentrega viraria cinco
  ;; chamadas com backoff — e a fila pareceria lenta em vez de correta.
  (testing "a regra de retry ignora 409"
    (is (false? (http/deve-repetir? 409 "The requested identifier already exists.")))
    (is (true? (http/deve-repetir? 429 nil)) "controle: o que deve repetir, repete")
    (is (true? (http/deve-repetir? 503 nil))))

  (com-servidor
   (google-que-guarda-eventos)
   (fn [registro]
     (do
       (api/criar-evento! "tok-123" "agenda@x" (corpo-do-evento))
       (api/criar-evento! "tok-123" "agenda@x" (corpo-do-evento))
       (is (= 2 (count @registro))
           "duas chamadas ao todo: o 409 não foi repetido cinco vezes")))))

(deftest conflito-409-sem-motivo-duplicate-continua-sendo-erro
  ;; O caso de controle do `duplicado?`: nem todo 409 é idempotência cumprida.
  (com-servidor
   (fn [_ troca]
     (responder troca 409 {:error {:errors [{:domain "global"
                                             :reason "conflict"
                                             :message "outra coisa"}]
                                   :code 409}}))
   (fn [_]
     (let [resp (api/criar-evento! "tok-123" "agenda@x" (corpo-do-evento))]
       (is (:erro resp))
       (is (= 409 (:status resp)))
       (is (not (:duplicado? resp)))))))

(deftest escrever-em-agenda-sem-acesso-e-erro-visivel
  (com-servidor
   (fn [_ troca] (responder troca 403 {:error {:code 403 :message "Forbidden"}}))
   (fn [_]
     (let [resp (api/criar-evento! "tok-123" "agenda-descompartilhada@x" (corpo-do-evento))]
       (is (:erro resp))
       (is (= 403 (:status resp)))
       (is (api/sem-acesso? resp) "o mesmo predicado que a leitura já usa")))))

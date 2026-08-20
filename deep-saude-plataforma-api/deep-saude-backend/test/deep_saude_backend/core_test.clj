(ns deep-saude-backend.core-test
  "Testes de `core.clj` que não dependem de banco.

   O valor principal deste namespace é indireto e vale registrar: ele faz
   `require` de `deep-saude-backend.core`, e isso obriga o Clojure a compilar o
   arquivo inteiro. Enquanto `core.clj` não tinha teste nenhum, `lein test`
   passava sem nunca ter compilado o maior arquivo do projeto.

   O que dá para testar sem banco é a pilha de middlewares — que é justamente
   onde mora um tipo de defeito difícil de ver por leitura: a ORDEM em que os
   wrappers se envolvem. Ver o teste do 413 abaixo."
  (:require [clojure.test :refer :all]
            [ring.mock.request :as mock]
            [cheshire.core :as json]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.remuneracao :as remuneracao]
            [environ.core]))

(deftest app-esta-montado
  (testing "o handler existe e é chamável"
    (is (fn? core/app)))
  (testing "rota inexistente SEM token devolve 401, não 404"
    ;; Não é engano no teste: em `app-routes` o `(wrap-jwt-autenticacao
    ;; protected-routes)` é um handler embrulhado, não uma rota. Ele checa o JWT
    ;; antes de perguntar se alguma rota casa, então responde 401 para qualquer
    ;; caminho e o `route/not-found` que vem depois nunca é alcançado por
    ;; requisição anônima. Só dá 404 para quem está autenticado.
    (is (= 401 (:status (core/app (mock/request :get "/nao-existe")))))))

(deftest rota-protegida-exige-token
  (testing "sem Authorization devolve 401, não 500"
    (let [resp (core/app (mock/request :get "/api/agendamentos"))]
      (is (= 401 (:status resp))))))

(deftest toda-resposta-tem-request-id
  (let [app (core/montar-app (fn [request]
                               {:status 200
                                :body {:request-id (:request-id request)}}))]
    (testing "gera UUID quando o cliente não envia identificador"
      (let [resp (app (mock/request :get "/qualquer"))
            outro-resp (app (mock/request :get "/qualquer"))
            request-id (get-in resp [:headers "X-Request-ID"])]
        (is (= request-id
               (get (json/parse-string (:body resp)) "request-id")))
        (is (= request-id (str (java.util.UUID/fromString request-id))))
        (is (not= request-id (get-in outro-resp [:headers "X-Request-ID"])))))
    (testing "propaga o identificador recebido"
      (let [resp (app (-> (mock/request :get "/qualquer")
                          (mock/header "X-Request-ID" "req-do-proxy")))]
        (is (= "req-do-proxy" (get-in resp [:headers "X-Request-ID"])))
        (is (= "req-do-proxy"
               (get (json/parse-string (:body resp)) "request-id")))))))

(deftest payload-grande-devolve-413-em-json
  ;; Regressão do bug de ordem de middleware: `wrap-limite-payload` estava
  ;; envolvendo `wrap-json-response` em vez de ser envolvido por ele. O corpo do
  ;; 413 chegava ao Jetty como mapa Clojure e o servidor devolvia um 500 cru,
  ;; sem corpo — logo o cliente não recebia nem o status nem a explicação.
  ;;
  ;; O teste olha as duas coisas: o status E o corpo serializado. Só o status
  ;; não pegaria o defeito, porque o mapa vira 500 só na hora de escrever a
  ;; resposta, já fora da pilha de middlewares.
  (let [grande (apply str (repeat (* 300 1024) "x"))
        resp   (core/app (-> (mock/request :put "/api/agendamentos/qualquer")
                             (mock/content-type "application/json")
                             (mock/body (json/generate-string {:observacoes grande}))))]
    (testing "status é 413"
      (is (= 413 (:status resp))))
    (testing "corpo saiu serializado como JSON, não como mapa Clojure"
      (is (string? (:body resp))
          "corpo não-string chega no Jetty como mapa e vira 500 sem corpo")
      (is (= "payload_muito_grande"
             (get (json/parse-string (:body resp)) "code"))))))

(deftest limite-de-payload-roda-antes-do-parser-de-json
  ;; Acrescentado na revisão cruzada (D-002), porque o teste acima cobre metade
  ;; da propriedade que a ordem dos middlewares tem que garantir.
  ;;
  ;; Ele prova que `wrap-json-response` está POR FORA do limite — o corpo sai
  ;; serializado. Não prova que o limite está ANTES do `wrap-json-body`, que é a
  ;; outra metade e a razão de o limite existir: recusar corpo grande **sem
  ;; gastar memória desserializando**. Mover o limite para depois do parser
  ;; manteria o 413 e o teste acima continuaria verde, perdendo a propriedade em
  ;; silêncio.
  ;;
  ;; O truque é mandar um corpo que seja grande demais E JSON inválido:
  ;;   - limite primeiro  -> 413, o parser nunca é alcançado
  ;;   - parser primeiro  -> ele encosta no corpo malformado antes, e a resposta
  ;;                         deixa de ser 413
  (let [malformado-e-grande (str "{\"observacoes\": \"" (apply str (repeat (* 300 1024) "x")))]
    (testing "corpo grande e malformado devolve 413, não erro de parsing"
      (let [resp (core/app (-> (mock/request :put "/api/agendamentos/qualquer")
                               (mock/content-type "application/json")
                               (mock/body malformado-e-grande)))]
        (is (= 413 (:status resp))
            "413 aqui significa que o limite decidiu antes de alguém tentar interpretar o corpo")
        (is (= "payload_muito_grande"
               (get (json/parse-string (:body resp)) "code")))))))
(deftest parametros-de-query-chegam-como-palavra-chave
  ;; Regressão de um defeito silencioso: `wrap-params` do Ring produz `:params`
  ;; com chaves de TEXTO, e os handlers leem `(get-in request [:params :algo])`.
  ;; Sem `wrap-keyword-params` na pilha, todo filtro de query string virava nil
  ;; sem erro nenhum — a listagem devolvia tudo como se não houvesse filtro, e o
  ;; `code` do callback do Google nunca era visto.
  ;;
  ;; O teste não passa por handler de negócio de propósito: ele inspeciona o
  ;; `:params` que a pilha entrega, que é onde o defeito mora. Assim continua
  ;; valendo mesmo que os handlers mudem.
  (let [visto (atom nil)
        app   (core/montar-app (fn [req] (reset! visto (:params req)) {:status 200 :body {}}))]
    (app (mock/request :get "/qualquer?paciente_id=abc&data_inicio=2030-01-01"))
    (testing "chaves viram palavra-chave"
      (is (= "abc" (:paciente_id @visto)))
      (is (= "2030-01-01" (:data_inicio @visto))))
    (testing "e não sobram como texto"
      (is (nil? (get @visto "paciente_id"))))))

(deftest origens-de-cors-configuraveis
  ;; A lista de origens era fixa no código, e o painel do admin faz health check
  ;; do NAVEGADOR. Publicar em host novo travava a tela em "Conectando ao
  ;; servidor..." sem dizer que o problema era CORS — foi assim que apareceu.
  (testing "sem CORS_ORIGINS, vale o padrão histórico"
    (with-redefs [environ.core/env {}]
      (let [origens (core/origens-permitidas)]
        (is (seq origens))
        (is (some #(re-find % "http://localhost:9002") origens)))))

  (testing "CORS_ORIGINS sobrescreve, aceitando lista separada por vírgula"
    (with-redefs [environ.core/env {:cors-origins "https://app.exemplo.com, https://admin.exemplo.com"}]
      (let [origens (core/origens-permitidas)]
        (is (= 2 (count origens)))
        (is (some #(re-matches % "https://app.exemplo.com") origens))
        (is (some #(re-matches % "https://admin.exemplo.com") origens)))))

  (testing "a origem é ancorada — sufixo não pode casar"
    ;; Sem `\A`/`\z`, "https://app.exemplo.com" casaria dentro de
    ;; "https://app.exemplo.com.invasor.net" e o atacante herdaria o CORS.
    (with-redefs [environ.core/env {:cors-origins "https://app.exemplo.com"}]
      (let [origem (first (core/origens-permitidas))]
        (is (re-matches origem "https://app.exemplo.com"))
        (is (nil? (re-matches origem "https://app.exemplo.com.invasor.net")))
        (is (nil? (re-matches origem "https://prefixo-https://app.exemplo.com")))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Boot — contrapartida da D-001
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; A regra da D-001 é "migration que falha derruba o boot". A aresta que sobrou
;; é que uma indisponibilidade MOMENTÂNEA do banco derrubava junto, virando
;; crash-loop por um blip de rede. Estes testes fixam a distinção: transiente é
;; absorvido, permanente continua derrubando.

(deftest aguardar-banco-absorve-indisponibilidade-transitoria
  (let [tentativas (atom 0)]
    (with-redefs [db/execute-query! (fn [_]
                                      (swap! tentativas inc)
                                      (when (< @tentativas 2)
                                        (throw (java.sql.SQLException. "connection refused")))
                                      [{:?column? 1}])]
      (is (true? (core/aguardar-banco! 3)))
      (is (= 2 @tentativas) "deve ter repetido uma vez antes de conseguir"))))

(deftest aguardar-banco-desiste-quando-o-banco-nao-volta
  (let [tentativas (atom 0)]
    (with-redefs [db/execute-query! (fn [_]
                                      (swap! tentativas inc)
                                      (throw (java.sql.SQLException. "connection refused")))]
      (is (thrown? java.sql.SQLException (core/aguardar-banco! 2))
          "banco que não volta tem que derrubar o boot, não repetir para sempre")
      (is (= 2 @tentativas) "deve ter tentado exatamente o número pedido"))))

(deftest migrar-so-anuncia-sucesso-quando-nao-sobra-pendencia
  ;; 🔴 A-026 — o defeito que custou 17 horas de log verde em 2026-08-19.
  ;;
  ;; `migrations_completed` saía logo depois do `migratus/migrate`, sem olhar se
  ;; sobrou pendência. Uma reserva órfã fazia o migratus desistir em silêncio e
  ;; o boot anunciava sucesso tendo aplicado ZERO migration.
  ;;
  ;; 📌 Os três casos abaixo são um par de controle, não três testes soltos: o
  ;; primeiro prova que a guarda DEIXA passar o boot saudável, os outros dois
  ;; que ela BARRA. Guarda que só foi vista barrando pode estar barrando tudo.
  (testing "saudável: havia pendência, migrou, não sobrou nada — não pode lançar"
    (let [chamada (atom 0)]
      (with-redefs [core/migratus-config (constantly {})
                    migratus/migrate     (constantly nil)
                    migratus/pending-list (fn [_] (if (= 1 (swap! chamada inc))
                                                    ["20260819080000-repasse"]
                                                    []))]
        (is (do (core/migrar!) true)
            "boot com schema em dia não pode ser derrubado pela guarda"))))

  (testing "a reserva está tomada e sobrou pendência — derruba o boot e nomeia a reserva órfã"
    (with-redefs [core/migratus-config (constantly {})
                  migratus/migrate     (constantly :ignore)
                  migratus/pending-list (constantly ["20260819080000-repasse"
                                                     "20260819090000-oauth-state"])]
      (let [e (try (core/migrar!) nil (catch clojure.lang.ExceptionInfo e e))]
        (is (some? e) "pendência restante tem que derrubar o boot — é a D-001")
        (is (= 2 (count (:pendentes (ex-data e)))))
        (is (= :ignore (:desfecho (ex-data e))))
        (is (re-find #"id = -1" (.getMessage e))
            "o log tem que entregar o último salto do diagnóstico, não deixar deduzir")
        (is (re-find #"rastro parcial" (.getMessage e))
            "apagar a reserva sem conferir rastro parcial é o passo que faltava"))))

  (testing "o migratus não relatou erro nenhum e AINDA ASSIM sobrou pendência"
    ;; Este é o caso que o código antigo não tinha como ver: o veredito vem do
    ;; efeito (`pending-list`), não do código de retorno. `nil` quer dizer
    ;; "terminei sem erro", e não "apliquei o que faltava".
    (with-redefs [core/migratus-config (constantly {})
                  migratus/migrate     (constantly nil)
                  migratus/pending-list (constantly ["20260819100000-acesso-prontuario"])]
      (let [e (try (core/migrar!) nil (catch clojure.lang.ExceptionInfo e e))]
        (is (some? e) "sucesso relatado com pendência restante é o defeito, não a exceção")
        (is (re-find #"sem erro relatado" (.getMessage e)))))))

(deftest sincronizar-nao-chama-de-concluida-o-que-nao-tentou-fazer
  ;; 🔴 A-026 — a rota respondia `{"message":"Sincronização concluída",
  ;; "status_atualizados":0}` para uma clínica com 54 sessões no passado, porque
  ;; os UPDATE filtram por `pagamento_automatico = true` e a flag estava
  ;; desligada. "Zero porque não havia o que fazer" e "zero porque eu não faço
  ;; isso aqui" chegavam como a MESMA resposta.
  ;;
  ;; 📌 Os dois casos abaixo são um par: o número zero pode aparecer nos dois
  ;; mundos, então testar só o manual não provaria nada. O que o par prova é que
  ;; a resposta passou a DIZER em qual mundo está.
  (let [pedido {:identity {:clinica_id (java.util.UUID/randomUUID)}}]

    (testing "clínica em pagamento manual — não pode dizer que concluiu"
      (with-redefs [db/datasource   (delay :sem-banco)
                    db/execute-one! (fn [_] {:pagamento_automatico false})]
        (let [resp (core/sincronizar-status-agendamentos-handler pedido)]
          (is (= 200 (:status resp)) "modo manual é configuração, não erro")
          (is (= "manual" (get-in resp [:body :modo])))
          (is (nil? (re-find #"(?i)conclu" (get-in resp [:body :message])))
              "a palavra 'concluída' para quem não tentou nada é a mentira inteira")
          (is (zero? (get-in resp [:body :status_atualizados]))))))

    (testing "clínica em pagamento automático — conclui, diz o modo e devolve o efeito"
      (with-redefs [db/datasource   (delay :sem-banco)
                    db/execute-one! (fn [_] {:pagamento_automatico true})
                    jdbc/execute!   (fn [_ _] [{:next.jdbc/update-count 7}])
                    remuneracao/calcular-pendentes! (fn [_] nil)]
        (let [resp (core/sincronizar-status-agendamentos-handler pedido)]
          (is (= 200 (:status resp)))
          (is (= "automatico" (get-in resp [:body :modo])))
          (is (re-find #"(?i)conclu" (get-in resp [:body :message])))
          (is (= 7 (get-in resp [:body :status_atualizados]))
              "o efeito medido tem que chegar em quem chamou, não só o código de status"))))))

(deftest limite-de-payload-nao-atrapalha-requisicao-pequena
  (testing "corpo pequeno passa direto pelo limite e chega na autenticação"
    (let [resp (core/app (-> (mock/request :put "/api/agendamentos/qualquer")
                             (mock/content-type "application/json")
                             (mock/body (json/generate-string {:observacoes "ok"}))))]
      (is (= 401 (:status resp)) "deve parar no JWT, não no limite de payload"))))

(deftest excecao-de-handler-vira-json-registrado-e-nao-html
  ;; 🔴 VERMELHO DELIBERADO — achado caçando outra coisa, em 18/08.
  ;;
  ;; O e2e de cadastro de paciente falhava com o front reportando
  ;;
  ;;     SyntaxError: Unexpected token '<', "<html>
  ;;
  ;; que é `response.json()` engasgando numa PÁGINA HTML. Fui atrás da exceção
  ;; no log do backend e **não havia nenhuma** — porque a pilha de middlewares
  ;; não tem tratamento de exceção. Handler que estoura chega ao Jetty, que
  ;; devolve HTML e não registra nada.
  ;;
  ;; Duas consequências, e a segunda é a grave:
  ;;
  ;;   1. uma API JSON responde HTML, e todo cliente quebra no parser em vez
  ;;      de ler o erro;
  ;;   2. **o servidor não conta o que aconteceu.** Em produção a primeira
  ;;      notícia de um 500 seria alguém avisando — e aí não haveria o que ler.
  ;;
  ;; Gastei duas hipóteses erradas e duas rodadas de CI porque o sistema não
  ;; reporta os próprios erros. Este teste existe para isso não se repetir.
  (let [app (core/montar-app (fn [_] (throw (IllegalArgumentException. "boom-de-teste"))))
        resp (app (mock/request :get "/qualquer"))]

    (testing "responde 500 em vez de propagar a exceção"
      (is (= 500 (:status resp))))

    (testing "o corpo é JSON, não HTML — cliente de API precisa conseguir ler"
      (is (= "application/json; charset=utf-8" (get-in resp [:headers "Content-Type"])))
      (is (map? (json/parse-string (:body resp)))))

    (testing "e a resposta NÃO vaza a mensagem interna"
      ;; ⚠️ A guarda do outro lado: registrar tudo, contar pouco. Devolver a
      ;; exceção ao cliente entrega caminho de arquivo e estrutura interna a
      ;; quem só mandou um POST.
      (is (not (re-find #"boom-de-teste" (:body resp)))))

    (testing "mas o identificador da requisição vai junto, para casar com o log"
      (is (some? (get-in resp [:headers "X-Request-ID"]))))))

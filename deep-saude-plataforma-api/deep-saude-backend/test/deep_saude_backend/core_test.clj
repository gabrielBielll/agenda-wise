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
            [deep-saude-backend.db :as db]))

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

(deftest limite-de-payload-nao-atrapalha-requisicao-pequena
  (testing "corpo pequeno passa direto pelo limite e chega na autenticação"
    (let [resp (core/app (-> (mock/request :put "/api/agendamentos/qualquer")
                             (mock/content-type "application/json")
                             (mock/body (json/generate-string {:observacoes "ok"}))))]
      (is (= 401 (:status resp)) "deve parar no JWT, não no limite de payload"))))

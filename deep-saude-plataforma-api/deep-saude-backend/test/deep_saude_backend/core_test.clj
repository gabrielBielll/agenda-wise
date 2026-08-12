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
            [deep-saude-backend.core :as core]))

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

(deftest limite-de-payload-nao-atrapalha-requisicao-pequena
  (testing "corpo pequeno passa direto pelo limite e chega na autenticação"
    (let [resp (core/app (-> (mock/request :put "/api/agendamentos/qualquer")
                             (mock/content-type "application/json")
                             (mock/body (json/generate-string {:observacoes "ok"}))))]
      (is (= 401 (:status resp)) "deve parar no JWT, não no limite de payload"))))

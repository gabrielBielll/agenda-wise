(ns deep-saude-backend.limites-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.limites :as limites]))

(defn- chave-unica [] (str "teste-" (java.util.UUID/randomUUID)))

(deftest conta-tentativas-dentro-da-janela
  (let [k (chave-unica)
        cfg {:max-tentativas 3 :janela-ms 60000}]
    (is (:permitido? (limites/registrar! k cfg)) "1ª")
    (is (:permitido? (limites/registrar! k cfg)) "2ª")
    (is (:permitido? (limites/registrar! k cfg)) "3ª")
    (is (not (:permitido? (limites/registrar! k cfg))) "4ª estoura o limite")
    (is (not (:permitido? (limites/registrar! k cfg))) "e continua bloqueada")))

(deftest janela-expira
  (let [k (chave-unica)
        cfg {:max-tentativas 2 :janela-ms 50}]
    (limites/registrar! k cfg)
    (limites/registrar! k cfg)
    (is (not (:permitido? (limites/registrar! k cfg))))
    (Thread/sleep 80)
    (is (:permitido? (limites/registrar! k cfg)) "janela nova, contador zerado")))

(deftest chaves-sao-independentes
  (let [a (chave-unica) b (chave-unica)
        cfg {:max-tentativas 1 :janela-ms 60000}]
    (limites/registrar! a cfg)
    (is (not (:permitido? (limites/registrar! a cfg))))
    (is (:permitido? (limites/registrar! b cfg))
        "bloquear um IP não pode bloquear os outros")))

(deftest login-bem-sucedido-libera
  (testing "quem acertou a senha não fica preso pelas tentativas anteriores"
    (let [k (chave-unica)
          cfg {:max-tentativas 3 :janela-ms 60000}]
      (dotimes [_ 3] (limites/registrar! k cfg))
      (is (not (:permitido? (limites/registrar! k cfg))))
      (limites/liberar! k)
      (is (:permitido? (limites/registrar! k cfg))))))

(deftest informa-quanto-esperar
  (let [k (chave-unica)
        cfg {:max-tentativas 1 :janela-ms 60000}]
    (limites/registrar! k cfg)
    (let [r (limites/registrar! k cfg)]
      (is (not (:permitido? r)))
      (is (<= 50 (:espera-s r) 60) "Retry-After coerente com a janela"))))

(deftest extrai-ip
  (testing "usa X-Forwarded-For, porque em produção há proxy na frente"
    (is (= "203.0.113.9"
           (limites/ip-do-request {:headers {"x-forwarded-for" "203.0.113.9, 10.0.0.1"}
                                   :remote-addr "10.0.0.1"}))))
  (testing "cai para remote-addr quando não há proxy"
    (is (= "10.0.0.1" (limites/ip-do-request {:headers {} :remote-addr "10.0.0.1"}))))
  (testing "nunca devolve nil — a chave do contador não pode ser nula"
    (is (= "desconhecido" (limites/ip-do-request {:headers {}})))
    (is (= "desconhecido" (limites/ip-do-request {:headers {"x-forwarded-for" "  "}})))))

(deftest middleware-de-rate-limit
  (let [chamadas (atom 0)
        handler (limites/wrap-rate-limit
                 (fn [_] (swap! chamadas inc) {:status 200})
                 {:max-tentativas 2 :janela-ms 60000 :nome (chave-unica)})
        req {:headers {} :remote-addr (str "ip-" (java.util.UUID/randomUUID))}]
    (is (= 200 (:status (handler req))))
    (is (= 200 (:status (handler req))))
    (let [r (handler req)]
      (is (= 429 (:status r)))
      (is (= "rate_limited" (get-in r [:body :code])))
      (is (some? (get-in r [:headers "Retry-After"]))))
    (is (= 2 @chamadas) "o handler não roda quando bloqueado")))

(defn- corpo
  "Um corpo de `n` bytes, como InputStream — é o que o Jetty entrega antes do
   parser de JSON, e é onde o limite tem que morder."
  [n]
  (java.io.ByteArrayInputStream. (byte-array n)))

;; O handler protegido LÊ o corpo, exatamente como o `wrap-json-body` faz na
;; pilha real. É a leitura que dispara o corte — um handler que ignora o corpo
;; nunca chegaria a estourar, e um teste com esse handler mediria o nada.
(defn- le-o-corpo [req] (slurp (:body req)) {:status 200})

(deftest teto-por-ip-alem-do-teto-por-conta
  ;; 🔴 T2.5 — credential stuffing: um IP tentando N contas diferentes nunca via
  ;; 429 com só a chave (IP, e-mail), porque cada conta tinha o próprio contador.
  ;; O teto por IP puro, empilhado por fora, fecha isso. É o mesmo empilhamento
  ;; que a rota de login usa.
  (let [ip (str "ip-" (java.util.UUID/randomUUID))
        nome (str "login-" (java.util.UUID/randomUUID))
        handler (limites/wrap-rate-limit
                 (limites/wrap-rate-limit (fn [_] {:status 200})
                                          {:nome (str nome "-conta") :max-tentativas 3 :janela-ms 60000
                                           :chave-extra #(get-in % [:body :email])})
                 {:nome (str nome "-ip") :max-tentativas 5 :janela-ms 60000})
        tentativa (fn [email] (handler {:remote-addr ip :headers {} :body {:email email}}))]
    (testing "cinco contas distintas, uma tentativa cada, passam (bem abaixo do teto de conta)"
      (doseq [i (range 5)]
        (is (= 200 (:status (tentativa (str "c" i "@x")))))))
    (testing "a sexta conta no MESMO IP bate no teto de IP, mesmo nunca tendo tentado antes"
      (is (= 429 (:status (tentativa "c6@x"))))
      (is (= "rate_limited" (get-in (tentativa "c7@x") [:body :code]))))))

(deftest middleware-de-payload
  (let [handler (limites/wrap-limite-payload le-o-corpo 1000)]
    (testing "corpo dentro do limite passa"
      (is (= 200 (:status (handler {:headers {"content-length" "999"} :body (corpo 999)})))))
    (testing "corpo acima do limite, declarado no header, é recusado"
      (let [r (handler {:headers {"content-length" "1001"} :body (corpo 1001)})]
        (is (= 413 (:status r)))
        (is (= "payload_muito_grande" (get-in r [:body :code])))))

    ;; 🔴 T1.3 — o buraco: `Transfer-Encoding: chunked` não manda `Content-Length`,
    ;; então o atalho do header não vê nada e o corpo inteiro era desserializado.
    ;; Na rota de login, pública e sem auth, isso é OOM a um POST de distância.
    (testing "corpo grande SEM content-length também é recusado (chunked)"
      (let [r (handler {:headers {} :body (corpo 5000)})]
        (is (= 413 (:status r)))
        (is (= "payload_muito_grande" (get-in r [:body :code])))))

    (testing "CONTROLE — o MESMO corpo grande dá 413 com e sem o header"
      (is (= 413 (:status (handler {:headers {"content-length" "5000"} :body (corpo 5000)})))
          "com header: atalho do content-length")
      (is (= 413 (:status (handler {:headers {} :body (corpo 5000)})))
          "sem header: o limite morde na leitura"))

    (testing "content-length malformado é tratado como ausente, e o limite ainda vale na leitura"
      ;; O header vem do cliente: `Long/parseLong` cru estourando aqui seria um
      ;; 500 a um header de lixo de distância. Ilegível = ausente, e aí quem
      ;; protege é o corte na leitura.
      (is (= 200 (:status (handler {:headers {"content-length" "abc"} :body (corpo 10)}))))
      (is (= 413 (:status (handler {:headers {"content-length" "abc"} :body (corpo 5000)}))))
      (is (= 200 (:status (handler {:headers {"content-length" ""} :body (corpo 10)})))))

    (testing "corpo pequeno sem header passa"
      (is (= 200 (:status (handler {:headers {} :body (corpo 10)})))))

    (testing "requisição sem corpo nenhum não quebra"
      (let [sem-corpo (limites/wrap-limite-payload (fn [_] {:status 200}) 1000)]
        (is (= 200 (:status (sem-corpo {:headers {}}))))))))

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

(deftest middleware-de-payload
  (let [handler (limites/wrap-limite-payload (fn [_] {:status 200}) 1000)]
    (testing "corpo dentro do limite passa"
      (is (= 200 (:status (handler {:headers {"content-length" "999"}})))))
    (testing "corpo acima do limite é recusado antes do handler"
      (let [r (handler {:headers {"content-length" "1001"}})]
        (is (= 413 (:status r)))
        (is (= "payload_muito_grande" (get-in r [:body :code])))))
    (testing "sem content-length, deixa passar (o servidor tem o próprio limite)"
      (is (= 200 (:status (handler {:headers {}})))))
    (testing "content-length malformado é tratado como ausente, não vira 500"
      ;; O header vem do cliente: se `Long/parseLong` cru estourasse aqui,
      ;; derrubar a requisição seria questão de mandar lixo no header.
      (is (= 200 (:status (handler {:headers {"content-length" "abc"}}))))
      (is (= 200 (:status (handler {:headers {"content-length" ""}})))))))

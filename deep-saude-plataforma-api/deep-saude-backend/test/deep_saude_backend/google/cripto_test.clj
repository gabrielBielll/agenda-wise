(ns deep-saude-backend.google.cripto-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.google.cripto :as cripto]))

(def chave (cripto/gerar-chave))

(deftest chaves
  (testing "chave gerada é AES-256 válida"
    (is (cripto/chave-valida? chave)))

  (testing "chave errada é rejeitada em vez de aceita silenciosamente"
    (is (not (cripto/chave-valida? nil)))
    (is (not (cripto/chave-valida? "")))
    (is (not (cripto/chave-valida? "curta-demais")))
    (is (not (cripto/chave-valida? (.encodeToString (java.util.Base64/getEncoder) (byte-array 16))))
        "16 bytes é AES-128, não serve")))

(deftest ida-e-volta
  (testing "refresh token volta idêntico"
    (let [token "1//0abcDEF-refresh-token-do-google_xyz.123"]
      (is (= token (cripto/decifrar (cripto/cifrar token chave) chave)))))

  (testing "acentuação e unicode sobrevivem"
    (is (= "ação — çãõ" (cripto/decifrar (cripto/cifrar "ação — çãõ" chave) chave))))

  (testing "nil passa reto"
    (is (nil? (cripto/cifrar nil chave)))
    (is (nil? (cripto/decifrar nil chave)))))

(deftest nao-vaza-nem-repete
  (testing "o texto claro não aparece no valor cifrado"
    (let [token "refresh-token-secreto"]
      (is (not (clojure.string/includes? (cripto/cifrar token chave) token)))))

  (testing "cifrar o mesmo valor duas vezes dá resultados diferentes (nonce novo)"
    (let [a (cripto/cifrar "mesmo-token" chave)
          b (cripto/cifrar "mesmo-token" chave)]
      (is (not= a b) "nonce repetido em GCM é falha grave")
      (is (= "mesmo-token" (cripto/decifrar a chave)))
      (is (= "mesmo-token" (cripto/decifrar b chave)))))

  (testing "o formato tem prefixo de versão, para dar caminho de migração"
    (is (clojure.string/starts-with? (cripto/cifrar "x" chave) "v1:"))))

(deftest falha-alto
  (testing "chave errada não decifra — lança em vez de devolver lixo"
    (let [cifrado (cripto/cifrar "token" chave)
          outra (cripto/gerar-chave)]
      (is (thrown? Exception (cripto/decifrar cifrado outra)))))

  (testing "valor adulterado é detectado (GCM autentica)"
    (let [cifrado (cripto/cifrar "token" chave)
          [v nonce texto] (clojure.string/split cifrado #":")
          adulterado (str v ":" nonce ":" (clojure.string/reverse texto))]
      (is (thrown? Exception (cripto/decifrar adulterado chave)))))

  (testing "formato desconhecido é rejeitado"
    (is (thrown? Exception (cripto/decifrar "texto-claro-qualquer" chave)))
    (is (thrown? Exception (cripto/decifrar "v2:aaa:bbb" chave))))

  (testing "sem chave configurada, falha explicitamente"
    (is (thrown? Exception (cripto/cifrar "token" nil)))))

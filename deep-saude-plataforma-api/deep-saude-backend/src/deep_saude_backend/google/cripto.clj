(ns deep-saude-backend.google.cripto
  "Criptografia em repouso do refresh token do Google.

   O refresh token da clínica dá acesso de leitura e escrita à agenda de todos
   os pacientes de todos os psicólogos daquela clínica. Ele não pode ficar em
   texto claro numa coluna — um dump de banco, um backup mal guardado ou um log
   de query vazariam a agenda inteira.

   AES-256-GCM: cifra e autentica na mesma operação, então um valor adulterado
   falha na decifragem em vez de decifrar em lixo silencioso.

   A chave vem de GOOGLE_TOKEN_KEY (32 bytes em base64). Em produção ela deve
   sair do Secrets Manager (AWS-006), nunca do repositório.

   Formato do valor guardado: v1:<nonce-base64>:<ciphertext-base64>
   O prefixo de versão permite trocar de algoritmo depois sem adivinhar o
   formato do que já está gravado."
  (:require [clojure.string :as str])
  (:import (java.security SecureRandom)
           (java.util Base64)
           (javax.crypto Cipher)
           (javax.crypto.spec GCMParameterSpec SecretKeySpec)))

(def ^:private algoritmo "AES/GCM/NoPadding")
(def ^:private tamanho-nonce 12)      ;; 96 bits, recomendado para GCM
(def ^:private tamanho-tag-bits 128)
(def ^:private versao "v1")

(defn- b64->bytes ^bytes [^String s] (.decode (Base64/getDecoder) s))
(defn- bytes->b64 ^String [^bytes b] (.encodeToString (Base64/getEncoder) b))

(defn chave-valida?
  "A chave precisa ter exatamente 32 bytes (AES-256) depois do base64."
  [chave-b64]
  (boolean
   (try
     (= 32 (alength (b64->bytes chave-b64)))
     (catch Exception _ false))))

(defn gerar-chave
  "Gera uma chave nova em base64. Uso operacional: rodar uma vez e guardar o
   resultado no gerenciador de segredos."
  []
  (let [b (byte-array 32)]
    (.nextBytes (SecureRandom.) b)
    (bytes->b64 b)))

(defn- ->secret-key [chave-b64]
  (when-not (chave-valida? chave-b64)
    (throw (ex-info "GOOGLE_TOKEN_KEY ausente ou inválida (esperado 32 bytes em base64)." {})))
  (SecretKeySpec. (b64->bytes chave-b64) "AES"))

(defn cifrar
  "Texto claro -> 'v1:<nonce>:<ciphertext>'. Nonce novo a cada chamada."
  [texto chave-b64]
  (when texto
    (let [chave (->secret-key chave-b64)
          nonce (byte-array tamanho-nonce)
          _ (.nextBytes (SecureRandom.) nonce)
          cipher (doto (Cipher/getInstance algoritmo)
                   (.init Cipher/ENCRYPT_MODE chave (GCMParameterSpec. tamanho-tag-bits nonce)))
          cifrado (.doFinal cipher (.getBytes ^String texto "UTF-8"))]
      (str versao ":" (bytes->b64 nonce) ":" (bytes->b64 cifrado)))))

(defn decifrar
  "'v1:<nonce>:<ciphertext>' -> texto claro.

   Lança se o valor foi adulterado ou se a chave está errada — falhar alto é o
   comportamento desejado, porque seguir com token corrompido só transforma o
   erro num 401 confuso do Google várias camadas depois."
  [valor chave-b64]
  (when valor
    (let [partes (str/split valor #":")]
      (when-not (and (= 3 (count partes)) (= versao (first partes)))
        (throw (ex-info "Formato de token cifrado não reconhecido." {})))
      (let [[_ nonce-b64 cifrado-b64] partes
            chave (->secret-key chave-b64)
            cipher (doto (Cipher/getInstance algoritmo)
                     (.init Cipher/DECRYPT_MODE chave
                            (GCMParameterSpec. tamanho-tag-bits (b64->bytes nonce-b64))))]
        (String. (.doFinal cipher (b64->bytes cifrado-b64)) "UTF-8")))))

(defn chave-do-ambiente
  "Lê direto de System/getenv em vez de environ, de propósito: mantém este
   namespace sem dependência externa e, portanto, testável isoladamente."
  []
  (System/getenv "GOOGLE_TOKEN_KEY"))

(defn cifrar-token [texto] (cifrar texto (chave-do-ambiente)))
(defn decifrar-token [valor] (decifrar valor (chave-do-ambiente)))

(ns deep-saude-backend.google.http
  "Cliente HTTP para a API do Google, com backoff.

   Usa java.net.http do próprio JDK em vez de trazer clj-http/hato: o conjunto
   de endpoints que consumimos é pequeno e uma dependência a menos é uma
   dependência a menos para auditar e atualizar.

   Backoff exponencial com jitter em 403 (usageLimits), 429 e 5xx — cota
   estourada e erro transitório do Google são normais em operação, e retry sem
   jitter faz todas as instâncias baterem juntas de novo (thundering herd)."
  (:require [cheshire.core :as json]
            [clojure.string :as str])
  (:import (java.net URI URLEncoder)
           (java.net.http HttpClient HttpRequest HttpRequest$BodyPublishers
                          HttpResponse$BodyHandlers)
           (java.time Duration)))

(def ^:private cliente
  (delay (-> (HttpClient/newBuilder)
             (.connectTimeout (Duration/ofSeconds 10))
             (.followRedirects java.net.http.HttpClient$Redirect/NORMAL)
             (.build))))

(def max-tentativas 5)

(defn deve-repetir?
  "429 e 5xx sempre. 403 só quando é limite de uso — 403 por permissão (agenda
   descompartilhada) não melhora com retry e precisa chegar rápido ao alerta."
  [status corpo]
  (boolean
   (or (= 429 status)
       (<= 500 status 599)
       (and (= 403 status)
            (some? corpo)
            (re-find #"(?i)rateLimitExceeded|userRateLimitExceeded|quotaExceeded" (str corpo))))))

(defn backoff-ms
  "Espera antes da tentativa `n` (1-based): 2^n * 500ms, teto de 32s, com
   jitter de até 30% para dessincronizar instâncias."
  ([n] (backoff-ms n (rand)))
  ([n aleatorio]
   (let [base (min 32000 (* 500 (long (Math/pow 2 n))))]
     (long (+ base (* base 0.3 aleatorio))))))

(defn url-com-query [url params]
  (let [qs (->> params
                (remove (fn [[_ v]] (nil? v)))
                (map (fn [[k v]] (str (URLEncoder/encode (name k) "UTF-8")
                                      "="
                                      (URLEncoder/encode (str v) "UTF-8"))))
                (str/join "&"))]
    (if (str/blank? qs) url (str url "?" qs))))

(defn- construir [metodo url {:keys [headers body]}]
  (let [b (HttpRequest/newBuilder (URI/create url))]
    (doseq [[k v] headers] (.header b (name k) (str v)))
    (.timeout b (Duration/ofSeconds 30))
    (case metodo
      :get    (.GET b)
      :delete (.DELETE b)
      (.method b (str/upper-case (name metodo))
               (if body
                 (HttpRequest$BodyPublishers/ofString body)
                 (HttpRequest$BodyPublishers/noBody))))
    (.build b)))

(defn requisitar
  "Executa a requisição com retry. Devolve {:status :body :json}.

   Não lança em status de erro: quem chama decide o que fazer. Um 403 de
   permissão precisa virar estado `sem_acesso` no painel, não stack trace."
  [metodo url {:keys [headers body dormir] :as opts}]
  (let [dormir (or dormir #(Thread/sleep ^long %))]
    (loop [tentativa 1]
      (let [resp (try
                   (let [r (.send @cliente (construir metodo url opts)
                                  (HttpResponse$BodyHandlers/ofString))]
                     {:status (.statusCode r) :body (.body r)})
                   (catch java.io.IOException e
                     {:status 0 :body (.getMessage e) :erro-rede true}))]
        (if (and (< tentativa max-tentativas)
                 (or (:erro-rede resp) (deve-repetir? (:status resp) (:body resp))))
          (do (dormir (backoff-ms tentativa))
              (recur (inc tentativa)))
          (assoc resp :json (try (json/parse-string (:body resp) true)
                                 (catch Exception _ nil))))))))

(defn ok? [{:keys [status]}] (<= 200 status 299))

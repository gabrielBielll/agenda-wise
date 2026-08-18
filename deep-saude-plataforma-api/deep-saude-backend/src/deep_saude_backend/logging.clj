(ns deep-saude-backend.logging
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [taoensso.timbre :as log]))

(defn- nivel-configurado []
  (case (some-> (System/getenv "LOG_LEVEL") str/lower-case)
    "debug" :debug
    "warn"  :warn
    "error" :error
    :info))

(defn json-output
  "Serializa um evento do Timbre sem acrescentar campos de usuário. Contexto
   só deve conter identificadores técnicos não clínicos."
  [{:keys [level msg_ timestamp_ ?ns-str context ?err]}]
  (json/generate-string
   (merge (cond-> {:ts    (force timestamp_)
                   :level (name level)
                   :ns    ?ns-str
                   :msg   (force msg_)}
            ?err (assoc :error_type (.getName (class ?err))))
          context)))

(defn configurar! []
  (log/merge-config!
   {:min-level (nivel-configurado)
    :appenders {:println {:enabled? true
                          :output-fn json-output}}}))

(configurar!)

(defn wrap-request-id
  "Propaga o identificador recebido ou cria um UUID, disponibilizando-o no
   contexto dos logs e no header de toda resposta."
  [handler]
  (fn [request]
    (let [request-id (or (get-in request [:headers "x-request-id"])
                         (str (java.util.UUID/randomUUID)))]
      (log/with-context {:request_id request-id}
        (-> (handler (assoc request :request-id request-id))
            (assoc-in [:headers "X-Request-ID"] request-id))))))

(defn wrap-excecao
  "Fronteira de erro da API: registra a exceção e devolve **JSON**, nunca HTML.

   🔴 Existe por uma ausência descoberta em 18/08, caçando outro defeito. Um
   handler que estourava chegava ao Jetty, que respondia uma **página HTML** — e
   **ninguém registrava nada**. Os efeitos, na ordem em que doem:

   1. **O servidor não contava o que deu errado.** Em produção, a primeira
      notícia de um 500 seria alguém avisando, e aí não haveria o que ler. Duas
      hipóteses erradas e duas rodadas de CI foram gastas por causa disso.
   2. Uma API JSON respondendo HTML quebra o cliente **no parser**: o front
      reportava `SyntaxError: Unexpected token '<'`, que manda quem investiga
      procurar rede em vez do erro do servidor.

   ⚠️ **Fica FORA do `wrap-json-response`, e por isso serializa o corpo à mão.**
   É de propósito: assim ela também cobre exceção levantada pela própria
   serialização — corpo com tipo que o Cheshire não sabe escrever era outro
   caminho para 500 mudo.

   🔒 **Registra tudo, conta pouco.** A resposta leva um código estável e o
   `request_id`; a mensagem e o stack ficam no log. Devolver a exceção ao cliente
   entrega estrutura interna a quem só mandou um POST — e o `request_id` no
   header é o que costura o relato da pessoa ao log do servidor."
  [handler]
  (fn [request]
    (try
      (handler request)
      (catch Throwable e
        (log/with-context {:uri (:uri request)
                           :metodo (name (:request-method request :desconhecido))}
          (log/error e "requisicao_falhou"))
        {:status 500
         :headers {"Content-Type" "application/json; charset=utf-8"}
         :body (json/generate-string
                {:erro "Erro interno."
                 :code "erro_interno"})}))))

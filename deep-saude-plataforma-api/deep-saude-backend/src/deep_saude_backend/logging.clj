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

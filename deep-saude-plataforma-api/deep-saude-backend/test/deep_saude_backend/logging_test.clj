(ns deep-saude-backend.logging-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [deep-saude-backend.logging :as logging]))

(deftest evento-e-json-estruturado
  (let [evento (json/parse-string
                (logging/json-output
                 {:level :warn
                  :msg_ (delay "evento_teste")
                  :timestamp_ (delay "2030-01-01T00:00:00Z")
                  :?ns-str "deep-saude-backend.teste"
                  :context {:request_id "req-123"}})
                true)]
    (is (= {:ts "2030-01-01T00:00:00Z"
            :level "warn"
            :ns "deep-saude-backend.teste"
            :msg "evento_teste"
            :request_id "req-123"}
           evento))))

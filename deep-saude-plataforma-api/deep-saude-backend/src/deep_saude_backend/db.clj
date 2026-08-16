(ns deep-saude-backend.db
  "Conexão e helpers de query.

   Extraído de core.clj para quebrar a dependência circular que apareceria com
   os handlers do Google: eles precisam do banco, e core.clj precisa deles para
   montar as rotas. Aqui não há regra de negócio nenhuma."
  (:require [clojure.string :as str]
            [environ.core :refer [env]]
            [next.jdbc :as jdbc]
            [next.jdbc.connection :as connection]
            [next.jdbc.result-set :as rs])
  (:import (com.zaxxer.hikari HikariDataSource)))

(defonce db-spec
  (delay
    (when-let [db-url (env :database-url)]
      (let [uri (java.net.URI. db-url)
            auth (some-> (.getUserInfo uri) (str/split #":"))
            usuario (first auth)
            senha (second auth)
            host (.getHost uri)
            ;; ⚠️ `.getPort` devolve **int**, e -1 quando a URL não traz porta.
            ;; Em Clojure só `nil` e `false` são falsos, então o `(or ... 5432)`
            ;; que estava aqui NUNCA caía no padrão: o -1 seguia para o driver,
            ;; que respondia `JDBC URL port: -1 not valid (1:65535)` e depois
            ;; `No suitable driver` — mensagem que não menciona porta nenhuma.
            ;; Achado pela `vale` ao subir o backend com DATABASE_URL sem porta;
            ;; confirmado com `java.net.URI` puro antes da correção.
            port (let [p (.getPort uri)] (if (pos? p) p 5432))
            path (.getPath uri)
            dbname (if (seq path) (subs path 1) "defaultdb")
            query (.getQuery uri)
            query-params (when query
                           (apply merge (for [pair (str/split query #"&")]
                                          (let [[k v] (str/split pair #"=")]
                                            {(keyword k) v}))))
            ;; Se sslmode for disable, mantém disable. Se for qualquer outra coisa
            ;; (verify-full, require, nil), força require.
            ssl-mode-param (:sslmode query-params)
            ssl-mode (if (= ssl-mode-param "disable") "disable" "require")
            ssl-enabled (not= ssl-mode "disable")]
        {:dbtype   "postgresql"
         :dbname   dbname
         :host     host
         :port     port
         :user     usuario
         :password senha
         :ssl      ssl-enabled
         :sslmode  ssl-mode}))))

(defn- inteiro [chave padrao]
  (if-let [v (env chave)] (Integer/parseInt (str v)) padrao))

(defonce datasource
  (delay
    ;; Pool de conexões (HikariCP).
    ;;
    ;; Antes era `jdbc/get-datasource` sobre o mapa de configuração, que abre
    ;; uma conexão NOVA a cada query e a descarta em seguida. Contra um Postgres
    ;; local isso passa despercebido; contra CockroachDB gerenciado, cada query
    ;; paga handshake TCP + TLS. Um handler que faz 5 queries pagava 5 handshakes.
    ;;
    ;; `max-lifetime` abaixo do tempo de corte do servidor é o que evita o
    ;; clássico "connection reset" intermitente: bancos gerenciados derrubam
    ;; conexões ociosas em silêncio, e o pool precisa reciclar antes disso.
    ;;
    ;; ⚠️ `->pool` não é `get-datasource`. Ele repassa cada chave do mapa como
    ;; propriedade de bean do HikariDataSource, e o Hikari não tem `user`, `ssl`
    ;; nem `sslmode` — a credencial dele chama `username`, e o resto do que é do
    ;; driver tem que viajar na URL. Passar o db-spec cru aqui fazia o pool
    ;; subir SEM usuário e SEM TLS, em silêncio: a conexão caía no usuário do
    ;; sistema operacional e o `sslmode` montado acima era descartado. Contra
    ;; banco gerenciado isso é falha de autenticação no boot.
    ;;
    ;; Por isso a separação explícita: o que é do driver vai por `jdbc-url`, e
    ;; só credencial e ajuste de pool ficam como propriedade do Hikari.
    (let [spec (or @db-spec
                   (throw (ex-info "DATABASE_URL não configurada — sem ela não há pool." {})))]
      (connection/->pool
       HikariDataSource
       {:jdbcUrl           (connection/jdbc-url
                            (select-keys spec [:dbtype :dbname :host :port :ssl :sslmode]))
        :username          (:user spec)
        :password          (:password spec)
        :maximumPoolSize   (inteiro :db-pool-size 10)
        :minimumIdle       (inteiro :db-pool-min-idle 2)
        :connectionTimeout (inteiro :db-connection-timeout-ms 10000)
        :idleTimeout       300000     ;; 5 min
        :maxLifetime       1500000    ;; 25 min
        :keepaliveTime     120000     ;; 2 min
        :poolName          "deep-saude-pool"}))))

(defn execute-query! [query-vector]
  (jdbc/execute! @datasource query-vector {:builder-fn rs/as-unqualified-lower-maps}))

(defn execute-one! [query-vector]
  (jdbc/execute-one! @datasource query-vector {:builder-fn rs/as-unqualified-lower-maps}))

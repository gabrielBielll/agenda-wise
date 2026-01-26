(defproject deep-saude-backend "0.1.0-SNAPSHOT"
  :description "Backend para Gestão de Psicólogos da Plataforma Deep Saúde"
  :url "http://example.com/FIXME" ; Você pode querer atualizar isso
  :license {:name "EPL-2.0 OR GPL-2.0-or-later WITH Classpath-exception-2.0"
            :url "https://www.eclipse.org/legal/epl-2.0/"}
  :dependencies [[org.clojure/clojure "1.11.1"]
                 [ring/ring-core "1.11.0"]
                 [ring/ring-jetty-adapter "1.11.0"] ; Ou http-kit
                 [ring/ring-json "0.5.1"]
                 [ring-cors "0.1.13"]
                 [compojure "1.7.1"]
                 [com.github.seancorfield/next.jdbc "1.3.909"] ; Nome corrigido
                 [org.postgresql/postgresql "42.7.1"] ; Driver JDBC
                 [environ "1.2.0"]
                 [buddy/buddy-sign "3.5.346"]
                 [buddy/buddy-hashers "2.0.167"]]
  :plugins [[lein-ring "0.12.6"]] ; Para facilitar o desenvolvimento com Ring
  :ring {:handler deep-saude-backend.core/app
         :init deep-saude-backend.core/init-db ; Função para inicializar o DB (opcional aqui)
         :destroy deep-saude-backend.core/destroy-db} ; Função para limpar (opcional aqui)
  :main ^:skip-aot deep-saude-backend.core
  :target-path "target/%s"
  :profiles {:uberjar {:aot :all
                       :jvm-opts ["-Dclojure.compiler.direct-linking=true"]}
             :dev {:dependencies [[javax.servlet/servlet-api "2.5"] ; Para desenvolvimento local com `lein ring server`
                                  [ring/ring-mock "0.4.0"]]}})

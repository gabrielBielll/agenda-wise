(ns deep-saude-backend.core
  (:require [ring.adapter.jetty :as jetty]
            [ring.middleware.json :as middleware-json]
            [compojure.core :refer [defroutes GET POST PUT DELETE context]]
            [compojure.route :as route]
            [environ.core :refer [env]]
            [next.jdbc :as jdbc]
            [next.jdbc.sql :as sql]
            [next.jdbc.result-set :as rs]
            [clojure.string :as str]
            [buddy.sign.jwt :as jwt]
            [buddy.hashers :as hashers]
            [ring.middleware.cors :refer [wrap-cors]])
  (:gen-class)
  (:import (java.sql Date))) ; Importar java.sql.Date para conversão

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Configuração do Banco de Dados e JWT
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defonce db-spec
  (delay
    (when-let [db-url (env :database-url)]
      {:dbtype   "postgresql"
       :jdbcUrl  (str/replace-first db-url "postgresql://" "jdbc:postgresql://")
       :ssl      false
       :sslmode  "disable"})))

(defonce datasource (delay (jdbc/get-datasource @db-spec)))

(def jwt-secret
  (if-let [secret (env :jwt-secret)]
    (do
      (println (str "SUCCESS: JWT_SECRET encontrada. Início: '" (subs secret 0 (min 4 (count secret))) "...', Fim: '..." (subs secret (max 0 (- (count secret) 4))) "'."))
      secret)
    (do
      (println "ERROR: Variável de ambiente JWT_SECRET não foi encontrada!")
      (throw (Exception. "FATAL: A variável de ambiente :jwt-secret não está configurada! A aplicação será encerrada.")))))

(defn execute-query! [query-vector]
  (jdbc/execute! @datasource query-vector {:builder-fn rs/as-unqualified-lower-maps}))

(defn execute-one! [query-vector]
  (jdbc/execute-one! @datasource query-vector {:builder-fn rs/as-unqualified-lower-maps}))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Middlewares de Segurança
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- extract-token [request]
  (some-> (get-in request [:headers "authorization"])
          (str/split #" ")
          (second)))

(defn wrap-jwt-autenticacao [handler]
  (fn [request]
    (try
      (if-let [token (extract-token request)]
        (let [claims (jwt/unsign token jwt-secret)
              request-com-identidade (assoc request :identity claims)]
          (handler request-com-identidade))
        {:status 401 :body {:erro "Token de autorização não fornecido."}})
      (catch Exception e
        (println "ERRO DE VALIDAÇÃO JWT:" (.getMessage e))
        {:status 401 :body {:erro "Token inválido ou expirado."}}))))

(defn wrap-checar-permissao [handler nome-permissao-requerida]
  (fn [request]
    (let [papel-id (get-in request [:identity :papel_id])]
      (if-not papel-id
        {:status 403 :body {:erro "Identidade do usuário ou papel não encontrado na requisição."}}
        (let [permissao (execute-one!
                         ["SELECT pp.permissao_id
                           FROM papel_permissoes pp
                           JOIN permissoes p ON pp.permissao_id = p.id
                           WHERE pp.papel_id = ? AND p.nome_permissao = ?"
                          papel-id nome-permissao-requerida])]
          (if permissao
            (handler request)
            {:status 403 :body {:erro (str "Usuário não tem a permissão necessária: " nome-permissao-requerida)}}))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Handlers (Lógica dos Endpoints)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn health-check-handler [_]
  {:status 200 :headers {"Content-Type" "text/plain"} :body "Servidor Deep Saúde OK!"})

;; --- Handlers de Autenticação e Provisionamento ---
(defn provisionar-clinica-handler [request]
  (let [{:keys [nome_clinica limite_psicologos nome_admin email_admin senha_admin]} (:body request)]
    (cond
      (or (str/blank? nome_clinica) (str/blank? nome_admin) (str/blank? email_admin) (str/blank? senha_admin))
      {:status 400, :body {:erro "Nome da clínica, nome do admin, email e senha são obrigatórios."}}

      (execute-one! ["SELECT id FROM usuarios WHERE email = ?" email_admin])
      {:status 409, :body {:erro "Email do administrador já cadastrado no sistema."}}

      :else
      (let [nova-clinica (sql/insert! @datasource :clinicas
                                      {:nome_da_clinica nome_clinica :limite_psicologos limite_psicologos}
                                      {:builder-fn rs/as-unqualified-lower-maps :return-keys [:id :nome_da_clinica]})
            papel-admin-id (:id (execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))
            novo-admin (when papel-admin-id
                         (sql/insert! @datasource :usuarios
                                      {:clinica_id (:id nova-clinica)
                                       :papel_id   papel-admin-id
                                       :nome       nome_admin
                                       :email      email_admin
                                       :senha_hash (hashers/encrypt senha_admin)}
                                      {:builder-fn rs/as-unqualified-lower-maps :return-keys [:id :email]}))]
        (if novo-admin
          {:status 201 :body {:message "Clínica e usuário administrador criados com sucesso."
                               :clinica nova-clinica
                               :usuario_admin novo-admin}}
          {:status 500 :body {:erro "Erro interno: O papel 'admin_clinica' não foi encontrado ou não pôde ser associado."}})))))

(defn login-handler [request]
  (let [{:keys [email senha]} (:body request)]
    (if-let [usuario (execute-one! ["SELECT u.id, u.clinica_id, u.papel_id, u.senha_hash, p.nome_papel 
                                     FROM usuarios u 
                                     JOIN papeis p ON u.papel_id = p.id 
                                     WHERE u.email = ?" email])]
      (if (hashers/check senha (:senha_hash usuario))
        (let [claims {:user_id    (:id usuario)
                      :clinica_id (:clinica_id usuario)
                      :papel_id   (:papel_id usuario)
                      :role       (:nome_papel usuario)
                      :exp        (-> (java.time.Instant/now) (.plusSeconds 3600) .getEpochSecond)}
              token (jwt/sign claims jwt-secret)]
          {:status 200 :body {:message "Usuário autenticado com sucesso."
                               :token   token}})
        {:status 401 :body {:erro "Credenciais inválidas."}})
      {:status 401 :body {:erro "Credenciais inválidas."}})))

;; --- Handlers de Usuários ---
(defn criar-usuario-handler [request]
  (let [clinica-id-admin (get-in request [:identity :clinica_id])
        {:keys [nome email senha papel]} (:body request)]
    (cond
      (or (str/blank? nome) (str/blank? email) (str/blank? senha) (str/blank? papel))
      {:status 400, :body {:erro "Nome, email, senha e papel são obrigatórios."}}

      (execute-one! ["SELECT id FROM usuarios WHERE email = ?" email])
      {:status 409, :body {:erro "Email já cadastrado no sistema."}}

      :else
      (if-let [papel-id (:id (execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" papel]))]
        (let [novo-usuario (sql/insert! @datasource :usuarios
                                        {:clinica_id clinica-id-admin
                                         :papel_id   papel-id
                                         :nome       nome
                                         :email      email
                                         :senha_hash (hashers/encrypt senha)}
                                        {:builder-fn rs/as-unqualified-lower-maps :return-keys [:id :nome :email :clinica_id :papel_id]})]
          {:status 201, :body novo-usuario})
        {:status 400, :body {:erro (str "O papel '" papel "' não é válido.")}}))))

(defn remover-usuario-handler [request]
  (let [clinica-id-admin (get-in request [:identity :clinica_id])
        usuario-id-para-remover (get-in request [:params :id])]
    (let [resultado (sql/delete! @datasource :usuarios {:id usuario-id-para-remover :clinica_id clinica-id-admin})]
      (if (zero? (:next.jdbc/update-count resultado))
        {:status 404 :body {:erro "Usuário não encontrado nesta clínica ou você não tem permissão para removê-lo."}}
        {:status 204 :body ""}))))

(defn obter-usuario-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (get-in request [:params :id])]
    (if-let [usuario (execute-one! ["SELECT id, nome, email, papel_id FROM usuarios WHERE id = ? AND clinica_id = ?" usuario-id clinica-id])]
      {:status 200 :body usuario}
      {:status 404 :body {:erro "Usuário não encontrado nesta clínica."}})))

(defn atualizar-usuario-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (get-in request [:params :id])
        {:keys [nome email]} (:body request)]
    (cond
      (and (str/blank? nome) (str/blank? email))
      {:status 400 :body {:erro "Pelo menos um campo (nome ou email) deve ser fornecido para atualização."}}

      (and email (execute-one! ["SELECT id FROM usuarios WHERE email = ? AND id != ?" email usuario-id]))
      {:status 409 :body {:erro "O email fornecido já está em uso por outro usuário."}}

      :else
      (let [update-map (cond-> {}
                         (not (str/blank? nome)) (assoc :nome nome)
                         (not (str/blank? email)) (assoc :email email))
            resultado (sql/update! @datasource :usuarios update-map {:id usuario-id :clinica_id clinica-id})]
        (if (zero? (:next.jdbc/update-count resultado))
          {:status 404 :body {:erro "Usuário não encontrado nesta clínica ou nenhum dado foi alterado."}}
          (let [usuario-atualizado (execute-one! ["SELECT id, nome, email, papel_id FROM usuarios WHERE id = ?" usuario-id])]
            {:status 200 :body usuario-atualizado}))))))

;; --- Handlers de Psicólogos ---
(defn listar-psicologos-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])]
    (if-not clinica-id
      {:status 403 :body {:erro "Clínica ID não encontrada na identidade do usuário."}}
      (let [papel-psicologo-id (:id (execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))]
        (if-not papel-psicologo-id
          {:status 500 :body {:erro "Configuração de papel 'psicologo' não encontrada."}}
          (let [psicologos (execute-query!
                             ["SELECT id, nome, email, clinica_id, papel_id FROM usuarios WHERE clinica_id = ? AND papel_id = ?"
                              clinica-id papel-psicologo-id])]
            {:status 200 :body psicologos}))))))

;; --- Handlers de Pacientes ---
(defn criar-paciente-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        ;; Extrair o novo campo psicologo_id
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id]} (:body request)]
    (cond
      ;; ... (validações existentes) ...
      :else
      (let [novo-paciente (sql/insert! @datasource :pacientes
                                       {:clinica_id      clinica-id
                                        :nome            nome
                                        :email           email
                                        :telefone        telefone
                                        :data_nascimento (when data_nascimento (Date/valueOf data_nascimento))
                                        :endereco        endereco
                                        :avatar_url      avatar_url
                                        :psicologo_id    psicologo_id} ; Adicionar o novo campo
                                       {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
        {:status 201, :body novo-paciente}))))

(defn listar-pacientes-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        papel-id (:papel_id identity)
        user-id (:user_id identity)
        nome-papel (:nome_papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" papel-id]))]
        
    (let [pacientes (if (or (= nome-papel "admin_clinica") (= nome-papel "secretario"))
                      ;; Se for admin ou secretário, busca todos os pacientes da clínica
                      (execute-query! 
                        ["SELECT p.*, u.nome as nome_psicologo 
                          FROM pacientes p 
                          LEFT JOIN usuarios u ON p.psicologo_id = u.id
                          WHERE p.clinica_id = ?" clinica-id])
                      ;; Se for psicólogo, busca apenas os seus pacientes
                      (execute-query! 
                        ["SELECT p.*, u.nome as nome_psicologo 
                          FROM pacientes p 
                          LEFT JOIN usuarios u ON p.psicologo_id = u.id
                          WHERE p.clinica_id = ? AND p.psicologo_id = ?" clinica-id user-id]))]
      {:status 200 :body pacientes})))

;; ESBOÇO DOS PRÓXIMOS HANDLERS DE PACIENTES
(defn obter-paciente-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        paciente-id (get-in request [:params :id])]
    (if-let [paciente (execute-one! ["SELECT * FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-id clinica-id])]
      {:status 200 :body paciente}
      {:status 404 :body {:erro "Paciente não encontrado nesta clínica."}})))

(defn atualizar-paciente-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id (get-in request [:params :id])
        {:keys [nome email telefone data_nascimento endereco avatar_url]} (:body request)]
    
    ;; Verificação de Propriedade para Psicólogos
    (if (and (= papel "psicologo")
             (not (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND psicologo_id = ?" paciente-id usuario-id])))
      {:status 403 :body {:erro "Você só pode editar pacientes vinculados a você."}}
      
      (cond
        (str/blank? nome)
        {:status 400 :body {:erro "O campo nome não pode estar em branco."}}

        (and email (not (str/blank? email)) 
             (execute-one! ["SELECT id FROM pacientes WHERE email = ? AND clinica_id = ? AND id != ?" email clinica-id paciente-id]))
        {:status 409 :body {:erro "O email fornecido já está em uso por outro paciente nesta clínica."}}

        :else
        (let [update-map {:nome nome
                          :email email
                          :telefone telefone
                          :data_nascimento (when data_nascimento (Date/valueOf data_nascimento))
                          :endereco endereco
                          :avatar_url avatar_url}
              resultado (sql/update! @datasource :pacientes update-map {:id paciente-id :clinica_id clinica-id})]
          (if (zero? (:next.jdbc/update-count resultado))
            {:status 404 :body {:erro "Paciente não encontrado nesta clínica ou nenhum dado foi alterado."}}
            (let [paciente-atualizado (execute-one! ["SELECT * FROM pacientes WHERE id = ?" paciente-id])]
              {:status 200 :body paciente-atualizado})))))))

(defn remover-paciente-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id-para-remover (get-in request [:params :id])]
    
    ;; Verificação de Propriedade para Psicólogos
    (if (and (= papel "psicologo")
             (not (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND psicologo_id = ?" paciente-id-para-remover usuario-id])))
      {:status 403 :body {:erro "Você só pode excluir pacientes vinculados a você."}}
      
      (let [resultado (sql/delete! @datasource :pacientes {:id paciente-id-para-remover :clinica_id clinica-id})]
        (if (zero? (:next.jdbc/update-count resultado))
          {:status 404 :body {:erro "Paciente não encontrado nesta clínica ou você não tem permissão para removê-lo."}}
          {:status 204 :body ""})))))


;; --- Handlers de Agendamentos ---
(defn criar-agendamento-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta]} (:body request)]
    (if (or (nil? paciente_id) (nil? psicologo_id) (nil? data_hora_sessao))
      {:status 400, :body {:erro "paciente_id, psicologo_id e data_hora_sessao são obrigatórios."}}
      (let [paciente-valido? (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND clinica_id = ?" paciente_id clinica-id])
            psicologo-valido? (execute-one! ["SELECT id FROM usuarios WHERE id = ? AND clinica_id = ?" psicologo_id clinica-id])]
        (if (and paciente-valido? psicologo-valido?)
          (let [novo-agendamento (sql/insert! @datasource :agendamentos
                                              {:clinica_id       clinica-id
                                               :paciente_id      paciente_id
                                               :psicologo_id     psicologo_id
                                               :data_hora_sessao data_hora_sessao
                                               :valor_consulta   valor_consulta}
                                              {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
            {:status 201, :body novo-agendamento})
          {:status 422, :body {:erro "Paciente ou psicólogo não pertence à clínica do usuário autenticado."}})))))

(defn listar-agendamentos-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        papel-id (:papel_id identity)
        user-id (:user_id identity)
        nome-papel (:nome_papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" papel-id]))]
    (let [agendamentos (if (or (= nome-papel "admin_clinica") (= nome-papel "secretario"))
                         (execute-query! ["SELECT * FROM agendamentos WHERE clinica_id = ?" clinica-id])
                         (execute-query! ["SELECT * FROM agendamentos WHERE clinica_id = ? AND psicologo_id = ?" clinica-id user-id]))]
      {:status 200 :body agendamentos})))


;; --- Handlers de Prontuários ---
(defn criar-prontuario-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        {:keys [paciente_id conteudo tipo]} (:body request)]
    
    (if (or (str/blank? paciente_id) (str/blank? conteudo))
      {:status 400 :body {:erro "Paciente e conteúdo são obrigatórios."}}
      
      (let [paciente (execute-one! ["SELECT id, psicologo_id FROM pacientes WHERE id = ? AND clinica_id = ?" paciente_id clinica-id])]
        (if-not paciente
          {:status 404 :body {:erro "Paciente não encontrado."}}
          
          ;; Verificação de permissão: Psicólogo só cria para seus pacientes
          (if (and (= papel "psicologo") (not= (:psicologo_id paciente) usuario-id))
            {:status 403 :body {:erro "Você só pode registrar prontuários para seus pacientes."}}
            
            (let [novo-prontuario (sql/insert! @datasource :prontuarios
                                              {:clinica_id clinica-id
                                               :paciente_id paciente_id
                                               :psicologo_id usuario-id
                                               :conteudo conteudo
                                               :tipo (or tipo "sessao")}
                                              {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
              {:status 201 :body novo-prontuario})))))))

(defn listar-prontuarios-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id (get-in request [:params :paciente-id])]
    
    (let [paciente (execute-one! ["SELECT id, psicologo_id FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-id clinica-id])]
      (if-not paciente
        {:status 404 :body {:erro "Paciente não encontrado."}}
        
        ;; Verificação: Psicólogo só vê de seus pacientes
        (if (and (= papel "psicologo") (not= (:psicologo_id paciente) usuario-id))
          {:status 403 :body {:erro "Você não tem permissão para visualizar este prontuário."}}
          
          (let [prontuarios (execute-query! 
                              ["SELECT p.*, u.nome as nome_psicologo 
                                FROM prontuarios p
                                JOIN usuarios u ON p.psicologo_id = u.id
                                WHERE p.paciente_id = ? AND p.clinica_id = ?
                                ORDER BY p.data_registro DESC" 
                               paciente-id clinica-id])]
            {:status 200 :body prontuarios}))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Definição das Rotas e Aplicação Principal
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(defroutes public-routes
  (POST "/api/admin/provisionar-clinica" [] provisionar-clinica-handler)
  (POST "/api/auth/login" [] login-handler)
  (GET  "/api/health" [] health-check-handler))

;; ROTAS DE PRONTUÁRIOS
(defroutes prontuarios-routes
  (POST "/" request (wrap-checar-permissao criar-prontuario-handler "gerenciar_prontuarios"))
  (GET  "/" request (wrap-checar-permissao listar-prontuarios-handler "visualizar_pacientes")))

;; ROTAS ATUALIZADAS PARA PACIENTES
(defroutes pacientes-routes
  (POST   "/" request (wrap-checar-permissao criar-paciente-handler "gerenciar_pacientes"))
  (GET    "/" request (wrap-checar-permissao listar-pacientes-handler "visualizar_pacientes"))
  
  ;; Sub-rota de prontuários
  (context "/:paciente-id/prontuarios" [] prontuarios-routes)
  
  (GET    "/:id" request (wrap-checar-permissao obter-paciente-handler "visualizar_pacientes"))
  (PUT    "/:id" request (wrap-checar-permissao atualizar-paciente-handler "gerenciar_pacientes"))
  (DELETE "/:id" request (wrap-checar-permissao remover-paciente-handler "gerenciar_pacientes")))

(defroutes agendamentos-routes
  (POST "/" request (wrap-checar-permissao criar-agendamento-handler "gerenciar_agendamentos_clinica"))
  (GET  "/" request (wrap-jwt-autenticacao listar-agendamentos-handler)))

(defroutes protected-routes
  (POST   "/api/usuarios" request (wrap-checar-permissao criar-usuario-handler "gerenciar_usuarios"))
  (GET    "/api/usuarios/:id" request (wrap-checar-permissao obter-usuario-handler "gerenciar_usuarios"))
  (PUT    "/api/usuarios/:id" request (wrap-checar-permissao atualizar-usuario-handler "gerenciar_usuarios"))
  (DELETE "/api/usuarios/:id" request (wrap-checar-permissao remover-usuario-handler "gerenciar_usuarios"))

  (context "/api/psicologos" []
    (GET    "/" request (wrap-checar-permissao listar-psicologos-handler "visualizar_todos_agendamentos")))

  (context "/api/pacientes" [] pacientes-routes)

  (context "/api/agendamentos" [] agendamentos-routes))

(def app
  (-> (defroutes app-routes
        public-routes
        (wrap-jwt-autenticacao protected-routes)
        (route/not-found "Recurso não encontrado"))
      ;; APLICAÇÃO DO MIDDLEWARE DE CORS
      (wrap-cors :access-control-allow-origin [#"http://localhost:3000" #"http://localhost:9002" #"https://deep-ngrv.onrender.com"] ; Adicionada porta 9002
                 :access-control-allow-methods [:get :post :put :delete :options]
                 :access-control-allow-headers #{"Authorization" "Content-Type"})
      (middleware-json/wrap-json-body {:keywords? true})
      (middleware-json/wrap-json-response)))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Funções de Inicialização
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(defn init-db []
  (if (env :database-url)
    (do
      (println "DATABASE_URL encontrada.")
      (println "Tentando conectar ao banco de dados...")
      (try
        (execute-query! ["SELECT 1"])
        (println "Conexão com o banco de dados estabelecida com sucesso!")
        (catch Exception e
          (println "Falha ao conectar ao banco de dados:" (.getMessage e)))))
    (println "AVISO: DATABASE_URL não configurada. As operações de banco de dados irão falhar.")))

(defn destroy-db []
  (println "Finalizando aplicação..."))

(defn -main [& _]
  (init-db)
  (let [port (Integer. (or (env :port) 3000))]
    (println (str "Servidor iniciado na porta " port))
    (jetty/run-jetty #'app {:port port :join? false})))

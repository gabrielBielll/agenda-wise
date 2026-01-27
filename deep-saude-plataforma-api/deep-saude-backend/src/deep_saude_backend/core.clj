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
    (let [token (extract-token request)]
      (println "DEBUG: Middleware JWT. Token presente?" (boolean token))
      (if-not token
        {:status 401 :body {:erro "Token de autorização não fornecido."}}
        (let [auth-data (try
                          (let [claims (jwt/unsign token jwt-secret)
                                claims-parsed (-> claims
                                                  (update :user_id #(java.util.UUID/fromString %))
                                                  (update :clinica_id #(java.util.UUID/fromString %))
                                                  (update :papel_id #(java.util.UUID/fromString %)))]
                             {:identity claims-parsed})
                          (catch Exception e
                            (println "ERRO DE VALIDAÇÃO JWT:" (.getMessage e))
                            nil))]
          (if auth-data
            (handler (assoc request :identity (:identity auth-data)))
            {:status 401 :body {:erro "Token inválido ou expirado."}}))))))

(defn wrap-checar-permissao [handler nome-permissao-requerida]
  (fn [request]
    (println "DEBUG: Middleware Permissao. Requer:" nome-permissao-requerida)
    (let [papel-id (get-in request [:identity :papel_id])]
      (println "DEBUG: Papel ID:" papel-id)
      (if-not papel-id
        {:status 403 :body {:erro "Identidade do usuário ou papel não encontrado na requisição."}}
        (let [permissao (execute-one!
                         ["SELECT pp.permissao_id
                           FROM papel_permissoes pp
                           JOIN permissoes p ON pp.permissao_id = p.id
                           WHERE pp.papel_id = ? AND p.nome_permissao = ?"
                          papel-id nome-permissao-requerida])]
          (println "DEBUG: Permissao encontrada?" permissao)
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
                               :token   token
                               :user    {:id         (:id usuario)
                                         :email      email
                                         :clinica_id (:clinica_id usuario)
                                         :papel_id   (:papel_id usuario)
                                         :role       (:nome_papel usuario)}}})
        {:status 401 :body {:erro "Credenciais inválidas."}})
      {:status 401 :body {:erro "Credenciais inválidas."}})))

;; --- Handlers de Usuários ---
(defn criar-usuario-handler [request]
  (let [clinica-id-admin (get-in request [:identity :clinica_id])
        {:keys [nome email senha papel cpf telefone data_nascimento endereco crp registro_e_psi abordagem area_de_atuacao]} (:body request)]
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
                                         :senha_hash (hashers/encrypt senha)
                                         :cpf cpf
                                         :telefone telefone
                                         :data_nascimento (when data_nascimento (Date/valueOf data_nascimento))
                                         :endereco endereco
                                         :crp crp
                                         :registro_e_psi registro_e_psi
                                         :abordagem abordagem
                                         :area_de_atuacao area_de_atuacao}
                                        {:builder-fn rs/as-unqualified-lower-maps :return-keys [:id :nome :email :clinica_id :papel_id :cpf :telefone :data_nascimento :endereco :crp :registro_e_psi :abordagem :area_de_atuacao]})]
          {:status 201, :body novo-usuario})
        {:status 400, :body {:erro (str "O papel '" papel "' não é válido.")}}))))

(defn remover-usuario-handler [request]
  (let [clinica-id-admin (get-in request [:identity :clinica_id])
        usuario-id-para-remover (java.util.UUID/fromString (get-in request [:params :id]))]
    (let [resultado (sql/delete! @datasource :usuarios {:id usuario-id-para-remover :clinica_id clinica-id-admin})]
      (if (zero? (:next.jdbc/update-count resultado))
        {:status 404 :body {:erro "Usuário não encontrado nesta clínica ou você não tem permissão para removê-lo."}}
        {:status 204 :body ""}))))

(defn obter-usuario-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [usuario (execute-one! ["SELECT id, nome, email, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao FROM usuarios WHERE id = ? AND clinica_id = ?" usuario-id clinica-id])]
      {:status 200 :body usuario}
      {:status 404 :body {:erro "Usuário não encontrado nesta clínica."}})))

(defn atualizar-usuario-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [nome email cpf telefone data_nascimento endereco crp registro_e_psi abordagem area_de_atuacao]} (:body request)]
    (cond
      (and (str/blank? nome) (str/blank? email))
      {:status 400 :body {:erro "Pelo menos um campo (nome ou email) deve ser fornecido para atualização."}}

      (and email (execute-one! ["SELECT id FROM usuarios WHERE email = ? AND id != ?" email usuario-id]))
      {:status 409 :body {:erro "O email fornecido já está em uso por outro usuário."}}

      :else
      (let [update-map (cond-> {}
                         (not (str/blank? nome)) (assoc :nome nome)
                         (not (str/blank? email)) (assoc :email email)
                         (some? cpf) (assoc :cpf cpf)
                         (some? telefone) (assoc :telefone telefone)
                         (some? data_nascimento) (assoc :data_nascimento (when data_nascimento (Date/valueOf data_nascimento)))
                         (some? endereco) (assoc :endereco endereco)
                         (some? crp) (assoc :crp crp)
                         (some? registro_e_psi) (assoc :registro_e_psi registro_e_psi)
                         (some? abordagem) (assoc :abordagem abordagem)
                         (some? area_de_atuacao) (assoc :area_de_atuacao area_de_atuacao))
            resultado (sql/update! @datasource :usuarios update-map {:id usuario-id :clinica_id clinica-id})]
        (if (zero? (:next.jdbc/update-count resultado))
          {:status 404 :body {:erro "Usuário não encontrado nesta clínica ou nenhum dado foi alterado."}}
          (let [usuario-atualizado (execute-one! ["SELECT id, nome, email, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao FROM usuarios WHERE id = ?" usuario-id])]
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
                             ["SELECT id, nome, email, clinica_id, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao FROM usuarios WHERE clinica_id = ? AND papel_id = ?"
                              clinica-id papel-psicologo-id])]
            {:status 200 :body psicologos}))))))

;; --- Handlers de Pacientes ---
(defn criar-paciente-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        ;; Extrair o novo campo psicologo_id e campos clínicos
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id historico_familiar uso_medicamentos diagnostico contatos_emergencia]} (:body request)]
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
                                        :psicologo_id    (when psicologo_id (java.util.UUID/fromString psicologo_id))
                                        :historico_familiar historico_familiar
                                        :uso_medicamentos   uso_medicamentos
                                        :diagnostico        diagnostico
                                        :contatos_emergencia contatos_emergencia} ; Adicionar novos campos
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
        paciente-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [paciente (execute-one! ["SELECT * FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-id clinica-id])]
      {:status 200 :body paciente}
      {:status 404 :body {:erro "Paciente não encontrado nesta clínica."}})))

(defn atualizar-paciente-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id historico_familiar uso_medicamentos diagnostico contatos_emergencia]} (:body request)]
    
    ;; Verificação de Propriedade para Psicólogos
    (if (and (= papel "psicologo")
             (not (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND psicologo_id = ?" paciente-id usuario-id])))
      {:status 403 :body {:erro "Você só pode editar pacientes vinculados a você."}}
      
      (cond
        (and (some? nome) (str/blank? nome))
        {:status 400 :body {:erro "O campo nome não pode estar em branco."}}

        (and email (not (str/blank? email)) 
             (execute-one! ["SELECT id FROM pacientes WHERE email = ? AND clinica_id = ? AND id != ?" email clinica-id paciente-id]))
        {:status 409 :body {:erro "O email fornecido já está em uso por outro paciente nesta clínica."}}

        :else
        (let [update-map (cond-> {}
                           (some? nome) (assoc :nome nome)
                           (some? email) (assoc :email email)
                           (some? telefone) (assoc :telefone telefone)
                           (some? data_nascimento) (assoc :data_nascimento (Date/valueOf data_nascimento))
                           (some? endereco) (assoc :endereco endereco)
                           (some? avatar_url) (assoc :avatar_url avatar_url)
                           (some? historico_familiar) (assoc :historico_familiar historico_familiar)
                           (some? uso_medicamentos) (assoc :uso_medicamentos uso_medicamentos)
                           (some? diagnostico) (assoc :diagnostico diagnostico)
                           (some? contatos_emergencia) (assoc :contatos_emergencia contatos_emergencia)
                           (some? psicologo_id) (assoc :psicologo_id (when (not (str/blank? psicologo_id)) (java.util.UUID/fromString psicologo_id))))
              resultado (if (empty? update-map)
                          {:next.jdbc/update-count 0}
                          (sql/update! @datasource :pacientes update-map {:id paciente-id :clinica_id clinica-id}))]
          (if (zero? (:next.jdbc/update-count resultado))
            {:status 404 :body {:erro "Paciente não encontrado nesta clínica ou nenhum dado foi alterado."}}
            (let [paciente-atualizado (execute-one! ["SELECT * FROM pacientes WHERE id = ?" paciente-id])]
              {:status 200 :body paciente-atualizado})))))))

(defn remover-paciente-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id-para-remover (java.util.UUID/fromString (get-in request [:params :id]))]
    
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
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta duracao]} (:body request)]
      (println "DEBUG: Handler iniciado. Payload:" (:body request))
      (if (or (nil? paciente_id) (nil? psicologo_id) (nil? data_hora_sessao))
        {:status 400, :body {:erro "paciente_id, psicologo_id e data_hora_sessao são obrigatórios."}}
        (let [paciente-uuid (java.util.UUID/fromString paciente_id)
              psicologo-uuid (java.util.UUID/fromString psicologo_id)
              paciente-valido? (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND clinica_id = ?" 
                                              paciente-uuid clinica-id])
              psicologo-valido? (execute-one! ["SELECT id FROM usuarios WHERE id = ? AND clinica_id = ?" 
                                               psicologo-uuid clinica-id])]
          (if (and paciente-valido? psicologo-valido?)
            (let [novo-agendamento (sql/insert! @datasource :agendamentos
                                                {:clinica_id       clinica-id
                                                 :paciente_id      paciente-uuid
                                                 :psicologo_id     psicologo-uuid
                                                 :data_hora_sessao (java.sql.Timestamp/valueOf data_hora_sessao)
                                                 :valor_consulta   valor_consulta
                                                 :duracao          (or duracao 50)}
                                                {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
              {:status 201, :body novo-agendamento})
            {:status 422, :body {:erro "Paciente ou psicólogo não pertence à clínica do usuário autenticado."}}))))
    (catch Exception e
      (println "ERRO FATAL NO HANDLER:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))


(defn obter-agendamento-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [agendamento (execute-one! ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])]
      {:status 200 :body agendamento}
      {:status 404 :body {:erro "Agendamento não encontrado."}})))

(defn atualizar-agendamento-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))
          {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta duracao status]} (:body request)]
      
      (if (execute-one! ["SELECT id FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])
        (let [;; Se status for 'cancelado', zera o valor_consulta automaticamente
              valor-final (if (= status "cancelado") 0 valor_consulta)
              update-map (cond-> {}
                           (some? paciente_id) (assoc :paciente_id (java.util.UUID/fromString paciente_id))
                           (some? psicologo_id) (assoc :psicologo_id (java.util.UUID/fromString psicologo_id))
                           (some? data_hora_sessao) (assoc :data_hora_sessao (java.sql.Timestamp/valueOf data_hora_sessao))
                           (some? valor-final) (assoc :valor_consulta valor-final)
                           (some? duracao) (assoc :duracao duracao)
                           (some? status) (assoc :status status))
              resultado (sql/update! @datasource :agendamentos update-map {:id agendamento-id :clinica_id clinica-id})]
          (if (zero? (:next.jdbc/update-count resultado))
            {:status 500 :body {:erro "Erro ao atualizar agendamento."}}
            (let [agendamento-atualizado (execute-one! ["SELECT * FROM agendamentos WHERE id = ?" agendamento-id])]
              {:status 200 :body agendamento-atualizado})))
        {:status 404 :body {:erro "Agendamento não encontrado."}}))
    (catch Exception e
      (println "ERRO AO ATUALIZAR AGENDAMENTO:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))


(defn remover-agendamento-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))]
      
      (if (execute-one! ["SELECT id FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])
        (let [resultado (sql/delete! @datasource :agendamentos {:id agendamento-id :clinica_id clinica-id})]
          (if (zero? (:next.jdbc/update-count resultado))
            {:status 500 :body {:erro "Erro ao remover agendamento."}}
            {:status 204 :body ""}))
        {:status 404 :body {:erro "Agendamento não encontrado."}}))
    (catch Exception e
      (println "ERRO AO REMOVER AGENDAMENTO:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))

(defn listar-agendamentos-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        papel-id (:papel_id identity)
        user-id (:user_id identity)
        paciente-id-filter (get-in request [:params :paciente_id])
        nome-papel (:nome_papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" papel-id]))]
    (println "DEBUG: Listar Agendamentos - User:" user-id "Papel:" nome-papel "Clinica:" clinica-id "Paciente Filter:" paciente-id-filter)
    
    (let [base-query "SELECT a.*, p.nome as nome_paciente, u.nome as nome_psicologo
                      FROM agendamentos a
                      JOIN pacientes p ON a.paciente_id = p.id
                      LEFT JOIN usuarios u ON a.psicologo_id = u.id
                      WHERE a.clinica_id = ?"
          
          params [clinica-id]
          
          ;; Adicionar filtro de psicólogo se não for admin/secretario
          [query params] (if (or (= nome-papel "admin_clinica") (= nome-papel "secretario"))
                           [base-query params]
                           [(str base-query " AND a.psicologo_id = ?") (conj params user-id)])
          
          ;; Adicionar filtro de paciente se fornecido
          [query params] (if (not (str/blank? paciente-id-filter))
                           [(str query " AND a.paciente_id = ?") (conj params (java.util.UUID/fromString paciente-id-filter))]
                           [query params])
          
          ;; Adicionar ordenação
          query (str query " ORDER BY a.data_hora_sessao DESC")]
      
      (let [agendamentos (execute-query! (into [query] params))]
        {:status 200 :body agendamentos}))))

;; --- Handlers de Bloqueios de Agenda ---
(defn criar-bloqueio-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          usuario-id (get-in request [:identity :user_id])
          {:keys [data_inicio data_fim motivo dia_inteiro]} (:body request)]
      (println "DEBUG: Criando bloqueio:" (:body request))
      (if (or (nil? data_inicio) (nil? data_fim))
        {:status 400 :body {:erro "data_inicio e data_fim são obrigatórios."}}
        (let [novo-bloqueio (sql/insert! @datasource :bloqueios_agenda
                                         {:clinica_id    clinica-id
                                          :psicologo_id  usuario-id
                                          :data_inicio   (java.sql.Timestamp/valueOf data_inicio)
                                          :data_fim      (java.sql.Timestamp/valueOf data_fim)
                                          :motivo        motivo
                                          :dia_inteiro   (or dia_inteiro false)}
                                         {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
          {:status 201 :body novo-bloqueio})))
    (catch Exception e
      (println "ERRO ao criar bloqueio:" (.getMessage e))
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))

(defn listar-bloqueios-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (get-in request [:identity :user_id])
        data-inicio-param (get-in request [:params :data_inicio])
        data-fim-param (get-in request [:params :data_fim])]
    (let [query (str "SELECT * FROM bloqueios_agenda 
                      WHERE clinica_id = ? AND psicologo_id = ?"
                     (when data-inicio-param " AND data_fim >= ?::timestamp")
                     (when data-fim-param " AND data_inicio <= ?::timestamp")
                     " ORDER BY data_inicio ASC")
          params (cond-> [clinica-id usuario-id]
                   data-inicio-param (conj data-inicio-param)
                   data-fim-param (conj data-fim-param))
          bloqueios (execute-query! (into [query] params))]
      {:status 200 :body bloqueios})))

(defn remover-bloqueio-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (get-in request [:identity :user_id])
        bloqueio-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [bloqueio (execute-one! ["SELECT id FROM bloqueios_agenda WHERE id = ? AND clinica_id = ? AND psicologo_id = ?" 
                                      bloqueio-id clinica-id usuario-id])]
      (do
        (sql/delete! @datasource :bloqueios_agenda {:id bloqueio-id})
        {:status 200 :body {:mensagem "Bloqueio removido com sucesso."}})
      {:status 404 :body {:erro "Bloqueio não encontrado ou você não tem permissão."}})))

;; --- Handlers de Prontuários ---
(defn criar-prontuario-handler [request]
        (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        {:keys [paciente_id conteudo tipo queixa_principal resumo_tecnico observacoes_estado_mental encaminhamentos_tarefas agendamento_id humor]} (:body request)]
    
    (println "DEBUG: criar-prontuario recebido:" (:body request)) 
    (println "DEBUG: Humor value:" humor " Type:" (type humor))

    (if (str/blank? conteudo)
      {:status 400 :body {:erro "Conteúdo da evolução é obrigatório."}}
      
      (try
        (let [paciente-uuid (java.util.UUID/fromString paciente_id)
              paciente (execute-one! ["SELECT id, psicologo_id FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-uuid clinica-id])]
          (if-not paciente
            {:status 404 :body {:erro "Paciente não encontrado."}}
            
            ;; Verificação de permissão: Psicólogo só cria para seus pacientes
            (if (and (= papel "psicologo") (not= (:psicologo_id paciente) usuario-id))
              {:status 403 :body {:erro "Você só pode registrar prontuários para seus pacientes."}}
              
              (let [novo-prontuario (sql/insert! @datasource :prontuarios
                                                {:clinica_id clinica-id
                                                 :paciente_id paciente-uuid
                                                 :psicologo_id usuario-id
                                                 :conteudo conteudo
                                                 :tipo (or tipo "sessao")
                                                 :humor humor  ;; Salvando humor
                                                 :queixa_principal queixa_principal
                                                 :resumo_tecnico resumo_tecnico
                                                 :observacoes_estado_mental observacoes_estado_mental
                                                 :encaminhamentos_tarefas encaminhamentos_tarefas
                                                 :agendamento_id (when (not (str/blank? agendamento_id)) 
                                                                   (println "DEBUG: Salvando agendamento_id:" agendamento_id)
                                                                   (java.util.UUID/fromString agendamento_id))}
                                                {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
                {:status 201 :body novo-prontuario}))))
        (catch Exception e
          (println "ERRO CRIAR PRONTUARIO:" (.getMessage e))
          (.printStackTrace e)
          {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))))

(defn listar-prontuarios-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id (java.util.UUID/fromString (get-in request [:params :paciente-id]))]
    
    (let [paciente (execute-one! ["SELECT id, psicologo_id FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-id clinica-id])]
      (if-not paciente
        {:status 404 :body {:erro "Paciente não encontrado."}}
        
        ;; Verificação: Psicólogo só vê de seus pacientes
        (if (and (= papel "psicologo") (not= (:psicologo_id paciente) usuario-id))
          {:status 403 :body {:erro "Você não tem permissão para visualizar este prontuário."}}
          
          (let [prontuarios (execute-query! 
                              ["SELECT p.*, u.nome as nome_psicologo, a.data_hora_sessao as data_sessao
                                FROM prontuarios p
                                JOIN usuarios u ON p.psicologo_id = u.id
                                LEFT JOIN agendamentos a ON p.agendamento_id = a.id
                                WHERE p.paciente_id = ? AND p.clinica_id = ?
                                ORDER BY p.data_registro DESC" 
                               paciente-id clinica-id])]
            (println "DEBUG: Listar Prontuarios - Encontrados:" (count prontuarios))
            {:status 200 :body prontuarios}))))))

(defn remover-prontuario-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        prontuario-id (java.util.UUID/fromString (get-in request [:params :id]))]
    
    (if-let [prontuario (execute-one! ["SELECT id, psicologo_id FROM prontuarios WHERE id = ? AND clinica_id = ?" prontuario-id clinica-id])]
      ;; Verificação de permissão: Apenas o autor ou admin pode excluir
      (if (and (= papel "psicologo") (not= (:psicologo_id prontuario) usuario-id))
        {:status 403 :body {:erro "Você só pode excluir prontuários criados por você."}}
        
        (let [resultado (sql/delete! @datasource :prontuarios {:id prontuario-id :clinica_id clinica-id})]
          (if (zero? (:next.jdbc/update-count resultado))
            {:status 500 :body {:erro "Erro ao excluir prontuário."}}
            {:status 204 :body ""})))
      {:status 404 :body {:erro "Prontuário não encontrado."}})))

(defn atualizar-prontuario-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        prontuario-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [conteudo tipo queixa_principal resumo_tecnico observacoes_estado_mental encaminhamentos_tarefas agendamento_id humor]} (:body request)]
    
    (println "DEBUG: atualizar-prontuario recebido. Humor:" humor)
    
    (if (str/blank? conteudo)
      {:status 400 :body {:erro "Conteúdo é obrigatório."}}
      
      (if-let [prontuario (execute-one! ["SELECT id, psicologo_id FROM prontuarios WHERE id = ? AND clinica_id = ?" prontuario-id clinica-id])]
        ;; Verificação de permissão: Apenas o autor pode editar
        (if (not= (:psicologo_id prontuario) usuario-id)
          {:status 403 :body {:erro "Você só pode editar prontuários criados por você."}}
          
          (let [update-map (cond-> {:conteudo conteudo
                                    :tipo (or tipo "sessao")
                                    :queixa_principal queixa_principal
                                    :resumo_tecnico resumo_tecnico
                                    :observacoes_estado_mental observacoes_estado_mental
                                    :encaminhamentos_tarefas encaminhamentos_tarefas
                                    :humor humor}
                             (some? agendamento_id) (assoc :agendamento_id (when (not (str/blank? agendamento_id)) (java.util.UUID/fromString agendamento_id))))
                resultado (sql/update! @datasource :prontuarios update-map {:id prontuario-id :clinica_id clinica-id})]
            
            (if (zero? (:next.jdbc/update-count resultado))
              {:status 500 :body {:erro "Erro ao atualizar prontuário."}}
              (let [prontuario-atualizado (execute-one! ["SELECT * FROM prontuarios WHERE id = ?" prontuario-id])]
                {:status 200 :body prontuario-atualizado}))))
        {:status 404 :body {:erro "Prontuário não encontrado."}}))))


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
  (GET  "/" request (wrap-checar-permissao listar-prontuarios-handler "visualizar_pacientes"))
  (PUT  "/:id" request (wrap-checar-permissao atualizar-prontuario-handler "gerenciar_prontuarios"))
  (DELETE "/:id" request (wrap-checar-permissao remover-prontuario-handler "gerenciar_prontuarios")))

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
  (GET  "/" request (wrap-jwt-autenticacao listar-agendamentos-handler))
  (GET  "/:id" request (wrap-jwt-autenticacao obter-agendamento-handler))
  (PUT  "/:id" request (wrap-checar-permissao atualizar-agendamento-handler "gerenciar_agendamentos_clinica"))
  (DELETE "/:id" request (wrap-checar-permissao remover-agendamento-handler "gerenciar_agendamentos_clinica")))

;; ROTAS DE BLOQUEIOS DE AGENDA
(defroutes bloqueios-routes
  (POST "/" request (wrap-jwt-autenticacao criar-bloqueio-handler))
  (GET  "/" request (wrap-jwt-autenticacao listar-bloqueios-handler))
  (DELETE "/:id" request (wrap-jwt-autenticacao remover-bloqueio-handler)))

(defroutes protected-routes
  (POST   "/api/usuarios" request (wrap-checar-permissao criar-usuario-handler "gerenciar_usuarios"))
  (GET    "/api/usuarios/:id" request (wrap-checar-permissao obter-usuario-handler "gerenciar_usuarios"))
  (PUT    "/api/usuarios/:id" request (wrap-checar-permissao atualizar-usuario-handler "gerenciar_usuarios"))
  (DELETE "/api/usuarios/:id" request (wrap-checar-permissao remover-usuario-handler "gerenciar_usuarios"))

  (context "/api/psicologos" []
    (GET    "/" request (wrap-checar-permissao listar-psicologos-handler "visualizar_todos_agendamentos")))

  (context "/api/pacientes" [] pacientes-routes)

  (context "/api/agendamentos" [] agendamentos-routes)
  
  (context "/api/bloqueios" [] bloqueios-routes))

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
        (try
          (execute-query! ["ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao INTEGER DEFAULT 50"])
          (println "Coluna 'duracao' verificada/adicionada com sucesso.")
          
          ;; Status para cancelamento de sessões
          (execute-query! ["ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'agendado'"])
          (println "Coluna 'status' de agendamentos verificada/adicionada com sucesso.")
          
          ;; Novos campos Prontuário
          (execute-query! ["ALTER TABLE prontuarios ADD COLUMN IF NOT EXISTS queixa_principal TEXT"])
          (execute-query! ["ALTER TABLE prontuarios ADD COLUMN IF NOT EXISTS resumo_tecnico TEXT"])
          (execute-query! ["ALTER TABLE prontuarios ADD COLUMN IF NOT EXISTS observacoes_estado_mental TEXT"])
          (execute-query! ["ALTER TABLE prontuarios ADD COLUMN IF NOT EXISTS encaminhamentos_tarefas TEXT"])
          (execute-query! ["ALTER TABLE prontuarios ADD COLUMN IF NOT EXISTS agendamento_id UUID"])
          (execute-query! ["ALTER TABLE prontuarios ADD COLUMN IF NOT EXISTS humor INTEGER"])
          (println "Novas colunas de prontuário verificadas/adicionadas com sucesso.")

          ;; Novos campos Clínicos do Paciente
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS historico_familiar TEXT"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS uso_medicamentos TEXT"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS diagnostico TEXT"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS contatos_emergencia TEXT"])
          (println "Novas colunas de dados clínicos do paciente verificadas/adicionadas com sucesso.")

          ;; Tabela de Bloqueios de Agenda
          (execute-query! ["CREATE TABLE IF NOT EXISTS bloqueios_agenda (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            clinica_id UUID NOT NULL,
                            psicologo_id UUID NOT NULL,
                            data_inicio TIMESTAMP NOT NULL,
                            data_fim TIMESTAMP NOT NULL,
                            motivo VARCHAR(255),
                            dia_inteiro BOOLEAN DEFAULT false,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                           )"])
          (println "Tabela bloqueios_agenda verificada/criada com sucesso.")

          (catch Exception e
            (println "Aviso ao verificar colunas:" (.getMessage e))))
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

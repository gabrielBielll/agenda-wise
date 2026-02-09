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
            [ring.middleware.cors :refer [wrap-cors]]
            [ring.middleware.params :refer [wrap-params]])
  (:gen-class)
  (:import (java.sql Date))) ; Importar java.sql.Date para conversão

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Configuração do Banco de Dados e JWT
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defonce db-spec
  (delay
    (when-let [db-url (env :database-url)]
      (let [uri (java.net.URI. db-url)
            auth (some-> (.getUserInfo uri) (str/split #":"))
            usuario (first auth)
            senha (second auth)
            host (.getHost uri)
            port (or (.getPort uri) 5432)
            path (.getPath uri)
            dbname (if (seq path) (subs path 1) "defaultdb")
            query (.getQuery uri)
            query-params (when query
                           (apply merge (for [pair (str/split query #"&")]
                                          (let [[k v] (str/split pair #"=")]
                                            {(keyword k) v}))))
            ;; Se sslmode for disable, mantém disable. Se for qualquer outra coisa (verify-full, require, nil), força require.
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

;; --- MIGRATION SAFEGUARD ---
;; Ensure tables have necessary columns for finance module
(defn ensure-finance-columns! []
  (try
    (println "MIGRATION: Verificando colunas financeiras na tabela agendamentos...")
    ;; Check/Add valor_repasse
    (try 
       (jdbc/execute! @datasource ["ALTER TABLE agendamentos ADD COLUMN valor_repasse DECIMAL(10, 2)"])
       (println "MIGRATION: Coluna 'valor_repasse' adicionada.")
       (catch Exception _ (println "MIGRATION: Coluna 'valor_repasse' ja existe.")))
    
    ;; Check/Add status_repasse
    (try 
       (jdbc/execute! @datasource ["ALTER TABLE agendamentos ADD COLUMN status_repasse VARCHAR(20) DEFAULT 'pendente'"])
       (println "MIGRATION: Coluna 'status_repasse' adicionada.")
       (catch Exception _ (println "MIGRATION: Coluna 'status_repasse' ja existe.")))
    
    ;; Check/Add status_pagamento
    (try 
       (jdbc/execute! @datasource ["ALTER TABLE agendamentos ADD COLUMN status_pagamento VARCHAR(20) DEFAULT 'pendente'"])
       (println "MIGRATION: Coluna 'status_pagamento' adicionada.")
       (catch Exception _ (println "MIGRATION: Coluna 'status_pagamento' ja existe.")))
    
    (println "MIGRATION: Verificação concluída.")
    (catch Exception e
      (println "MIGRATION ERROR:" (.getMessage e)))))

;; Run migration on startup (in a delay or future to avoid blocking, but here simple call is fine as it's quick)
(future (ensure-finance-columns!))


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
    (let [papel-id (get-in request [:identity :papel_id])
          role     (get-in request [:identity :role])]
      (println "DEBUG PERMISSAO: role=" role ", requer=" nome-permissao-requerida)
      (if-not papel-id
        {:status 403 :body {:erro "Identidade do usuário ou papel não encontrado na requisição."}}
        ;; Admin bypassa TODAS as permissões
        (if (= role "admin_clinica")
          (do
            (println "DEBUG PERMISSAO: Admin bypass concedido.")
            (handler request))
          ;; Outros papéis: checa na tabela papel_permissoes
          (let [permissao (execute-one!
                           ["SELECT pp.permissao_id
                             FROM papel_permissoes pp
                             JOIN permissoes p ON pp.permissao_id = p.id
                             WHERE pp.papel_id = ? AND p.nome_permissao = ?"
                            papel-id nome-permissao-requerida])]
            (if permissao
              (handler request)
              {:status 403 :body {:erro (str "Usuário não tem a permissão necessária: " nome-permissao-requerida)}})))))))


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
    (println "DEBUG LOGIN: Tentativa de login para email:" email)
    (if-let [usuario (execute-one! ["SELECT * FROM usuarios WHERE email = ?" email])]
      (do
        (println "DEBUG LOGIN: Usuário encontrado na tabela usuarios. ID:" (:id usuario))
        (if-let [papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" (:papel_id usuario)])]
          (do
            (println "DEBUG LOGIN: Papel encontrado:" (:nome_papel papel))
            (let [senha-valida (try
                                 (hashers/check senha (:senha_hash usuario))
                                 (catch Exception e
                                   (println "DEBUG LOGIN: Hash incompatível, auto-corrigindo..." (.getMessage e))
                                   ;; Hash no banco é corrupto/incompatível (ex: bcrypt+sha512 truncado)
                                   ;; Gera novo hash nativo do Buddy e salva no banco
                                   (let [new-hash (hashers/encrypt senha)]
                                     (execute-one! ["UPDATE usuarios SET senha_hash = ? WHERE email = ?" new-hash email])
                                     (println "DEBUG LOGIN: Hash regenerado e salvo. Verificando...")
                                     (hashers/check senha new-hash))))]
              (println "DEBUG LOGIN: Senha válida?" senha-valida)
              (if senha-valida
                (let [claims {:user_id    (:id usuario)
                              :clinica_id (:clinica_id usuario)
                              :papel_id   (:papel_id usuario)
                              :role       (:nome_papel papel)
                              :exp        (-> (java.time.Instant/now) (.plusSeconds 3600) .getEpochSecond)}
                      token (jwt/sign claims jwt-secret)]
                  {:status 200 :body {:message "Usuário autenticado com sucesso."
                                      :token   token
                                      :user    {:id         (:id usuario)
                                                :email      email
                                                :clinica_id (:clinica_id usuario)
                                                :papel_id   (:papel_id usuario)
                                                :role       (:nome_papel papel)}}})
                (do
                  (println "DEBUG LOGIN: Senha incorreta.")
                  {:status 401 :body {:erro "Credenciais inválidas."}}))))
          (do
            (println "DEBUG LOGIN: Papel NÃO encontrado para ID:" (:papel_id usuario))
            {:status 500 :body {:erro "Erro de integridade: Papel do usuário não encontrado."}})))
      (do
        (println "DEBUG LOGIN: Usuário NÃO encontrado na tabela usuarios (SELECT simples).")
        {:status 401 :body {:erro "Credenciais inválidas."}}))))

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
        {:keys [nome email senha cpf telefone data_nascimento endereco crp registro_e_psi abordagem area_de_atuacao]} (:body request)]
    (cond
      (and (str/blank? nome) (str/blank? email) (str/blank? senha))
      {:status 400 :body {:erro "Pelo menos um campo (nome, email ou senha) deve ser fornecido para atualização."}}

      (and email (execute-one! ["SELECT id FROM usuarios WHERE email = ? AND id != ?" email usuario-id]))
      {:status 409 :body {:erro "O email fornecido já está em uso por outro usuário."}}

      :else
      (let [update-map (cond-> {}
                         (not (str/blank? nome)) (assoc :nome nome)
                         (not (str/blank? email)) (assoc :email email)
                         (not (str/blank? senha)) (assoc :senha_hash (hashers/encrypt senha))
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
    (println "DEBUG PSICOLOGOS: clinica-id do JWT =" clinica-id "(tipo:" (type clinica-id) ")")
    (if-not clinica-id
      {:status 403 :body {:erro "Clínica ID não encontrada na identidade do usuário."}}
      (let [papel-psicologo-id (:id (execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))
            _ (println "DEBUG PSICOLOGOS: papel-psicologo-id =" papel-psicologo-id "(tipo:" (type papel-psicologo-id) ")")
            ;; Debug: contar TODOS os usuarios sem filtro
            total-usuarios (:count (execute-one! ["SELECT COUNT(*) as count FROM usuarios"]))
            _ (println "DEBUG PSICOLOGOS: total usuarios no banco =" total-usuarios)
            ;; Debug: contar usuarios por clinica
            por-clinica (:count (execute-one! ["SELECT COUNT(*) as count FROM usuarios WHERE clinica_id = ?" clinica-id]))
            _ (println "DEBUG PSICOLOGOS: usuarios nesta clinica =" por-clinica)
            ;; Debug: contar usuarios por papel
            por-papel (:count (execute-one! ["SELECT COUNT(*) as count FROM usuarios WHERE papel_id = ?" papel-psicologo-id]))
            _ (println "DEBUG PSICOLOGOS: usuarios com papel psicologo =" por-papel)
            ;; Debug: listar todas as clinicas
            clinicas (execute-query! ["SELECT id FROM clinicas"])
            _ (println "DEBUG PSICOLOGOS: clinicas no banco =" (mapv :id clinicas))
            ;; Debug: listar todos os papeis
            papeis (execute-query! ["SELECT id, nome_papel FROM papeis"])
            _ (println "DEBUG PSICOLOGOS: papeis no banco =" (mapv (fn [p] [(:id p) (:nome_papel p)]) papeis))]
        (if-not papel-psicologo-id
          {:status 500 :body {:erro "Configuração de papel 'psicologo' não encontrada."}}
          (let [psicologos (execute-query!
                             ["SELECT id, nome, email, clinica_id, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao FROM usuarios WHERE clinica_id = ? AND papel_id = ?"
                              clinica-id papel-psicologo-id])]
            (println "DEBUG PSICOLOGOS: resultado final =" (count psicologos) "psicologos")
            {:status 200 :body psicologos}))))))

;; --- Handlers de Pacientes ---
(defn criar-paciente-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        ;; Extrair o novo campo psicologo_id e campos clínicos
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id historico_familiar uso_medicamentos diagnostico contatos_emergencia status]} (:body request)]
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
                                        :contatos_emergencia contatos_emergencia
                                        :status             (or status "ativo")} ; Adicionar novos campos
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
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id historico_familiar uso_medicamentos diagnostico contatos_emergencia status nota_fiscal origem vencimento_pagamento tipo_pagamento]} (:body request)]
    
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
                           (some? status) (assoc :status status)
                           (some? nota_fiscal) (assoc :nota_fiscal nota_fiscal)
                           (some? origem) (assoc :origem origem)
                           (some? vencimento_pagamento) (assoc :vencimento_pagamento vencimento_pagamento)
                           (some? tipo_pagamento) (assoc :tipo_pagamento tipo_pagamento)
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
          {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta duracao recorrencia_tipo quantidade_recorrencia force observacoes]} (:body request)]
      (println "DEBUG: Handler iniciado. Payload:" (:body request))
      (if (or (nil? paciente_id) (nil? psicologo_id) (nil? data_hora_sessao))
        {:status 400, :body {:erro "paciente_id, psicologo_id e data_hora_sessao são obrigatórios."}}
        (let [paciente-uuid (java.util.UUID/fromString paciente_id)
              psicologo-uuid (java.util.UUID/fromString psicologo_id)
              sessao-timestamp-inicial (java.sql.Timestamp/valueOf data_hora_sessao)
              duracao-sessao (or duracao 50)
              
              qtd-sessoes (if (and recorrencia_tipo (pos? (or quantidade_recorrencia 0))) 
                                (min (or quantidade_recorrencia 1) 150) 
                                1)
              intervalo-dias (case recorrencia_tipo
                               "semanal" 7
                               "quinzenal" 14
                               0)
              
              sessoes-para-criar (for [i (range qtd-sessoes)]
                                   (let [base-time (.getTime sessao-timestamp-inicial)
                                         offset-millis (* i intervalo-dias 24 60 60 1000)
                                         start-time (java.sql.Timestamp. (+ base-time offset-millis))
                                         end-time (java.sql.Timestamp. (+ (.getTime start-time) (* duracao-sessao 60000)))]
                                     {:start start-time :end end-time}))

              bloqueio-existente (some (fn [{:keys [start end]}]
                                         (execute-one! ["SELECT id FROM bloqueios_agenda 
                                                         WHERE clinica_id = ? 
                                                         AND psicologo_id = ?
                                                         AND data_inicio < ?::timestamp
                                                         AND data_fim > ?::timestamp"
                                                        clinica-id psicologo-uuid end start]))
                                       sessoes-para-criar)

              agendamento-conflitante (when (not force)
                                        (let [conflicts (doall (map (fn [{:keys [start end]}]
                                                (println "DEBUG: Verificando conflito para" start "até" end "Psico:" psicologo-uuid)
                                                (let [found (execute-one! ["SELECT id, data_hora_sessao, duracao FROM agendamentos 
                                                                WHERE clinica_id = ? 
                                                                AND psicologo_id = ?
                                                                AND status != 'cancelado'
                                                                AND data_hora_sessao < ?::timestamp
                                                                AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?::timestamp"
                                                               clinica-id psicologo-uuid end start])]
                                                  (when found (println "DEBUG: CONFLITO ENCONTRADO!" found))
                                                  found))
                                              sessoes-para-criar))]
                                          (some identity conflicts)))
              
              paciente-valido? (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND clinica_id = ?" 
                                              paciente-uuid clinica-id])
              psicologo-valido? (execute-one! ["SELECT id FROM usuarios WHERE id = ? AND clinica_id = ?" 
                                               psicologo-uuid clinica-id])

              ;; Generate recurrence ID if valid recurrence
              recorrencia-uuid (when (and recorrencia_tipo (pos? (or quantidade_recorrencia 0)) (> qtd-sessoes 1))
                                 (java.util.UUID/randomUUID))]
          
          (cond
            bloqueio-existente
            {:status 409 :body {:erro "Não é possível agendar. Um ou mais horários da sequência conflitam com bloqueios." :code "block_conflict"}}
            
            agendamento-conflitante
            {:status 409 :body {:erro "Já existe um agendamento neste horário." :code "appointment_conflict"}}
            
            (not (and paciente-valido? psicologo-valido?))
            {:status 422, :body {:erro "Paciente ou psicólogo não pertence à clínica do usuário autenticado."}}

            :else
            (let [novos-agendamentos (doall (map (fn [{:keys [start end]}]
                                                     (sql/insert! @datasource :agendamentos
                                                                  (merge 
                                                                    {:clinica_id       clinica-id
                                                                     :paciente_id      paciente-uuid
                                                                     :psicologo_id     psicologo-uuid
                                                                     :data_hora_sessao start
                                                                     :valor_consulta   valor_consulta
                                                                     :duracao          duracao-sessao
                                                                     :observacoes      observacoes}
                                                                    (when recorrencia-uuid {:recorrencia_id recorrencia-uuid}))
                                                                  {:builder-fn rs/as-unqualified-lower-maps :return-keys true}))
                                                   sessoes-para-criar))]
                {:status 201, :body (first novos-agendamentos)})))))
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
          {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta duracao status mode observacoes]} (:body request)]
      
      (if-let [agendamento-atual (execute-one! ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])]
        (cond
          (= mode "all_future")
          (if-let [recorrencia-id (:recorrencia_id agendamento-atual)]
             (let [novo-duracao (or duracao (:duracao agendamento-atual) 50)
                   novo-valor (if (= status "cancelado") 0 (or valor_consulta (:valor_consulta agendamento-atual)))
                   
                   ;; Find all future appointments in this series (including this one)
                   agendamentos-futuros (execute-query! ["SELECT id, data_hora_sessao FROM agendamentos 
                                                    WHERE recorrencia_id = ? 
                                                    AND data_hora_sessao >= ? 
                                                    AND clinica_id = ?"
                                                   recorrencia-id (:data_hora_sessao agendamento-atual) clinica-id])]
               
               (doall (map (fn [appt]
                             (let [original-date (:data_hora_sessao appt)
                                   ;; If user sent a new data_hora_sessao, we extract the TIME and apply it to the original date of each appointment
                                   new-timestamp (if data_hora_sessao
                                                   (let [input-timestamp (java.sql.Timestamp/valueOf data_hora_sessao)
                                                         cal-input (java.util.Calendar/getInstance)
                                                         cal-original (java.util.Calendar/getInstance)]
                                                     (.setTime cal-input input-timestamp)
                                                     (.setTime cal-original original-date)
                                                     (.set cal-original java.util.Calendar/HOUR_OF_DAY (.get cal-input java.util.Calendar/HOUR_OF_DAY))
                                                     (.set cal-original java.util.Calendar/MINUTE (.get cal-input java.util.Calendar/MINUTE))
                                                     (.set cal-original java.util.Calendar/SECOND 0)
                                                     (java.sql.Timestamp. (.getTimeInMillis cal-original)))
                                                   original-date)
                                   
                                   update-map (cond-> {}
                                                (some? paciente_id) (assoc :paciente_id (java.util.UUID/fromString paciente_id))
                                                (some? psicologo_id) (assoc :psicologo_id (java.util.UUID/fromString psicologo_id))
                                                (some? data_hora_sessao) (assoc :data_hora_sessao new-timestamp) ;; Use calculated timestamp
                                                (some? novo-valor) (assoc :valor_consulta novo-valor)
                                                (some? novo-duracao) (assoc :duracao novo-duracao)
                                                (some? status) (assoc :status status)
                                                (some? observacoes) (assoc :observacoes observacoes))]
                               
                               (sql/update! @datasource :agendamentos update-map {:id (:id appt)})))
                           agendamentos-futuros))
               
               {:status 200 :body {:message (str (count agendamentos-futuros) " agendamentos atualizados com sucesso.")}})
             
             {:status 400 :body {:erro "Agendamento não é recorrente."}})

          (= mode "all")
          (if-let [recorrencia-id (:recorrencia_id agendamento-atual)]
             (let [novo-duracao (or duracao (:duracao agendamento-atual) 50)
                   novo-valor (if (= status "cancelado") 0 (or valor_consulta (:valor_consulta agendamento-atual)))
                   
                   ;; Find ALL appointments in this series
                   todos-agendamentos (execute-query! ["SELECT id, data_hora_sessao FROM agendamentos 
                                                    WHERE recorrencia_id = ? 
                                                    AND clinica_id = ?"
                                                   recorrencia-id clinica-id])]
               
               (doall (map (fn [appt]
                             (let [original-date (:data_hora_sessao appt)
                                   new-timestamp (if data_hora_sessao
                                                   (let [input-timestamp (java.sql.Timestamp/valueOf data_hora_sessao)
                                                         cal-input (java.util.Calendar/getInstance)
                                                         cal-original (java.util.Calendar/getInstance)]
                                                     (.setTime cal-input input-timestamp)
                                                     (.setTime cal-original original-date)
                                                     (.set cal-original java.util.Calendar/HOUR_OF_DAY (.get cal-input java.util.Calendar/HOUR_OF_DAY))
                                                     (.set cal-original java.util.Calendar/MINUTE (.get cal-input java.util.Calendar/MINUTE))
                                                     (.set cal-original java.util.Calendar/SECOND 0)
                                                     (java.sql.Timestamp. (.getTimeInMillis cal-original)))
                                                   original-date)
                                   
                                   update-map (cond-> {}
                                                (some? paciente_id) (assoc :paciente_id (java.util.UUID/fromString paciente_id))
                                                (some? psicologo_id) (assoc :psicologo_id (java.util.UUID/fromString psicologo_id))
                                                (some? data_hora_sessao) (assoc :data_hora_sessao new-timestamp)
                                                (some? novo-valor) (assoc :valor_consulta novo-valor)
                                                (some? novo-duracao) (assoc :duracao novo-duracao)
                                                (some? status) (assoc :status status)
                                                (some? observacoes) (assoc :observacoes observacoes))]
                               
                               (sql/update! @datasource :agendamentos update-map {:id (:id appt)})))
                           todos-agendamentos))
               
               {:status 200 :body {:message (str (count todos-agendamentos) " agendamentos atualizados com sucesso.")}})
             
             {:status 400 :body {:erro "Agendamento não é recorrente."}})

          :else ;; Default: Single update (existing logic)
        (let [_ (println "DEBUG: Atualizando agendamento. Body:" (:body request)) 
              ;; Determinar dados finais para validação de bloqueio
              novo-data (if data_hora_sessao (java.sql.Timestamp/valueOf data_hora_sessao) (:data_hora_sessao agendamento-atual))
              novo-duracao (or duracao (:duracao agendamento-atual) 50)
              novo-psicologo-uuid (if psicologo_id (java.util.UUID/fromString psicologo_id) (:psicologo_id agendamento-atual))
              
              ;; Calcular fim da sessão
              novo-fim (java.sql.Timestamp. (+ (.getTime novo-data) (* novo-duracao 60000)))
              
              ;; Verificar se há bloqueio conflitante (apenas se houver mudança de horário, duração ou psicólogo, mas por segurança checamos sempre que possível conflito)
              bloqueio-existente (execute-one! ["SELECT id FROM bloqueios_agenda 
                                                  WHERE clinica_id = ? 
                                                  AND psicologo_id = ?
                                                  AND data_inicio < ?::timestamp
                                                  AND data_fim > ?::timestamp"
                                                 clinica-id novo-psicologo-uuid novo-fim novo-data])

              ;; Verificar se há agendamento conflitante (igual criação)
              agendamento-conflitante (when (some? data_hora_sessao) ;; Só checa se estiver mudando horário/data
                                       (execute-one! ["SELECT id FROM agendamentos 
                                                       WHERE clinica_id = ? 
                                                       AND psicologo_id = ?
                                                       AND status != 'cancelado'
                                                       AND id != ?
                                                       AND data_hora_sessao < ?::timestamp
                                                       AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?::timestamp"
                                                      clinica-id novo-psicologo-uuid agendamento-id novo-fim novo-data]))
              
              ;; Se status for 'cancelado', zera o valor_consulta automaticamente
              valor-final (if (= status "cancelado") 0 valor_consulta)
              update-map (cond-> {}
                           (some? paciente_id) (assoc :paciente_id (java.util.UUID/fromString paciente_id))
                           (some? psicologo_id) (assoc :psicologo_id (java.util.UUID/fromString psicologo_id))
                           (some? data_hora_sessao) (assoc :data_hora_sessao (java.sql.Timestamp/valueOf data_hora_sessao))
                           (some? valor-final) (assoc :valor_consulta valor-final)
                           (some? duracao) (assoc :duracao duracao)
                           (some? status) (assoc :status status)
                           (some? observacoes) (assoc :observacoes observacoes)
                           (some? (:valor_repasse (:body request))) (assoc :valor_repasse (:valor_repasse (:body request)))
                           (some? (:status_repasse (:body request))) (assoc :status_repasse (:status_repasse (:body request)))
                           (some? (:status_pagamento (:body request))) (assoc :status_pagamento (:status_pagamento (:body request))))]
          
          (cond
            bloqueio-existente
            {:status 409 :body {:erro "Não é possível alterar para este horário. O período está bloqueado."}}
            
            agendamento-conflitante
            {:status 409 :body {:erro "Já existe um agendamento neste horário."}}

            :else
            (let [resultado (sql/update! @datasource :agendamentos update-map {:id agendamento-id :clinica_id clinica-id})]
              (if (zero? (:next.jdbc/update-count resultado))
                {:status 500 :body {:erro "Erro ao atualizar agendamento."}}
                (let [agendamento-atualizado (execute-one! ["SELECT * FROM agendamentos WHERE id = ?" agendamento-id])]
                  {:status 200 :body agendamento-atualizado}))))))
        {:status 404 :body {:erro "Agendamento não encontrado."}}))
    (catch Exception e
      (println "ERRO AO ATUALIZAR AGENDAMENTO:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))


(defn remover-agendamento-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))
          mode (get-in request [:query-params "mode"])]
      
      (if-let [agendamento (execute-one! ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])]
        (let [recorrencia-id (:recorrencia_id agendamento)
              data-sessao (:data_hora_sessao agendamento)]
          
          (if (and (= mode "all_future") recorrencia-id)
            ;; Remover este e os futuros da mesma recorrência
            (let [resultado (jdbc/execute! @datasource 
                                           ["DELETE FROM agendamentos 
                                             WHERE clinica_id = ? 
                                             AND recorrencia_id = ? 
                                             AND data_hora_sessao >= ?"
                                            clinica-id recorrencia-id data-sessao])]
               {:status 204 :body ""})
            
            (if (and (= mode "all") recorrencia-id)
                ;; Remover TODOS da mesma recorrência (passados e futuros)
                (let [resultado (jdbc/execute! @datasource 
                                               ["DELETE FROM agendamentos 
                                                 WHERE clinica_id = ? 
                                                 AND recorrencia_id = ?"
                                                clinica-id recorrencia-id])]
                  {:status 204 :body ""})

                ;; Remover apenas este
                (let [resultado (sql/delete! @datasource :agendamentos {:id agendamento-id :clinica_id clinica-id})]
                  (if (zero? (:next.jdbc/update-count resultado))
                    {:status 500 :body {:erro "Erro ao remover agendamento."}}
                    {:status 204 :body ""})))))
        {:status 404 :body {:erro "Agendamento não encontrado."}}))
    (catch Exception e
      (println "ERRO AO REMOVER AGENDAMENTO:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))
;; Função global de sincronização (sem contexto de request)
;; Usada na inicialização do backend para TODAS as clínicas
(defn sincronizar-status-global! []
  (try
    (let [agora (java.sql.Timestamp. (System/currentTimeMillis))]
      (println "SYNC GLOBAL: Sincronizando status de todos os agendamentos passados...")
      
      ;; Atualiza status para 'realizado' em sessões passadas que ainda estão como 'agendado'
      (let [status-result (jdbc/execute! @datasource 
                            ["UPDATE agendamentos 
                              SET status = 'realizado' 
                              WHERE data_hora_sessao < ? 
                              AND (status IS NULL OR status = 'agendado')"
                             agora])
            status-count (get (first status-result) :next.jdbc/update-count 0)
            
            ;; Atualiza status_pagamento para 'pago' em sessões passadas realizadas (não canceladas)
            pagamento-result (jdbc/execute! @datasource 
                               ["UPDATE agendamentos 
                                 SET status_pagamento = 'pago' 
                                 WHERE data_hora_sessao < ? 
                                 AND status != 'cancelado'
                                 AND (status_pagamento IS NULL OR status_pagamento = 'pendente')"
                                agora])
            pagamento-count (get (first pagamento-result) :next.jdbc/update-count 0)]
        
        (println "SYNC GLOBAL: Atualizados" status-count "status e" pagamento-count "pagamentos")))
    (catch Exception e
      (println "ERRO SYNC GLOBAL:" (.getMessage e)))))

;; Handler para sincronizar status de agendamentos passados (por clínica)
;; Atualiza no banco: status='realizado' e status_pagamento='pago' para sessões passadas não canceladas
(defn sincronizar-status-agendamentos-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          agora (java.sql.Timestamp. (System/currentTimeMillis))]
      (println "SYNC: Sincronizando status de agendamentos passados para clínica" clinica-id)
      
      ;; Atualiza status para 'realizado' em sessões passadas que ainda estão como 'agendado'
      (let [status-result (jdbc/execute! @datasource 
                            ["UPDATE agendamentos 
                              SET status = 'realizado' 
                              WHERE clinica_id = ? 
                              AND data_hora_sessao < ? 
                              AND (status IS NULL OR status = 'agendado')"
                             clinica-id agora])
            status-count (get (first status-result) :next.jdbc/update-count 0)
            
            ;; Atualiza status_pagamento para 'pago' em sessões passadas realizadas (não canceladas)
            pagamento-result (jdbc/execute! @datasource 
                               ["UPDATE agendamentos 
                                 SET status_pagamento = 'pago' 
                                 WHERE clinica_id = ? 
                                 AND data_hora_sessao < ? 
                                 AND status != 'cancelado'
                                 AND (status_pagamento IS NULL OR status_pagamento = 'pendente')"
                                clinica-id agora])
            pagamento-count (get (first pagamento-result) :next.jdbc/update-count 0)]
        
        (println "SYNC: Atualizados" status-count "status e" pagamento-count "pagamentos")
        {:status 200 :body {:message "Sincronização concluída"
                            :status_atualizados status-count
                            :pagamentos_atualizados pagamento-count}}))
    (catch Exception e
      (println "ERRO AO SINCRONIZAR STATUS:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro ao sincronizar: " (.getMessage e))}})))

(defn listar-agendamentos-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        papel-id (:papel_id identity)
        user-id (:user_id identity)
        paciente-id-filter (get-in request [:params :paciente_id])
        nome-papel (:nome_papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" papel-id]))]
    (println "DEBUG: Listar Agendamentos - User:" user-id "Papel:" nome-papel "Clinica:" clinica-id "Paciente Filter:" paciente-id-filter)
    
    (let [base-query "SELECT a.*, p.nome as nome_paciente, p.nota_fiscal, p.origem, p.vencimento_pagamento, p.tipo_pagamento, u.nome as nome_psicologo
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

(defn gerar-intervalos-bloqueio [data_inicio data_fim recorrencia_tipo quantidade_recorrencia]
  (let [start-ts (java.sql.Timestamp/valueOf data_inicio)
        end-ts   (java.sql.Timestamp/valueOf data_fim)
        duracao-millis (- (.getTime end-ts) (.getTime start-ts))
        
        qtd-bloqueios (if (and recorrencia_tipo (pos? (or quantidade_recorrencia 0))) 
                          (min (or quantidade_recorrencia 1) 120) 
                          1)
        intervalo-dias (case recorrencia_tipo
                         "semanal" 7
                         "quinzenal" 14
                         0)]
    (for [i (range qtd-bloqueios)]
      (let [base-time (.getTime start-ts)
            offset-millis (* i intervalo-dias 24 60 60 1000)
            s-time (java.sql.Timestamp. (+ base-time offset-millis))
            e-time (java.sql.Timestamp. (+ (.getTime s-time) duracao-millis))]
        {:start s-time :end e-time}))))

(defn verificar-conflitos-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          usuario-id (get-in request [:identity :user_id])
          papel (get-in request [:identity :role])
          {:keys [data_inicio data_fim recorrencia_tipo quantidade_recorrencia psicologo_id]} (:body request)
          
          target-psicologo-id (if (and (or (= papel "admin_clinica") (= papel "secretario")) 
                                       (not (str/blank? psicologo_id)))
                                (java.util.UUID/fromString psicologo_id)
                                usuario-id)]
      
      (if (or (nil? data_inicio) (nil? data_fim))
        {:status 400 :body {:erro "data_inicio e data_fim são obrigatórios."}}
        
        (let [intervalos (gerar-intervalos-bloqueio data_inicio data_fim recorrencia_tipo quantidade_recorrencia)
              
              conflitos (reduce (fn [acc {:keys [start end]}]
                                  (let [agendamentos (execute-query! ["SELECT id, data_hora_sessao, duracao, status FROM agendamentos 
                                                                       WHERE clinica_id = ? 
                                                                       AND psicologo_id = ?
                                                                       AND status != 'cancelado'
                                                                       AND data_hora_sessao < ?::timestamp
                                                                       AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?::timestamp"
                                                                      clinica-id target-psicologo-id end start])]
                                    (into acc agendamentos)))
                                []
                                intervalos)]
          {:status 200 :body {:conflitos conflitos :total (count conflitos)}})))
    (catch Exception e
      (println "ERRO VERIFICAR CONFLITOS:" (.getMessage e))
      {:status 500 :body {:erro "Erro interno ao verificar conflitos."}})))

(defn criar-bloqueio-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          usuario-id (get-in request [:identity :user_id])
          papel (get-in request [:identity :role])
          {:keys [data_inicio data_fim motivo dia_inteiro recorrencia_tipo quantidade_recorrencia cancelar_conflitos psicologo_id]} (:body request)
          
          target-psicologo-id (if (and (or (= papel "admin_clinica") (= papel "secretario")) 
                                       (not (str/blank? psicologo_id)))
                                (java.util.UUID/fromString psicologo_id)
                                usuario-id)]
                                
      (if (or (nil? data_inicio) (nil? data_fim))
        {:status 400 :body {:erro "data_inicio e data_fim são obrigatórios."}}
        (let [intervalos (gerar-intervalos-bloqueio data_inicio data_fim recorrencia_tipo quantidade_recorrencia)
              recorrencia-uuid (when (and recorrencia_tipo (not= recorrencia_tipo "none")) 
                                 (java.util.UUID/randomUUID))]

          ;; Se solicitado, cancelar agendamentos conflitantes
          (when cancelar_conflitos
            (doseq [{:keys [start end]} intervalos
                    :let [end-ts (java.sql.Timestamp. (.getTime end))
                          start-ts (java.sql.Timestamp. (.getTime start))]]
              (sql/update! @datasource :agendamentos 
                           {:status "cancelado" :valor_consulta 0} 
                           ["clinica_id = ? AND psicologo_id = ? AND status != 'cancelado' 
                             AND data_hora_sessao < ?
                             AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?"
                            clinica-id target-psicologo-id end-ts start-ts])))

          (let [novos-bloqueios (doall (map (fn [{:keys [start end]}]
                                              (sql/insert! @datasource :bloqueios_agenda
                                                           {:clinica_id    clinica-id
                                                            :psicologo_id  target-psicologo-id
                                                            :data_inicio   start
                                                            :data_fim      end
                                                            :motivo        motivo
                                                            :dia_inteiro   (or dia_inteiro false)
                                                            :recorrencia_id recorrencia-uuid}
                                                           {:builder-fn rs/as-unqualified-lower-maps :return-keys true}))
                                            intervalos))]
            {:status 201 :body (first novos-bloqueios)}))))
    (catch Exception e
      (println "ERRO ao criar bloqueio:" (.getMessage e))
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))

(defn listar-bloqueios-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        data-inicio-param (get-in request [:params :data_inicio])
        data-fim-param (get-in request [:params :data_fim])
        ;; Novo filtro opcional: psicologo_id (apenas para admin/secretário)
        psicologo-id-param (get-in request [:params :psicologo_id])]
    
    (let [;; Definição base da query
          base-query "SELECT * FROM bloqueios_agenda WHERE clinica_id = ?"
          base-params [clinica-id]

          ;; Lógica de restrição de acesso e filtro de psicólogo
          [query params] (cond
                           ;; Se for admin ou secretario
                           (or (= papel "admin_clinica") (= papel "secretario"))
                           (if (not (str/blank? psicologo-id-param))
                             ;; Se admin especificou um psicólogo, filtra por ele
                             [(str base-query " AND psicologo_id = ?") (conj base-params (java.util.UUID/fromString psicologo-id-param))]
                             ;; Se não, traz tudo (ou poderíamos obrigar o filtro, mas trazer tudo é útil para visão geral)
                             [base-query base-params])

                           ;; Se for psicólogo, FORÇA o filtro pelo próprio ID (ignora parâmetro se tentar passar)
                           (= papel "psicologo")
                           [(str base-query " AND psicologo_id = ?") (conj base-params usuario-id)]

                           :else
                           ;; Papel desconhecido ou sem permissão (tecnicamente o middleware já barra, mas segurança extra)
                           [base-query (conj base-params nil)]) ;; Vai falhar ou não trazer nada seguro
          
          ;; Adiciona filtros de data se presentes
          [query params] (if data-inicio-param
                           [(str query " AND data_fim >= ?::timestamp") (conj params data-inicio-param)]
                           [query params])
          
          [query params] (if data-fim-param
                           [(str query " AND data_inicio <= ?::timestamp") (conj params data-fim-param)]
                           [query params])
          
          ;; Ordenação final
          query (str query " ORDER BY data_inicio ASC")
          
          bloqueios (execute-query! (into [query] params))]
      
      {:status 200 :body bloqueios})))

(defn remover-bloqueio-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (get-in request [:identity :user_id])
        papel (get-in request [:identity :role])
        bloqueio-id (java.util.UUID/fromString (get-in request [:params :id]))
        mode (or (get-in request [:params :mode]) (get-in request [:query-params "mode"]))] ;; "single" ou "all_future"

    (let [query (if (or (= papel "admin_clinica") (= papel "secretario"))
                  ["SELECT id, recorrencia_id, data_inicio FROM bloqueios_agenda WHERE id = ? AND clinica_id = ?" bloqueio-id clinica-id]
                  ["SELECT id, recorrencia_id, data_inicio FROM bloqueios_agenda WHERE id = ? AND clinica_id = ? AND psicologo_id = ?" bloqueio-id clinica-id usuario-id])]

      (if-let [bloqueio (execute-one! query)]
        (do
          (cond
            (and (= mode "all_future") (:recorrencia_id bloqueio))
            (sql/delete! @datasource :bloqueios_agenda ["recorrencia_id = ? AND data_inicio >= ?" 
                                                         (:recorrencia_id bloqueio)
                                                         (:data_inicio bloqueio)])

            :else
            (sql/delete! @datasource :bloqueios_agenda {:id bloqueio-id}))
          
          {:status 200 :body {:mensagem "Bloqueio removido com sucesso."}})
        {:status 404 :body {:erro "Bloqueio não encontrado ou você não tem permissão."}}))))

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
  (POST "/sincronizar" request (wrap-jwt-autenticacao sincronizar-status-agendamentos-handler))
  (POST "/" request (wrap-checar-permissao criar-agendamento-handler "gerenciar_agendamentos_clinica"))
  (GET  "/" request (wrap-jwt-autenticacao listar-agendamentos-handler))
  (GET  "/:id" request (wrap-jwt-autenticacao obter-agendamento-handler))
  (PUT  "/:id" request (wrap-checar-permissao atualizar-agendamento-handler "gerenciar_agendamentos_clinica"))
  (DELETE "/:id" request (wrap-checar-permissao remover-agendamento-handler "gerenciar_agendamentos_clinica")))

;; ROTAS DE BLOQUEIOS DE AGENDA
(defroutes bloqueios-routes
  (POST "/verificar-conflitos" request (wrap-jwt-autenticacao verificar-conflitos-handler))
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
      (wrap-cors :access-control-allow-origin [#"http://localhost:3000" #"http://localhost:9002" #"https://.*\.code\.run" #"https://deep-ngrv.onrender.com"]
                 :access-control-allow-methods [:get :post :put :delete :options]
                 :access-control-allow-headers #{"Authorization" "Content-Type"})
      (wrap-params)
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

          ;; Novo campo de status para pacientes
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'ativo'"])
          (println "Coluna 'status' de pacientes verificada/adicionada com sucesso.")

          ;; Novos campos Clínicos do Paciente
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS historico_familiar TEXT"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS uso_medicamentos TEXT"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS diagnostico TEXT"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS contatos_emergencia TEXT"])
          (println "Novas colunas de dados clínicos do paciente verificadas/adicionadas com sucesso.")

          ;; Novos campos Financeiros do Paciente
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nota_fiscal BOOLEAN DEFAULT false"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS origem VARCHAR(50)"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS vencimento_pagamento VARCHAR(100)"])
          (execute-query! ["ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_pagamento VARCHAR(20) DEFAULT 'avulso'"])
          (println "Novas colunas financeiras do paciente verificadas/adicionadas com sucesso.")

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
          (execute-query! ["ALTER TABLE bloqueios_agenda ADD COLUMN IF NOT EXISTS recorrencia_id UUID"])
          (println "Tabela bloqueios_agenda verificada/criada com sucesso.")

          ;; Sincronização de status de agendamentos passados na inicialização
          (sincronizar-status-global!)

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

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
            [migratus.core :as migratus]
            [deep-saude-backend.db :refer [datasource execute-query! execute-one!]]
            [deep-saude-backend.tempo :as tempo]
            [deep-saude-backend.google.rrule :as rrule]
            [deep-saude-backend.google.handlers :as google]
            [ring.middleware.cors :refer [wrap-cors]]
            [ring.middleware.params :refer [wrap-params]])
  (:gen-class)
  (:import (java.sql Date))) ; Importar java.sql.Date para conversão

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Configuração do Banco de Dados e JWT
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; db-spec, datasource e os helpers de query moram em deep-saude-backend.db.
;; Ver a docstring de lá para o motivo da extração.

(def jwt-secret
  (if-let [secret (env :jwt-secret)]
    ;; ⚠️ Não logar nem pedaço do segredo. A versão anterior imprimia os 4
    ;; primeiros e os 4 últimos caracteres no startup — em log agregado isso é
    ;; material entregue de graça para quem quiser forjar um JWT.
    (do (println "JWT_SECRET carregada.") secret)
    (do
      (println "ERROR: Variável de ambiente JWT_SECRET não foi encontrada!")
      (throw (Exception. "FATAL: A variável de ambiente :jwt-secret não está configurada! A aplicação será encerrada.")))))

(defn fuso-da-clinica
  "Fuso horário da clínica. Todo horário que chega do frontend é horário de
   parede e precisa deste fuso para virar instante — ver deep-saude-backend.tempo.

   Cai no padrão quando a clínica não tem fuso definido, o que mantém o
   comportamento histórico (tudo era implicitamente São Paulo)."
  [clinica-id]
  (or (:timezone (execute-one! ["SELECT timezone FROM clinicas WHERE id = ?" clinica-id]))
      tempo/fuso-padrao))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Migrações de schema (Migratus)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Substitui a antiga ensure-finance-columns!, que tentava ALTER TABLE no
;; startup e engolia a exceção quando a coluna já existia. Aquilo não versiona,
;; não tem ordem, não tem rollback e não registra o que já rodou — insustentável
;; a partir do momento em que a integração com o Google adiciona 5 tabelas.
;;
;; As migrations vivem em resources/migrations e são a única fonte da verdade do
;; schema. setup_db.sql permanece só como referência histórica.

(defn migratus-config []
  {:store                :database
   :migration-dir        "migrations/"
   :migration-table-name "schema_migracoes"
   :db                   {:datasource @datasource}})

(defn migrar!
  "Aplica as migrations pendentes. Roda de forma síncrona no boot: subir a
   aplicação com o schema desatualizado é pior do que não subir."
  []
  (println "MIGRATIONS: aplicando migrations pendentes...")
  (migratus/migrate (migratus-config))
  (println "MIGRATIONS: schema atualizado."))


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
  ;; Health check que só devolve 200 sem olhar o banco não é health check: a
  ;; aplicação continua "saudável" para o balanceador enquanto todas as
  ;; requisições reais falham.
  (try
    (execute-one! ["SELECT 1"])
    {:status 200 :headers {"Content-Type" "application/json"}
     :body {:status "ok" :banco "ok"}}
    (catch Exception e
      (println "HEALTH: banco indisponível:" (.getMessage e))
      {:status 503 :headers {"Content-Type" "application/json"}
       :body {:status "degradado" :banco "indisponivel"}})))

;; --- Handlers de Autenticação e Provisionamento ---

(defn- provisionamento-autorizado?
  "Provisionar clínica cria um tenant e um admin. Sem proteção, qualquer um na
   internet criava clínicas à vontade — enchia o banco e gerava contas de admin
   arbitrárias.

   A autorização é um segredo compartilhado no header, porque este endpoint
   precisa funcionar ANTES de existir qualquer usuário para autenticar.

   ⚠️ Falha fechada: sem PROVISIONING_TOKEN configurado, o endpoint não
   funciona. Aberto por padrão foi exatamente o problema."
  [request]
  (let [esperado (env :provisioning-token)
        recebido (get-in request [:headers "x-provisioning-token"])]
    (and (not (str/blank? esperado))
         (not (str/blank? recebido))
         ;; Comparação em tempo constante: `=` em string vaza, por tempo de
         ;; resposta, quantos caracteres iniciais bateram.
         (java.security.MessageDigest/isEqual
          (.getBytes ^String esperado "UTF-8")
          (.getBytes ^String recebido "UTF-8")))))

(defn provisionar-clinica-handler [request]
  (let [{:keys [nome_clinica limite_psicologos nome_admin email_admin senha_admin]} (:body request)]
    (cond
      (not (provisionamento-autorizado? request))
      (do
        (println "PROVISIONAMENTO: tentativa não autorizada.")
        {:status 403 :body {:erro "Provisionamento não autorizado."
                            :code "provisionamento_nao_autorizado"}})

      (or (str/blank? nome_clinica) (str/blank? nome_admin) (str/blank? email_admin) (str/blank? senha_admin))
      {:status 400, :body {:erro "Nome da clínica, nome do admin, email e senha são obrigatórios."}}

      (< (count (str senha_admin)) 8)
      {:status 400, :body {:erro "A senha do administrador deve ter ao menos 8 caracteres."}}

      (execute-one! ["SELECT id FROM usuarios WHERE email = ?" email_admin])
      {:status 409, :body {:erro "Email do administrador já cadastrado no sistema."}}

      :else
      ;; Clínica e admin na mesma transação: uma clínica sem admin é um tenant
      ;; órfão que ninguém consegue acessar nem remover pela aplicação.
      (if-let [papel-admin-id (:id (execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))]
        (jdbc/with-transaction [tx @datasource]
          (let [nova-clinica (sql/insert! tx :clinicas
                                          {:nome_da_clinica nome_clinica :limite_psicologos limite_psicologos}
                                          {:builder-fn rs/as-unqualified-lower-maps :return-keys [:id :nome_da_clinica]})
                novo-admin (sql/insert! tx :usuarios
                                        {:clinica_id (:id nova-clinica)
                                         :papel_id   papel-admin-id
                                         :nome       nome_admin
                                         :email      email_admin
                                         :senha_hash (hashers/encrypt senha_admin)}
                                        {:builder-fn rs/as-unqualified-lower-maps :return-keys [:id :email]})]
            {:status 201 :body {:message "Clínica e usuário administrador criados com sucesso."
                                :clinica nova-clinica
                                :usuario_admin novo-admin}}))
        {:status 500 :body {:erro "Papel 'admin_clinica' não encontrado. Rode as migrations."}}))))

(defn senha-confere?
  "Verifica a senha contra o hash armazenado.

   ⚠️ Antes, o `catch` aqui pegava a senha que a pessoa acabou de digitar,
   gravava como novo hash do usuário e devolvia `true` — 'auto-correção'. Na
   prática: qualquer conta cujo hash estivesse corrompido era tomada por quem
   soubesse o e-mail, e o atacante ainda saía com a senha definida por ele.
   `hashers/check` lança justamente quando o hash é ilegível, então o caminho
   era alcançável.

   Hash ilegível agora é falha de autenticação. A recuperação passa por um admin
   (PUT /api/usuarios/:id com `senha`) ou, se quem ficou trancado for o próprio
   admin, pela CLI de resgate (`lein run reset-senha`). Nunca pelo login."
  [senha hash-armazenado usuario-id]
  (try
    (hashers/check senha hash-armazenado)
    (catch Exception e
      (println "LOGIN: hash ilegível para o usuário" (str usuario-id)
               "- autenticação negada. Necessário reset por admin."
               (.getMessage e))
      false)))

(defn login-handler [request]
  (let [{:keys [email senha]} (:body request)]
    (if-let [usuario (execute-one! ["SELECT * FROM usuarios WHERE email = ?" email])]
      (do
        (if-let [papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" (:papel_id usuario)])]
          (do
            (let [senha-valida (senha-confere? senha (:senha_hash usuario) (:id usuario))]
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
                {:status 401 :body {:erro "Credenciais inválidas."}})))
          (do
            (println "LOGIN: papel inexistente para o usuário" (str (:id usuario)))
            {:status 500 :body {:erro "Erro de integridade: Papel do usuário não encontrado."}})))
      ;; Mesma resposta para usuário inexistente e senha errada: distinguir os
      ;; dois casos permite enumerar quem tem conta na plataforma.
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
        user-id (:user_id identity)
        ;; Papel vem do JWT, já assinado. Reler do banco a cada requisição era
        ;; uma query extra por listagem sem nenhuma informação nova.
        nome-papel (:role identity)]

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
              fuso (fuso-da-clinica clinica-id)
              inicio-zdt (tempo/parse-instante data_hora_sessao fuso)
              duracao-sessao (or duracao 50)

              qtd-sessoes (if (and recorrencia_tipo (pos? (or quantidade_recorrencia 0)))
                                (min (or quantidade_recorrencia 1) 150)
                                1)

              ;; Ocorrências geradas na linha do tempo LOCAL: o horário de parede
              ;; é preservado semana a semana. A versão anterior somava
              ;; (* i 7 24 60 60 1000) milissegundos, o que escorrega uma hora ao
              ;; atravessar mudança de horário de verão.
              sessoes-para-criar (map (fn [{:keys [inicio fim]}]
                                        {:start (tempo/->sql inicio)
                                         :end   (tempo/->sql fim)})
                                      (tempo/ocorrencias inicio-zdt recorrencia_tipo
                                                         qtd-sessoes duracao-sessao))

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

              ;; Série existe se, e somente se, há um RRULE de verdade.
              ;; Amarrar as duas coisas evita o caso em que recorrencia_tipo é
              ;; um valor não suportado ("mensal"): antes isso gerava um
              ;; recorrencia_id para uma "série" de uma sessão só.
              rrule-str (rrule/->rrule recorrencia_tipo qtd-sessoes)
              recorrencia-uuid (when rrule-str (java.util.UUID/randomUUID))]
          
          (cond
            bloqueio-existente
            {:status 409 :body {:erro "Não é possível agendar. Um ou mais horários da sequência conflitam com bloqueios." :code "block_conflict"}}
            
            agendamento-conflitante
            {:status 409 :body {:erro "Já existe um agendamento neste horário." :code "appointment_conflict"}}
            
            (not (and paciente-valido? psicologo-valido?))
            {:status 422, :body {:erro "Paciente ou psicólogo não pertence à clínica do usuário autenticado."}}

            :else
            ;; Série inteira em UMA transação.
            ;;
            ;; Antes eram N sql/insert! soltos: cair no meio de uma recorrência
            ;; de 40 sessões deixava 17 sessões órfãs no banco, sem série e sem
            ;; ninguém saber. É também o pré-requisito do outbox da Fase 2, que
            ;; precisa gravar a intenção de sync na mesma transação do dado.
            (jdbc/with-transaction [tx @datasource]
              (when recorrencia-uuid
                (sql/insert! tx :recorrencias
                             {:id              recorrencia-uuid
                              :clinica_id      clinica-id
                              :psicologo_id    psicologo-uuid
                              :paciente_id     paciente-uuid
                              :rrule           rrule-str
                              :dtstart         (tempo/->sql inicio-zdt)
                              :duracao_minutos duracao-sessao
                              :timezone        fuso
                              :status          "ativa"}))
              (let [novos-agendamentos
                    (doall (map (fn [{:keys [start]}]
                                  (sql/insert! tx :agendamentos
                                               (merge
                                                 {:clinica_id       clinica-id
                                                  :paciente_id      paciente-uuid
                                                  :psicologo_id     psicologo-uuid
                                                  :data_hora_sessao start
                                                  ;; Chave de reconciliação com o Google (D10): a ocorrência
                                                  ;; nasce no horário original e este valor nunca muda, mesmo
                                                  ;; que a sessão seja remarcada depois.
                                                  :original_start_time start
                                                  :valor_consulta   valor_consulta
                                                  :duracao          duracao-sessao
                                                  :observacoes      observacoes}
                                                 (when recorrencia-uuid {:recorrencia_id recorrencia-uuid}))
                                               {:builder-fn rs/as-unqualified-lower-maps :return-keys true}))
                                sessoes-para-criar))]
                {:status 201, :body (first novos-agendamentos)}))))))
    (catch Exception e
      (println "ERRO FATAL NO HANDLER:" (.getMessage e))
      (.printStackTrace e)
      {:status 500 :body {:erro "Erro interno."}})))


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
                   fuso (fuso-da-clinica clinica-id)

                   ;; Find all future appointments in this series (including this one)
                   agendamentos-futuros (execute-query! ["SELECT id, data_hora_sessao FROM agendamentos
                                                    WHERE recorrencia_id = ?
                                                    AND data_hora_sessao >= ?
                                                    AND clinica_id = ?"
                                                   recorrencia-id (:data_hora_sessao agendamento-atual) clinica-id])]

               ;; Uma transação para a série inteira: ou todas as ocorrências
               ;; futuras mudam, ou nenhuma muda. Antes eram N updates soltos, e
               ;; uma falha no meio deixava a série metade num horário e metade
               ;; noutro — sem erro visível para quem editou.
               (jdbc/with-transaction [tx @datasource]
                 (doall (map (fn [appt]
                               (let [original-date (:data_hora_sessao appt)
                                     ;; Cada ocorrência mantém a própria DATA e adota o HORÁRIO novo.
                                     ;; Antes isso era feito com java.util.Calendar no fuso default da
                                     ;; JVM (UTC em container); agora é explícito no fuso da clínica.
                                     new-timestamp (if data_hora_sessao
                                                     (tempo/->sql (tempo/com-horario-de original-date data_hora_sessao fuso))
                                                     original-date)

                                     update-map (cond-> {}
                                                  (some? paciente_id) (assoc :paciente_id (java.util.UUID/fromString paciente_id))
                                                  (some? psicologo_id) (assoc :psicologo_id (java.util.UUID/fromString psicologo_id))
                                                  (some? data_hora_sessao) (assoc :data_hora_sessao new-timestamp) ;; Use calculated timestamp
                                                  (some? novo-valor) (assoc :valor_consulta novo-valor)
                                                  (some? novo-duracao) (assoc :duracao novo-duracao)
                                                  (some? status) (assoc :status status)
                                                  (some? observacoes) (assoc :observacoes observacoes))]

                                 (sql/update! tx :agendamentos update-map {:id (:id appt)})))
                             agendamentos-futuros)))

               {:status 200 :body {:message (str (count agendamentos-futuros) " agendamentos atualizados com sucesso.")}})
             
             {:status 400 :body {:erro "Agendamento não é recorrente."}})

          (= mode "all")
          (if-let [recorrencia-id (:recorrencia_id agendamento-atual)]
             (let [novo-duracao (or duracao (:duracao agendamento-atual) 50)
                   novo-valor (if (= status "cancelado") 0 (or valor_consulta (:valor_consulta agendamento-atual)))
                   fuso (fuso-da-clinica clinica-id)

                   ;; Find ALL appointments in this series
                   todos-agendamentos (execute-query! ["SELECT id, data_hora_sessao FROM agendamentos
                                                    WHERE recorrencia_id = ?
                                                    AND clinica_id = ?"
                                                   recorrencia-id clinica-id])]

               ;; Mesma atomicidade do modo "all_future".
               (jdbc/with-transaction [tx @datasource]
                 (doall (map (fn [appt]
                               (let [original-date (:data_hora_sessao appt)
                                     new-timestamp (if data_hora_sessao
                                                     (tempo/->sql (tempo/com-horario-de original-date data_hora_sessao fuso))
                                                     original-date)

                                     update-map (cond-> {}
                                                  (some? paciente_id) (assoc :paciente_id (java.util.UUID/fromString paciente_id))
                                                  (some? psicologo_id) (assoc :psicologo_id (java.util.UUID/fromString psicologo_id))
                                                  (some? data_hora_sessao) (assoc :data_hora_sessao new-timestamp)
                                                  (some? novo-valor) (assoc :valor_consulta novo-valor)
                                                  (some? novo-duracao) (assoc :duracao novo-duracao)
                                                  (some? status) (assoc :status status)
                                                  (some? observacoes) (assoc :observacoes observacoes))]

                                 (sql/update! tx :agendamentos update-map {:id (:id appt)})))
                             todos-agendamentos)))

               {:status 200 :body {:message (str (count todos-agendamentos) " agendamentos atualizados com sucesso.")}})
             
             {:status 400 :body {:erro "Agendamento não é recorrente."}})

          :else ;; Default: Single update (existing logic)
        (let [_ (println "DEBUG: Atualizando agendamento. Body:" (:body request))
              fuso (fuso-da-clinica clinica-id)
              ;; Determinar dados finais para validação de bloqueio
              novo-data-zdt (tempo/->zdt (or data_hora_sessao (:data_hora_sessao agendamento-atual)) fuso)
              novo-data (tempo/->sql novo-data-zdt)
              novo-duracao (or duracao (:duracao agendamento-atual) 50)
              novo-psicologo-uuid (if psicologo_id (java.util.UUID/fromString psicologo_id) (:psicologo_id agendamento-atual))

              ;; Calcular fim da sessão
              novo-fim (tempo/->sql (tempo/mais-minutos novo-data-zdt novo-duracao))
              
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
                           (some? data_hora_sessao) (assoc :data_hora_sessao novo-data)
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
      {:status 500 :body {:erro "Erro interno."}})))


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
      {:status 500 :body {:erro "Erro interno."}})))
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
      {:status 500 :body {:erro "Erro ao sincronizar."}})))

(defn listar-agendamentos-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        user-id (:user_id identity)
        paciente-id-filter (get-in request [:params :paciente_id])
        ;; O papel já vem assinado no JWT — a consulta que estava aqui era uma
        ;; ida ao banco por requisição para reler o que já estava em mãos.
        nome-papel (:role identity)]

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

(defn gerar-intervalos-bloqueio
  "Intervalos de um bloqueio, com ou sem recorrência.

   Mesmo tratamento de fuso do agendamento: horário de parede preservado entre
   as repetições, duração real preservada dentro de cada uma."
  [data_inicio data_fim recorrencia_tipo quantidade_recorrencia fuso]
  (let [inicio-zdt (tempo/parse-instante data_inicio fuso)
        fim-zdt    (tempo/parse-instante data_fim fuso)
        duracao-minutos (.toMinutes (java.time.Duration/between inicio-zdt fim-zdt))

        qtd-bloqueios (if (and recorrencia_tipo (pos? (or quantidade_recorrencia 0)))
                          (min (or quantidade_recorrencia 1) 120)
                          1)]
    (map (fn [{:keys [inicio fim]}]
           {:start (tempo/->sql inicio) :end (tempo/->sql fim)})
         (tempo/ocorrencias inicio-zdt recorrencia_tipo qtd-bloqueios duracao-minutos))))

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
        
        (let [intervalos (gerar-intervalos-bloqueio data_inicio data_fim recorrencia_tipo
                                                    quantidade_recorrencia (fuso-da-clinica clinica-id))

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
        (let [intervalos (gerar-intervalos-bloqueio data_inicio data_fim recorrencia_tipo
                                                   quantidade_recorrencia (fuso-da-clinica clinica-id))
              recorrencia-uuid (when (and recorrencia_tipo (not= recorrencia_tipo "none"))
                                 (java.util.UUID/randomUUID))]

          ;; Cancelamento de conflitos + criação dos bloqueios numa transação só.
          ;; Falhar no meio aqui era especialmente ruim: cancelava sessões de
          ;; pacientes e depois não criava o bloqueio que justificava o cancelamento.
          (jdbc/with-transaction [tx @datasource]
            ;; (start/end já vêm como OffsetDateTime, prontos para o JDBC)
            (when cancelar_conflitos
              (doseq [{start-ts :start end-ts :end} intervalos]
                (sql/update! tx :agendamentos
                             {:status "cancelado" :valor_consulta 0}
                             ["clinica_id = ? AND psicologo_id = ? AND status != 'cancelado'
                               AND data_hora_sessao < ?
                               AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?"
                              clinica-id target-psicologo-id end-ts start-ts])))

            (let [novos-bloqueios (doall (map (fn [{:keys [start end]}]
                                                (sql/insert! tx :bloqueios_agenda
                                                             {:clinica_id    clinica-id
                                                              :psicologo_id  target-psicologo-id
                                                              :data_inicio   start
                                                              :data_fim      end
                                                              :motivo        motivo
                                                              :dia_inteiro   (or dia_inteiro false)
                                                              :recorrencia_id recorrencia-uuid}
                                                             {:builder-fn rs/as-unqualified-lower-maps :return-keys true}))
                                              intervalos))]
              {:status 201 :body (first novos-bloqueios)})))))
    (catch Exception e
      (println "ERRO ao criar bloqueio:" (.getMessage e))
      {:status 500 :body {:erro "Erro interno."}})))

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
          {:status 500 :body {:erro "Erro interno."}})))))

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

;; ROTAS DA INTEGRAÇÃO COM GOOGLE AGENDA
;;
;; ⚠️ Todas exigem `gerenciar_integracao_google`, permissão concedida só ao
;; admin_clinica. Não é excesso de zelo: vincular a agenda errada a um
;; profissional expõe o histórico de pacientes de outro (spec 5.4).
(defroutes google-routes
  (POST "/conectar"     request (wrap-checar-permissao google/iniciar-conexao-handler "gerenciar_integracao_google"))
  (POST "/callback"     request (wrap-checar-permissao google/callback-handler "gerenciar_integracao_google"))
  (GET  "/status"       request (wrap-checar-permissao google/status-handler "gerenciar_integracao_google"))
  (POST "/desconectar"  request (wrap-checar-permissao google/desconectar-handler "gerenciar_integracao_google"))
  (POST "/agendas/sincronizar" request (wrap-checar-permissao google/sincronizar-agendas-handler "gerenciar_integracao_google"))
  (GET  "/agendas"      request (wrap-checar-permissao google/listar-agendas-handler "gerenciar_integracao_google"))
  (GET  "/agendas/:id/sugestoes" request (wrap-checar-permissao google/sugerir-vinculo-handler "gerenciar_integracao_google"))
  (PUT  "/agendas/:id/vinculo"   request (wrap-checar-permissao google/vincular-handler "gerenciar_integracao_google"))
  (DELETE "/agendas/:id/vinculo" request (wrap-checar-permissao google/desvincular-handler "gerenciar_integracao_google"))
  (PUT  "/agendas/:id/pausa"     request (wrap-checar-permissao google/pausar-handler "gerenciar_integracao_google")))

(defroutes protected-routes
  (POST   "/api/usuarios" request (wrap-checar-permissao criar-usuario-handler "gerenciar_usuarios"))
  (GET    "/api/usuarios/:id" request (wrap-checar-permissao obter-usuario-handler "gerenciar_usuarios"))
  (PUT    "/api/usuarios/:id" request (wrap-checar-permissao atualizar-usuario-handler "gerenciar_usuarios"))
  (DELETE "/api/usuarios/:id" request (wrap-checar-permissao remover-usuario-handler "gerenciar_usuarios"))

  (context "/api/psicologos" []
    (GET    "/" request (wrap-checar-permissao listar-psicologos-handler "visualizar_todos_agendamentos")))

  (context "/api/pacientes" [] pacientes-routes)

  (context "/api/agendamentos" [] agendamentos-routes)

  (context "/api/bloqueios" [] bloqueios-routes)

  (context "/api/google" [] google-routes))

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
        ;; Schema: antes era um paredão de ALTER TABLE ... IF NOT EXISTS aqui,
        ;; sem ordem nem registro do que já havia rodado. Agora é Migratus.
        ;; ⚠️ Migração falha aborta o boot de propósito — subir com o schema
        ;; desatualizado é pior do que não subir.
        (migrar!)

        (try
          ;; Sincronização de status de agendamentos passados na inicialização
          (sincronizar-status-global!)
          (catch Exception e
            (println "Aviso na sincronização de status:" (.getMessage e))))
        (catch Exception e
          (println "Falha ao conectar ao banco de dados:" (.getMessage e)))))
    (println "AVISO: DATABASE_URL não configurada. As operações de banco de dados irão falhar.")))

(defn destroy-db []
  (println "Finalizando aplicação..."))

(defn reset-senha!
  "CLI de resgate: redefine a senha de um usuário direto pelo banco.

   Existe porque o login deixou de 'auto-corrigir' hash ilegível (ver
   senha-confere?). Um usuário comum nessa situação é resolvido por um admin via
   PUT /api/usuarios/:id — mas se quem ficou trancado for o próprio admin, não
   sobra ninguém para fazer isso.

   Uso: lein run reset-senha admin@exemplo.com 'nova-senha'

   Exige as mesmas variáveis de ambiente do servidor, então o privilégio é o de
   quem já tem acesso ao banco — não amplia superfície."
  [email nova-senha]
  (cond
    (or (str/blank? email) (str/blank? nova-senha))
    (do (println "Uso: lein run reset-senha <email> <nova-senha>") 1)

    (< (count nova-senha) 8)
    (do (println "Senha muito curta (mínimo 8 caracteres).") 1)

    :else
    (if-let [usuario (execute-one! ["SELECT id FROM usuarios WHERE email = ?" email])]
      (do
        (sql/update! @datasource :usuarios
                     {:senha_hash (hashers/encrypt nova-senha)}
                     {:id (:id usuario)})
        (println "Senha redefinida para o usuário" (str (:id usuario)))
        0)
      (do (println "Usuário não encontrado para o e-mail informado.") 1))))

(defn -main [& args]
  (case (first args)
    "reset-senha" (System/exit (reset-senha! (second args) (nth args 2 nil)))
    (do
      (init-db)
      (let [port (Integer. (or (env :port) 3000))]
        (println (str "Servidor iniciado na porta " port))
        (jetty/run-jetty #'app {:port port :join? false})))))

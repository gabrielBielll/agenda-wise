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
            [taoensso.timbre :as log]
            [deep-saude-backend.db :refer [datasource execute-query! execute-one!]]
            [deep-saude-backend.tempo :as tempo]
            [deep-saude-backend.dominio :as dominio]
            [deep-saude-backend.limites :as limites]
            [deep-saude-backend.logging :as logging]
            [deep-saude-backend.pacientes.portabilidade :as portabilidade-pacientes]
            [deep-saude-backend.paleta :as paleta]
            [deep-saude-backend.prontuarios :as prontuarios]
            [deep-saude-backend.remuneracao :as remuneracao]
            [deep-saude-backend.google.outbox :as outbox]
            [deep-saude-backend.google.rrule :as rrule]
            [deep-saude-backend.google.handlers :as google]
            ;; Autenticação (login com Google) e recuperação de senha. São
            ;; namespaces-folha: core os requer para registrar as rotas, e eles
            ;; NÃO requerem core de volta. A emissão de sessão que os dois
            ;; compartilham com o login clássico mora em `sessao`, justamente
            ;; para não fechar um ciclo core <-> auth-google.
            [deep-saude-backend.sessao :as sessao]
            [deep-saude-backend.auth-recuperacao :as auth-recuperacao]
            [deep-saude-backend.auth-google :as auth-google]
            [ring.middleware.cors :refer [wrap-cors]]
            [ring.middleware.params :refer [wrap-params]]
            [ring.middleware.keyword-params :refer [wrap-keyword-params]])
  (:gen-class)
  ;; O import de java.sql.Date saiu em 18/08: a conversão virou
  ;; `dominio/data-de-formulario`, e import sem uso convida a voltar ao
  ;; `Date/valueOf` cru — que era exatamente o defeito.
  )

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Configuração do Banco de Dados e JWT
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; db-spec, datasource e os helpers de query moram em deep-saude-backend.db.
;; Ver a docstring de lá para o motivo da extração.

;; O delay de fato mora em `deep-saude-backend.sessao` desde a extração da
;; emissão de sessão (login com Google precisava emitir a MESMA sessão sem
;; fechar ciclo com core). Este alias mantém `core/jwt-secret` funcionando
;; para tudo que já lia daqui — wrap-jwt-autenticacao, renovar, -main — e para
;; os testes que redefinem `core/jwt-secret`. É o MESMO delay: forçar um força
;; o outro.
(def jwt-secret sessao/jwt-secret)

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

(defn- diagnostico-de-bloqueio
  "Traduz o desfecho do migratus na próxima ação de quem está de plantão.

   Existe porque em 2026-08-19 a causa estava a cinco saltos da tela quebrada:
   `/admin/psicologos` → 500 → PSQLException → colunas de repasse ausentes →
   migration não aplicada → reserva órfã. Quem lê o log às 3 da manhã merece o
   último salto escrito, não deduzido."
  [desfecho]
  (case desfecho
    :ignore  (str "O migratus desistiu porque a reserva de migração está tomada "
                  "(\"Migration reserved by another instance\"). Se nenhuma outra "
                  "instância está migrando agora, a reserva é órfã de um processo "
                  "que morreu no meio: a linha `id = -1` de `schema_migracoes`. "
                  "ANTES de apagá-la, confira se a migration interrompida deixou "
                  "rastro parcial no schema — é o passo que separa \"consertei\" de "
                  "\"consertei e sei que não quebrei outra coisa\".")
    :failure (str "O migratus relatou falha ao aplicar as migrations. O erro real "
                  "está no log imediatamente acima desta linha.")
    (str "As migrations terminaram sem erro relatado e mesmo assim sobrou "
         "pendência: o schema do banco não é o que este build espera.")))

(defn migrar!
  "Aplica as migrations pendentes. Roda de forma síncrona no boot: subir a
   aplicação com o schema desatualizado é pior do que não subir.

   🔴 **`migrations_completed` era incondicional, e mentiu por 17 horas.**

   Em 2026-08-19 uma migration quebrou às 03:13 segurando a reserva do migratus.
   A partir dali toda subida encontrava a reserva de um processo morto e
   desistia — e esta função anunciava sucesso do mesmo jeito, porque saía logo
   depois do `migratus/migrate` sem olhar se sobrou pendência:

       Running up for [20260819080000 20260819090000 20260819100000]
       Migration reserved by another instance. Ignoring.
       migrations_completed          <- sucesso tendo aplicado ZERO

   Um sinal que diz \"está tudo bem\" sem ter verificado é pior que sinal nenhum:
   ele consome a atenção que iria para o problema. Foram 17 horas de log verde
   com a tela de psicólogos em 500.

   📌 **A checagem é por EFEITO, não por código de retorno.** `migratus/migrate`
   devolve `nil` no sucesso, `:ignore` com a reserva tomada e `:failure` no
   resto — mas nenhum desses três responde à única pergunta que importa, que é
   *\"sobrou migration por aplicar?\"*. `:ignore` com pendência zero é benigno
   (outra instância migrou primeiro e terminou); `nil` com pendência é o defeito.
   Por isso o veredito sai de `pending-list`, e o desfecho entra só no
   diagnóstico.

   ⚠️ Lançar aqui derruba o boot, e é de propósito: é a D-001, e a promessa que
   a docstring desta função já fazia sem o código cumprir."
  []
  (log/info "migrations_started")
  (let [config    (migratus-config)
        antes     (migratus/pending-list config)
        desfecho  (migratus/migrate config)
        depois    (migratus/pending-list config)]
    (if (seq depois)
      (do
        (log/with-context {:pendentes  (vec depois)
                           :quantidade (count depois)
                           :desfecho   (name (or desfecho :sem_erro))}
          (log/error "migrations_bloqueadas"))
        (throw (ex-info (str "Boot abortado: " (count depois) " migration(s) continuam "
                             "pendentes depois de migrar (" (str/join ", " depois) "). "
                             (diagnostico-de-bloqueio desfecho))
                        {:pendentes (vec depois) :desfecho desfecho})))
      (log/with-context {:aplicadas (count antes)}
        (log/info "migrations_completed")))))


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
      (if-not token
        {:status 401 :body {:erro "Token de autorização não fornecido."}}
        (let [auth-data (try
                          (let [claims (jwt/unsign token @jwt-secret)
                                claims-parsed (-> claims
                                                  (update :user_id #(java.util.UUID/fromString %))
                                                  (update :clinica_id #(java.util.UUID/fromString %))
                                                  (update :papel_id #(java.util.UUID/fromString %)))]
                             {:identity claims-parsed})
                          (catch Exception e
                            ;; 🔵 T3.3 — o `:cause` do ex-data separa as 6 causas
                            ;; que a buddy funde num evento só (`:exp` expirado,
                            ;; `:signature` assinatura errada, etc.). Sem ele,
                            ;; "6 eventos em produção" não dizia qual era qual.
                            ;; Só observabilidade: o comportamento não muda.
                            (log/with-context {:cause (:cause (ex-data e))}
                              (log/warn e "jwt_validation_failed"))
                            nil))]
          (if auth-data
            (handler (assoc request :identity (:identity auth-data)))
            {:status 401 :body {:erro "Token inválido ou expirado."}}))))))

(defn wrap-plataforma-admin
  "Guarda das rotas `/api/plataforma/*` — o painel do operador da plataforma.

   Autentica pelo mesmo JWT e depois exige a flag `plataforma_admin`. Papel de
   clínica não conta: `admin_clinica` é o administrador de UMA clínica, e o
   `wrap-checar-permissao` já lhe dá bypass dentro dela. Se o painel reusasse
   aquele caminho, todo admin de toda clínica cliente viraria operador da
   plataforma — que é o oposto do produto.

   ⚠️ A flag não se concede por endpoint nenhum. Ver a migration
   `20260815120000-plataforma-admin`.

   ⚠️ E ela **não** abre prontuário: `pode-ler-prontuarios?` não a consulta, e
   há teste garantindo. Operar o negócio e ler o registro clínico de um paciente
   de outra clínica são coisas diferentes, e a R-012 só permite a segunda ao
   psicólogo autor."
  [handler]
  (wrap-jwt-autenticacao
   (fn [request]
     (if (true? (get-in request [:identity :plataforma_admin]))
       (handler request)
       (do
         (log/warn "platform_access_denied")
         {:status 403 :body {:erro "Acesso restrito ao operador da plataforma."
                             :code "nao_e_operador_da_plataforma"}})))))

(defn tem-permissao?
  [papel-id nome-permissao]
  (boolean
   (and papel-id
        (execute-one!
         ["SELECT pp.permissao_id
             FROM papel_permissoes pp
             JOIN permissoes p ON pp.permissao_id = p.id
            WHERE pp.papel_id = ? AND p.nome_permissao = ?"
          papel-id nome-permissao]))))

(defn wrap-checar-permissao [handler nome-permissao-requerida]
  (fn [request]
    (let [papel-id (get-in request [:identity :papel_id])
          role     (get-in request [:identity :role])]
      (if-not papel-id
        {:status 403 :body {:erro "Identidade do usuário ou papel não encontrado na requisição."}}
        ;; Admin bypassa TODAS as permissões
        (if (= role "admin_clinica")
          (handler request)
          ;; Outros papéis: checa na tabela papel_permissoes
          (if (tem-permissao? papel-id nome-permissao-requerida)
              (handler request)
              {:status 403 :body {:erro (str "Usuário não tem a permissão necessária: " nome-permissao-requerida)}}))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Handlers (Lógica dos Endpoints)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- validar-fk-da-clinica
  "422 se `id-str` (vindo do corpo) não pertence à clínica; nil se ausente ou OK.

   🔴 T2.1 — generaliza a validação positiva que a `criar-agendamento-handler`
   já fazia. FK do corpo sem esta conferência deixa apontar sessão ou paciente
   para o psicólogo/paciente de OUTRA clínica: o `WHERE clinica_id` da linha-base
   não alcança o alvo do id, e o FK do banco só garante que a linha existe, não
   que ela é desta clínica. `tabela` é literal do código, nunca entrada do usuário."
  [clinica-id tabela id-str rotulo]
  (when-not (str/blank? id-str)
    (let [uuid (java.util.UUID/fromString id-str)]
      (when-not (execute-one! [(str "SELECT 1 FROM " tabela " WHERE id = ? AND clinica_id = ?")
                               uuid clinica-id])
        {:status 422
         :body {:erro (str rotulo " não pertence à clínica do usuário autenticado.")
                :code "fk_fora_da_clinica"}}))))

(defn health-check-handler [_]
  ;; Health check que só devolve 200 sem olhar o banco não é health check: a
  ;; aplicação continua "saudável" para o balanceador enquanto todas as
  ;; requisições reais falham.
  (try
    (execute-one! ["SELECT 1"])
    {:status 200 :headers {"Content-Type" "application/json"}
     :body {:status "ok" :banco "ok"}}
    (catch Exception e
      (log/error e "health_database_unavailable")
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

(defn- criar-clinica-e-admin!
  "Validação e criação de clínica + admin. Devolve resposta HTTP pronta.

   ⚠️ A autorização fica **fora** daqui de propósito, porque há dois caminhos
   legítimos e eles não se parecem: o endpoint público usa segredo no header —
   precisa funcionar antes de existir qualquer usuário para autenticar — e o
   painel da plataforma usa a flag do token de quem já está logado. Quem chama
   já decidiu que pode; esta função não decide nada sobre permissão.

   Extraída quando o painel de superadmin apareceu. Antes era o corpo do
   `provisionar-clinica-handler`, e duplicá-la significaria manter duas
   validações de senha e dois tratamentos de email repetido."
  [{:keys [nome_clinica limite_psicologos nome_admin email_admin senha_admin]}]
  (cond
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
      {:status 500 :body {:erro "Papel 'admin_clinica' não encontrado. Rode as migrations."}})))

(defn provisionar-clinica-handler
  "Provisionamento público, autorizado por segredo compartilhado no header."
  [request]
  (if-not (provisionamento-autorizado? request)
    (do
      (log/warn "provisioning_unauthorized")
      {:status 403 :body {:erro "Provisionamento não autorizado."
                          :code "provisionamento_nao_autorizado"}})
    (criar-clinica-e-admin! (:body request))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Painel do operador da plataforma
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; ⚠️ **Nada aqui devolve dado clínico.** Contagem de pacientes, sim; nome de
;; paciente, não; conteúdo de prontuário, jamais. Quem opera a plataforma
;; precisa saber quanto uma clínica usa para cobrar e para dimensionar — não
;; precisa saber quem ela atende, e a R-012 diz que não pode.
;;
;; É a linha que separa este painel de uma chave-mestra, e ela é fácil de
;; apagar por descuido: basta alguém acrescentar um `nome` num SELECT destes
;; porque "ficaria melhor na tela".

(defn plataforma-listar-clinicas-handler
  "Uma linha por clínica, com o quanto ela usa. Sem nome de paciente."
  [_request]
  {:status 200
   :body (execute-query!
          ;; `pagamento_automatico` está aqui porque é configuração invisível:
          ;; desligada, a clínica não fecha o próprio mês e a sincronização
          ;; responde zero sem que ninguém saiba por quê (A-026). Não é dado
          ;; clínico — é o modo de operação da conta.
          ["SELECT c.id, c.nome_da_clinica, c.limite_psicologos, c.timezone,
                   c.pagamento_automatico,
                   (SELECT count(*) FROM usuarios u WHERE u.clinica_id = c.id) AS usuarios,
                   (SELECT count(*) FROM pacientes p WHERE p.clinica_id = c.id) AS pacientes,
                   (SELECT count(*) FROM agendamentos a WHERE a.clinica_id = c.id) AS agendamentos
              FROM clinicas c
             ORDER BY c.nome_da_clinica"])})

(defn plataforma-metricas-handler
  "Totais da plataforma, para a primeira dobra do painel."
  [_request]
  {:status 200
   :body (execute-one!
          ["SELECT (SELECT count(*) FROM clinicas)     AS clinicas,
                   (SELECT count(*) FROM usuarios)     AS usuarios,
                   (SELECT count(*) FROM pacientes)    AS pacientes,
                   (SELECT count(*) FROM agendamentos) AS agendamentos,
                   (SELECT count(*) FROM usuarios WHERE plataforma_admin) AS operadores"])})

(defn plataforma-criar-clinica-handler
  "Cria clínica pelo painel. Mesma criação do endpoint público — o que muda é
   quem autorizou: aqui é a flag do token, lá é o segredo no header."
  [request]
  (criar-clinica-e-admin! (:body request)))

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
      (log/error e "login_password_hash_unreadable")
      false)))

;; A duração do token (e seu comentário longo) mudou-se para `sessao` junto com
;; a emissão de sessão; renovar-sessao-handler e login continuam lendo daqui por
;; este alias.
(def ^:private duracao-do-token-s sessao/duracao-do-token-s)

(def ^:private teto-da-sessao-s
  "🔴 O teto que impede a renovação de virar sessão eterna.

   Renovar sem teto transforma um token roubado em acesso permanente: bastaria
   renovar antes de cada expiração. Com o teto, o carimbo `sessao_iniciada_em`
   viaja de renovação em renovação e, passadas 12 h, a renovação é recusada e um
   login de verdade é exigido.

   📌 12 h cobre um dia de trabalho inteiro sem interromper ninguém, e ainda
   assim obriga a credencial a reaparecer uma vez por dia."
  (* 12 3600))

(defn login-handler [request]
  (let [{:keys [email senha]} (:body request)
        ;; Contador por IP+e-mail, liberado no sucesso (ver mais abaixo).
        chave-limite (str "login:" (limites/ip-do-request request) ":" email)]
    (if-let [usuario (execute-one! ["SELECT * FROM usuarios WHERE email = ?" email])]
      (do
        (if-let [papel (execute-one! ["SELECT nome_papel FROM papeis WHERE id = ?" (:papel_id usuario)])]
          (do
            (let [senha-valida (senha-confere? senha (:senha_hash usuario) (:id usuario))]
              (when senha-valida
                ;; Acertou a senha: zera o contador. Sem isso, quem errou
                ;; algumas vezes e depois acertou continuaria pagando pelas
                ;; tentativas anteriores até a janela vencer.
                (limites/liberar! chave-limite))
              (if senha-valida
                ;; 🔴 A emissão da sessão (claims + JWT + corpo) mudou-se para
                ;; `sessao/emitir-sessao`, uma verdade só, porque o login com
                ;; conta Google (auth-google) tem que devolver EXATAMENTE isto.
                ;; O `:email` do corpo passa a sair de `(:email usuario)` — valor
                ;; idêntico ao `email` digitado aqui, já que o SELECT casou por ele.
                (sessao/emitir-sessao usuario papel)
                {:status 401 :body {:erro "Credenciais inválidas."}})))
          (do
            (log/error "login_role_missing")
            {:status 500 :body {:erro "Erro de integridade: Papel do usuário não encontrado."}})))
      ;; Mesma resposta para usuário inexistente e senha errada: distinguir os
      ;; dois casos permite enumerar quem tem conta na plataforma.
      {:status 401 :body {:erro "Credenciais inválidas."}})))

(defn obter-perfil-proprio-handler [request]
  (let [usuario-id (get-in request [:identity :user_id])
        clinica-id (get-in request [:identity :clinica_id])]
    (if-let [usuario (execute-one! ["SELECT id, nome, email FROM usuarios WHERE id = ? AND clinica_id = ?"
                                    usuario-id clinica-id])]
      {:status 200 :body usuario}
      {:status 404 :body {:erro "Perfil não encontrado."}})))

(defn atualizar-perfil-proprio-handler [request]
  (let [usuario-id (get-in request [:identity :user_id])
        clinica-id (get-in request [:identity :clinica_id])
        nome (some-> (get-in request [:body :nome]) str str/trim)]
    (cond
      (str/blank? nome)
      {:status 422 :body {:erro "Informe o nome que deve aparecer na plataforma."
                          :code "display_name_required"}}

      (> (count nome) 120)
      {:status 422 :body {:erro "O nome de exibição deve ter no máximo 120 caracteres."
                          :code "display_name_too_long"}}

      :else
      (let [resultado (sql/update! @datasource :usuarios {:nome nome}
                                   {:id usuario-id :clinica_id clinica-id})]
        (if (zero? (:next.jdbc/update-count resultado))
          {:status 404 :body {:erro "Perfil não encontrado."}}
          {:status 200 :body (execute-one! ["SELECT id, nome, email FROM usuarios WHERE id = ? AND clinica_id = ?"
                                            usuario-id clinica-id])})))))

;; --- Handlers de Usuários ---
(defn criar-usuario-handler [request]
  (let [clinica-id-admin (get-in request [:identity :clinica_id])
        {:keys [nome email senha papel cpf telefone data_nascimento endereco crp registro_e_psi abordagem area_de_atuacao
                modalidade_repasse percentual_repasse valor_fixo_repasse]} (:body request)
        regra-repasse (when (or modalidade_repasse (some? percentual_repasse) (some? valor_fixo_repasse))
                        {:modalidade_repasse modalidade_repasse
                         :percentual_repasse percentual_repasse
                         :valor_fixo_repasse valor_fixo_repasse})]
    (cond
      (or (str/blank? nome) (str/blank? email) (str/blank? senha) (str/blank? papel))
      {:status 400, :body {:erro "Nome, email, senha e papel são obrigatórios."}}

      ;; 🔴 T1.4 — o mínimo de 8 que o provisionamento (`criar-clinica-e-admin!`)
      ;; e a CLI de resgate (`reset-senha!`) já exigem. Aqui só havia `str/blank?`,
      ;; então uma psicóloga nascia com senha de um caractere — porta de força
      ;; bruta aberta pelo mesmo cadastro que fecha as outras.
      (< (count (str senha)) 8)
      {:status 400, :body {:erro "A senha deve ter ao menos 8 caracteres."}}

      (execute-one! ["SELECT id FROM usuarios WHERE email = ?" email])
      {:status 409, :body {:erro "Email já cadastrado no sistema."}}

      ;; 🔴 T2.8(b) — a psicóloga precisa declarar a modalidade. Sem isto ela caía
      ;; no default silencioso do schema (`modalidade_repasse DEFAULT 'percentual'`,
      ;; `percentual DEFAULT 50`), e a régua de repasse de 50% ficava valendo sem
      ;; ninguém ter escolhido — erro que, pela trava `valor_repasse IS NULL`, só
      ;; se corrige por fora da API. A tela (`admin/psicologos/novo`) já manda o
      ;; campo como obrigatório; exigi-lo aqui alinha o backend ao contrato.
      (and (= papel "psicologo") (nil? regra-repasse))
      {:status 422 :body {:erro "Informe a modalidade de repasse da psicóloga (percentual ou fixo)."
                          :code "modalidade_repasse_obrigatoria"}}

      (and regra-repasse (not= papel "psicologo"))
      {:status 422 :body {:erro "Regra de repasse só pode ser definida para psicóloga."
                          :code "regra_repasse_papel_invalido"}}

      (and regra-repasse (remuneracao/validar-regra regra-repasse))
      {:status 422 :body {:erro (remuneracao/validar-regra regra-repasse)
                          :code "regra_repasse_invalida"}}

      :else
      (if-let [papel-id (:id (execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" papel]))]
        (let [novo-usuario (sql/insert! @datasource :usuarios
                                        (merge {:clinica_id clinica-id-admin
                                                :papel_id   papel-id
                                                :nome       nome
                                                :email      email
                                                :senha_hash (hashers/encrypt senha)
                                                :cpf cpf
                                                :telefone telefone
                                                :data_nascimento (dominio/data-de-formulario data_nascimento)
                                                :endereco endereco
                                                :crp crp
                                                :registro_e_psi registro_e_psi
                                                :abordagem abordagem
                                                :area_de_atuacao area_de_atuacao}
                                               (or regra-repasse {}))
                                        {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
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
    (if-let [usuario (execute-one! ["SELECT id, nome, email, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao,
                                           modalidade_repasse, percentual_repasse, valor_fixo_repasse
                                      FROM usuarios WHERE id = ? AND clinica_id = ?" usuario-id clinica-id])]
      {:status 200 :body usuario}
      {:status 404 :body {:erro "Usuário não encontrado nesta clínica."}})))

(defn atualizar-usuario-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [nome email senha cpf telefone data_nascimento endereco crp registro_e_psi abordagem area_de_atuacao
                modalidade_repasse percentual_repasse valor_fixo_repasse]} (:body request)
        campos-repasse? (or modalidade_repasse (some? percentual_repasse) (some? valor_fixo_repasse))
        regra-repasse (when campos-repasse?
                        {:modalidade_repasse modalidade_repasse
                         :percentual_repasse percentual_repasse
                         :valor_fixo_repasse valor_fixo_repasse})]
    (cond
      (and (str/blank? nome) (str/blank? email) (str/blank? senha) (not campos-repasse?))
      {:status 400 :body {:erro "Pelo menos um campo (nome, email ou senha) deve ser fornecido para atualização."}}

      ;; 🔴 T1.4 — mesmo piso de 8 caracteres do criar. Só troca de senha (não em
      ;; branco) é conferida; ausência de senha aqui significa "não mexer nela".
      (and (not (str/blank? senha)) (< (count (str senha)) 8))
      {:status 400 :body {:erro "A senha deve ter ao menos 8 caracteres."}}

      (and email (execute-one! ["SELECT id FROM usuarios WHERE email = ? AND id != ?" email usuario-id]))
      {:status 409 :body {:erro "O email fornecido já está em uso por outro usuário."}}

      (and regra-repasse (remuneracao/validar-regra regra-repasse))
      {:status 422 :body {:erro (remuneracao/validar-regra regra-repasse)
                          :code "regra_repasse_invalida"}}

      :else
      (let [update-map (cond-> {}
                         (not (str/blank? nome)) (assoc :nome nome)
                         (not (str/blank? email)) (assoc :email email)
                         (not (str/blank? senha)) (assoc :senha_hash (hashers/encrypt senha))
                         (some? cpf) (assoc :cpf cpf)
                         (some? telefone) (assoc :telefone telefone)
                         (some? data_nascimento) (assoc :data_nascimento (dominio/data-de-formulario data_nascimento))
                         (some? endereco) (assoc :endereco endereco)
                         (some? crp) (assoc :crp crp)
                         (some? registro_e_psi) (assoc :registro_e_psi registro_e_psi)
                         (some? abordagem) (assoc :abordagem abordagem)
                         (some? area_de_atuacao) (assoc :area_de_atuacao area_de_atuacao)
                         regra-repasse (merge regra-repasse))
            resultado (sql/update! @datasource :usuarios update-map {:id usuario-id :clinica_id clinica-id})]
        (if (zero? (:next.jdbc/update-count resultado))
          {:status 404 :body {:erro "Usuário não encontrado nesta clínica ou nenhum dado foi alterado."}}
          (let [usuario-atualizado (execute-one! ["SELECT id, nome, email, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao,
                                                         modalidade_repasse, percentual_repasse, valor_fixo_repasse
                                                    FROM usuarios WHERE id = ?" usuario-id])]
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
                             ["SELECT id, nome, email, clinica_id, papel_id, cpf, telefone, data_nascimento, endereco, crp, registro_e_psi, abordagem, area_de_atuacao,
                                      modalidade_repasse, percentual_repasse, valor_fixo_repasse
                                 FROM usuarios WHERE clinica_id = ? AND papel_id = ?"
                              clinica-id papel-psicologo-id])]
            {:status 200 :body psicologos}))))))

;; --- Handlers de Pacientes ---
(defn criar-paciente-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        ;; Extrair o novo campo psicologo_id e campos clínicos
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id historico_familiar uso_medicamentos diagnostico contatos_emergencia status
                cpf cep logradouro numero complemento bairro cidade uf]} (:body request)
        ;; 🔴 Só dígitos, sempre. O banco tem CHECK e UNIQUE sobre a forma
        ;; limpa — máscara aqui viraria dois cadastros para a mesma pessoa,
        ;; porque `123.456.789-09` e `12345678909` não colidem no UNIQUE.
        cpf-limpo (not-empty (dominio/digitos cpf))
        cep-limpo (not-empty (dominio/digitos cep))
        ;; 🔴 T2.1 — calculada uma vez; a psicóloga vinculada tem que ser desta clínica.
        fk-psicologo-erro (validar-fk-da-clinica clinica-id "usuarios" psicologo_id "Psicólogo(a)")]
    (cond
      ;; ⚠️ O CPF é conferido pelos DÍGITOS VERIFICADORES, não pelo formato.
      ;; Formato certo com dígito errado é o caso comum de digitação trocada, e
      ;; é justamente o que uma checagem de formato deixa passar.
      (and cpf-limpo (not (dominio/cpf-valido? cpf-limpo)))
      {:status 422 :body {:erro "CPF inválido — confira os números."
                          :code "cpf_invalido"}}

      ;; O ViaCEP diz se o CEP EXISTE; aqui só conferimos se tem forma de CEP.
      ;; O servidor não pode depender de API de terceiro para aceitar cadastro:
      ;; com o ViaCEP fora, a psicóloga ainda precisa salvar a paciente.
      (not (dominio/cep-valido? cep))
      {:status 422 :body {:erro "CEP deve ter 8 dígitos." :code "cep_invalido"}}

      ;; 🔴 T2.1 — a psicóloga vinculada tem que ser DESTA clínica. Sem isto, o
      ;; corpo apontava o paciente para uma psicóloga de outro tenant.
      fk-psicologo-erro fk-psicologo-erro

      :else
      (let [novo-paciente (sql/insert! @datasource :pacientes
                                       {:clinica_id      clinica-id
                                        :nome            nome
                                        ;; 🔴 `""` colide no UNIQUE (email, clinica_id); `NULL` não.
                                        ;; Sem isto a clínica só cadastrava UM paciente sem e-mail.
                                        :email           (dominio/texto-de-formulario email)
                                        :telefone        telefone
                                        :data_nascimento (dominio/data-de-formulario data_nascimento)
                                        :endereco        endereco
                                        :avatar_url      avatar_url
                                        :psicologo_id    (dominio/uuid-de-formulario psicologo_id)
                                        :historico_familiar historico_familiar
                                        :uso_medicamentos   uso_medicamentos
                                        :diagnostico        diagnostico
                                        :contatos_emergencia contatos_emergencia
                                        :cpf             cpf-limpo
                                        :cep             cep-limpo
                                        :logradouro      (dominio/texto-de-formulario logradouro)
                                        :numero          (dominio/texto-de-formulario numero)
                                        :complemento     (dominio/texto-de-formulario complemento)
                                        :bairro          (dominio/texto-de-formulario bairro)
                                        :cidade          (dominio/texto-de-formulario cidade)
                                        :uf              (some-> (dominio/texto-de-formulario uf) str/upper-case)
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
                          LEFT JOIN usuarios u ON p.psicologo_id = u.id AND u.clinica_id = p.clinica_id
                          WHERE p.clinica_id = ?" clinica-id])
                      ;; Se for psicólogo, busca apenas os seus pacientes
                      (execute-query! 
                        ["SELECT p.*, u.nome as nome_psicologo
                          FROM pacientes p
                          LEFT JOIN usuarios u ON p.psicologo_id = u.id AND u.clinica_id = p.clinica_id
                          WHERE p.clinica_id = ? AND p.psicologo_id = ?" clinica-id user-id]))]
      {:status 200 :body pacientes})))

;; ESBOÇO DOS PRÓXIMOS HANDLERS DE PACIENTES
(defn obter-paciente-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [paciente (execute-one! ["SELECT * FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-id clinica-id])]
      ;; 🔴 T2.2 — ler por id precisa da MESMA guarda de dono que listar/editar/
      ;; excluir já têm. Sem ela, um `SELECT *` traz diagnóstico, medicação e
      ;; histórico do paciente de outra psicóloga da mesma clínica — a psicóloga
      ;; transferida guarda o UUID e continua lendo. Admin e secretário alcançam
      ;; a clínica inteira (é o desenho); a psicóloga, só a própria carteira.
      (if (and (= papel "psicologo") (not= (:psicologo_id paciente) usuario-id))
        {:status 403 :body {:erro "Você só pode ver pacientes vinculados a você."}}
        {:status 200 :body paciente})
      {:status 404 :body {:erro "Paciente não encontrado nesta clínica."}})))

(defn atualizar-paciente-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        paciente-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [nome email telefone data_nascimento endereco avatar_url psicologo_id historico_familiar uso_medicamentos diagnostico contatos_emergencia status nota_fiscal origem vencimento_pagamento tipo_pagamento
                cpf cep logradouro numero complemento bairro cidade uf]} (:body request)
        ;; Mesma limpeza da criação. Máscara aqui viraria dois cadastros para a
        ;; mesma pessoa — o UNIQUE do banco é sobre a forma limpa.
        cpf-limpo (when (some? cpf) (not-empty (dominio/digitos cpf)))
        cep-limpo (when (some? cep) (not-empty (dominio/digitos cep)))
        ;; 🔴 T2.1 — reatribuir a psicóloga não pode atravessar tenant.
        fk-psicologo-erro (validar-fk-da-clinica clinica-id "usuarios" psicologo_id "Psicólogo(a)")]

    ;; Verificação de Propriedade para Psicólogos
    (if (and (= papel "psicologo")
             (not (execute-one! ["SELECT id FROM pacientes WHERE id = ? AND psicologo_id = ?" paciente-id usuario-id])))
      {:status 403 :body {:erro "Você só pode editar pacientes vinculados a você."}}
      
      (cond
        (and (some? nome) (str/blank? nome))
        {:status 400 :body {:erro "O campo nome não pode estar em branco."}}

        ;; ⚠️ Mesmas guardas da criação, e repetidas de propósito. Este é o
        ;; SEGUNDO caminho que grava CPF, e a assimetria entre dois caminhos —
        ;; um validado, outro não — é o defeito que este projeto já pagou mais de
        ;; uma vez ("dois caminhos, um consertado").
        (and cpf-limpo (not (dominio/cpf-valido? cpf-limpo)))
        {:status 422 :body {:erro "CPF inválido — confira os números." :code "cpf_invalido"}}

        (and (some? cep) (not (dominio/cep-valido? cep)))
        {:status 422 :body {:erro "CEP deve ter 8 dígitos." :code "cep_invalido"}}

        ;; O UNIQUE do banco recusaria de qualquer forma, mas com erro de driver.
        ;; Aqui a recusa sai legível e diz de quem é o CPF conflitante.
        (and cpf-limpo
             (execute-one! ["SELECT id FROM pacientes WHERE cpf = ? AND clinica_id = ? AND id != ?"
                            cpf-limpo clinica-id paciente-id]))
        {:status 409 :body {:erro "Este CPF já está cadastrado em outro paciente desta clínica."
                            :code "cpf_duplicado"}}

        (and email (not (str/blank? email))
             (execute-one! ["SELECT id FROM pacientes WHERE email = ? AND clinica_id = ? AND id != ?" email clinica-id paciente-id]))
        {:status 409 :body {:erro "O email fornecido já está em uso por outro paciente nesta clínica."}}

        fk-psicologo-erro fk-psicologo-erro

        :else
        (let [update-map (cond-> {}
                           (some? nome) (assoc :nome nome)
                           (some? email) (assoc :email (dominio/texto-de-formulario email))
                           (some? telefone) (assoc :telefone telefone)
                           (some? data_nascimento) (assoc :data_nascimento (dominio/data-de-formulario data_nascimento))
                           (some? endereco) (assoc :endereco endereco)
                           (some? cpf) (assoc :cpf cpf-limpo)
                           (some? cep) (assoc :cep cep-limpo)
                           (some? logradouro) (assoc :logradouro (dominio/texto-de-formulario logradouro))
                           (some? numero) (assoc :numero (dominio/texto-de-formulario numero))
                           (some? complemento) (assoc :complemento (dominio/texto-de-formulario complemento))
                           (some? bairro) (assoc :bairro (dominio/texto-de-formulario bairro))
                           (some? cidade) (assoc :cidade (dominio/texto-de-formulario cidade))
                           (some? uf) (assoc :uf (some-> (dominio/texto-de-formulario uf) str/upper-case))
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
          papel (get-in request [:identity :role])
          ;; Lista branca também é a guarda financeira da criação: campos como
          ;; status_pagamento, valor_repasse e status_repasse não entram aqui,
          ;; portanto ninguém cria uma sessão já paga. Se algum deles passar a
          ;; ser aceito, precisa receber a mesma permissão por campo do update.
          {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta duracao recorrencia_tipo quantidade_recorrencia force observacoes]} (:body request)]
      (cond
        (or (nil? paciente_id) (nil? psicologo_id) (nil? data_hora_sessao))
        {:status 400, :body {:erro "paciente_id, psicologo_id e data_hora_sessao são obrigatórios."}}

        (and force (not= papel "admin_clinica"))
        {:status 403
         :body {:erro "Apenas o administrador da clínica pode forçar um agendamento com conflito."
                :code "force_requires_admin"}}

        :else
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

              ;; 🔴 `AND tipo = 'bloqueio'` não é filtro de conveniência: sem ele,
              ;; um horário que a psicóloga OFERECEU (D-024, `tipo = 'disponivel'`,
              ;; mesma tabela com o sinal invertido) passaria a IMPEDIR o
              ;; agendamento. É a forma da GC-009 acontecendo dentro do nosso
              ;; banco, e o sintoma seria uma ausência: sem erro, sem log.
              bloqueio-existente (some (fn [{:keys [start end]}]
                                         (execute-one! ["SELECT id FROM bloqueios_agenda
                                                         WHERE clinica_id = ?
                                                         AND psicologo_id = ?
                                                         AND tipo = 'bloqueio'
                                                         AND data_inicio < ?::timestamp
                                                         AND data_fim > ?::timestamp"
                                                        clinica-id psicologo-uuid end start]))
                                       sessoes-para-criar)

              agendamento-conflitante (when (not force)
                                        (let [conflicts (doall (map (fn [{:keys [start end]}]
                                                (execute-one! ["SELECT id, data_hora_sessao, duracao FROM agendamentos
                                                                WHERE clinica_id = ? 
                                                                AND psicologo_id = ?
                                                                AND status != 'cancelado'
                                                                AND data_hora_sessao < ?::timestamp
                                                                AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?::timestamp"
                                                               clinica-id psicologo-uuid end start]))
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
                ;; Outbox (D8): a intenção de sincronizar commita com a sessão ou
                ;; não commita nada. Só enfileira quem tem conexão Google ativa —
                ;; a regra mora no `outbox`, para esta chamada ser uma linha.
                (outbox/enfileirar-agendamentos-criados! tx clinica-id psicologo-uuid novos-agendamentos)
                {:status 201, :body (first novos-agendamentos)}))))))
    (catch Exception e
      (log/error e "appointment_create_failed")
      {:status 500 :body {:erro "Erro interno."}})))


(defn obter-agendamento-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))]
    (if-let [agendamento (execute-one! ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])]
      ;; 🔴 T2.2 — mesma regra da listagem: admin/secretário veem a clínica
      ;; inteira, a psicóloga só as próprias. 404 (e não 403) para não confirmar a
      ;; existência de uma sessão que não é dela.
      (if (and (not (contains? #{"admin_clinica" "secretario"} papel))
               (not= (:psicologo_id agendamento) usuario-id))
        {:status 404 :body {:erro "Agendamento não encontrado."}}
        {:status 200 :body agendamento})
      {:status 404 :body {:erro "Agendamento não encontrado."}})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; R-004 — passado é imutável
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; As duas peças abaixo são o que separa a edição de série do passado. Ver
;; docs/REGRAS_DE_NEGOCIO.md (R-004), os achados A-001 e A-002 em
;; docs/REVISAO_PRE_PRODUCAO.md e a reprodução em
;; docs/reproducoes/serie_reescreve_passado.sql.

(def ^:private filtro-do-passado
  "Tira do conjunto o que já aconteceu. Vale para os dois modos de série.

   Dois critérios porque cada um pega o que o outro deixa passar: a data pega a
   ocorrência que já passou e ainda não foi sincronizada para `realizado`
   (a sincronização roda no boot e ao abrir o Financeiro, não continuamente), e
   o status pega a que foi marcada como realizada sem que a hora tenha chegado.

   Fica como string concatenada, e não como cláusula montada, porque não tem
   parâmetro: `now()` é avaliado pelo banco, na mesma transação do UPDATE."
  " AND data_hora_sessao >= now()
    AND (status IS NULL OR status <> 'realizado')")

(def ^:private filtro-sem-dinheiro
  "A outra metade do corte da **R-021**, a que o `filtro-do-passado` não cobre:
   sessão sem dinheiro associado.

   🔴 Por que não basta o filtro do passado. A R-021 protege por *\"já aconteceu
   OU tem dinheiro\"*, e avisa em letras garrafais que escrever o corte como
   `data < now()` é errado — foi o erro da A-002. Uma sessão FUTURA **adiantada**
   (paga antes da data) tem `data_hora_sessao >= now()` e `status <> 'realizado'`,
   então escaparia pelo filtro do passado; é o dinheiro que a protege. Juntos,
   `filtro-do-passado` + este definem a ocorrência que a R-021 deixa apagar.

   Fica como string concatenável, sem parâmetro, igual ao irmão."
  " AND (status_pagamento IS NULL OR status_pagamento <> 'pago')
    AND valor_repasse IS NULL")

(defn- escopo-de-remocao
  "[where-sql params] das ocorrências que o `mode` pede para apagar. O `where`
   é reusado tanto para levantar as protegidas quanto para o DELETE, de modo que
   as duas consultas nunca discordem sobre qual é o conjunto."
  [mode clinica-id agendamento-id recorrencia-id data-sessao]
  (cond
    (and (= mode "all_future") recorrencia-id)
    ["clinica_id = ? AND recorrencia_id = ? AND data_hora_sessao >= ?"
     [clinica-id recorrencia-id data-sessao]]

    (and (= mode "all") recorrencia-id)
    ["clinica_id = ? AND recorrencia_id = ?"
     [clinica-id recorrencia-id]]

    :else
    ["clinica_id = ? AND id = ?"
     [clinica-id agendamento-id]]))

(defn- sessoes-protegidas-da-r021
  "As ocorrências do escopo que a R-021 NÃO deixa apagar: já aconteceram ou têm
   dinheiro. Definidas exatamente como a negação de \"apagável\" — o conjunto que
   sobra quando se tira do escopo o que passa por `filtro-do-passado` E
   `filtro-sem-dinheiro`. Escrever a negação em cima das duas constantes garante
   que edição e exclusão continuem lendo o mesmo corte."
  [where params fuso]
  (let [protegidas (execute-query!
                    (into [(str "SELECT id, data_hora_sessao FROM agendamentos"
                                " WHERE " where
                                " AND NOT (TRUE" filtro-do-passado filtro-sem-dinheiro ")")]
                          params))]
    (mapv (fn [{:keys [id data_hora_sessao]}]
            {:id id
             :data_hora_sessao (.format (tempo/->zdt data_hora_sessao fuso)
                                        java.time.format.DateTimeFormatter/ISO_OFFSET_DATE_TIME)})
          protegidas)))

(defn- valor-para-a-serie
  "O `valor_consulta` a gravar nas ocorrências de uma série — ou nil para não
   tocar na coluna.

   ⚠️ Devolver nil é o ponto. A versão anterior era

       (if (= status \"cancelado\") 0 (or valor_consulta (:valor_consulta agendamento-atual)))

   que **nunca** dá nil: sem valor no corpo da requisição, caía no valor do
   agendamento aberto. Como o `cond->` adiante só testa `some?`, o
   `valor_consulta` era gravado em toda ocorrência do conjunto, em toda edição
   — inclusive quando o usuário só queria mudar o horário. Era essa a metade
   cara da A-001: o horário mudava à vista, o dinheiro mudava calado.

   Agora só grava quando alguém pediu: valor no corpo, ou cancelamento, que
   zera por regra."
  [status valor_consulta]
  (cond
    (= status "cancelado") 0
    (some? valor_consulta) valor_consulta
    :else nil))

(defn- guarda-conflito-serie
  "T1.2 — as MESMAS duas guardas do ramo individual, aplicadas a cada ocorrência
   de série cuja OCUPAÇÃO de fato muda (horário, psicóloga ou duração). Devolve a
   resposta 409 do primeiro impedimento, ou nil se está livre.

   Espelha o individual e a criação, ponto a ponto:
   - **bloqueio recusa sempre** — nem o admin força a agenda fechada de alguém
     (R-020), então a checagem de bloqueio ignora `force`, e o filtro
     `tipo = 'bloqueio'` deixa a janela OFERECIDA (D-024) passar;
   - **conflito de sessão recusa quando não há `force`** — e `force` já exigiu
     admin no topo do handler (R-006/R-020). O conflito exclui a própria série
     (`recorrencia_id <> ?`): as ocorrências não colidem entre si nem com a
     posição de onde estão saindo.

   ⚠️ Só verifica a ocorrência que muda DE FATO — a lição da A-011: a tela reenvia
   todos os campos, e checar por PRESENÇA em vez de por MUDANÇA travaria uma série
   que só teve o status editado, ou uma que já convive com um bloqueio."
  [ocorrencias {:keys [clinica-id fuso data_hora_sessao psicologo_id duracao recorrencia-id force]}]
  (let [janela (fn [occ]
                 (let [novo-psi   (if psicologo_id (java.util.UUID/fromString psicologo_id) (:psicologo_id occ))
                       nova-dur   (or duracao (:duracao occ) 50)
                       atual-zdt  (tempo/->zdt (:data_hora_sessao occ) fuso)
                       inicio-zdt (if data_hora_sessao
                                    (tempo/com-horario-de (:data_hora_sessao occ) data_hora_sessao fuso)
                                    atual-zdt)
                       mudou? (or (not= novo-psi (:psicologo_id occ))
                                  (not= (long nova-dur) (long (or (:duracao occ) 50)))
                                  (not (.isEqual inicio-zdt atual-zdt)))]
                   (when mudou?
                     {:psi    novo-psi
                      :inicio (tempo/->sql inicio-zdt)
                      :fim    (tempo/->sql (tempo/mais-minutos inicio-zdt nova-dur))})))
        janelas  (keep janela ocorrencias)
        bloqueio (some (fn [{:keys [psi inicio fim]}]
                         (execute-one! ["SELECT id FROM bloqueios_agenda
                                          WHERE clinica_id = ? AND psicologo_id = ?
                                            AND tipo = 'bloqueio'
                                            AND data_inicio < ?::timestamp AND data_fim > ?::timestamp"
                                        clinica-id psi fim inicio]))
                       janelas)
        conflito (when-not force
                   (some (fn [{:keys [psi inicio fim]}]
                           (execute-one! ["SELECT id FROM agendamentos
                                            WHERE clinica_id = ? AND psicologo_id = ?
                                              AND status != 'cancelado'
                                              AND (recorrencia_id IS NULL OR recorrencia_id <> ?)
                                              AND data_hora_sessao < ?::timestamp
                                              AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?::timestamp"
                                          clinica-id psi recorrencia-id fim inicio]))
                         janelas))]
    (cond
      bloqueio {:status 409 :body {:erro "Não é possível alterar para este horário. O período está bloqueado."
                                   :code "block_conflict"}}
      conflito {:status 409 :body {:erro "Já existe um agendamento neste horário."
                                   :code "appointment_conflict"}}
      :else nil)))

(defn atualizar-agendamento-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          papel-id (get-in request [:identity :papel_id])
          papel (get-in request [:identity :role])
          agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))
          {:keys [paciente_id psicologo_id data_hora_sessao valor_consulta duracao status mode observacoes
                  status_pagamento valor_repasse status_repasse force]} (:body request)
          altera-financeiro? (some some? [status_pagamento valor_repasse status_repasse])]

      (cond
        (some? valor_repasse)
        {:status 422
         :body {:erro "valor_repasse é calculado pelo servidor a partir da regra da psicóloga."
                :code "repasse_calculado_pelo_servidor"}}

        (and altera-financeiro?
             (not (tem-permissao? papel-id "gerenciar_pagamentos")))
        {:status 403
         :body {:erro "Usuário não tem permissão para alterar pagamentos ou repasses."
                :code "payment_permission_required"}}

        :else
        ;; R-020 (1) — *"o admin sempre tem força"*, e o Gabriel confirmou que
        ;; vale também aqui, no caminho de atualização, onde o campo não existia.
        ;;
        ;; A checagem é idêntica à da criação, de propósito: mesma condição,
        ;; mesmo `code`, mesma frase. Quem forja um `force: true` no corpo sem
        ;; ser admin leva 403 nos dois caminhos, e a tela lê um contrato só.
        (if (and force (not= papel "admin_clinica"))
          {:status 403
           :body {:erro "Apenas o administrador da clínica pode forçar um agendamento com conflito."
                  :code "force_requires_admin"}}

        (if-let [erro-de-dominio (dominio/validar (:body request))]
        ;; Sem esta checagem o backend gravava qualquer string nas colunas de
        ;; estado. Foi assim que `status_repasse` acabou com cinco valores de
        ;; três vocabulários diferentes na mesma coluna.
        {:status 422 :body {:erro erro-de-dominio :code "valor_de_dominio_invalido"}}

        (if-let [agendamento-atual (execute-one! ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])]
        ;; 🔴 T2.1 — antes dos três modos: paciente/psicólogo do corpo precisam ser
        ;; DESTA clínica. Vale para individual e série, um lugar só.
        (if-let [fk-erro (or (validar-fk-da-clinica clinica-id "pacientes" paciente_id "Paciente")
                             (validar-fk-da-clinica clinica-id "usuarios" psicologo_id "Psicólogo(a)"))]
          fk-erro
          (cond
          (= mode "all_future")
          (if-let [recorrencia-id (:recorrencia_id agendamento-atual)]
             (let [novo-duracao (or duracao (:duracao agendamento-atual) 50)
                   novo-valor (valor-para-a-serie status valor_consulta)
                   fuso (fuso-da-clinica clinica-id)

                   ;; Desta ocorrência em diante — e nunca para trás de agora.
                   ;; Os DOIS cortes, não um ou outro: só a data da ocorrência
                   ;; deixava "esta e as seguintes", aberta numa sessão antiga,
                   ;; alcançar meses de sessões já realizadas (A-002); só
                   ;; `now()` faria o modo pegar a série inteira sempre que ela
                   ;; estivesse toda no futuro, que é o caso comum — deixaria de
                   ;; ser "esta e as seguintes".
                   ;; psicologo_id e duracao entram no SELECT porque a guarda de
                   ;; conflito da T1.2 precisa da ocupação atual de cada ocorrência.
                   agendamentos-futuros (execute-query! [(str "SELECT id, data_hora_sessao, psicologo_id, duracao FROM agendamentos
                                                    WHERE recorrencia_id = ?
                                                    AND data_hora_sessao >= ?
                                                    AND clinica_id = ?"
                                                              filtro-do-passado)
                                                   recorrencia-id (:data_hora_sessao agendamento-atual) clinica-id])]

               ;; 🔴 T1.2 — a série passa pelas mesmas guardas do individual ANTES
               ;; de gravar. Sem isto, mover a série para cima de sessão ou de
               ;; bloqueio passava calado.
               (if-let [erro (guarda-conflito-serie agendamentos-futuros
                                                    {:clinica-id clinica-id :fuso fuso
                                                     :data_hora_sessao data_hora_sessao
                                                     :psicologo_id psicologo_id :duracao duracao
                                                     :recorrencia-id recorrencia-id :force force})]
                 erro
                 (do
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

                   {:status 200 :body {:message (str (count agendamentos-futuros) " agendamentos atualizados com sucesso.")}})))

             {:status 400 :body {:erro "Agendamento não é recorrente."}})

          (= mode "all")
          (if-let [recorrencia-id (:recorrencia_id agendamento-atual)]
             (let [novo-duracao (or duracao (:duracao agendamento-atual) 50)
                   novo-valor (valor-para-a-serie status valor_consulta)
                   fuso (fuso-da-clinica clinica-id)

                   ;; "A série toda" é a série toda que ainda vai acontecer.
                   ;; Sem o filtro, este SELECT pegava as ocorrências já
                   ;; realizadas e pagas junto (A-001).
                   todos-agendamentos (execute-query! [(str "SELECT id, data_hora_sessao, psicologo_id, duracao FROM agendamentos
                                                    WHERE recorrencia_id = ?
                                                    AND clinica_id = ?"
                                                            filtro-do-passado)
                                                   recorrencia-id clinica-id])]

               ;; 🔴 T1.2 — mesma guarda do all_future antes de gravar.
               (if-let [erro (guarda-conflito-serie todos-agendamentos
                                                    {:clinica-id clinica-id :fuso fuso
                                                     :data_hora_sessao data_hora_sessao
                                                     :psicologo_id psicologo_id :duracao duracao
                                                     :recorrencia-id recorrencia-id :force force})]
                 erro
                 (do
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

                   {:status 200 :body {:message (str (count todos-agendamentos) " agendamentos atualizados com sucesso.")}})))

             {:status 400 :body {:erro "Agendamento não é recorrente."}})

          :else ;; Default: Single update (existing logic)
        (let [fuso (fuso-da-clinica clinica-id)
              ;; Determinar dados finais para validação de bloqueio
              novo-data-zdt (tempo/->zdt (or data_hora_sessao (:data_hora_sessao agendamento-atual)) fuso)
              novo-data (tempo/->sql novo-data-zdt)
              novo-duracao (or duracao (:duracao agendamento-atual) 50)
              novo-psicologo-uuid (if psicologo_id (java.util.UUID/fromString psicologo_id) (:psicologo_id agendamento-atual))

              ;; Calcular fim da sessão
              novo-fim-zdt (tempo/mais-minutos novo-data-zdt novo-duracao)
              novo-fim (tempo/->sql novo-fim-zdt)

              ;; Presença é confirmação humana. Nem a passagem do relógio nem
              ;; uma chamada forjada podem dizer que uma sessão futura ocorreu.
              realizacao-antecipada? (and (= status "realizado")
                                          (.isAfter novo-fim-zdt (java.time.ZonedDateTime/now (.getZone novo-data-zdt))))
              pagamento-automatico? (and (= status "realizado")
                                          (not= "pago" (:status_pagamento agendamento-atual))
                                          (boolean (:pagamento_automatico
                                                    (execute-one! ["SELECT pagamento_automatico FROM clinicas WHERE id = ?"
                                                                   clinica-id]))))
              
              ;; ⚠️ A-011 — a diferença entre PRESENÇA e MUDANÇA, que é o defeito inteiro.
              ;;
              ;; O comentário que estava aqui dizia que a checagem "dispara quando
              ;; o intervalo ou o dono mudam". A condição abaixo dele testava
              ;; `(some? data_hora_sessao)` — ou seja, se o campo **veio no
              ;; corpo**. Não é a mesma coisa, e a diferença é exatamente o que
              ;; separa a API da tela:
              ;;
              ;;   - o teste-guarda manda UM campo  -> `{:status_pagamento "pago"}`  -> passava
              ;;   - o formulário do admin manda TUDO, sempre                        -> 409
              ;;
              ;; O `agendamentoSchema` de `src/app/admin/agendamentos/actions.ts`
              ;; **exige** `psicologo_id` e `data_hora_sessao`. Então marcar
              ;; pagamento pela tela, numa sessão que a própria clínica sobrepôs
              ;; com `force`, batia em 409 — o caso que o teste jurava proteger.
              ;;
              ;; Agora compara VALOR com VALOR. `.isEqual` compara instantes, não
              ;; representações: a mesma hora vinda como string de parede e como
              ;; TIMESTAMPTZ lido do banco tem que dar "não mudou".
              atual-data-zdt (tempo/->zdt (:data_hora_sessao agendamento-atual) fuso)
              mudou-horario? (not (.isEqual novo-data-zdt atual-data-zdt))
              mudou-duracao? (not= (long novo-duracao) (long (or (:duracao agendamento-atual) 50)))
              mudou-psicologo? (not= novo-psicologo-uuid (:psicologo_id agendamento-atual))

              ;; "Quem ocupa qual intervalo." É a única coisa que as duas guardas
              ;; abaixo protegem — dinheiro, status e observações não mexem nisso.
              mudou-ocupacao? (or mudou-horario? mudou-duracao? mudou-psicologo?)

              ;; O bloqueio também passa a ser checado só quando a ocupação muda.
              ;; Antes rodava SEMPRE — nem o `when` da outra ele tinha. Uma sessão
              ;; cancelada dentro de um bloqueio (a criação de bloqueio ignora
              ;; canceladas) ficava impossível de editar pela tela: corrigir o
              ;; valor, anotar o motivo ou DESFAZER o cancelamento, tudo 409.
              ;;
              ;; ⚠️ `force` NÃO passa por cima de bloqueio, aqui nem na criação.
              ;; Lá a checagem de bloqueio vem antes do `force` no mesmo `cond`.
              ;; Mantido igual de propósito: a R-020 deu ao admin força sobre
              ;; conflito de agenda, não sobre a agenda fechada de alguém.
              ;; 🔴 Mesmo filtro da criação, e pelo mesmo motivo: janela oferecida
              ;; (`tipo = 'disponivel'`, D-024) não impede remanejar sessão para
              ;; dentro dela — impedir seria o oposto exato do que ela significa.
              bloqueio-existente (when mudou-ocupacao?
                                   (execute-one! ["SELECT id FROM bloqueios_agenda
                                                  WHERE clinica_id = ?
                                                  AND psicologo_id = ?
                                                  AND tipo = 'bloqueio'
                                                  AND data_inicio < ?::timestamp
                                                  AND data_fim > ?::timestamp"
                                                 clinica-id novo-psicologo-uuid novo-fim novo-data]))

              agendamento-conflitante (when (and mudou-ocupacao? (not force))
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
                           (some? (:status_repasse (:body request))) (assoc :status_repasse (:status_repasse (:body request)))
                           (and pagamento-automatico? (not (some? (:status_pagamento (:body request)))))
                           (assoc :status_pagamento "pago"
                                  :status_pagamento_origem "automatico")
                           (some? (:status_pagamento (:body request)))
                           (assoc :status_pagamento (:status_pagamento (:body request))
                                  :status_pagamento_origem "manual"))]
          
          (cond
            realizacao-antecipada?
            {:status 422 :body {:erro "A sessão só pode ser marcada como realizada depois do horário de término."
                                :code "session_not_finished"}}

            ;; Os dois 409 passam a nomear o motivo, como a criação já fazia.
            ;; Sem `code` a tela não distingue "conflito, te ofereço forçar" de
            ;; "deu erro" — e o botão de forçar da A-009 não teria onde existir
            ;; no caminho de edição.
            bloqueio-existente
            {:status 409 :body {:erro "Não é possível alterar para este horário. O período está bloqueado."
                                :code "block_conflict"}}
            
            agendamento-conflitante
            {:status 409 :body {:erro "Já existe um agendamento neste horário."
                                :code "appointment_conflict"}}

            :else
            (let [resultado (sql/update! @datasource :agendamentos update-map {:id agendamento-id :clinica_id clinica-id})]
              (if (zero? (:next.jdbc/update-count resultado))
                {:status 500 :body {:erro "Erro ao atualizar agendamento."}}
                (do
                  ;; A R-023 só nasce quando a sessão está realizada e no
                  ;; passado. A função é idempotente: se já há snapshot, mudar
                  ;; a configuração da psicóloga não toca neste valor (R-004).
                  (remuneracao/calcular-pendentes! clinica-id)
                  (let [agendamento-atualizado (execute-one! ["SELECT * FROM agendamentos WHERE id = ?" agendamento-id])]
                    ;; O último `)` fecha o (if-let [fk-erro ...]) da T2.1.
                    {:status 200 :body agendamento-atualizado}))))))))
          {:status 404 :body {:erro "Agendamento não encontrado."}})))))
    (catch Exception e
      (log/error e "appointment_update_failed")
      {:status 500 :body {:erro "Erro interno."}})))


(defn remover-agendamento-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          agendamento-id (java.util.UUID/fromString (get-in request [:params :id]))
          mode (get-in request [:query-params "mode"])]
      
      (if-let [agendamento (execute-one! ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?" agendamento-id clinica-id])]
        ;; 🔴 R-021 (T1.1) — apagar não pode alcançar sessão que já aconteceu ou
        ;; que tem dinheiro, em NENHUM dos três modos. Antes, o DELETE não filtrava
        ;; status, pagamento nem data, e o `all_future` ainda ancorava na data da
        ;; ocorrência aberta em vez de no corte da regra — apagava registro
        ;; financeiro em silêncio e respondia 204. Agora as protegidas são
        ;; levantadas ANTES; se houver qualquer uma, ninguém é apagado e a resposta
        ;; as NOMEIA, o mesmo desenho da recusa de bloqueio-sobre-sessão (A-006).
        (let [recorrencia-id (:recorrencia_id agendamento)
              data-sessao (:data_hora_sessao agendamento)
              fuso (fuso-da-clinica clinica-id)
              [where params] (escopo-de-remocao mode clinica-id agendamento-id recorrencia-id data-sessao)
              protegidas (sessoes-protegidas-da-r021 where params fuso)]
          (if (seq protegidas)
            {:status 409
             :body {:erro (str "Não é possível apagar: " (count protegidas)
                               " sessão(ões) já aconteceram ou têm dinheiro associado.")
                    :code "past_or_paid_protected"
                    :sessoes protegidas}}
            (do
              (jdbc/execute! @datasource (into [(str "DELETE FROM agendamentos WHERE " where)] params))
              {:status 204 :body ""})))
        {:status 404 :body {:erro "Agendamento não encontrado."}}))
    (catch Exception e
      (log/error e "appointment_delete_failed")
      {:status 500 :body {:erro "Erro interno."}})))
;; Função global de sincronização (sem contexto de request)
;; Usada na inicialização do backend para TODAS as clínicas
(defn sincronizar-status-global! []
  (try
    (let [agora (java.sql.Timestamp. (System/currentTimeMillis))]
      (log/info "global_status_sync_started")
      
      ;; O relógio não confirma presença. `status_count` fica explícito para
      ;; manter o contrato da rota enquanto a confirmação passa a ser manual.
      (let [status-count 0

            ;; No modo automático, o pagamento só fecha DEPOIS que a psicóloga
            ;; confirmou a realização. Sessão apenas passada continua pendente.
            pagamento-result (jdbc/execute! @datasource 
                               ["UPDATE agendamentos 
                                 SET status_pagamento = 'pago',
                                     status_pagamento_origem = 'automatico'
                                 WHERE data_hora_sessao < ? 
                                 AND status = 'realizado'
                                 AND (status_pagamento IS NULL OR status_pagamento = 'pendente')
                                 AND clinica_id IN (
                                   SELECT id FROM clinicas WHERE pagamento_automatico = true
                                 )"
                                agora])
            pagamento-count (get (first pagamento-result) :next.jdbc/update-count 0)]
        
        ;; Uma clínica pode ter sessões realizadas antes de este deploy. O
        ;; `IS NULL` do cálculo permite backfill seguro sem recalcular passado.
        (doseq [{clinica-id :id}
                (execute-query! ["SELECT id FROM clinicas WHERE pagamento_automatico = true"])]
          (remuneracao/calcular-pendentes! clinica-id))

        ;; 📌 Contar só o que foi tocado esconde o que NÃO foi. Uma clínica em
        ;; pagamento manual é invisível neste log, e foi assim que ninguém
        ;; percebeu que a flag existia — ver A-026.
        (let [manuais (:manuais (execute-one!
                                 ["SELECT count(*) AS manuais FROM clinicas
                                    WHERE pagamento_automatico = false"]))]
          (log/with-context {:status_count   status-count
                             :payment_count  pagamento-count
                             :clinicas_manuais manuais}
            (log/info "global_status_sync_completed")))))
    (catch Exception e
      (log/error e "global_status_sync_failed"))))

;; Handler legado de sincronização financeira por clínica. O nome da rota fica
;; por compatibilidade; presença agora é confirmada manualmente na agenda.
(defn clinica-em-pagamento-automatico?
  "A clínica fecha o mês sozinha, ou o financeiro é marcado à mão?

   A coluna nasceu em `20260817100000-pagamento-automatico`, que ligou a flag
   para as clínicas que já existiam e deixou o default em `false` — está escrito
   lá que clínica nova herda *\"o default seguro (desligado)\"*. Ou seja: manual
   é uma CONFIGURAÇÃO, não um defeito, e a sincronização não deve tratá-la como
   erro. Ela só não pode chamar de \"concluída\" o que nem tentou fazer."
  [clinica-id]
  (boolean (:pagamento_automatico
            (execute-one! ["SELECT pagamento_automatico FROM clinicas WHERE id = ?" clinica-id]))))

(defn sincronizar-status-agendamentos-handler
  "🔴 **A-026 — esta rota respondia sucesso sem ter feito nada.**

   Em 2026-08-19, com 54 das 108 sessões da clínica de demonstração já no
   passado, ela respondeu, palavra por palavra:

       {\"message\":\"Sincronização concluída\",\"status_atualizados\":0,
        \"pagamentos_atualizados\":0}

   Os dois UPDATE filtram por `pagamento_automatico = true`, e a clínica estava
   com a flag desligada. O `200` era honesto sobre o HTTP e mudo sobre o mundo:
   **\"zero porque não havia o que fazer\" e \"zero porque eu não faço isso aqui\"
   chegavam como a mesma resposta.** Quem chamou não tinha como distinguir, e
   ninguém tinha como saber que a flag existia.

   📌 O conserto **não** é ligar a flag no provisionamento: o default desligado
   é decisão escrita na migration. É a resposta dizer em qual dos dois mundos
   ela está — `:modo` `\"automatico\"` ou `\"manual\"`. O número zero continua
   podendo aparecer nos dois; o que deixa de existir é a ambiguidade."
  [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          agora (java.sql.Timestamp. (System/currentTimeMillis))]
      (log/info "clinic_status_sync_started")
      (if-not (clinica-em-pagamento-automatico? clinica-id)
        (do
          (log/with-context {:motivo "pagamento_manual"}
            (log/info "clinic_status_sync_skipped"))
          {:status 200 :body {:message "Nada a sincronizar: esta clínica fecha o pagamento manualmente."
                              :modo "manual"
                              :status_atualizados 0
                              :pagamentos_atualizados 0}})
      
      (let [status-count 0

            ;; Pagamento automático depende da confirmação humana de presença.
            pagamento-result (jdbc/execute! @datasource 
                               ["UPDATE agendamentos 
                                 SET status_pagamento = 'pago',
                                     status_pagamento_origem = 'automatico'
                                 WHERE clinica_id = ? 
                                 AND data_hora_sessao < ? 
                                 AND status = 'realizado'
                                 AND (status_pagamento IS NULL OR status_pagamento = 'pendente')
                                 AND clinica_id IN (
                                   SELECT id FROM clinicas WHERE pagamento_automatico = true
                                 )"
                                clinica-id agora])
            pagamento-count (get (first pagamento-result) :next.jdbc/update-count 0)]
        
        (remuneracao/calcular-pendentes! clinica-id)

        (log/with-context {:status_count status-count :payment_count pagamento-count}
          (log/info "clinic_status_sync_completed"))
        {:status 200 :body {:message "Sincronização concluída"
                            :modo "automatico"
                            :status_atualizados status-count
                            :pagamentos_atualizados pagamento-count}})))
    (catch Exception e
      (log/error e "clinic_status_sync_failed")
      {:status 500 :body {:erro "Erro ao sincronizar."}})))

(defn marcar-repasses-transferidos-handler
  "Marca em lote o pagamento mensal de uma psicóloga.

   O cálculo continua por sessão (R-023); este handler só muda o segundo eixo,
   pagamento, por psicóloga e período. Sessão não realizada, não paga pelo
   paciente ou ainda sem snapshot não entra silenciosamente no lote."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        {:keys [psicologo_id data_inicio data_fim]} (:body request)]
    (try
      (let [psicologo-id (java.util.UUID/fromString (or psicologo_id ""))
            inicio (java.time.LocalDate/parse (or data_inicio ""))
            fim (java.time.LocalDate/parse (or data_fim ""))]
        (cond
          (.isAfter inicio fim)
          {:status 422 :body {:erro "data_inicio não pode ser posterior a data_fim."
                              :code "periodo_invalido"}}

          (not (execute-one! ["SELECT id FROM usuarios WHERE id = ? AND clinica_id = ?"
                              psicologo-id clinica-id]))
          {:status 404 :body {:erro "Psicóloga não encontrada nesta clínica."}}

          :else
          (let [zona (tempo/zona (fuso-da-clinica clinica-id))
                inicio-instante (tempo/->sql (.atStartOfDay inicio zona))
                fim-exclusivo (tempo/->sql (.atStartOfDay (.plusDays fim 1) zona))
                transferidos (jdbc/execute!
                              @datasource
                              ["UPDATE agendamentos
                                   SET status_repasse = 'transferido'
                                 WHERE clinica_id = ?
                                   AND psicologo_id = ?
                                   AND data_hora_sessao >= ?
                                   AND data_hora_sessao < ?
                                   AND status = 'realizado'
                                   AND status_pagamento = 'pago'
                                   AND valor_repasse IS NOT NULL
                                   AND status_repasse <> 'transferido'
                              RETURNING valor_repasse"
                               clinica-id psicologo-id inicio-instante fim-exclusivo]
                              {:builder-fn rs/as-unqualified-lower-maps})
                total (reduce + 0M (map #(bigdec (:valor_repasse %)) transferidos))]
            {:status 200
             :body {:quantidade (count transferidos)
                    :valor_total total
                    :psicologo_id psicologo-id
                    :data_inicio data_inicio
                    :data_fim data_fim}})))
      (catch java.time.format.DateTimeParseException _
        {:status 422 :body {:erro "data_inicio e data_fim devem usar AAAA-MM-DD."
                            :code "periodo_invalido"}})
      (catch IllegalArgumentException _
        {:status 422 :body {:erro "psicologo_id é obrigatório e deve ser um UUID válido."
                            :code "psicologo_invalido"}}))))

(defn recalcular-repasse-handler
  "🔴 T2.8(a) — correção reversível do repasse de uma psicóloga.

   O default silencioso do schema (`modalidade_repasse = 'percentual'`,
   `percentual = 50`) fazia toda psicóloga nova nascer em 50%, e a trava
   `valor_repasse IS NULL` do cálculo impedia consertar o snapshot já gravado
   pela API. Este endpoint ZERA o repasse das sessões AINDA NÃO TRANSFERIDAS da
   psicóloga e recalcula pela régua atual (já corrigida no cadastro).

   Restrito a `gerenciar_pagamentos` (R-007): mexe em dinheiro. NÃO alcança sessão
   `status_repasse = 'transferido'` — dinheiro que já foi repassado é passado, e
   passado é imutável (R-004)."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        {:keys [psicologo_id]} (:body request)]
    (try
      (let [psicologo-id (java.util.UUID/fromString (or psicologo_id ""))]
        (if-not (execute-one! ["SELECT id FROM usuarios WHERE id = ? AND clinica_id = ?"
                               psicologo-id clinica-id])
          {:status 404 :body {:erro "Psicóloga não encontrada nesta clínica."}}
          (let [zerados (jdbc/execute-one!
                         @datasource
                         ["UPDATE agendamentos
                              SET valor_repasse = NULL,
                                  modalidade_repasse_aplicada = NULL,
                                  percentual_repasse_aplicado = NULL,
                                  valor_fixo_repasse_aplicado = NULL,
                                  repasse_calculado_em = NULL
                            WHERE clinica_id = ? AND psicologo_id = ?
                              AND (status_repasse IS NULL OR status_repasse <> 'transferido')"
                          clinica-id psicologo-id])]
            ;; Recalcula os snapshots das realizadas/passadas pela régua atual.
            ;; Idempotente e limitado a `valor_repasse IS NULL`, que é o que
            ;; acabamos de zerar — não toca no que ficou transferido.
            (remuneracao/calcular-pendentes! clinica-id)
            {:status 200 :body {:zerados (get zerados :next.jdbc/update-count 0)
                                :psicologo_id psicologo-id}})))
      (catch IllegalArgumentException _
        {:status 422 :body {:erro "psicologo_id é obrigatório e deve ser um UUID válido."
                            :code "psicologo_invalido"}}))))

(defn listar-agendamentos-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        user-id (:user_id identity)
        paciente-id-filter (get-in request [:params :paciente_id])
        ;; O papel já vem assinado no JWT — a consulta que estava aqui era uma
        ;; ida ao banco por requisição para reler o que já estava em mãos.
        nome-papel (:role identity)]

    (let [;; 🔴 T2.1 — cada JOIN repete `= a.clinica_id` na condição. O `WHERE`
          ;; filtra a linha-base, mas um `paciente_id`/`psicologo_id` que apontasse
          ;; para outra clínica (FK sem trava de tenant) traria o nome de lá.
          ;; Repetir o filtro dentro do JOIN fecha o vazamento na origem.
          base-query "SELECT a.*, p.nome as nome_paciente, p.nota_fiscal, p.origem, p.vencimento_pagamento, p.tipo_pagamento, u.nome as nome_psicologo
                      FROM agendamentos a
                      JOIN pacientes p ON a.paciente_id = p.id AND p.clinica_id = a.clinica_id
                      LEFT JOIN usuarios u ON a.psicologo_id = u.id AND u.clinica_id = a.clinica_id
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
      (log/error e "schedule_conflict_check_failed")
      {:status 500 :body {:erro "Erro interno ao verificar conflitos."}})))

(defn criar-bloqueio-handler [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          usuario-id (get-in request [:identity :user_id])
          papel (get-in request [:identity :role])
          {:keys [data_inicio data_fim motivo dia_inteiro recorrencia_tipo quantidade_recorrencia psicologo_id tipo]} (:body request)

          ;; 📌 Ausente = `bloqueio`, e isso é o que mantém compatível todo
          ;; cliente que já existe: a tela de bloquear horário não manda `tipo`
          ;; e continua criando proibição, exatamente como antes da D-024.
          tipo-janela (or (not-empty (str/trim (or tipo ""))) "bloqueio")

          target-psicologo-id (if (and (or (= papel "admin_clinica") (= papel "secretario"))
                                       (not (str/blank? psicologo_id)))
                                (java.util.UUID/fromString psicologo_id)
                                usuario-id)]

      (cond
        (or (nil? data_inicio) (nil? data_fim))
        {:status 400 :body {:erro "data_inicio e data_fim são obrigatórios."}}

        ;; Vocabulário fechado no servidor. O CHECK do banco é a rede embaixo
        ;; disto; aqui é onde a mensagem sai legível para quem chamou.
        (not (contains? dominio/tipo-janela-agenda tipo-janela))
        {:status 422 :body {:erro (str "Valor inválido para tipo: '" tipo-janela
                                       "'. Aceitos: bloqueio, disponivel.")
                            :code "tipo_invalido"}}

        :else
        (let [fuso (fuso-da-clinica clinica-id)
              intervalos (gerar-intervalos-bloqueio data_inicio data_fim recorrencia_tipo
                                                   quantidade_recorrencia fuso)
              ;; Limite conhecido: esta guarda é sequencial. O SELECT e os
              ;; INSERTs abaixo não se protegem de uma sessão concorrente; um
              ;; SELECT comum em READ COMMITTED dentro da transação também não
              ;; fecharia essa corrida. A correção real exige trava ou
              ;; restrição no banco.
              ;;
              ;; Custo conhecido: há uma consulta por intervalo, inclusive no
              ;; caminho sem conflito. Uma recorrência no limite da R-005 pode
              ;; chegar a 120 consultas; agrupar intervalos numa única query é
              ;; otimização futura, não mudança silenciosa desta guarda.
              ;; 🔴 Esta recusa é do BLOQUEIO, não da janela de agenda.
              ;;
              ;; Bloquear por cima de sessão marcada é contradição — a sessão
              ;; ficaria dentro de um horário proibido. Já OFERECER um intervalo
              ;; que contém uma sessão não é contradição nenhuma: a psicóloga
              ;; abre 14h-18h e as 15h já estão ocupadas; o resto continua
              ;; oferecido. Aplicar a mesma recusa aos dois faria a tela dizer
              ;; "há sessões marcadas no período" para quem só quis anunciar
              ;; disponibilidade — e ela seria obrigada a picotar a janela em
              ;; volta de cada sessão para conseguir salvar.
              conflitos (if (= tipo-janela "bloqueio")
                          (reduce (fn [acc {:keys [start end]}]
                                    (into acc
                                          (execute-query!
                                           ["SELECT id, data_hora_sessao, COALESCE(duracao, 50) AS duracao
                                             FROM agendamentos
                                            WHERE clinica_id = ?
                                              AND psicologo_id = ?
                                              AND status != 'cancelado'
                                              AND data_hora_sessao < ?
                                              AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?"
                                            clinica-id target-psicologo-id end start])))
                                  []
                                  intervalos)
                          [])
              recorrencia-uuid (when (and recorrencia_tipo (not= recorrencia_tipo "none"))
                                 (java.util.UUID/randomUUID))]

          (if (seq conflitos)
            {:status 409
             :body {:erro "Não é possível criar o bloqueio: há sessões marcadas no período."
                    :code "session_conflict"
                    :sessoes (mapv (fn [{:keys [id data_hora_sessao duracao]}]
                                     {:id id
                                      :data_hora_sessao
                                      (.format (tempo/->zdt data_hora_sessao fuso)
                                               java.time.format.DateTimeFormatter/ISO_OFFSET_DATE_TIME)
                                      :duracao duracao})
                                   conflitos)}}
            (jdbc/with-transaction [tx @datasource]
              (let [novos-bloqueios (doall (map (fn [{:keys [start end]}]
                                                  (sql/insert! tx :bloqueios_agenda
                                                               {:clinica_id    clinica-id
                                                                :psicologo_id  target-psicologo-id
                                                                :data_inicio   start
                                                                :data_fim      end
                                                                :motivo        motivo
                                                                :tipo          tipo-janela
                                                                :dia_inteiro   (or dia_inteiro false)
                                                                :recorrencia_id recorrencia-uuid}
                                                               {:builder-fn rs/as-unqualified-lower-maps :return-keys true}))
                                                intervalos))]
                {:status 201 :body (first novos-bloqueios)}))))))
    (catch Exception e
      (log/error e "schedule_block_create_failed")
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

(defn atualizar-bloqueio-handler
  "Edita uma janela de agenda que já existe — período, motivo e tipo.

   🔴 **Por que uma rota própria, e não apagar-e-recriar pelo front.**

   Até 21/08 só havia criar, listar e remover. Editar do lado do cliente seria
   um DELETE seguido de um POST: se o segundo falhasse — rede caindo, 409 de
   conflito, qualquer coisa —, a janela simplesmente sumiria da agenda da
   psicóloga, e ela só descobriria quando alguém não conseguisse marcar. Perda
   silenciosa de dado por causa de uma edição.

   ⚠️ **A recusa por sessão marcada vale só para o BLOQUEIO**, como na criação:
   fechar por cima de uma sessão é contradição; oferecer um intervalo que contém
   sessão não é. Repetir a regra aqui não é duplicação — é a mesma decisão da
   D-024 aplicada ao segundo caminho, e o teste cobre os dois.

   📌 O dono é conferido como no `remover-bloqueio-handler`: admin e secretário
   alcançam a clínica inteira, psicóloga alcança só a própria agenda."
  [request]
  (try
    (let [clinica-id (get-in request [:identity :clinica_id])
          usuario-id (get-in request [:identity :user_id])
          papel (get-in request [:identity :role])
          bloqueio-id (java.util.UUID/fromString (get-in request [:params :id]))
          {:keys [data_inicio data_fim motivo tipo]} (:body request)]
      ;; 🔴 T2.6 / R-020(2) — criar bloqueio é dos dois (psicóloga e clínica,
      ;; R-014), mas EDITAR e EXCLUIR é só da clínica. A R-020 tirou isso da
      ;; psicóloga. (Secretário segue como braço da clínica, como já era na
      ;; leitura/edição; o que a regra remove explicitamente é a psicóloga —
      ;; decisão a confirmar com o Gabriel.)
      (if (= papel "psicologo")
        {:status 403 :body {:erro "Editar bloqueio é da administração da clínica."
                            :code "bloqueio_admin_only"}}
        (let [query (if (or (= papel "admin_clinica") (= papel "secretario"))
                      ["SELECT id, psicologo_id, tipo FROM bloqueios_agenda WHERE id = ? AND clinica_id = ?" bloqueio-id clinica-id]
                      ["SELECT id, psicologo_id, tipo FROM bloqueios_agenda WHERE id = ? AND clinica_id = ? AND psicologo_id = ?" bloqueio-id clinica-id usuario-id])
              atual (execute-one! query)]
          (cond
        (nil? atual)
        {:status 404 :body {:erro "Janela não encontrada ou você não tem permissão."}}

        (or (nil? data_inicio) (nil? data_fim))
        {:status 400 :body {:erro "data_inicio e data_fim são obrigatórios."}}

        :else
        (let [;; Tipo ausente MANTÉM o que já estava. Trocar por `bloqueio` no
              ;; silêncio faria uma edição de horário virar mudança de
              ;; significado — a janela liberada viraria proibição sem ninguém
              ;; pedir.
              tipo-novo (or (not-empty (str/trim (or tipo ""))) (:tipo atual) "bloqueio")]
          (if-not (contains? dominio/tipo-janela-agenda tipo-novo)
            {:status 422 :body {:erro (str "Valor inválido para tipo: '" tipo-novo
                                           "'. Aceitos: bloqueio, disponivel.")
                                :code "tipo_invalido"}}
            (let [fuso (fuso-da-clinica clinica-id)
                  ;; A MESMA conversão que a criação usa (`gerar-intervalos-bloqueio`).
                  ;; Inventar outra aqui seria abrir espaço para as duas rotas
                  ;; discordarem sobre que instante é "18:00" — que é a família de
                  ;; defeito que o PR #7 inteiro passou consertando.
                  inicio (tempo/->sql (tempo/parse-instante data_inicio fuso))
                  fim    (tempo/->sql (tempo/parse-instante data_fim fuso))
                  conflitos (when (= tipo-novo "bloqueio")
                              (execute-query!
                               ["SELECT id, data_hora_sessao, COALESCE(duracao, 50) AS duracao
                                   FROM agendamentos
                                  WHERE clinica_id = ?
                                    AND psicologo_id = ?
                                    AND status != 'cancelado'
                                    AND data_hora_sessao < ?
                                    AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?"
                                clinica-id (:psicologo_id atual) fim inicio]))]
              (if (seq conflitos)
                {:status 409
                 :body {:erro "Não é possível bloquear: há sessões marcadas no período."
                        :code "session_conflict"
                        :sessoes (mapv (fn [{:keys [id data_hora_sessao duracao]}]
                                         {:id id
                                          :data_hora_sessao
                                          (.format (tempo/->zdt data_hora_sessao fuso)
                                                   java.time.format.DateTimeFormatter/ISO_OFFSET_DATE_TIME)
                                          :duracao duracao})
                                       conflitos)}}
                (do
                  (sql/update! @datasource :bloqueios_agenda
                               {:data_inicio inicio :data_fim fim
                                :motivo motivo :tipo tipo-novo}
                               {:id bloqueio-id})
                  {:status 200 :body {:mensagem "Janela atualizada com sucesso."
                                      :tipo tipo-novo}}))))))))) ;; +2: fecha (let [query]) e (if papel)
    (catch Exception e
      (log/error e "schedule_block_update_failed")
      {:status 500 :body {:erro "Erro interno."}})))

(defn remover-bloqueio-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        usuario-id (get-in request [:identity :user_id])
        papel (get-in request [:identity :role])
        bloqueio-id (java.util.UUID/fromString (get-in request [:params :id]))
        mode (or (get-in request [:params :mode]) (get-in request [:query-params "mode"]))] ;; "single" ou "all_future"

    ;; 🔴 T2.6 / R-020(2) — excluir bloqueio é da clínica, não da psicóloga.
    (if (= papel "psicologo")
      {:status 403 :body {:erro "Excluir bloqueio é da administração da clínica."
                          :code "bloqueio_admin_only"}}
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
          {:status 404 :body {:erro "Bloqueio não encontrado ou você não tem permissão."}})))))

;; --- Handlers de Prontuários ---
;;
;; O CRUD mora em deep-saude-backend.prontuarios. Estes nomes permanecem como
;; compatibilidade para as rotas e para consumidores que ainda requerem core.
(def criar-prontuario-handler prontuarios/criar-handler)
(def remover-prontuario-handler prontuarios/remover-handler)
(def atualizar-prontuario-handler prontuarios/atualizar-handler)

(def ^:private super-admin-le-prontuario?
  "Saída de emergência da R-012. Ligada em código de propósito: não transformar
   em variável de ambiente nem em configuração de painel. Ligar sem registrar
   quem leu o quê deixa a leitura indistinguível de uma porta dos fundos."
  false)

(defn listar-prontuarios-handler [request]
  (prontuarios/listar-handler request super-admin-le-prontuario?))
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Definição das Rotas e Aplicação Principal
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(defn renovar-sessao-handler
  "Devolve um token novo para quem já tem um VÁLIDO.

   🔴 Esta rota vive dentro de `protected-routes`, então o
   `wrap-jwt-autenticacao` já recusou token expirado ou com assinatura errada
   antes de chegar aqui. Ela **não** renova o que já morreu — quem deixou expirar
   entra de novo. Isso é deliberado: aceitar token expirado faria a expiração não
   significar nada.

   ⚠️ E os claims saem do `:identity`, não do corpo da requisição. Ler papel ou
   `clinica_id` do que o cliente manda seria deixar o cliente escolher o próprio
   privilégio — a mesma família da SEC-005, que já custou um `admin_clinica`
   decidido por string no front."
  [request]
  (try
    (let [{:keys [user_id clinica_id papel_id role plataforma_admin sessao_iniciada_em]} (:identity request)
          agora (.getEpochSecond (java.time.Instant/now))
          inicio (or sessao_iniciada_em agora)
          idade (- agora inicio)]
      (if (> idade teto-da-sessao-s)
        {:status 401 :body {:erro "Sessão muito antiga. Entre novamente."
                            :code "sessao_expirada_no_teto"}}
        ;; 🔴 T2.3 — a renovação relê o usuário no banco em vez de reassinar os
        ;; claims do token anterior. Sem isto, quem foi demitido, rebaixado ou teve
        ;; o papel trocado mantinha o privilégio antigo por até o teto (~12h),
        ;; porque o papel viajava congelado no JWT. Recusa se o usuário sumiu ou se
        ;; o papel mudou; e relê `plataforma_admin` para uma revogação valer já.
        (let [atual (execute-one!
                     ["SELECT u.papel_id, u.plataforma_admin, p.nome_papel AS role
                         FROM usuarios u JOIN papeis p ON p.id = u.papel_id
                        WHERE u.id = ? AND u.clinica_id = ?"
                      user_id clinica_id])]
          (cond
            (nil? atual)
            {:status 401 :body {:erro "Usuário não encontrado. Entre novamente."
                                :code "usuario_inexistente"}}

            (not= (:papel_id atual) papel_id)
            {:status 401 :body {:erro "Seu papel mudou. Entre novamente."
                                :code "papel_alterado"}}

            :else
            (let [claims {:user_id    (str user_id)
                          :clinica_id (str clinica_id)
                          :papel_id   (str (:papel_id atual))
                          :role       (:role atual)
                          :plataforma_admin (boolean (:plataforma_admin atual))
                          ;; 📌 O carimbo ORIGINAL viaja adiante. Renovar reiniciando
                          ;; a contagem seria o mesmo que não ter teto nenhum.
                          :sessao_iniciada_em inicio
                          :exp (+ agora duracao-do-token-s)}]
              {:status 200 :body {:token (jwt/sign claims @jwt-secret)
                                  :expira_em (+ agora duracao-do-token-s)}})))))
    (catch Exception e
      (log/error e "token_renewal_failed")
      {:status 500 :body {:erro "Erro interno."}})))

(defroutes public-routes
  ;; Rotas públicas são as únicas alcançáveis sem token — e por isso as únicas
  ;; onde força bruta é possível. O limite é por IP; no login, também por
  ;; e-mail tentado, para que atacar uma conta específica não consuma a cota
  ;; de todo mundo atrás do mesmo NAT.
  (POST "/api/admin/provisionar-clinica" []
    (limites/wrap-rate-limit provisionar-clinica-handler
                             {:nome "provisionar" :max-tentativas 5 :janela-ms 3600000}))
  ;; 🔴 T2.5 — dois tetos empilhados no login:
  ;;  - por (IP, e-mail): 10/5min, segura força bruta contra UMA conta;
  ;;  - por IP puro: 60/5min, segura *credential stuffing* — um IP tentando N
  ;;    contas diferentes nunca via 429 com só a chave (IP, e-mail).
  ;; O teto por IP NÃO é liberado no login bem-sucedido (só o de e-mail é), senão
  ;; um acerto zeraria a contagem de um ataque que varre contas.
  (POST "/api/auth/login" []
    (limites/wrap-rate-limit
     (limites/wrap-rate-limit login-handler
                              {:nome "login" :max-tentativas 10 :janela-ms 300000
                               :chave-extra #(get-in % [:body :email])})
     {:nome "login-ip" :max-tentativas 60 :janela-ms 300000}))
  ;; Login com conta Google: mesma superfície pública de força bruta que o
  ;; login. Limite por IP — não há e-mail no corpo para empilhar a segunda
  ;; chave, o e-mail vem dentro do id_token assinado.
  (POST "/api/auth/google" []
    (limites/wrap-rate-limit auth-google/login-google-handler
                             {:nome "login-google" :max-tentativas 20 :janela-ms 300000}))
  ;; Recuperação de senha. `recuperar` é ~5/15min por IP: gerar link é barato,
  ;; mas em rajada vira sonda de contas e enxurrada de e-mail. `redefinir` é um
  ;; pouco mais folgado — a pessoa legítima pode errar a senha nova algumas vezes.
  (POST "/api/auth/recuperar" []
    (limites/wrap-rate-limit auth-recuperacao/recuperar-handler
                             {:nome "recuperar-senha" :max-tentativas 5 :janela-ms 900000}))
  (POST "/api/auth/redefinir" []
    (limites/wrap-rate-limit auth-recuperacao/redefinir-handler
                             {:nome "redefinir-senha" :max-tentativas 10 :janela-ms 900000}))
  (GET  "/api/health" [] health-check-handler))

;; ROTAS DE PRONTUÁRIOS
(defroutes prontuarios-routes
  (POST "/" request (wrap-checar-permissao criar-prontuario-handler "gerenciar_prontuarios"))
  (GET  "/" request (wrap-checar-permissao listar-prontuarios-handler "visualizar_pacientes"))
  (PUT  "/:id" request (wrap-checar-permissao atualizar-prontuario-handler "gerenciar_prontuarios"))
  (DELETE "/:id" request (wrap-checar-permissao remover-prontuario-handler "gerenciar_prontuarios")))

;; ROTAS ATUALIZADAS PARA PACIENTES
(defroutes pacientes-routes
  ;; Rotas literais precisam vir antes de /:id, senão "exportar" seria tratado
  ;; como UUID de paciente. Ambas respeitam o mesmo escopo da listagem: clínica
  ;; inteira para admin/secretaria e carteira própria para psicóloga.
  (GET    "/exportar" request
    (wrap-checar-permissao portabilidade-pacientes/exportar-handler "visualizar_pacientes"))
  (POST   "/importar" request
    (wrap-checar-permissao portabilidade-pacientes/importar-handler "gerenciar_pacientes"))
  (POST   "/" request (wrap-checar-permissao criar-paciente-handler "gerenciar_pacientes"))
  (GET    "/" request (wrap-checar-permissao listar-pacientes-handler "visualizar_pacientes"))
  
  ;; Sub-rota de prontuários
  (context "/:paciente-id/prontuarios" [] prontuarios-routes)
  
  (GET    "/:id" request (wrap-checar-permissao obter-paciente-handler "visualizar_pacientes"))
  (PUT    "/:id" request (wrap-checar-permissao atualizar-paciente-handler "gerenciar_pacientes"))
  (DELETE "/:id" request (wrap-checar-permissao remover-paciente-handler "gerenciar_pacientes")))

(defroutes agendamentos-routes
  ;; 🔴 T2.4 — a rota dispara `UPDATE ... status_pagamento = 'pago'` em lote. Ela
  ;; só tinha autenticação, então qualquer papel a chamava. Passa a exigir
  ;; `gerenciar_pagamentos`, como as outras rotas que movem dinheiro (R-007). A
  ;; autenticação JWT já vem do `wrap-jwt-autenticacao` que envolve protected-routes.
  (POST "/sincronizar" request (wrap-checar-permissao sincronizar-status-agendamentos-handler "gerenciar_pagamentos"))
  (POST "/" request (wrap-checar-permissao criar-agendamento-handler "gerenciar_agendamentos_clinica"))
  (GET  "/" request (wrap-jwt-autenticacao listar-agendamentos-handler))
  (GET  "/:id" request (wrap-jwt-autenticacao obter-agendamento-handler))
  (PUT  "/:id" request (wrap-checar-permissao atualizar-agendamento-handler "gerenciar_agendamentos_clinica"))
  (DELETE "/:id" request (wrap-checar-permissao remover-agendamento-handler "gerenciar_agendamentos_clinica")))

(defroutes repasses-routes
  (POST "/transferir" request
    (wrap-checar-permissao marcar-repasses-transferidos-handler "gerenciar_pagamentos"))
  ;; 🔴 T2.8(a) — correção reversível do erro de modalidade. Só quem move dinheiro.
  (POST "/recalcular" request
    (wrap-checar-permissao recalcular-repasse-handler "gerenciar_pagamentos")))

;; ROTAS DE BLOQUEIOS DE AGENDA
;; GC-016 — a paleta de cores da clínica.
;;
;; 📌 **Ler é de todo mundo**: a agenda pinta com ela, então psicóloga e
;; secretário precisam. **Escrever é do admin**, e a forma de dizer isso aqui é
;; deliberada: `gerenciar_configuracoes_clinica` **não existe** em
;; `papel_permissoes`. Como o admin bypassa toda permissão e ninguém mais tem
;; essa, o efeito é "só admin" — sem migration nova e sem inventar um vocabulário
;; de permissão antes de alguém precisar dele.
;;
;; ⚠️ Se um dia o Gabriel quiser delegar ao secretário, é UM `INSERT` na tabela,
;; e o nome já está no lugar certo esperando.
(defroutes paleta-routes
  (GET    "/" request (wrap-jwt-autenticacao paleta/listar-handler))
  (PUT    "/" request (wrap-jwt-autenticacao
                       (wrap-checar-permissao paleta/definir-handler
                                              "gerenciar_configuracoes_clinica")))
  (DELETE "/:estado" request (wrap-jwt-autenticacao
                              (wrap-checar-permissao paleta/voltar-ao-padrao-handler
                                                     "gerenciar_configuracoes_clinica"))))

(defroutes bloqueios-routes
  (POST "/verificar-conflitos" request (wrap-jwt-autenticacao verificar-conflitos-handler))
  (POST "/" request (wrap-jwt-autenticacao criar-bloqueio-handler))
  (GET  "/" request (wrap-jwt-autenticacao listar-bloqueios-handler))
  (PUT    "/:id" request (wrap-jwt-autenticacao atualizar-bloqueio-handler))
  (DELETE "/:id" request (wrap-jwt-autenticacao remover-bloqueio-handler)))

;; ROTAS DA INTEGRAÇÃO COM GOOGLE AGENDA
;;
;; ⚠️ Todas exigem `gerenciar_integracao_google`, permissão concedida só ao
;; admin_clinica. Não é excesso de zelo: vincular a agenda errada a um
;; profissional expõe o histórico de pacientes de outro (spec 5.4).
(defroutes google-routes
  ;; GC-012: limite próprio da psicóloga. Nenhuma destas rotas aceita usuário
  ;; alvo e nenhuma atravessa a permissão administrativa da clínica inteira.
  (POST "/minha-conexao/conectar" request
    (wrap-checar-permissao google/iniciar-conexao-propria-handler "conectar_agenda_propria"))
  (POST "/minha-conexao/callback" request
    (wrap-checar-permissao google/callback-conexao-propria-handler "conectar_agenda_propria"))
  (GET "/minha-conexao/status" request
    (wrap-checar-permissao google/status-conexao-propria-handler "conectar_agenda_propria"))
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
  ;; A renovação vem antes de tudo: é a rota que mantém a sessão viva, e ela não
  ;; depende de papel nenhum — quem tem token válido pode renovar o próprio.
  (POST   "/api/auth/renovar" request (wrap-jwt-autenticacao renovar-sessao-handler))
  (GET    "/api/me" request (wrap-jwt-autenticacao obter-perfil-proprio-handler))
  (PUT    "/api/me" request (wrap-jwt-autenticacao atualizar-perfil-proprio-handler))
  (POST   "/api/usuarios" request (wrap-checar-permissao criar-usuario-handler "gerenciar_usuarios"))
  (GET    "/api/usuarios/:id" request (wrap-checar-permissao obter-usuario-handler "gerenciar_usuarios"))
  (PUT    "/api/usuarios/:id" request (wrap-checar-permissao atualizar-usuario-handler "gerenciar_usuarios"))
  (DELETE "/api/usuarios/:id" request (wrap-checar-permissao remover-usuario-handler "gerenciar_usuarios"))

  (context "/api/psicologos" []
    (GET    "/" request (wrap-checar-permissao listar-psicologos-handler "visualizar_todos_agendamentos")))

  (context "/api/pacientes" [] pacientes-routes)

  (context "/api/agendamentos" [] agendamentos-routes)

  (context "/api/repasses" [] repasses-routes)

  (context "/api/bloqueios" [] bloqueios-routes)
  (context "/api/paleta" [] paleta-routes)

  (context "/api/google" [] google-routes))

(defroutes plataforma-routes
  ;; Painel do operador da plataforma. Conjunto SEPARADO das rotas clínicas de
  ;; propósito: aqui a autorização é a flag `plataforma_admin`, lá é
  ;; `clinica_id` + papel. Misturar os dois eixos foi o que este desenho evitou.
  (context "/api/plataforma" []
    (GET  "/metricas" request (wrap-plataforma-admin plataforma-metricas-handler))
    (GET  "/clinicas" request (wrap-plataforma-admin plataforma-listar-clinicas-handler))
    (POST "/clinicas" request (wrap-plataforma-admin plataforma-criar-clinica-handler))))

(defroutes app-routes
  public-routes
  ;; Antes de `protected-routes`: aquele bloco autentica ANTES de casar o
  ;; caminho, então uma requisição sem token para /api/plataforma pararia lá com
  ;; 401 genérico em vez de chegar à sua própria guarda.
  plataforma-routes
  (wrap-jwt-autenticacao protected-routes)
  (route/not-found "Recurso não encontrado"))

(def ^:private origens-padrao
  [#"http://localhost:3000" #"http://localhost:9002"
   #"https://.*\.code\.run" #"https://deep-ngrv.onrender.com"])

(defn origens-permitidas
  "Origens aceitas pelo CORS.

   `CORS_ORIGINS` sobrescreve a lista, separada por vírgula. Sem ela, vale o
   padrão histórico — nada muda em quem já roda.

   Existe porque a lista era fixa no código, e o painel do admin faz health
   check do NAVEGADOR: publicar em qualquer host novo (staging, uma máquina de
   demonstração, um domínio próprio) fazia a tela travar em 'Conectando ao
   servidor...' sem dizer que o problema era CORS. Descoberto exatamente assim.

   Cada entrada vira regex ancorada: `https://app.exemplo.com` casa com essa
   origem e só com ela. Ancorar importa — sem `\\A` e `\\z`, `exemplo.com`
   casaria também com `exemplo.com.invasor.net`."
  []
  (if-let [bruto (env :cors-origins)]
    (->> (str/split (str bruto) #",")
         (map str/trim)
         (remove str/blank?)
         (mapv #(re-pattern (str "\\A" (java.util.regex.Pattern/quote %) "\\z"))))
    origens-padrao))

(defn montar-app
  "A pilha de middlewares, aplicada a um handler qualquer.

   Extraída de `app` para que a PILHA tenha teste próprio, sem passar por
   handler de negócio. Dois dos defeitos encontrados nesta auditoria eram da
   pilha e não dos handlers — a ordem do `wrap-json-response` e a ausência do
   `wrap-keyword-params` — e nenhum teste de handler pegaria qualquer um dos
   dois."
  [handler]
  (-> handler
      ;; APLICAÇÃO DO MIDDLEWARE DE CORS
      (wrap-cors :access-control-allow-origin (origens-permitidas)
                 :access-control-allow-methods [:get :post :put :delete :options]
                 :access-control-allow-headers #{"Authorization" "Content-Type" "X-Request-ID"})
      ;; ⚠️ Ordem importa e é contraintuitiva no `->`: quem aparece DEPOIS aqui
      ;; roda ANTES na requisição. `wrap-keyword-params` vem listado antes de
      ;; `wrap-params` justamente para rodar DEPOIS dele, que é a única ordem em
      ;; que há um `:params` para converter.
      ;;
      ;; Sem isto, `wrap-params` deixa `:params` com chaves de TEXTO e todo
      ;; handler que lê `(get-in request [:params :algo])` enxerga nil — em
      ;; silêncio, sem erro. O efeito medido antes do conserto:
      ;;
      ;;   GET /api/agendamentos?paciente_id=X   ignorava o filtro e devolvia tudo
      ;;   GET /api/bloqueios?data_inicio=...    ignorava o período e devolvia tudo
      ;;   POST /api/google/callback?code=...    nunca enxergava o code, então o
      ;;                                         fluxo OAuth não tinha como fechar
      ;;
      ;; Parâmetro de ROTA (`/:id`) não passava por isso: quem keywordiza esses
      ;; é o compojure. Por isso o defeito só aparecia em filtro e query string.
      (wrap-keyword-params)
      (wrap-params)
      (middleware-json/wrap-json-body {:keywords? true})
      ;; Último a envolver = primeiro a rodar. O limite de payload precisa vir
      ;; antes do parser de JSON: o ponto é recusar o corpo grande sem gastar
      ;; memória desserializando. Como `wrap-json-body` está aqui dentro, essa
      ;; ordem se mantém.
      (limites/wrap-limite-payload)
      ;; ⚠️ `wrap-json-response` tem que ser o mais externo de todos, senão as
      ;; respostas geradas por quem está FORA dele saem sem serializar. Era o
      ;; caso do 413: o corpo chegava ao Jetty como mapa Clojure e virava um 500
      ;; cru, sem corpo — justamente na resposta que existe para ser clara.
      (middleware-json/wrap-json-response)
      ;; 🔴 Fronteira de erro, FORA do `wrap-json-response` de propósito: assim
      ;; ela cobre também exceção levantada pela própria serialização. Antes
      ;; dela, handler que estourava virava página HTML do Jetty e log nenhum.
      (logging/wrap-excecao)
      ;; O `wrap-request-id` fica por fora de tudo para que o identificador já
      ;; exista quando a fronteira acima registrar — é ele que costura o relato
      ;; de quem viu o erro ao log do servidor.
      (logging/wrap-request-id)))

(def app (montar-app app-routes))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Funções de Inicialização
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private tentativas-de-conexao
  "Quantas vezes tentar o banco no boot antes de desistir."
  5)

(defn aguardar-banco!
  "Espera o banco responder, com backoff. Desiste lançando a última exceção.

   Contrapartida da D-001 (ver mensageria/DECISOES.md). Migration que falha tem
   que derrubar o boot — nisso não se mexe. Mas indisponibilidade *momentânea*
   do banco no instante do boot é outra coisa: reinício do Cockroach ou blip de
   rede durante o deploy não são schema quebrado, e derrubar por isso vira
   crash-loop à toa.

   Só a CONEXÃO tem nova tentativa. A migration continua sem `try`, de
   propósito: transiente se resolve esperando, schema errado não."
  ([] (aguardar-banco! tentativas-de-conexao))
  ([tentativas]
   (loop [n 1]
     (let [resultado (try
                       (execute-query! ["SELECT 1"])
                       :ok
                       (catch Exception e
                         (if (>= n tentativas)
                           (do (log/with-context {:attempts tentativas}
                                 (log/error "database_boot_exhausted"))
                               (throw e))
                           (do (log/with-context {:attempt n :max_attempts tentativas :retry_in_s (* 2 n)}
                                 (log/warn "database_boot_retry"))
                               :repetir))))]
       (if (= resultado :ok)
         true
         (do (Thread/sleep (* 2000 n))
             (recur (inc n))))))))

(defn init-db []
  (if (env :database-url)
    (do
      (log/info "database_url_configured")
      (log/info "database_connection_started")
      (aguardar-banco!)
      (log/info "database_connection_established")
      ;; Schema: antes era um paredão de ALTER TABLE ... IF NOT EXISTS aqui,
      ;; sem ordem nem registro do que já havia rodado. Agora é Migratus.
      ;;
      ;; ⚠️ `migrar!` fica FORA de try de propósito: migração que falha tem que
      ;; abortar o boot — subir com o schema desatualizado é pior do que não
      ;; subir. Antes ele estava dentro de um `catch Exception` que só imprimia
      ;; "Falha ao conectar ao banco de dados" e deixava a aplicação subir do
      ;; mesmo jeito. Isso mascarou por completo o pool sem usuário do db.clj: o
      ;; log dizia "Servidor iniciado" com o banco 100% inacessível.
      (migrar!)

      (try
        ;; Sincronização de status de agendamentos passados na inicialização
        (sincronizar-status-global!)
        (catch Exception e
          (log/warn e "startup_status_sync_failed"))))
    (log/warn "database_url_missing")))

(defn destroy-db []
  (outbox/parar-worker!)
  (log/info "application_stopping"))

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
    (do (log/error "password_reset_usage_invalid") 1)

    (< (count nova-senha) 8)
    (do (log/error "password_reset_too_short") 1)

    :else
    (if-let [usuario (execute-one! ["SELECT id FROM usuarios WHERE email = ?" email])]
      (do
        (sql/update! @datasource :usuarios
                     {:senha_hash (hashers/encrypt nova-senha)}
                     {:id (:id usuario)})
        (log/info "password_reset_completed")
        0)
      (do (log/warn "password_reset_user_not_found") 1))))

(defn -main [& args]
  (case (first args)
    "reset-senha" (System/exit (reset-senha! (second args) (nth args 2 nil)))
    (do
      ;; Falha fechada antes de tocar no banco ou escutar a porta. A leitura é
      ;; preguiçosa para o AOT, não opcional para o processo servidor.
      (force jwt-secret)
      (init-db)
      ;; Worker do outbox do Google. Fica FORA de `init-db` de propósito: a
      ;; suíte de testes chama migrations e handlers, nunca `-main`, e um
      ;; processo de fundo que dispara rede no meio dos testes falharia em outro
      ;; lugar que não o dele. Desligado por padrão — `GOOGLE_SYNC_WORKER=1`
      ;; liga; `outbox/parar-worker!` desliga.
      (outbox/iniciar-se-configurado!)
      ;; `HOST` restringe a interface de escuta. Sem ele o Jetty ouve em todas,
      ;; que é o que se quer atrás de um balanceador — e é exatamente o que NÃO
      ;; se quer numa máquina com IP público, onde "todas" inclui a internet.
      ;; Poder amarrar a uma interface privada (VPN, rede interna) é a diferença
      ;; entre expor a API para a rede certa e para o mundo.
      (let [port (Integer/parseInt (str (or (env :port) 3000)))
            host (env :host)]
        (println (str "Servidor iniciado na porta " port
                      (if host (str ", ouvindo apenas em " host) ", ouvindo em todas as interfaces")))
        (jetty/run-jetty #'app (cond-> {:port port :join? false}
                                 host (assoc :host host)))))))

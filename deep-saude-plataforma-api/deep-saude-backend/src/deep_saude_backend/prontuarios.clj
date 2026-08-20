(ns deep-saude-backend.prontuarios
  "CRUD de prontuário — o módulo mais sensível do sistema.

   A **R-012** governa este arquivo inteiro: prontuário é do psicólogo autor.
   Nem outro psicólogo da mesma clínica, nem o operador da plataforma.
   Ver `docs/REGRAS_DE_NEGOCIO.md`.

   🔴 **A D-021 (2026-08-20) abriu UMA exceção, e só na leitura:** o **admin da
   clínica** lê os prontuários dela. É pedido do Gabriel vindo da CEO — *\"a ceo
   pediu para que o admin possa ver os prontuarios sim somente o secretario que
   nao\"*. Editar e excluir continuam do autor, e há teste guardando os dois.

   ⚠️ **A exceção NÃO alcança quem opera a plataforma**, embora o papel dele
   seja `admin_clinica`. Ver `admin-da-clinica?` — a distinção é a flag
   `plataforma_admin`, e `plataforma_test` a guarda.

   📌 **E a leitura de quem não é o autor passou a ser registrada em
   `acesso_prontuario`, com motivo próprio.** Enquanto só a flag de emergência
   abria a porta, registrar era exceção; com o admin lendo de rotina, o registro
   virou o que **sustenta** a regra — a R-012 deixou de proibir e passou a
   rastrear.

   ⚠️ Três guardas moram aqui, e as três já foram violadas pelo código antes de
   alguém reparar (achados A-003 e o vizinho dele, em
   `docs/REVISAO_PRE_PRODUCAO.md`):

   - **leitura** — `pode-ler?`: o autor, e o admin da clínica pela D-021;
   - **edição** — `atualizar-handler` checa autoria sem olhar papel;
   - **exclusão** — `remover-handler` idem. Esta era a que faltava: a guarda só
     disparava quando o papel era \"psicologo\", então o admin apagava registro
     clínico alheio.

   Cobertura em `prontuarios_guarda_test` (a tabela de decisão inteira, **sem
   banco** — roda em qualquer máquina), `prontuarios_test`, `plataforma_test` e
   `isolamento_test`. Se uma mudança aqui exigir editar qualquer um deles,
   pare: ou a mudança alterou comportamento, ou o teste estava errado.

   📌 Na D-021 foi o primeiro caso — o comportamento mudou de propósito, por
   decisão do oráculo. As asserções foram reescritas **antes** da guarda, e
   vistas vermelhas, para que \"corrigi e passou\" não ficasse indistinguível de
   \"escrevi o teste para passar\"."
  (:require [clojure.string :as str]
            [next.jdbc.result-set :as rs]
            [next.jdbc.sql :as sql]
            [taoensso.timbre :as log]
            [deep-saude-backend.db :refer [datasource execute-query! execute-one!]]))

(defn criar-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        {:keys [paciente_id conteudo tipo queixa_principal resumo_tecnico
                observacoes_estado_mental encaminhamentos_tarefas
                agendamento_id humor]} (:body request)]

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
                                                  :humor humor
                                                  :queixa_principal queixa_principal
                                                  :resumo_tecnico resumo_tecnico
                                                  :observacoes_estado_mental observacoes_estado_mental
                                                  :encaminhamentos_tarefas encaminhamentos_tarefas
                                                  :agendamento_id (when (not (str/blank? agendamento_id))
                                                                    (java.util.UUID/fromString agendamento_id))}
                                                 {:builder-fn rs/as-unqualified-lower-maps :return-keys true})]
                {:status 201 :body novo-prontuario}))))
        (catch Exception e
          (log/error e "prontuario_create_failed")
          {:status 500 :body {:erro "Erro interno."}})))))

(defn- autor? [usuario-id paciente]
  (= (:psicologo_id paciente) usuario-id))

(defn- admin-da-clinica?
  "Administra ESTA clínica — e não é quem opera a plataforma.

   🔴 A exclusão do operador não é detalhe: ele tem papel `admin_clinica` na
   própria clínica, então liberar \"admin\" sem olhar a flag o liberaria junto e
   derrubaria a garantia que `plataforma_test` chama de *\"o teste mais
   importante deste arquivo\"*. A D-021 é sobre quem administra a clínica; a
   R-012 continua valendo para quem opera o negócio."
  [identity]
  (and (= (:role identity) "admin_clinica")
       (not (true? (:plataforma_admin identity)))))

(defn- pode-ler-normalmente? [identity paciente]
  (or (and (= (:role identity) "psicologo")
           (autor? (:user_id identity) paciente))
      (admin-da-clinica? identity)))

(defn- pode-ler? [super-admin-le? identity paciente]
  (or super-admin-le?
      (pode-ler-normalmente? identity paciente)))

(defn- motivo-do-acesso
  "Por que ESTA leitura foi permitida, quando quem lê não é o autor.
   `nil` quer dizer \"é o autor\" — e leitura do autor não vira registro, senão a
   tabela enche de ruído e esconde o acesso que importa.

   ⚠️ Os motivos são distintos de propósito. Enquanto só a flag abria a porta,
   registrar era exceção; com o admin lendo de rotina, o registro passou a ser o
   que **sustenta** a regra — a R-012 deixou de proibir e passou a rastrear.
   Jogar rotina e emergência no mesmo balde faria a auditoria perder exatamente
   o que ela existe para separar."
  [super-admin-le? identity paciente]
  (cond
    (autor? (:user_id identity) paciente) nil
    (admin-da-clinica? identity)          "admin_clinica"
    super-admin-le?                       "flag_super_admin"
    :else                                 nil))

(defn- registrar-acesso! [clinica-id paciente-id usuario-id papel motivo]
  (try
    (execute-one!
     ["INSERT INTO acesso_prontuario
         (clinica_id, paciente_id, usuario_id, papel, motivo)
       VALUES (?, ?, ?, ?, ?)"
      clinica-id paciente-id usuario-id papel motivo])
    (catch Exception e
      (log/with-context {:auditoria "acesso_prontuario"}
        (log/error e "prontuario_audit_write_failed")))))

(defn listar-handler
  "Lista os prontuários de um paciente. A aridade de 1 é a segura, e é a que
   qualquer chamador novo deve usar.

   ⚠️ A aridade de 2 é a saída de emergência da R-012. Passar `true` libera a
   leitura alheia apenas porque a flag documentada em `core.clj` foi ligada em
   código e implantada. O acesso é registrado quando a flag foi decisiva; falha
   ao registrar aparece como erro alto, mas não derruba a leitura de emergência.

   Existe um único chamador legítimo com dois argumentos:
   `core/listar-prontuarios-handler`. Não crie outro call site com `true`."
  ([request] (listar-handler request false))
  ([request super-admin-le?]
   (let [identity (:identity request)
         clinica-id (:clinica_id identity)
         usuario-id (:user_id identity)
         papel (:role identity)
         paciente-id (java.util.UUID/fromString (get-in request [:params :paciente-id]))
         paciente (execute-one! ["SELECT id, psicologo_id FROM pacientes WHERE id = ? AND clinica_id = ?" paciente-id clinica-id])]
     (if-not paciente
       {:status 404 :body {:erro "Paciente não encontrado."}}

       (if-not (pode-ler? super-admin-le? identity paciente)
         {:status 403 :body {:erro "Você não tem permissão para visualizar este prontuário."}}

         (let [prontuarios (execute-query!
                            ["SELECT p.*, u.nome as nome_psicologo, a.data_hora_sessao as data_sessao
                              FROM prontuarios p
                              JOIN usuarios u ON p.psicologo_id = u.id
                              LEFT JOIN agendamentos a ON p.agendamento_id = a.id
                              WHERE p.paciente_id = ? AND p.clinica_id = ?
                              ORDER BY p.data_registro DESC"
                             paciente-id clinica-id])]
           (when-let [motivo (motivo-do-acesso super-admin-le? identity paciente)]
             (registrar-acesso! clinica-id paciente-id usuario-id papel motivo))
           {:status 200 :body prontuarios}))))))

(defn remover-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        prontuario-id (java.util.UUID/fromString (get-in request [:params :id]))]

    (if-let [prontuario (execute-one! ["SELECT id, psicologo_id FROM prontuarios WHERE id = ? AND clinica_id = ?" prontuario-id clinica-id])]
      ;; Só o autor exclui. Apagar registro clínico alheio seria ainda mais
      ;; grave do que lê-lo; a autoria vale para qualquer papel.
      (if (not= (:psicologo_id prontuario) usuario-id)
        {:status 403 :body {:erro "Você só pode excluir prontuários criados por você."}}

        (let [resultado (sql/delete! @datasource :prontuarios {:id prontuario-id :clinica_id clinica-id})]
          (if (zero? (:next.jdbc/update-count resultado))
            {:status 500 :body {:erro "Erro ao excluir prontuário."}}
            {:status 204 :body ""})))
      {:status 404 :body {:erro "Prontuário não encontrado."}})))

(defn atualizar-handler [request]
  (let [identity (:identity request)
        clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        prontuario-id (java.util.UUID/fromString (get-in request [:params :id]))
        {:keys [conteudo tipo queixa_principal resumo_tecnico
                observacoes_estado_mental encaminhamentos_tarefas
                agendamento_id humor]} (:body request)]

    (if (str/blank? conteudo)
      {:status 400 :body {:erro "Conteúdo é obrigatório."}}

      (if-let [prontuario (execute-one! ["SELECT id, psicologo_id FROM prontuarios WHERE id = ? AND clinica_id = ?" prontuario-id clinica-id])]
        (if (not= (:psicologo_id prontuario) usuario-id)
          {:status 403 :body {:erro "Você só pode editar prontuários criados por você."}}

          (let [update-map (cond-> {:conteudo conteudo
                                    :tipo (or tipo "sessao")
                                    :queixa_principal queixa_principal
                                    :resumo_tecnico resumo_tecnico
                                    :observacoes_estado_mental observacoes_estado_mental
                                    :encaminhamentos_tarefas encaminhamentos_tarefas
                                    :humor humor}
                             (some? agendamento_id) (assoc :agendamento_id (when (not (str/blank? agendamento_id))
                                                                            (java.util.UUID/fromString agendamento_id))))
                resultado (sql/update! @datasource :prontuarios update-map {:id prontuario-id :clinica_id clinica-id})]

            (if (zero? (:next.jdbc/update-count resultado))
              {:status 500 :body {:erro "Erro ao atualizar prontuário."}}
              (let [prontuario-atualizado (execute-one! ["SELECT * FROM prontuarios WHERE id = ?" prontuario-id])]
                {:status 200 :body prontuario-atualizado}))))
        {:status 404 :body {:erro "Prontuário não encontrado."}}))))

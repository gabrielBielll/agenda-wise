(ns deep-saude-backend.isolamento-test
  "Segunda clínica: criar uma, e provar que ela não enxerga a primeira.

   Este namespace existe por causa do produto, não do código. A ideia é vender
   acesso a outras clínicas, cada uma com seus psicólogos, **isoladas**. A
   partir daí, vazamento entre inquilinos deixa de ser defeito e vira
   responsabilidade perante uma clínica cliente e os pacientes dela.

   Até aqui o isolamento tinha sido verificado por leitura e por amostragem —
   a revisão pré-produção olhou alguns handlers e a `orla` varreu os 57 comandos
   SQL do `core.clj` conferindo quais filtram por `clinica_id`. Leitura acha o
   que já está escrito; ela não protege contra a rota que alguém acrescentar mês
   que vem. Isto aqui roda a cada push.

   ## O que é provado

   1. **Criar a segunda clínica funciona de ponta a ponta**, pelo endpoint real
      de provisionamento, com clínica e admin na mesma transação.
   2. **A clínica B não lê, não altera e não apaga nada da A** — uma asserção
      por handler, e não uma amostra.
   3. **As listagens da B voltam vazias**, que é o modo silencioso de vazar:
      404 aparece, item a mais numa lista não aparece.

   ## Rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5432/deep_teste?user=u&password=p' lein test

   Sem a variável, pulado — igual aos outros namespaces de banco."
  (:require [clojure.test :refer :all]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            ;; Só pela guarda `exigir-banco-de-teste!`; ver prontuarios-test.
            [deep-saude-backend.agendamentos-test :as agtest]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica-a  #uuid "aaaaaaaa-0000-0000-0000-00000000000a")
(def psi-a      #uuid "aaaaaaaa-0000-0000-0000-0000000000c1")
(def paciente-a #uuid "aaaaaaaa-0000-0000-0000-0000000000d1")

;; Preenchidos pelo provisionamento, não fixados: o teste tem que exercitar o
;; caminho real de criação da segunda clínica, não fabricar uma no banco.
(def clinica-b (atom nil))
(def admin-b   (atom nil))

(defn- semear-clinica-a! []
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))]
    (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Clinica A')
                       ON CONFLICT (id) DO NOTHING" clinica-a])
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                       VALUES (?, ?, ?, 'Psi A', 'psi-a@teste.local', 'x')
                       ON CONFLICT (id) DO NOTHING" psi-a clinica-a papel])
    (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                       VALUES (?, ?, 'Paciente A', ?) ON CONFLICT (id) DO NOTHING"
                      paciente-a clinica-a psi-a])))

(defn- limpar! []
  (db/execute-one! ["DELETE FROM prontuarios"])
  (db/execute-one! ["DELETE FROM agendamentos"])
  (db/execute-one! ["DELETE FROM recorrencias"])
  (db/execute-one! ["DELETE FROM bloqueios_agenda"])
  ;; As três do Google também apontam para `clinicas` e `usuarios`. Nenhum teste
  ;; daqui cria linha nelas hoje, então omiti-las passaria despercebido — até a
  ;; Fase 2 do Google criar a primeira, e aí quem quebra é justamente o teste que
  ;; guarda o isolamento entre clínicas. Levantadas do schema, não de memória:
  ;; `SELECT` em information_schema.table_constraints por FK para estas tabelas.
  (db/execute-one! ["DELETE FROM google_sync_outbox"])
  (db/execute-one! ["DELETE FROM vinculo_agenda"])
  (db/execute-one! ["DELETE FROM google_conexao"])
  ;; Só a clínica B e seus usuários: a A é fixa e vem do semear.
  ;;
  ;; ⚠️ A ordem aqui é a das chaves estrangeiras, não a alfabética nem a que
  ;; parece natural: `pacientes.psicologo_id` aponta para `usuarios.id`, então
  ;; paciente sai ANTES do psicólogo. A primeira versão apagava `usuarios`
  ;; primeiro e o CI reprovou na hora:
  ;;
  ;;   ERROR: update or delete on table "usuarios" violates foreign key
  ;;   constraint "pacientes_psicologo_id_fkey" on table "pacientes"
  ;;
  ;; Filho antes de pai, sempre — e aqui o paciente é filho de duas tabelas.
  (db/execute-one! ["DELETE FROM pacientes WHERE clinica_id <> ?" clinica-a])
  (db/execute-one! ["DELETE FROM usuarios WHERE clinica_id <> ?" clinica-a])
  (db/execute-one! ["DELETE FROM clinicas WHERE id <> ?" clinica-a]))

(defn com-banco-de-teste [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (limpar!)
        (semear-clinica-a!)
        (f)))
    (println (str "\n  [isolamento-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val) (ns-publics *ns*)))
                  " testes de banco PULADOS.\n"))))

(use-fixtures :once com-banco-de-teste)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private token-de-teste "token-de-provisionamento-para-teste")

(defn- provisionar!
  "Chama o endpoint real de provisionamento, com o header de autorização."
  [nome email]
  (core/provisionar-clinica-handler
   {:headers {"x-provisioning-token" token-de-teste}
    :body {:nome_clinica nome :nome_admin (str "Admin " nome)
           :email_admin email :senha_admin "senha-de-teste-123"}}))

(defn- como-b
  "Identidade de admin da clínica B. É com ela que tudo abaixo é tentado."
  []
  {:clinica_id @clinica-b :user_id @admin-b :role "admin_clinica"})

(defn- vazou?
  "Uma resposta vazou se devolveu 200 — não importa o corpo. Handler que
   encontra recurso de outra clínica e responde 200 é o defeito, mesmo que o
   corpo pareça inofensivo."
  [resp]
  (= 200 (:status resp)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1. Criar a segunda clínica
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest criar-a-segunda-clinica
  (with-redefs [environ.core/env (assoc env :provisioning-token token-de-teste)]
    (let [resp (provisionar! "Clinica B" "admin-b@teste.local")]
      (is (= 201 (:status resp)) "provisionar a segunda clínica tem que funcionar")
      (reset! clinica-b (get-in resp [:body :clinica :id]))
      (reset! admin-b   (get-in resp [:body :usuario_admin :id]))
      (testing "clínica e admin nascem juntos — clínica sem admin é tenant órfão"
        (is (some? @clinica-b))
        (is (some? @admin-b)))
      (testing "o admin da B pertence à B, não à A"
        (is (= @clinica-b (:clinica_id (db/execute-one!
                                        ["SELECT clinica_id FROM usuarios WHERE id = ?" @admin-b]))))))))

(deftest provisionamento-exige-o-token
  (with-redefs [environ.core/env (assoc env :provisioning-token token-de-teste)]
    (let [resp (core/provisionar-clinica-handler
                {:body {:nome_clinica "Clinica Pirata" :nome_admin "X"
                        :email_admin "pirata@teste.local" :senha_admin "senha-de-teste-123"}})]
      (is (= 403 (:status resp)) "sem header, ninguém cria clínica")
      (is (= "provisionamento_nao_autorizado" (:code (:body resp)))))))

(deftest provisionamento-falha-fechado-sem-token-configurado
  ;; A docstring do handler promete falha fechada. Guarda sem teste é guarda que
  ;; ninguém sabe se funciona.
  (with-redefs [environ.core/env (dissoc env :provisioning-token)]
    (is (= 403 (:status (provisionar! "Clinica Sem Config" "semconfig@teste.local"))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2. A clínica B não alcança nada da A
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- garantir-clinica-b! []
  (when (nil? @clinica-b)
    (with-redefs [environ.core/env (assoc env :provisioning-token token-de-teste)]
      (let [resp (provisionar! "Clinica B" "admin-b@teste.local")]
        (reset! clinica-b (get-in resp [:body :clinica :id]))
        (reset! admin-b   (get-in resp [:body :usuario_admin :id]))))))

(deftest b-nao-alcanca-paciente-da-a
  (garantir-clinica-b!)
  (let [id (str paciente-a)]
    (testing "não lê"
      (is (not (vazou? (core/obter-paciente-handler {:identity (como-b) :params {:id id}})))))
    (testing "não altera"
      (is (not (vazou? (core/atualizar-paciente-handler
                        {:identity (como-b) :params {:id id} :body {:nome "invadido"}}))))
      (is (= "Paciente A" (:nome (db/execute-one! ["SELECT nome FROM pacientes WHERE id = ?" paciente-a])))
          "o nome do paciente da A não pode ter mudado"))
    (testing "não apaga"
      (is (not= 204 (:status (core/remover-paciente-handler {:identity (como-b) :params {:id id}}))))
      (is (some? (db/execute-one! ["SELECT id FROM pacientes WHERE id = ?" paciente-a]))))))

(deftest b-nao-alcanca-usuario-da-a
  (garantir-clinica-b!)
  (is (not (vazou? (core/obter-usuario-handler {:identity (como-b) :params {:id (str psi-a)}})))))

(deftest b-nao-alcanca-agendamento-da-a
  (garantir-clinica-b!)
  (let [criado (core/criar-agendamento-handler
                {:identity {:clinica_id clinica-a :user_id psi-a :role "admin_clinica"}
                 :body {:paciente_id (str paciente-a) :psicologo_id (str psi-a)
                        :valor_consulta 200 :data_hora_sessao "2027-06-10T14:00:00"}})
        id (str (:id (:body criado)))]
    (is (= 201 (:status criado)) "o agendamento da A precisa existir para o teste valer")
    (testing "não lê"
      (is (not (vazou? (core/obter-agendamento-handler {:identity (como-b) :params {:id id}})))))
    (testing "não altera"
      (is (not (vazou? (core/atualizar-agendamento-handler
                        {:identity (como-b) :params {:id id} :body {:status "cancelado"}}))))
      ;; Por id, e não `SELECT ... FROM agendamentos`: este namespace não limpa
      ;; entre testes de propósito (a clínica B é criada uma vez), então há mais
      ;; de uma linha na tabela e pegar "a primeira" testaria outra coisa.
      (is (= "agendado" (:status (db/execute-one!
                                  ["SELECT status FROM agendamentos WHERE id = ?"
                                   (java.util.UUID/fromString id)])))))))

(deftest b-nao-alcanca-prontuario-da-a
  (garantir-clinica-b!)
  (core/criar-prontuario-handler
   {:identity {:clinica_id clinica-a :user_id psi-a :role "psicologo"}
    :body {:paciente_id (str paciente-a) :conteudo "Sessão da clínica A."}})
  (is (= 1 (:c (db/execute-one! ["SELECT count(*) AS c FROM prontuarios"])))
      "o prontuário da A precisa existir para o teste valer")
  (testing "a B não lê prontuário de paciente da A"
    (is (not (vazou? (core/listar-prontuarios-handler
                      {:identity (como-b) :params {:paciente-id (str paciente-a)}}))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 3. As listagens da B voltam vazias
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; O modo silencioso de vazar. Um 404 indevido alguém percebe; um item a mais
;; numa lista de outra clínica, não — e é o que aparece na tela de quem paga.

(deftest listagens-da-b-nao-mostram-nada-da-a
  (garantir-clinica-b!)
  (testing "pacientes"
    (let [resp (core/listar-pacientes-handler {:identity (como-b)})]
      (is (= 200 (:status resp)))
      (is (empty? (:body resp)) "a B não pode ver paciente nenhum da A")))
  (testing "agendamentos"
    (let [resp (core/listar-agendamentos-handler {:identity (como-b) :params {}})]
      (is (= 200 (:status resp)))
      (is (empty? (:body resp)))))
  (testing "bloqueios"
    (let [resp (core/listar-bloqueios-handler {:identity (como-b) :params {}})]
      (is (= 200 (:status resp)))
      (is (empty? (:body resp)))))
  (testing "psicólogos"
    ;; A B nasce sem psicólogo: o provisionamento cria um admin, e o handler
    ;; filtra por papel 'psicologo'. Então o esperado é vazio — e o que importa
    ;; é que `psi-a`, que é psicólogo da A, não apareça aqui.
    (let [resp (core/listar-psicologos-handler {:identity (como-b)})]
      (is (= 200 (:status resp)))
      (is (empty? (:body resp)) "nenhum psicólogo — e nenhum da clínica A"))))

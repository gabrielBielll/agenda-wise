(ns deep-saude-backend.agendamentos-test
  "Handlers de agendamento contra banco de verdade.

   Este é o buraco que a mensagem 0001 apontou como o maior do projeto: a parte
   que mexe com dinheiro e com sigilo clínico era justamente a sem cobertura.

   **Banco real, não mock, de propósito.** O valor está no que o banco faz — o
   `USING ... AT TIME ZONE` da coluna, o rollback da transação, o `DELETE ...
   WHERE recorrencia_id`. Um mock devolveria o que o teste mandasse devolver e
   não provaria nada disso.

   ## Como rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5432/deep_teste?user=u&password=p' lein test

   Sem a variável, os testes deste namespace são **pulados** e `lein test`
   continua verde. É o que permite rodar a suíte em máquina sem banco.

   ⚠️ O banco apontado é **limpo entre os testes**. Nunca aponte para produção.

   ## Por que `with-redefs` no datasource

   `db/datasource` é `defonce` sobre um `delay` que lê `DATABASE_URL`. Como
   `core.clj` faz `:refer` dele, os dois namespaces enxergam a MESMA var — então
   redefinir aqui redireciona os handlers junto, sem precisar mexer em `db.clj`
   nem exportar `DATABASE_URL` de verdade no ambiente."
  (:require [clojure.test :refer :all]
            [clojure.string :as str]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica-a   #uuid "aaaaaaaa-0000-0000-0000-00000000000a")
(def clinica-b   #uuid "bbbbbbbb-0000-0000-0000-00000000000b")
(def psicologo-a #uuid "aaaaaaaa-0000-0000-0000-0000000000c1")
(def psicologo-b #uuid "bbbbbbbb-0000-0000-0000-0000000000c2")
(def paciente-a  #uuid "aaaaaaaa-0000-0000-0000-0000000000d1")
(def paciente-b  #uuid "bbbbbbbb-0000-0000-0000-0000000000d2")

(defn- semear-cadastro! []
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))]
    (doseq [[cli psi pac nome] [[clinica-a psicologo-a paciente-a "A"]
                                [clinica-b psicologo-b paciente-b "B"]]]
      (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, ?)
                         ON CONFLICT (id) DO NOTHING" cli (str "Clinica " nome)])
      (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                         VALUES (?, ?, ?, ?, ?, 'x') ON CONFLICT (id) DO NOTHING"
                        psi cli papel (str "Psi " nome) (str "psi-" (str/lower-case nome) "@teste.local")])
      (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                         VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING"
                        pac cli (str "Paciente " nome) psi]))))

(defn- limpar-agendamentos! []
  (db/execute-one! ["DELETE FROM agendamentos"])
  (db/execute-one! ["DELETE FROM recorrencias"])
  (db/execute-one! ["DELETE FROM bloqueios_agenda"]))

(defn com-banco-de-teste
  "Aponta o datasource para o banco de teste e prepara o schema. Sem
   TEST_DATABASE_URL, avisa e não roda nada — a suíte segue verde."
  [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        (migratus/migrate (core/migratus-config))
        (limpar-agendamentos!)
        (semear-cadastro!)
        (f)))
    (println (str "\n  [agendamentos-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val) (ns-publics *ns*)))
                  " testes de banco PULADOS.\n"))))

(defn entre-testes [f]
  (if (env :test-database-url) (do (limpar-agendamentos!) (f)) (f)))

(use-fixtures :once com-banco-de-teste)
(use-fixtures :each entre-testes)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- criar [body & {:keys [clinica] :or {clinica clinica-a}}]
  (core/criar-agendamento-handler {:identity {:clinica_id clinica} :body body}))

(defn- atualizar [id body & {:keys [clinica] :or {clinica clinica-a}}]
  (core/atualizar-agendamento-handler
   {:identity {:clinica_id clinica} :params {:id (str id)} :body body}))

(defn- remover [id mode & {:keys [clinica] :or {clinica clinica-a}}]
  (core/remover-agendamento-handler
   (cond-> {:identity {:clinica_id clinica} :params {:id (str id)}}
     mode (assoc :query-params {"mode" mode}))))

(defn- horarios-de-parede
  "Horário como o usuário vê, em São Paulo. É esta a leitura que importa: o
   instante em UTC muda de representação, o horário de parede não pode mudar."
  []
  (mapv :parede
        (db/execute-query!
         ["SELECT to_char(data_hora_sessao AT TIME ZONE 'America/Sao_Paulo',
                          'YYYY-MM-DD HH24:MI') AS parede
             FROM agendamentos ORDER BY data_hora_sessao"])))

(defn- conta [tabela]
  (:c (db/execute-one! [(str "SELECT count(*) AS c FROM " tabela)])))

(def ^:private sessao-base
  {:paciente_id (str paciente-a) :psicologo_id (str psicologo-a) :valor_consulta 200})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Criação
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest criar-sessao-avulsa
  (let [resp (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00"))]
    (is (= 201 (:status resp)))
    (testing "grava o horário de parede que o usuário digitou"
      (is (= ["2027-03-10 14:00"] (horarios-de-parede))))
    (testing "não cria série para sessão avulsa"
      (is (zero? (conta "recorrencias")))
      (is (nil? (:recorrencia_id (:body resp)))))
    (testing "original_start_time nasce igual ao início (chave de reconciliação D10)"
      (is (= (:data_hora_sessao (:body resp)) (:original_start_time (:body resp)))))))

(deftest criar-serie-semanal
  (let [resp (criar (assoc sessao-base :data_hora_sessao "2027-05-04T14:00:00"
                                       :recorrencia_tipo "semanal" :quantidade_recorrencia 4))]
    (is (= 201 (:status resp)))
    (testing "quatro ocorrências, todas às 14:00, de sete em sete dias"
      (is (= ["2027-05-04 14:00" "2027-05-11 14:00" "2027-05-18 14:00" "2027-05-25 14:00"]
             (horarios-de-parede))))
    (testing "uma linha em recorrencias, com a RRULE da série"
      (is (= 1 (conta "recorrencias")))
      (let [r (db/execute-one! ["SELECT rrule, timezone, duracao_minutos, status FROM recorrencias"])]
        (is (= "RRULE:FREQ=WEEKLY;COUNT=4" (:rrule r)))
        (is (= "America/Sao_Paulo" (:timezone r)))
        (is (= "ativa" (:status r)))))
    (testing "todas as ocorrências apontam para a mesma série"
      (is (= 1 (count (distinct (map :recorrencia_id
                                     (db/execute-query! ["SELECT recorrencia_id FROM agendamentos"]))))))) ))

(deftest criar-serie-atravessa-virada-de-ano-sem-escorregar
  ;; A versão antiga somava (* i 7 24 60 60 1000) milissegundos. Somar duração
  ;; absoluta é o que escorrega quando o calendário local muda de offset. Aqui a
  ;; asserção é sobre o horário de parede continuar 08:00 em todas.
  (let [resp (criar (assoc sessao-base :data_hora_sessao "2027-12-22T08:00:00"
                                       :recorrencia_tipo "semanal" :quantidade_recorrencia 4))]
    (is (= 201 (:status resp)))
    (is (= ["2027-12-22 08:00" "2027-12-29 08:00" "2028-01-05 08:00" "2028-01-12 08:00"]
           (horarios-de-parede)))))

(deftest criar-recusa-horario-ja-ocupado
  (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00" :duracao 50))
  (testing "sobreposição parcial no mesmo psicólogo é conflito"
    (let [resp (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:30:00" :duracao 50))]
      (is (= 409 (:status resp)))
      (is (= "appointment_conflict" (:code (:body resp))))))
  (testing "o conflito não deixou lixo no banco"
    (is (= 1 (conta "agendamentos")))))

(deftest criar-exige-campos-obrigatorios
  (is (= 400 (:status (criar (dissoc sessao-base :paciente_id)))))
  (is (= 400 (:status (criar (assoc sessao-base :data_hora_sessao nil))))))

(deftest criar-recusa-paciente-de-outra-clinica
  ;; Isolamento entre clínicas: é sigilo clínico, não detalhe de validação.
  (let [resp (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00"
                                       :paciente_id (str paciente-b)))]
    (is (= 422 (:status resp)))
    (is (zero? (conta "agendamentos")))))

(deftest criar-serie-e-tudo-ou-nada
  ;; O motivo de `with-transaction` existir no handler. A constraint derruba a
  ;; 3ª ocorrência; nenhuma das outras pode sobreviver, nem a linha da série.
  (db/execute-one! ["ALTER TABLE agendamentos ADD CONSTRAINT teste_falha
                     CHECK (data_hora_sessao <> '2027-05-18 17:00:00+00'::timestamptz)"])
  (try
    (let [resp (criar (assoc sessao-base :data_hora_sessao "2027-05-04T14:00:00"
                                         :recorrencia_tipo "semanal" :quantidade_recorrencia 4))]
      (is (= 500 (:status resp)) "a criação tem que falhar, não gravar pela metade")
      (is (zero? (conta "agendamentos")) "nenhuma sessão órfã")
      (is (zero? (conta "recorrencias")) "nem a série"))
    (finally
      (db/execute-one! ["ALTER TABLE agendamentos DROP CONSTRAINT teste_falha"]))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Atualização — os três modos
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- serie-de-quatro!
  "Série às 14:00 em 04, 11, 18 e 25 de maio. Devolve os ids em ordem."
  []
  (criar (assoc sessao-base :data_hora_sessao "2027-05-04T14:00:00"
                            :recorrencia_tipo "semanal" :quantidade_recorrencia 4))
  (mapv :id (db/execute-query! ["SELECT id FROM agendamentos ORDER BY data_hora_sessao"])))

(deftest atualizar-modo-individual-nao-toca-nas-irmas
  (let [[_ segundo _ _] (serie-de-quatro!)
        resp (atualizar segundo {:data_hora_sessao "2027-05-11T16:00:00"})]
    (is (= 200 (:status resp)))
    (testing "só a ocorrência escolhida mudou de horário"
      (is (= ["2027-05-04 14:00" "2027-05-11 16:00" "2027-05-18 14:00" "2027-05-25 14:00"]
             (horarios-de-parede))))))

(deftest atualizar-modo-all-future-pega-desta-em-diante
  (let [[_ _ terceiro _] (serie-de-quatro!)
        resp (atualizar terceiro {:data_hora_sessao "2027-05-18T09:00:00" :mode "all_future"})]
    (is (= 200 (:status resp)))
    (testing "as duas primeiras ficam intactas; a terceira e a quarta adotam 09:00"
      (is (= ["2027-05-04 14:00" "2027-05-11 14:00" "2027-05-18 09:00" "2027-05-25 09:00"]
             (horarios-de-parede))))
    (testing "cada ocorrência manteve a PRÓPRIA data e trocou só o horário"
      (is (str/includes? (:message (:body resp)) "2 agendamentos")))))

(deftest atualizar-modo-all-pega-a-serie-inteira
  (let [[_ _ terceiro _] (serie-de-quatro!)
        resp (atualizar terceiro {:data_hora_sessao "2027-05-18T07:30:00" :mode "all"})]
    (is (= 200 (:status resp)))
    (testing "todas as quatro passam para 07:30, cada uma na sua data"
      (is (= ["2027-05-04 07:30" "2027-05-11 07:30" "2027-05-18 07:30" "2027-05-25 07:30"]
             (horarios-de-parede))))
    (is (str/includes? (:message (:body resp)) "4 agendamentos"))))

(deftest atualizar-em-serie-exige-que-seja-serie
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))]
    (doseq [modo ["all_future" "all"]]
      (testing (str "modo " modo " em sessão avulsa")
        (let [resp (atualizar (:id avulsa) {:data_hora_sessao "2027-03-10T16:00:00" :mode modo})]
          (is (= 400 (:status resp))))))
    (testing "e o horário não mudou"
      (is (= ["2027-03-10 14:00"] (horarios-de-parede))))))

(deftest atualizar-cancelamento-zera-o-valor
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))
        resp   (atualizar (:id avulsa) {:status "cancelado"})]
    (is (= 200 (:status resp)))
    (is (= "cancelado" (:status (:body resp))))
    (is (zero? (bigdec (:valor_consulta (:body resp))))
        "sessão cancelada não pode continuar valendo dinheiro")))

(deftest atualizar-valida-dominio-antes-de-gravar
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))
        resp   (atualizar (:id avulsa) {:status_repasse "pago"})]
    (is (= 422 (:status resp)))
    (is (= "valor_de_dominio_invalido" (:code (:body resp))))
    (testing "valor válido do mesmo campo passa"
      (is (= 200 (:status (atualizar (:id avulsa) {:status_repasse "transferido"})))))))

(deftest atualizar-respeita-fronteira-entre-clinicas
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))]
    (testing "clínica B não enxerga nem altera agendamento da clínica A"
      (is (= 404 (:status (atualizar (:id avulsa) {:status "cancelado"} :clinica clinica-b)))))
    (testing "e o dado continua intocado"
      (is (= "agendado" (:status (db/execute-one! ["SELECT status FROM agendamentos"])))))))

(deftest atualizar-agendamento-inexistente-da-404
  (is (= 404 (:status (atualizar (java.util.UUID/randomUUID) {:status "cancelado"})))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Remoção — os três modos
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest remover-modo-individual
  (let [[_ segundo _ _] (serie-de-quatro!)]
    (is (= 204 (:status (remover segundo nil))))
    (is (= ["2027-05-04 14:00" "2027-05-18 14:00" "2027-05-25 14:00"] (horarios-de-parede)))))

(deftest remover-modo-all-future
  (let [[_ _ terceiro _] (serie-de-quatro!)]
    (is (= 204 (:status (remover terceiro "all_future"))))
    (testing "some desta em diante; as anteriores ficam"
      (is (= ["2027-05-04 14:00" "2027-05-11 14:00"] (horarios-de-parede))))))

(deftest remover-modo-all
  (let [[_ _ terceiro _] (serie-de-quatro!)]
    (is (= 204 (:status (remover terceiro "all"))))
    (is (= [] (horarios-de-parede)))))

(deftest remover-com-modo-de-serie-em-sessao-avulsa-remove-so-ela
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))]
    (criar (assoc sessao-base :data_hora_sessao "2027-03-11T14:00:00"))
    (is (= 204 (:status (remover (:id avulsa) "all_future")))
        "sem recorrencia_id, cai no caminho individual")
    (is (= ["2027-03-11 14:00"] (horarios-de-parede)))))

(deftest remover-respeita-fronteira-entre-clinicas
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))]
    (is (= 404 (:status (remover (:id avulsa) nil :clinica clinica-b))))
    (is (= 1 (conta "agendamentos")) "o agendamento da clínica A continua lá")))

(deftest remover-agendamento-inexistente-da-404
  (is (= 404 (:status (remover (java.util.UUID/randomUUID) nil)))))

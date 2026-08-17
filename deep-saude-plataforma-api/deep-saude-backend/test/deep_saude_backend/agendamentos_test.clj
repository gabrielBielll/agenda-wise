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
(def psicologo-a2 #uuid "aaaaaaaa-0000-0000-0000-0000000000c3")
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
                        pac cli (str "Paciente " nome) psi])))
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))]
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                       VALUES (?, ?, ?, 'Psi A2', 'psi-a2@teste.local', 'x')
                       ON CONFLICT (id) DO NOTHING"
                      psicologo-a2 clinica-a papel])))

(defn- nome-do-banco-na-url
  "Nome do banco na JDBC URL. nil quando não dá para determinar."
  [url]
  (some-> url (str/replace #"\?.*$" "") (->> (re-find #"/([^/]+)$")) second not-empty))

(defn- exigir-banco-de-teste!
  "Aborta se o datasource em uso não for o banco de TEST_DATABASE_URL.

   ⚠️ Este namespace roda `DELETE FROM agendamentos`. Até aqui, o único
   impedimento para isso acontecer no banco errado era um aviso em docstring — e
   aviso não impede nada.

   A checagem pergunta ao próprio banco quem ele é, pelo mesmo caminho que os
   handlers usam. Se o `with-redefs` do datasource deixar de surtir efeito algum
   dia — por refatoração, por AOT com direct-linking, por alguém cachear o valor
   no carregamento do namespace — o DELETE cairia no banco que `DATABASE_URL`
   estivesse apontando. Aqui ele para antes, e alto.

   Falha fechada: sem conseguir determinar o nome esperado, também aborta."
  [url]
  (let [esperado (nome-do-banco-na-url url)
        conectado (:current_database (db/execute-one! ["SELECT current_database()"]))]
    (when-not (and esperado conectado (= esperado conectado))
      (throw (ex-info (str "ABORTADO: os testes de banco não estão conectados ao banco de teste. "
                           "Esperado '" esperado "', conectado em '" conectado "'. "
                           "Nenhum DELETE foi executado.")
                      {:esperado esperado :conectado conectado})))
    conectado))

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
        ;; ⚠️ Antes de qualquer DELETE: confirmar que estamos mesmo no banco de
        ;; teste. Ver exigir-banco-de-teste!.
        (exigir-banco-de-teste! url)
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

(defn- criar-como [papel body]
  (core/criar-agendamento-handler
   {:identity {:clinica_id clinica-a
               :user_id psicologo-a
               :role papel}
    :body body}))

(defn- atualizar [id body & {:keys [clinica] :or {clinica clinica-a}}]
  (core/atualizar-agendamento-handler
   {:identity {:clinica_id clinica
               ;; Estes testes históricos exercitam o caminho administrativo;
               ;; agora que dinheiro tem guarda própria, a identidade precisa
               ;; declarar o papel em vez de passar por ausência de autorização.
               :papel_id (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))
               :role "admin_clinica"}
    :params {:id (str id)} :body body}))

(defn- remover [id mode & {:keys [clinica] :or {clinica clinica-a}}]
  (core/remover-agendamento-handler
   (cond-> {:identity {:clinica_id clinica} :params {:id (str id)}}
     mode (assoc :query-params {"mode" mode}))))

(defn- criar-bloqueio [body]
  (core/criar-bloqueio-handler
   {:identity {:clinica_id clinica-a
               :user_id psicologo-a
               :role "psicologo"}
    :body body}))

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

(deftest pagamento-automatico-respeita-configuracao-da-clinica
  ;; A coluna é criada aqui para que o vermelho prove o defeito de alcance do
  ;; job antes de a migration da correção existir: hoje ele ignora a flag e
  ;; fecha o financeiro de todas as clínicas.
  ;; Os testes anteriores não viram isso porque exercitam handlers; o job roda
  ;; fora de rota, no -main, e o -main não é iniciado pela suíte.
  (db/execute-one! ["ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS pagamento_automatico BOOLEAN NOT NULL DEFAULT false"])
  (db/execute-one! ["UPDATE clinicas SET pagamento_automatico = (id = ?) WHERE id IN (?, ?)"
                    clinica-a clinica-a clinica-b])
  (doseq [[id cli pac psi] [[#uuid "aaaaaaaa-0000-0000-0000-0000000000e1" clinica-a paciente-a psicologo-a]
                            [#uuid "bbbbbbbb-0000-0000-0000-0000000000e2" clinica-b paciente-b psicologo-b]]]
    (db/execute-one! ["INSERT INTO agendamentos
                       (id, clinica_id, paciente_id, psicologo_id, data_hora_sessao,
                        duracao, valor_consulta, status, status_pagamento)
                       VALUES (?, ?, ?, ?, now() - interval '1 day', 50, 200,
                               'agendado', 'pendente')"
                      id cli pac psi]))

  (core/sincronizar-status-global!)

  (let [habilitada (db/execute-one! ["SELECT status, status_pagamento, status_pagamento_origem
                                       FROM agendamentos WHERE clinica_id = ?" clinica-a])
        desabilitada (db/execute-one! ["SELECT status, status_pagamento, status_pagamento_origem
                                        FROM agendamentos WHERE clinica_id = ?" clinica-b])]
    (is (= ["realizado" "pago" "automatico"]
           ((juxt :status :status_pagamento :status_pagamento_origem) habilitada)))
    (is (= ["agendado" "pendente" "desconhecido"]
           ((juxt :status :status_pagamento :status_pagamento_origem) desabilitada)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Criação
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; A guarda que protege o DELETE
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; `exigir-banco-de-teste!` veio da revisão cruzada e é o que impede este
;; namespace de apagar agendamentos no banco errado. Guarda sem teste é guarda
;; que ninguém sabe se funciona — e esta em particular só é exercitada no
;; caminho feliz, onde ela nunca dispara. Os testes abaixo forçam o disparo.

(deftest guarda-aborta-quando-o-banco-conectado-nao-e-o-esperado
  (testing "URL apontando para outro banco derruba antes de qualquer DELETE"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"ABORTADO"
         (#'deep-saude-backend.agendamentos-test/exigir-banco-de-teste!
          "jdbc:postgresql://localhost:5432/banco_de_producao"))))
  (testing "a mensagem diz os dois nomes, senão não dá para diagnosticar"
    (let [erro (try (#'deep-saude-backend.agendamentos-test/exigir-banco-de-teste!
                     "jdbc:postgresql://localhost:5432/banco_de_producao")
                    (catch clojure.lang.ExceptionInfo e e))]
      (is (= "banco_de_producao" (:esperado (ex-data erro))))
      (is (some? (:conectado (ex-data erro)))))))

(deftest guarda-falha-fechada-quando-nao-da-para-determinar-o-banco
  ;; Falhar fechada é o que diferencia uma guarda de um enfeite: URL de onde não
  ;; se extrai nome não pode virar "então deixa passar".
  (doseq [url ["" "jdbc:postgresql://localhost:5432/" "lixo"]]
    (testing (str "URL inutilizável: " (pr-str url))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"ABORTADO"
           (#'deep-saude-backend.agendamentos-test/exigir-banco-de-teste! url))))))

(deftest guarda-aceita-o-banco-certo
  (testing "no banco de teste de verdade ela deixa passar e devolve o nome"
    (let [nome (#'deep-saude-backend.agendamentos-test/exigir-banco-de-teste!
                (env :test-database-url))]
      (is (string? nome))
      (is (seq nome)))))

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

(deftest somente-admin-pode-forcar-conflito
  (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00" :duracao 50))
  (let [sobreposto (assoc sessao-base :data_hora_sessao "2027-03-10T14:30:00"
                                      :duracao 50 :force true)
        psicologo (criar-como "psicologo" sobreposto)]
    (is (= 403 (:status psicologo)))
    (is (= "force_requires_admin" (:code (:body psicologo))))
    (is (= 1 (conta "agendamentos"))
        "a tentativa negada não grava uma segunda sessão")
    (testing "a clínica pode forçar o mesmo conflito"
      (is (= 201 (:status (criar-como "admin_clinica" sobreposto))))
      (is (= 2 (conta "agendamentos"))))))

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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; R-004 — passado é imutável (A-001 e A-002)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Estes dois testes descrevem a R-004. Foram escritos **antes** da correção de
;; A-001 e A-002 e falhavam contra o código de então, como manda a D-008;
;; a correção entrou no commit seguinte e eles passaram a descrever também o
;; que o código faz.
;;
;; Por que os testes que já existiam não pegaram: todos usam série inteiramente
;; no futuro (2027). Nos três modos, com a série toda no futuro, o
;; comportamento certo e o errado são indistinguíveis — só ocorrência já
;; realizada separa um do outro. É por isso que a série montada aqui atravessa
;; hoje, e é a única coisa que não pode ser simplificada nestes testes.
;;
;; ⚠️ Escritos pela `orla` (Claude na sandbox), que **não compila Clojure** —
;; Clojars é bloqueado pela política de saída do ambiente. O SQL dos dois modos
;; foi verificado aqui contra PostgreSQL 16
;; (docs/reproducoes/serie_reescreve_passado.sql); a suíte, não.
;; ✅ A `duna` (GPT local) executou os dois em PostgreSQL 18 — verdes, sem
;; regressão nos modos `all` e `all_future` (mensageria/0026).

(def ^:private fuso-sp (java.time.ZoneId/of "America/Sao_Paulo"))

(defn- parede
  "Horário de parede em São Paulo, `dias` a partir de agora, na hora cheia `hora`.

   Relativo a hoje de propósito. Data fixa no futuro vira data no passado com o
   tempo, e o teste passaria a exercitar outro caso — calado, e justamente do
   lado errado da fronteira que ele existe para vigiar."
  [dias hora]
  (-> (java.time.ZonedDateTime/now fuso-sp)
      (.plusDays dias)
      (.withHour hora) (.withMinute 0) (.withSecond 0) (.withNano 0)
      (.format (java.time.format.DateTimeFormatter/ofPattern "yyyy-MM-dd'T'HH:mm:ss"))))

(defn- serie-atravessando-hoje!
  "Série semanal de seis às 14:00, começando 24 dias atrás: quatro já
   realizadas e pagas, duas por vir. Devolve os ids em ordem cronológica.

   Os deslocamentos (-24, -17, -10, -3, +4, +11) evitam de propósito cair em
   cima de hoje: ocorrência no dia da execução ficaria de um lado ou do outro
   de `now()` conforme a hora em que a suíte rodasse.

   As passadas ficam valendo 350 — diferente dos 200 da série — para que
   reescrita silenciosa apareça na asserção em vez de se confundir com o valor
   que já estava lá."
  []
  (criar (assoc sessao-base :data_hora_sessao (parede -24 14)
                            :recorrencia_tipo "semanal" :quantidade_recorrencia 6))
  (db/execute-one! ["UPDATE agendamentos
                        SET status = 'realizado', status_pagamento = 'pago', valor_consulta = 350
                      WHERE data_hora_sessao < now()"])
  (mapv :id (db/execute-query! ["SELECT id FROM agendamentos ORDER BY data_hora_sessao"])))

(defn- ocorrencias []
  (db/execute-query!
   ["SELECT to_char(data_hora_sessao AT TIME ZONE 'America/Sao_Paulo',
                    'YYYY-MM-DD HH24:MI') AS parede,
            valor_consulta,
            (data_hora_sessao < now()) AS passada
       FROM agendamentos ORDER BY data_hora_sessao"]))

(defn- so-o-horario [linhas] (mapv #(subs (:parede %) 11) linhas))
(defn- passadas [] (filterv :passada (ocorrencias)))
(defn- futuras  [] (filterv (complement :passada) (ocorrencias)))

(deftest all-nao-reescreve-ocorrencia-ja-realizada
  ;; A-001. O usuário abre a última sessão da série e escolhe "a série toda"
  ;; para mudar o horário das próximas. Hoje o handler seleciona por
  ;; `recorrencia_id` sem filtro de data nem de status, e como `novo-valor`
  ;; nunca é nil, grava `valor_consulta` em todas — o livro financeiro muda
  ;; depois de o dinheiro ter andado, e a resposta diz "6 agendamentos
  ;; atualizados com sucesso".
  (let [ids  (serie-atravessando-hoje!)
        resp (atualizar (last ids) {:data_hora_sessao (parede 11 9) :mode "all"})]
    (is (= 200 (:status resp)))
    (testing "as quatro que já aconteceram continuam às 14:00"
      (is (= ["14:00" "14:00" "14:00" "14:00"] (so-o-horario (passadas)))))
    (testing "e continuam valendo o que valiam quando foram pagas"
      (is (every? #(== 350M (bigdec (:valor_consulta %))) (passadas))))
    (testing "as duas por vir adotam o horário novo — é o que o usuário pediu"
      (is (= ["09:00" "09:00"] (so-o-horario (futuras)))))))

(deftest all-future-corta-em-hoje-nao-na-ocorrencia-aberta
  ;; A-002. O corte de "esta e as seguintes" é a data da ocorrência aberta, não
  ;; `now()`. Abrir a sessão de três semanas atrás alcança tudo daquela data em
  ;; diante — inclusive as realizadas — e reescreve o valor de cada uma pela
  ;; mesma porta da A-001.
  (let [ids  (serie-atravessando-hoje!)
        resp (atualizar (first ids) {:data_hora_sessao (parede -24 9) :mode "all_future"})]
    (is (= 200 (:status resp)))
    (testing "abrir a mais antiga não alcança as sessões já realizadas"
      (is (= ["14:00" "14:00" "14:00" "14:00"] (so-o-horario (passadas))))
      (is (every? #(== 350M (bigdec (:valor_consulta %))) (passadas))))
    (testing "de hoje em diante, muda"
      (is (= ["09:00" "09:00"] (so-o-horario (futuras)))))))

(deftest atualizar-respeita-fronteira-entre-clinicas
  (let [avulsa (:body (criar (assoc sessao-base :data_hora_sessao "2027-03-10T14:00:00")))]
    (testing "clínica B não enxerga nem altera agendamento da clínica A"
      (is (= 404 (:status (atualizar (:id avulsa) {:status "cancelado"} :clinica clinica-b)))))
    (testing "e o dado continua intocado"
      (is (= "agendado" (:status (db/execute-one! ["SELECT status FROM agendamentos"])))))))

(deftest atualizar-agendamento-inexistente-da-404
  (is (= 404 (:status (atualizar (java.util.UUID/randomUUID) {:status "cancelado"})))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; R-006 — conflito ao mudar ocupação da agenda (A-007)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest atualizar-duracao-recusa-invasao-sem-mandar-data
  (let [primeira (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-10T14:00:00"
                                                   :duracao 50)))]
    (criar (assoc sessao-base :data_hora_sessao "2027-06-10T15:00:00" :duracao 50))
    (let [resp (atualizar (:id primeira) {:duracao 90})]
      (is (= 409 (:status resp)))
      (is (= 50 (:duracao (db/execute-one! ["SELECT duracao FROM agendamentos WHERE id = ?"
                                            (:id primeira)])))))))

(deftest atualizar-psicologo-recusa-agenda-ocupada-sem-mandar-data
  (let [a-mover (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-11T14:00:00"
                                                  :duracao 50)))
        ocupada (assoc sessao-base :data_hora_sessao "2027-06-11T14:00:00"
                                    :psicologo_id (str psicologo-a2) :duracao 50)]
    (criar ocupada)
    (let [resp (atualizar (:id a-mover) {:psicologo_id (str psicologo-a2)})]
      (is (= 409 (:status resp)))
      (is (= psicologo-a
             (:psicologo_id (db/execute-one! ["SELECT psicologo_id FROM agendamentos WHERE id = ?"
                                              (:id a-mover)])))))))

(deftest atualizar-dinheiro-de-sessao-forcada-continua-permitido
  (criar-como "admin_clinica"
              (assoc sessao-base :data_hora_sessao "2027-06-12T14:00:00" :duracao 50))
  (let [forcada (:body (criar-como "admin_clinica"
                                   (assoc sessao-base :data_hora_sessao "2027-06-12T14:30:00"
                                                       :duracao 50 :force true)))
        resp (atualizar (:id forcada) {:status_pagamento "pago"})]
    (is (= 200 (:status resp)))
    (is (= "pago" (:status_pagamento (:body resp))))
    (is (= "manual" (:status_pagamento_origem (:body resp))))))

(deftest atualizar-duracao-menor-sem-sobreposicao-continua-permitido
  (let [sessao (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-13T14:00:00"
                                                 :duracao 50)))
        resp (atualizar (:id sessao) {:duracao 30})]
    (is (= 200 (:status resp)))
    (is (= 30 (:duracao (:body resp))))))

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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; R-014 — bloqueio nunca cancela sessão (A-006)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest bloqueio-recusa-sessao-futura-sem-alterar-agendamento
  (let [inicio (parede 4 14)
        fim (parede 4 15)
        sessao (:body (criar (assoc sessao-base :data_hora_sessao inicio)))
        resp (criar-bloqueio {:data_inicio inicio :data_fim fim
                              :cancelar_conflitos false})
        gravada (db/execute-one! ["SELECT status, valor_consulta FROM agendamentos WHERE id = ?"
                                  (:id sessao)])]
    (is (= 409 (:status resp)))
    (is (= "session_conflict" (:code (:body resp))))
    (is (= 1 (count (:sessoes (:body resp)))))
    (is (= #{:id :data_hora_sessao :duracao}
           (set (keys (first (:sessoes (:body resp)))))))
    (is (= "agendado" (:status gravada)))
    (is (== 200M (bigdec (:valor_consulta gravada))))
    (is (zero? (conta "bloqueios_agenda")))))

(deftest cancelar-conflitos-nao-cancela-sessao-passada-realizada
  (let [inicio (parede -4 14)
        fim (parede -4 15)
        sessao (:body (criar (assoc sessao-base :data_hora_sessao inicio)))]
    (db/execute-one! ["UPDATE agendamentos
                          SET status = 'realizado', valor_consulta = 350
                        WHERE id = ?" (:id sessao)])
    (let [resp (criar-bloqueio {:data_inicio inicio :data_fim fim
                                :cancelar_conflitos true})
          gravada (db/execute-one! ["SELECT status, valor_consulta FROM agendamentos WHERE id = ?"
                                    (:id sessao)])]
      (is (= 409 (:status resp)))
      (is (= "session_conflict" (:code (:body resp))))
      (is (= "realizado" (:status gravada)))
      (is (== 350M (bigdec (:valor_consulta gravada))))
      (is (zero? (conta "bloqueios_agenda"))))))

(deftest bloqueio-sem-sobreposicao-continua-sendo-criado
  (let [resp (criar-bloqueio {:data_inicio (parede 6 14)
                              :data_fim (parede 6 15)
                              :cancelar_conflitos true})]
    (is (= 201 (:status resp)))
    (is (= 1 (conta "bloqueios_agenda")))))

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
            [buddy.sign.jwt :as jwt]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.pacientes.portabilidade :as portabilidade-pacientes]))

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
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))]
    (doseq [[cli psi pac nome] [[clinica-a psicologo-a paciente-a "A"]
                                [clinica-b psicologo-b paciente-b "B"]]]
      (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, ?)
                         ON CONFLICT (id) DO NOTHING" cli (str "Clinica " nome)])
      (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                         VALUES (?, ?, ?, ?, ?, 'x')
                         ON CONFLICT (id) DO UPDATE SET papel_id = EXCLUDED.papel_id"
                        psi cli papel (str "Psi " nome) (str "psi-" (str/lower-case nome) "@teste.local")])
      (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                         VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING"
                        pac cli (str "Paciente " nome) psi])))
  ;; A regra pode mudar dentro de um teste; fixture precisa devolver o legado
  ;; de 50% para o próximo, assim como devolve as tabelas transacionais.
  (db/execute-one! ["UPDATE usuarios
                        SET modalidade_repasse = 'percentual', percentual_repasse = 50,
                            valor_fixo_repasse = NULL
                      WHERE id IN (?, ?, ?)"
                    psicologo-a psicologo-a2 psicologo-b])
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))]
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                       VALUES (?, ?, ?, 'Psi A2', 'psi-a2@teste.local', 'x')
                       ON CONFLICT (id) DO UPDATE SET papel_id = EXCLUDED.papel_id"
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
      ;; 🔴 O segredo entra AQUI, e não pela variável de ambiente.
      ;;
      ;; O job do backend no CI não define `JWT_SECRET` — só o smoke e o e2e
      ;; definem. Sem esta linha, `@core/jwt-secret` fica nulo, o
      ;; `renovar-sessao-handler` cai no próprio `catch` e devolve 500 sem
      ;; `:token`; o teste então chama `jwt/unsign` com nil e estoura um NPE.
      ;;
      ;; ⚠️ E o estrago não é o NPE: é que `lein test` conta isso como **erro**,
      ;; não como **falha**. Quem ler só "0 failures" lê verde num teste que não
      ;; rodou. Mesmo padrão do `plataforma_test.clj`, que já resolvia assim.
      (with-redefs [db/datasource (delay ds)
                    core/jwt-secret (delay "segredo-apenas-para-agendamentos-test")]
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

(defn- limpar-pacientes-da-portabilidade! []
  ;; O teste de importação cria cadastros além da fixture. Removê-los antes e
  ;; depois mantém a suíte repetível mesmo quando uma execução anterior falha.
  (db/execute-one! ["DELETE FROM pacientes
                      WHERE email IN ('importada@teste.local', 'outra-carteira@teste.local')"]))

(defn entre-testes [f]
  (if (env :test-database-url)
    (do
      (limpar-agendamentos!)
      (limpar-pacientes-da-portabilidade!)
      (try
        (f)
        (finally
          (limpar-pacientes-da-portabilidade!))))
    (f)))

(use-fixtures :once com-banco-de-teste)
(use-fixtures :each entre-testes)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- criar [body & {:keys [clinica] :or {clinica clinica-a}}]
  (core/criar-agendamento-handler {:identity {:clinica_id clinica} :body body}))

(deftest importacao-de-pacientes-tem-previa-e-upsert-sem-atravessar-carteira
  (let [identidade-admin {:clinica_id clinica-a :user_id psicologo-a :role "admin_clinica"}
        registro {:linha_arquivo 2
                  :nome "Paciente importada"
                  :email "importada@teste.local"
                  :data_nascimento "1992-04-18"
                  :psicologo_email "psi-a@teste.local"
                  :status "ativo"
                  :diagnostico "Hipótese trazida da base anterior"}
        quantidade-antes (:c (db/execute-one! ["SELECT count(*) AS c FROM pacientes WHERE clinica_id = ?" clinica-a]))
        previa (portabilidade-pacientes/importar-handler
                {:identity identidade-admin
                 :body {:registros [registro]
                        :estrategia "ignorar_existentes"
                        :validar_apenas true}})]
    (is (= 200 (:status previa)))
    (is (= 1 (get-in previa [:body :novos])))
    (is (= quantidade-antes
           (:c (db/execute-one! ["SELECT count(*) AS c FROM pacientes WHERE clinica_id = ?" clinica-a])))
        "prévia não pode escrever")

    (let [importacao (portabilidade-pacientes/importar-handler
                      {:identity identidade-admin
                       :body {:registros [registro]
                              :estrategia "ignorar_existentes"}})
          gravada (db/execute-one! ["SELECT * FROM pacientes WHERE clinica_id = ? AND email = ?"
                                    clinica-a "importada@teste.local"])]
      (is (= 200 (:status importacao)))
      (is (= psicologo-a (:psicologo_id gravada)))
      (is (= "Hipótese trazida da base anterior" (:diagnostico gravada)))

      (let [atualizacao (portabilidade-pacientes/importar-handler
                         {:identity identidade-admin
                          :body {:registros [(assoc registro
                                                   :agenda_wise_id (str (:id gravada))
                                                   :nome "Paciente importada e revisada")]
                                 :estrategia "atualizar_existentes"}})]
        (is (= 200 (:status atualizacao)))
        (is (= 1 (get-in atualizacao [:body :atualizaveis])))
        (is (= "Paciente importada e revisada"
               (:nome (db/execute-one! ["SELECT nome FROM pacientes WHERE id = ?" (:id gravada)]))))))

    (let [de-outra-psi #uuid "aaaaaaaa-0000-0000-0000-0000000000d9"]
      (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, psicologo_id, nome, email)
                         VALUES (?, ?, ?, 'Paciente de outra psi', 'outra-carteira@teste.local')"
                        de-outra-psi clinica-a psicologo-a2])
      (let [recusa (portabilidade-pacientes/importar-handler
                    {:identity {:clinica_id clinica-a :user_id psicologo-a :role "psicologo"}
                     :body {:registros [{:nome "Tentativa de sobrescrita"
                                         :email "outra-carteira@teste.local"}]
                            :estrategia "atualizar_existentes"
                            :validar_apenas true}})]
        (is (= 422 (:status recusa)))
        (is (= "patient_import_conflict" (get-in recusa [:body :code])))))))

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

(defn- atualizar-como
  "Como `atualizar`, mas com o papel escolhido — a R-020 separa quem pode forcar."
  [papel id body & {:keys [clinica] :or {clinica clinica-a}}]
  (core/atualizar-agendamento-handler
   {:identity {:clinica_id clinica
               :user_id psicologo-a
               :papel_id (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" papel]))
               :role papel}
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
  ;; O relógio nunca confirma presença. A sessão só passa a `realizado` por uma
  ;; ação humana; depois disso, a configuração da clínica decide se o pagamento
  ;; fecha junto ou continua pendente para o financeiro.
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
    (is (= ["agendado" "pendente" "desconhecido"]
           ((juxt :status :status_pagamento :status_pagamento_origem) habilitada))
        "nem a clínica automática pode transformar passagem do tempo em presença")
    (is (= ["agendado" "pendente" "desconhecido"]
           ((juxt :status :status_pagamento :status_pagamento_origem) desabilitada))))

  (is (= 200 (:status (atualizar #uuid "aaaaaaaa-0000-0000-0000-0000000000e1"
                                 {:status "realizado"}))))
  (is (= 200 (:status (atualizar #uuid "bbbbbbbb-0000-0000-0000-0000000000e2"
                                 {:status "realizado"}
                                 :clinica clinica-b))))

  (let [habilitada (db/execute-one! ["SELECT status, status_pagamento, status_pagamento_origem,
                                             valor_repasse, modalidade_repasse_aplicada,
                                             percentual_repasse_aplicado
                                       FROM agendamentos WHERE clinica_id = ?" clinica-a])
        desabilitada (db/execute-one! ["SELECT status, status_pagamento, status_pagamento_origem
                                        FROM agendamentos WHERE clinica_id = ?" clinica-b])]
    (is (= ["realizado" "pago" "automatico"]
           ((juxt :status :status_pagamento :status_pagamento_origem) habilitada)))
    (is (== 100M (bigdec (:valor_repasse habilitada))))
    (is (= "percentual" (:modalidade_repasse_aplicada habilitada)))
    (is (== 50M (bigdec (:percentual_repasse_aplicado habilitada))))
    (is (= ["realizado" "pendente" "desconhecido"]
           ((juxt :status :status_pagamento :status_pagamento_origem) desabilitada)))

    ;; R-004: mudar a psicóloga para R$40 fixos não reescreve a sessão de R$100
    ;; calculada acima. Só a próxima sessão recebe a regra nova.
    (db/execute-one! ["UPDATE usuarios
                          SET modalidade_repasse = 'fixo', percentual_repasse = NULL,
                              valor_fixo_repasse = 40
                        WHERE id = ?" psicologo-a])
    (let [nova #uuid "aaaaaaaa-0000-0000-0000-0000000000e3"]
      (db/execute-one! ["INSERT INTO agendamentos
                         (id, clinica_id, paciente_id, psicologo_id, data_hora_sessao,
                          duracao, valor_consulta, status, status_pagamento)
                         VALUES (?, ?, ?, ?, now() - interval '1 day', 50, 300,
                                 'realizado', 'pendente')"
                        nova clinica-a paciente-a psicologo-a])
      (core/sincronizar-status-global!)
      (let [antiga (db/execute-one! ["SELECT valor_repasse, modalidade_repasse_aplicada
                                       FROM agendamentos WHERE id = ?"
                                      #uuid "aaaaaaaa-0000-0000-0000-0000000000e1"])
            nova-gravada (db/execute-one! ["SELECT valor_repasse, modalidade_repasse_aplicada,
                                                  valor_fixo_repasse_aplicado
                                             FROM agendamentos WHERE id = ?" nova])]
        (is (= [100M "percentual"]
               ((juxt #(bigdec (:valor_repasse %)) :modalidade_repasse_aplicada) antiga)))
        (is (= [40M "fixo" 40M]
               ((juxt #(bigdec (:valor_repasse %)) :modalidade_repasse_aplicada
                      #(bigdec (:valor_fixo_repasse_aplicado %))) nova-gravada)))))))

(deftest sessao-futura-nao-pode-ser-confirmada-como-realizada
  (let [id #uuid "aaaaaaaa-0000-0000-0000-0000000000e4"]
    (db/execute-one! ["INSERT INTO agendamentos
                        (id, clinica_id, paciente_id, psicologo_id, data_hora_sessao,
                         duracao, valor_consulta, status, status_pagamento)
                        VALUES (?, ?, ?, ?, now() + interval '1 day', 50, 200,
                                'agendado', 'pendente')"
                       id clinica-a paciente-a psicologo-a])
    (let [resp (atualizar id {:status "realizado"})
          gravada (db/execute-one! ["SELECT status, status_pagamento FROM agendamentos WHERE id = ?" id])]
      (is (= 422 (:status resp)))
      (is (= "session_not_finished" (get-in resp [:body :code])))
      (is (= ["agendado" "pendente"]
             ((juxt :status :status_pagamento) gravada))))))

(deftest repasse-mensal-e-em-lote-por-periodo-e-psicologa
  (let [dentro #uuid "aaaaaaaa-0000-0000-0000-0000000000f1"
        fora #uuid "aaaaaaaa-0000-0000-0000-0000000000f2"]
    (doseq [[id data] [[dentro "2026-07-15 14:00:00"]
                       [fora "2026-08-01 14:00:00"]]]
      (db/execute-one! ["INSERT INTO agendamentos
                         (id, clinica_id, paciente_id, psicologo_id, data_hora_sessao,
                          valor_consulta, status, status_pagamento, status_repasse,
                          valor_repasse, modalidade_repasse_aplicada,
                          percentual_repasse_aplicado, repasse_calculado_em)
                         VALUES (?, ?, ?, ?, ?::timestamp, 200, 'realizado', 'pago',
                                 'disponivel', 100, 'percentual', 50, now())"
                        id clinica-a paciente-a psicologo-a data]))
    (let [resp (core/marcar-repasses-transferidos-handler
                {:identity {:clinica_id clinica-a}
                 :body {:psicologo_id (str psicologo-a)
                        :data_inicio "2026-07-01"
                        :data_fim "2026-07-31"}})]
      (is (= 200 (:status resp)))
      (is (= 1 (get-in resp [:body :quantidade])))
      (is (== 100M (bigdec (get-in resp [:body :valor_total]))))
      (is (= "transferido" (:status_repasse
                             (db/execute-one! ["SELECT status_repasse FROM agendamentos WHERE id = ?" dentro]))))
      (is (= "disponivel" (:status_repasse
                            (db/execute-one! ["SELECT status_repasse FROM agendamentos WHERE id = ?" fora]))))
      ;; Repetir o mesmo lote é idempotente, não paga duas vezes.
      (let [segunda (core/marcar-repasses-transferidos-handler
                     {:identity {:clinica_id clinica-a}
                      :body {:psicologo_id (str psicologo-a)
                             :data_inicio "2026-07-01"
                             :data_fim "2026-07-31"}})]
        (is (= 0 (get-in segunda [:body :quantidade])))
        (is (zero? (bigdec (get-in segunda [:body :valor_total]))))))))

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

(deftest atualizar-com-o-payload-que-a-tela-manda-nao-pode-travar
  ;; A-011 — a guarda protege a API e nao protege a tela.
  ;;
  ;; O teste vizinho, `atualizar-dinheiro-de-sessao-forcada-continua-permitido`,
  ;; manda UM campo: `{:status_pagamento "pago"}`. Ele passa. Mas o formulario do
  ;; admin nao manda um campo — o `agendamentoSchema` de
  ;; `src/app/admin/agendamentos/actions.ts` EXIGE `psicologo_id` e
  ;; `data_hora_sessao`, entao toda edicao pela tela manda os dois, **iguais ao
  ;; que ja esta gravado**.
  ;;
  ;; A checagem dispara por PRESENCA do campo, nao por MUDANCA de valor. Entao
  ;; marcar pagamento pela tela, em sessao que um admin sobrepos legitimamente
  ;; com `force`, da 409 — exatamente o caso que o teste vizinho jurava proteger.
  ;;
  ;; ⚠️ Este teste existe porque o outro dava uma garantia que a tela nao tem.
  (criar-como "admin_clinica"
              (assoc sessao-base :data_hora_sessao "2027-06-14T14:00:00" :duracao 50))
  (let [forcada (:body (criar-como "admin_clinica"
                                   (assoc sessao-base :data_hora_sessao "2027-06-14T14:30:00"
                                                      :duracao 50 :force true)))
        ;; O payload da tela: tudo, sempre, com o intervalo INALTERADO.
        ;;
        ;; ⚠️ A data vai no formato que `paraPayloadParede` produz — com ESPAÇO,
        ;; não com `T`. Escrevi "2027-06-14T14:30:00" na primeira versao e parei:
        ;; a sessao foi CRIADA com `T` e a tela ATUALIZA com espaco, entao um
        ;; teste que usasse a mesma forma nos dois lados provaria uma igualdade
        ;; que a tela nunca exercita. Se as duas formas nao caissem no mesmo
        ;; instante, este teste ficaria verde e a tela continuaria travada — que e
        ;; exatamente o defeito que ele existe para pegar.
        resp (atualizar (:id forcada) (assoc sessao-base
                                             :data_hora_sessao "2027-06-14 14:30:00"
                                             :duracao 50
                                             :status_pagamento "pago"))]
    (is (= 200 (:status resp))
        "editar pela tela uma sessao forcada da 409 — a pessoa bate na parede na interface")
    (is (= "pago" (:status_pagamento (:body resp))))
    (testing "e o intervalo continua onde estava"
      (is (= ["2027-06-14 14:00" "2027-06-14 14:30"] (horarios-de-parede))))))

(deftest atualizar-que-de-fato-move-para-cima-de-outra-continua-recusado
  ;; O contrapeso do teste acima, e ele nao e opcional: "so checar quando mudou"
  ;; e uma frase que, mal implementada, vira "nunca checar". Este segura o lado
  ;; que a correcao NAO pode afrouxar.
  (let [primeira (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-15T14:00:00"
                                                  :duracao 50)))]
    (criar (assoc sessao-base :data_hora_sessao "2027-06-15T16:00:00" :duracao 50))
    (let [resp (atualizar (:id primeira) (assoc sessao-base
                                                :data_hora_sessao "2027-06-15T16:00:00"
                                                :duracao 50))]
      (is (= 409 (:status resp))
          "mover de verdade para cima de outra sessao tem que continuar recusado")
      (testing "e nada foi gravado"
        (is (= ["2027-06-15 14:00" "2027-06-15 16:00"] (horarios-de-parede)))))))

(deftest atualizar-com-force-e-privilegio-do-admin
  ;; R-020 (1) — *"o admin sempre tem forca"*, e o Gabriel disse que vale tambem
  ;; no caminho de atualizacao, onde hoje o campo `force` **nao existe**.
  ;;
  ;; Sem isto, a A-009 nasce pela metade: o admin ganha botao para CRIAR sobre
  ;; conflito e continua sem poder MOVER uma sessao para cima de outra.
  (let [a-mover (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-16T14:00:00"
                                                 :duracao 50)))]
    (criar (assoc sessao-base :data_hora_sessao "2027-06-16T16:00:00" :duracao 50))
    (testing "o psicologo nao force nem mesmo mandando o campo"
      (let [resp (atualizar-como "psicologo" (:id a-mover)
                                 {:data_hora_sessao "2027-06-16T16:00:00" :force true})]
        (is (= 403 (:status resp)))
        (is (= "force_requires_admin" (:code (:body resp))))
        (is (= ["2027-06-16 14:00" "2027-06-16 16:00"] (horarios-de-parede))
            "a tentativa negada nao pode ter movido a sessao")))
    (testing "a clinica move a mesma sessao para cima do conflito"
      (let [resp (atualizar-como "admin_clinica" (:id a-mover)
                                 {:data_hora_sessao "2027-06-16T16:00:00" :force true})]
        (is (= 200 (:status resp)))
        (is (= ["2027-06-16 16:00" "2027-06-16 16:00"] (horarios-de-parede)))))))

(deftest atualizar-sem-force-nomeia-o-conflito-como-a-criacao-ja-faz
  ;; ⚠️ Correcao de rumo minha: eu tinha escrito este teste exigindo
  ;; `session_conflict` e a lista `:sessoes`. **Estava errado.** Fui ler os dois
  ;; caminhos: aquele contrato e da **R-014**, que e bloqueio-sobre-sessao, e a
  ;; lista existe la porque a pessoa precisa saber o que ajustar.
  ;;
  ;; Conflito entre AGENDAMENTOS tem outro contrato — `appointment_conflict`, sem
  ;; lista — e e esse que o `(app)/calendar/actions.ts` ja le para abrir o modal
  ;; de forcar. Copiar o contrato errado teria feito a tela do admin esperar um
  ;; campo que ninguem manda.
  ;;
  ;; O buraco real e mais simples: a CRIACAO nomeia o conflito, a ATUALIZACAO
  ;; devolve so uma frase. Sem `code`, a tela nao tem como distinguir "conflito,
  ;; te ofereco forcar" de "deu erro" — entao o botao de forcar da A-009 nao teria
  ;; onde se pendurar no caminho de edicao.
  (let [a-mover (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-17T14:00:00"
                                                 :duracao 50)))]
    (criar (assoc sessao-base :data_hora_sessao "2027-06-17T16:00:00" :duracao 50))
    (let [resp (atualizar (:id a-mover) {:data_hora_sessao "2027-06-17T16:00:00"})]
      (is (= 409 (:status resp)))
      (is (= "appointment_conflict" (:code (:body resp)))
          "sem code a tela nao distingue conflito de erro qualquer, e o modal de forcar nao pode existir"))))

(deftest atualizar-sessao-cancelada-dentro-de-bloqueio-nao-pode-travar
  ;; A mesma A-011 num segundo lugar, que nenhum dos dois cartoes cita: a
  ;; checagem de BLOQUEIO no caminho de atualizacao roda **sempre** — nao tem nem
  ;; o `when` que a de conflito tem.
  ;;
  ;; ⚠️ Achar o caminho alcancavel deu trabalho, e a primeira versao deste teste
  ;; era um FALSO VERDE. Eu tinha escrito "cria a sessao, cria o bloqueio por
  ;; cima" — mas criar bloqueio sobre sessao e recusado (R-014) e nao tem `force`.
  ;; O bloqueio nunca existiria, o 409 nunca aconteceria, e o teste passaria
  ;; provando nada.
  ;;
  ;; O caminho que existe de verdade e este: a criacao de bloqueio ignora sessao
  ;; **cancelada** (`status != 'cancelado'`). Entao cancelar e depois bloquear o
  ;; periodo e uma sequencia que a clinica faz sem forcar nada — e a partir dai a
  ;; sessao cancelada fica **impossivel de editar pela tela**. Corrigir o valor,
  ;; anotar o motivo ou DESFAZER o cancelamento: tudo 409.
  (let [sessao (:body (criar (assoc sessao-base :data_hora_sessao "2027-06-18T14:00:00"
                                                :duracao 50)))]
    (is (= 200 (:status (atualizar (:id sessao) {:status "cancelado"}))))
    (testing "com a sessao cancelada, a clinica consegue bloquear o periodo"
      (is (= 201 (:status (criar-bloqueio {:data_inicio "2027-06-18T13:00:00"
                                           :data_fim "2027-06-18T18:00:00"
                                           :motivo "ferias"})))
          "se isto nao for 201 o resto do teste nao prova nada — era o falso verde"))
    (testing "e a sessao cancelada continua editavel"
      (let [resp (atualizar (:id sessao) (assoc sessao-base
                                                :data_hora_sessao "2027-06-18T14:00:00"
                                                :duracao 50
                                                :observacoes "cancelada pela paciente"))]
        (is (= 200 (:status resp))
            "a sessao ficou congelada dentro do bloqueio, sem saida pela tela")))
    (testing "mas MOVER para outro horario do bloqueio continua recusado"
      (let [resp (atualizar (:id sessao) {:data_hora_sessao "2027-06-18T16:00:00"})]
        (is (= 409 (:status resp)))
        (is (= "block_conflict" (:code (:body resp)))
            "a criacao ja nomeia este 409; a atualizacao devolvia so uma frase")))))

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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; D-024 — a janela `disponivel` divide a tabela com o bloqueio e NÃO proíbe
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest janela-disponivel-nao-impede-agendar-e-bloqueio-ainda-impede
  ;; 🔴 Os dois casos vivem no MESMO teste de propósito, e isto é o ponto.
  ;;
  ;; "disponível deixa agendar", sozinho, não mede nada: ele passaria igual se o
  ;; filtro `tipo = 'bloqueio'` estivesse certo E se a checagem de bloqueio
  ;; tivesse sumido por inteiro. As duas hipóteses dão o mesmo verde. O que as
  ;; separa é o controle positivo — a linha de bloqueio que CONTINUA recusando.
  (let [manha     (parede 8 9)
        manha-fim (parede 8 10)
        tarde     (parede 8 15)
        tarde-fim (parede 8 16)]
    (is (= 201 (:status (criar-bloqueio {:data_inicio manha :data_fim manha-fim
                                         :tipo "disponivel"})))
        "a psicóloga oferece a manhã")
    (is (= 201 (:status (criar-bloqueio {:data_inicio tarde :data_fim tarde-fim
                                         :tipo "bloqueio"})))
        "e fecha a tarde")

    (testing "agendar na janela OFERECIDA é permitido"
      (is (= 201 (:status (criar (assoc sessao-base :data_hora_sessao manha))))))

    (testing "CONTROLE — agendar no horário FECHADO continua recusado"
      (let [resp (criar (assoc sessao-base :data_hora_sessao tarde))]
        (is (= 409 (:status resp)))
        (is (= "block_conflict" (:code (:body resp))))))))

(deftest janela-disponivel-nao-impede-mover-sessao-e-bloqueio-ainda-impede
  ;; O mesmo par, no caminho de ATUALIZAR. São duas consultas distintas no
  ;; `core.clj` (criação e atualização) e já houve defeito que existia numa e
  ;; não na outra — a assimetria é a regra desta casa, não a exceção.
  (let [origem         (parede 9 8)
        oferecido      (parede 9 11)
        oferecido-fim  (parede 9 12)
        fechado        (parede 9 17)
        fechado-fim    (parede 9 18)
        sessao (:body (criar (assoc sessao-base :data_hora_sessao origem)))]
    (is (= 201 (:status (criar-bloqueio {:data_inicio oferecido :data_fim oferecido-fim
                                         :tipo "disponivel"}))))
    (is (= 201 (:status (criar-bloqueio {:data_inicio fechado :data_fim fechado-fim
                                         :tipo "bloqueio"}))))

    (testing "mover para dentro da janela OFERECIDA é permitido"
      (is (= 200 (:status (atualizar (:id sessao) {:data_hora_sessao oferecido})))))

    (testing "CONTROLE — mover para dentro do horário FECHADO continua recusado"
      (let [resp (atualizar (:id sessao) {:data_hora_sessao fechado})]
        (is (= 409 (:status resp)))
        (is (= "block_conflict" (:code (:body resp))))))))

(deftest janela-sem-tipo-continua-sendo-bloqueio
  ;; Compatibilidade, e ela não é detalhe: a tela de bloquear horário não manda
  ;; `tipo` e não deve precisar mandar. Se o default escorregasse para
  ;; `disponivel`, TODO bloqueio que já existe deixaria de proibir — e o sintoma
  ;; seria uma ausência, que é a família de defeito mais cara deste projeto.
  (let [inicio (parede 11 14)
        fim    (parede 11 15)]
    (is (= 201 (:status (criar-bloqueio {:data_inicio inicio :data_fim fim}))))
    (is (= "bloqueio" (:tipo (db/execute-one! ["SELECT tipo FROM bloqueios_agenda LIMIT 1"])))
        "sem `tipo` no corpo, o banco grava proibição")
    (let [resp (criar (assoc sessao-base :data_hora_sessao inicio))]
      (is (= 409 (:status resp)))
      (is (= "block_conflict" (:code (:body resp)))))))

(deftest tipo-de-janela-fora-do-vocabulario-e-recusado
  ;; Coluna de estado sem validação é campo de texto livre com nome bonito — a
  ;; lição que o `status_repasse` pagou com cinco valores de três vocabulários.
  (let [resp (criar-bloqueio {:data_inicio (parede 10 14)
                              :data_fim    (parede 10 15)
                              :tipo        "disponivel_talvez"})]
    (is (= 422 (:status resp)))
    (is (= "tipo_invalido" (:code (:body resp))))
    (is (zero? (conta "bloqueios_agenda"))
        "nada foi gravado")))

(deftest oferecer-janela-sobre-sessao-existente-e-permitido
  ;; Bloquear por cima de sessão é contradição (R-014) e continua 409. Oferecer
  ;; não é: a psicóloga abre 14h-18h e as 15h já estão ocupadas — o resto segue
  ;; oferecido. Aplicar a recusa do bloqueio ao sinal oposto obrigaria ela a
  ;; picotar a janela em volta de cada sessão para conseguir salvar.
  (let [sessao        (parede 12 15)
        janela-inicio (parede 12 14)
        janela-fim    (parede 12 18)]
    (is (= 201 (:status (criar (assoc sessao-base :data_hora_sessao sessao)))))

    (testing "OFERECER por cima da sessão é aceito"
      (is (= 201 (:status (criar-bloqueio {:data_inicio janela-inicio :data_fim janela-fim
                                           :tipo "disponivel"})))))

    (testing "CONTROLE — BLOQUEAR por cima da mesma sessão continua recusado"
      (let [resp (criar-bloqueio {:data_inicio janela-inicio :data_fim janela-fim
                                  :tipo "bloqueio"})]
        (is (= 409 (:status resp)))
        (is (= "session_conflict" (:code (:body resp))))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; A renovação de sessão — e o teto que impede virar sessão eterna
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- renovar [identity]
  (core/renovar-sessao-handler {:identity identity}))

(defn- claims-de
  "Abre o token com a MESMA biblioteca que o backend usa para assinar.

   📌 A primeira versão decodificava o base64 à mão. Além de mais código, isso
   lia o payload sem CONFERIR a assinatura — então um token mal assinado passaria
   pelo teste. Usar o `unsign` faz o teste falhar também quando a assinatura
   quebra, que é metade do que ele deveria vigiar."
  [token]
  ;; ⚠️ `@core/jwt-secret`, e não `(env :jwt-secret)`: o handler assina com o
  ;; primeiro. Ler do ambiente aqui faria o teste conferir com uma chave
  ;; diferente da que assinou — e passar ou quebrar por motivo errado.
  (jwt/unsign token @core/jwt-secret))

(deftest renovacao-devolve-token-novo-e-o-teto-recusa-sessao-antiga
  ;; 🔴 Os dois casos no MESMO teste, porque separados nenhum dos dois mede.
  ;;
  ;; "renova" sozinho passaria igual se o teto não existisse — e sem teto um
  ;; token roubado vira acesso permanente, bastando renovar antes de cada
  ;; expiração. O controle é a sessão velha que CONTINUA sendo recusada.
  (let [agora (.getEpochSecond (java.time.Instant/now))
        base {:user_id (str psicologo-a) :clinica_id (str clinica-a)
              :papel_id (str (java.util.UUID/randomUUID)) :role "psicologo"
              :plataforma_admin false}]

    (testing "sessão recente renova, e o token novo vale mais uma hora"
      (let [r (renovar (assoc base :sessao_iniciada_em (- agora 600)))
            c (claims-de (get-in r [:body :token]))]
        (is (= 200 (:status r)))
        (is (> (:exp c) agora) "o token novo tem de expirar no futuro")
        (is (<= 3500 (- (:exp c) agora) 3700) "cerca de uma hora")
        (is (= "psicologo" (:role c)) "o papel vem do :identity, não do corpo")))

    (testing "🔴 CONTROLE — o carimbo ORIGINAL viaja adiante, senão o teto não existe"
      ;; Se a renovação reiniciasse a contagem, uma sessão de 11h59 renovaria
      ;; para sempre, uma hora de cada vez.
      (let [inicio (- agora 600)
            c (claims-de (get-in (renovar (assoc base :sessao_iniciada_em inicio)) [:body :token]))]
        (is (= inicio (:sessao_iniciada_em c))
            "a renovação reiniciou a contagem — o teto virou enfeite")))

    (testing "CONTROLE — sessão além do teto é recusada"
      (let [r (renovar (assoc base :sessao_iniciada_em (- agora (* 13 3600))))]
        (is (= 401 (:status r)))
        (is (= "sessao_expirada_no_teto" (:code (:body r))))))

    (testing "e a fronteira: logo antes do teto ainda renova"
      (is (= 200 (:status (renovar (assoc base :sessao_iniciada_em (- agora (* 11 3600))))))))))

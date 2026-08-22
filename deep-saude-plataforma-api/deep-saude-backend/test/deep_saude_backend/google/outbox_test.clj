(ns deep-saude-backend.google.outbox-test
  "A fila de escrita para o Google, contra banco de verdade.

   **Banco real, não mock, de propósito** — como no `agendamentos-test`. O que
   se quer provar aqui é comportamento do Postgres, não da nossa aritmética: o
   `FOR UPDATE SKIP LOCKED`, o `RETURNING`, o `now() + interval`. Um mock
   devolveria o que o teste mandasse devolver e não provaria nenhum dos três.

   ## O executor é de mentira, e isso é o desenho

   Quem fala com o Google é injetado (`:executor`). Os testes daqui medem o que
   é desta camada — reserva, concorrência, backoff, teto — e nada de rede. Isso
   também é o que permite este arquivo existir antes de `google.api/criar-evento!`
   estar pronta.

   ## Rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5442/deep_teste?user=deep&password=deep&sslmode=disable' lein test

   Sem a variável, os testes daqui são pulados e a suíte segue verde."
  (:require [clojure.test :refer :all]
            [clojure.set :as set]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [deep-saude-backend.agendamentos-test :as agtest]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.google.outbox :as outbox]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica   #uuid "0b0b0b0b-0000-0000-0000-00000000000f")
(def psicologa #uuid "0b0b0b0b-0000-0000-0000-0000000000c1")
(def sem-google #uuid "0b0b0b0b-0000-0000-0000-0000000000c2")
(def paciente  #uuid "0b0b0b0b-0000-0000-0000-0000000000d1")

;; O datasource de teste, guardado para os testes que precisam de mais de uma
;; conexão ao mesmo tempo (concorrência). `db/datasource` está sob `with-redefs`
;; e vale só dentro da fixture.
(def ds-teste (atom nil))

(def opcoes {:builder-fn rs/as-unqualified-lower-maps})

(defn- limpar! []
  (db/execute-one! ["DELETE FROM google_sync_outbox WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM agendamentos WHERE clinica_id = ?" clinica])
  ;; Filho antes de pai: `recorrencias` aponta para `pacientes` e `usuarios`, e
  ;; `agendamentos` aponta para a série. Esquecer esta linha derruba a fixture no
  ;; DELETE de `pacientes`, longe da causa.
  (db/execute-one! ["DELETE FROM recorrencias WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM vinculo_agenda WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM google_conexao WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM pacientes WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM usuarios WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM clinicas WHERE id = ?" clinica]))

(defn- semear! []
  (limpar!)
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))]
    (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Clinica Outbox')"
                      clinica])
    (doseq [[id nome email] [[psicologa "Psi Conectada" "psi-outbox@teste.local"]
                             [sem-google "Psi Sem Google" "psi-sem-google@teste.local"]]]
      (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                         VALUES (?, ?, ?, ?, ?, 'x')" id clinica papel nome email]))
    (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                       VALUES (?, ?, 'Paciente Outbox', ?)" paciente clinica psicologa])
    ;; Só a primeira psicóloga conectou o Google.
    (db/execute-one! ["INSERT INTO google_conexao
                         (clinica_id, usuario_id, google_account_email,
                          refresh_token_cifrado, escopos, status)
                       VALUES (?, ?, 'psi-outbox@teste.local', 'cifrado', 'calendar', 'ativa')"
                      clinica psicologa])
    (db/execute-one! ["INSERT INTO vinculo_agenda
                         (clinica_id, usuario_id, google_calendar_id, access_role, status)
                       VALUES (?, ?, 'agenda-outbox@group.calendar.google.com', 'owner', 'ativo')"
                      clinica psicologa])))

(defn- com-banco [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (reset! ds-teste ds)
        (semear!)
        (try (f) (finally (limpar!) (outbox/parar-worker!)))))
    (println (str "\n  [outbox-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val)
                                 (ns-publics 'deep-saude-backend.google.outbox-test)))
                  " testes de banco PULADOS.\n"))))

(defn- entre-testes [f]
  (if (env :test-database-url)
    (do (db/execute-one! ["DELETE FROM google_sync_outbox WHERE clinica_id = ?" clinica])
        (db/execute-one! ["DELETE FROM agendamentos WHERE clinica_id = ?" clinica])
        (db/execute-one! ["DELETE FROM recorrencias WHERE clinica_id = ?" clinica])
        (f))
    (f)))

(use-fixtures :once com-banco)
(use-fixtures :each entre-testes)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- enfileirar-teste!
  "Uma linha na fila, direto, sem passar por handler."
  [& {:keys [operacao entidade-id payload]
      :or {operacao "criar" payload {}}}]
  (outbox/enfileirar! @ds-teste
                      {:clinica_id   clinica
                       :psicologo_id psicologa
                       :entidade     "agendamento"
                       :entidade_id  (or entidade-id (java.util.UUID/randomUUID))
                       :operacao     operacao
                       :payload      payload}))

(defn- linha [id]
  (jdbc/execute-one! @ds-teste ["SELECT * FROM google_sync_outbox WHERE id = ?" id] opcoes))

(defn- fila []
  (jdbc/execute! @ds-teste
                 ["SELECT * FROM google_sync_outbox WHERE clinica_id = ? ORDER BY id" clinica]
                 opcoes))

(defn- executor-que-anota
  "Executor de mentira: registra o que recebeu e devolve o desfecho combinado."
  [registro desfecho]
  (fn [item] (swap! registro conj item) desfecho))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Enfileirar
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest enfileirar-grava-a-intencao-com-o-padrao-da-tabela
  (let [entidade-id (java.util.UUID/randomUUID)
        gravada (enfileirar-teste! :entidade-id entidade-id
                                   :payload {:origem "teste" :n 3})
        l (linha (:id gravada))]
    (is (some? (:id gravada)))
    (is (= "pendente" (:status l)))
    (is (= 0 (:tentativas l)))
    (is (= clinica (:clinica_id l)))
    (is (= psicologa (:psicologo_id l)))
    (is (= "agendamento" (:entidade l)))
    (is (= entidade-id (:entidade_id l)))
    (is (= "criar" (:operacao l)))
    (is (nil? (:processado_em l)))
    ;; JSONB de ida e volta: o payload é gravado com cast e lido como PGobject.
    (is (= {:origem "teste" :n 3}
           (-> (jdbc/with-transaction [tx @ds-teste] (outbox/reservar-lote! tx 10))
               first :payload))
        "payload precisa voltar como mapa de Clojure, não como PGobject")))

(deftest enfileirar-recusa-vocabulario-fora-da-tabela
  ;; A coluna não tem CHECK; sem esta guarda, um valor errado só apareceria no
  ;; drenador, horas depois, como item que ninguém sabe entregar.
  (is (thrown? clojure.lang.ExceptionInfo
               (outbox/enfileirar! @ds-teste
                                   {:clinica_id clinica :psicologo_id psicologa
                                    :entidade "consulta" :entidade_id (java.util.UUID/randomUUID)
                                    :operacao "criar"})))
  (is (thrown? clojure.lang.ExceptionInfo
               (outbox/enfileirar! @ds-teste
                                   {:clinica_id clinica :psicologo_id psicologa
                                    :entidade "agendamento" :entidade_id (java.util.UUID/randomUUID)
                                    :operacao "sincronizar"})))
  (is (empty? (fila)) "nada pode ter sido gravado"))

(deftest so-enfileira-para-quem-tem-conexao-ativa
  (let [ags [{:id (java.util.UUID/randomUUID)} {:id (java.util.UUID/randomUUID)}]]
    ;; Controle: a MESMA chamada, com a psicóloga conectada, grava. Sem este
    ;; caso, "gravou zero" não distingue a guarda funcionando de a função
    ;; simplesmente não gravar nunca.
    (is (= 2 (outbox/enfileirar-agendamentos-criados! @ds-teste clinica psicologa ags)))
    (is (= 2 (count (fila))))

    (db/execute-one! ["DELETE FROM google_sync_outbox WHERE clinica_id = ?" clinica])
    (is (= 0 (outbox/enfileirar-agendamentos-criados! @ds-teste clinica sem-google ags))
        "psicóloga sem conexão não gera trabalho que nunca vai completar")
    (is (empty? (fila)))

    ;; Conexão que existe mas foi invalidada (invalid_grant) também não conta.
    (db/execute-one! ["UPDATE google_conexao SET status = 'invalida' WHERE usuario_id = ?" psicologa])
    (is (= 0 (outbox/enfileirar-agendamentos-criados! @ds-teste clinica psicologa ags)))
    (db/execute-one! ["UPDATE google_conexao SET status = 'ativa' WHERE usuario_id = ?" psicologa])))

(deftest criar-agendamento-enfileira-uma-linha-por-sessao
  ;; Prova a única linha acrescentada ao `criar-agendamento-handler`: a sessão e
  ;; a intenção de sincronizá-la commitam juntas.
  (let [resp (core/criar-agendamento-handler
              {:identity {:clinica_id clinica :role "admin_clinica"}
               :body {:paciente_id (str paciente)
                      :psicologo_id (str psicologa)
                      :data_hora_sessao "2030-03-04T10:00:00"
                      :duracao 50}})
        f (fila)]
    (is (= 201 (:status resp)))
    (is (= 1 (count f)))
    (is (= ["agendamento" "criar" "pendente"]
           ((juxt :entidade :operacao :status) (first f))))
    (is (= (get-in resp [:body :id]) (:entidade_id (first f)))
        "a intenção precisa apontar para a sessão que acabou de nascer")

    ;; Série: uma intenção por ocorrência, não uma pela série.
    (db/execute-one! ["DELETE FROM google_sync_outbox WHERE clinica_id = ?" clinica])
    (core/criar-agendamento-handler
     {:identity {:clinica_id clinica :role "admin_clinica"}
      :body {:paciente_id (str paciente)
             :psicologo_id (str psicologa)
             :data_hora_sessao "2030-04-01T08:00:00"
             :duracao 50
             :recorrencia_tipo "semanal"
             :quantidade_recorrencia 3}})
    (is (= 3 (count (fila))))))

(deftest agendamento-de-psicologa-sem-google-nao-enfileira
  ;; Controle do teste acima: o mesmo handler, mudando só a psicóloga.
  (db/execute-one! ["UPDATE pacientes SET psicologo_id = ? WHERE id = ?" sem-google paciente])
  (let [resp (core/criar-agendamento-handler
              {:identity {:clinica_id clinica :role "admin_clinica"}
               :body {:paciente_id (str paciente)
                      :psicologo_id (str sem-google)
                      :data_hora_sessao "2030-03-05T10:00:00"
                      :duracao 50}})]
    (is (= 201 (:status resp)))
    (is (empty? (fila))))
  (db/execute-one! ["UPDATE pacientes SET psicologo_id = ? WHERE id = ?" psicologa paciente]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Drenar — seleção
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest drenar-pega-so-o-que-esta-pendente-e-vencido
  (let [vencida (enfileirar-teste!)
        futura (enfileirar-teste!)
        concluida (enfileirar-teste!)
        descartada (enfileirar-teste!)
        recebidos (atom [])]
    (db/execute-one! ["UPDATE google_sync_outbox SET proxima_em = now() + interval '1 hour' WHERE id = ?"
                      (:id futura)])
    (db/execute-one! ["UPDATE google_sync_outbox SET status = 'ok' WHERE id = ?" (:id concluida)])
    (db/execute-one! ["UPDATE google_sync_outbox SET status = 'descartado' WHERE id = ?" (:id descartada)])

    (let [resumo (outbox/drenar! {:executor (executor-que-anota recebidos {:ok? true})
                                  :aleatorio 0.0})]
      (is (= {:reservados 1 :ok 1 :erro 0 :descartados 0} resumo))
      (is (= [(:id vencida)] (map :id @recebidos))
          "só a linha pendente e vencida pode ser entregue")
      (is (= "ok" (:status (linha (:id vencida)))))
      (is (some? (:processado_em (linha (:id vencida)))))
      (is (= "pendente" (:status (linha (:id futura)))) "a agendada para o futuro segue intocada")
      (is (= "ok" (:status (linha (:id concluida)))))
      (is (= "descartado" (:status (linha (:id descartada))))))))

(deftest item-que-falhou-e-ja-venceu-volta-a-ser-elegivel
  ;; Controle do teste acima: `erro` NÃO é estado terminal. Se a seleção olhasse
  ;; só `pendente`, tudo que falhasse uma vez sumiria da fila em silêncio.
  (let [item (enfileirar-teste!)
        recebidos (atom [])]
    (db/execute-one! ["UPDATE google_sync_outbox
                          SET status = 'erro', tentativas = 2, proxima_em = now() - interval '1 minute'
                        WHERE id = ?" (:id item)])
    (let [resumo (outbox/drenar! {:executor (executor-que-anota recebidos {:ok? true})
                                  :aleatorio 0.0})]
      (is (= 1 (:reservados resumo)))
      (is (= "ok" (:status (linha (:id item)))))
      (is (= 3 (:tentativas (linha (:id item)))) "a tentativa bem-sucedida também conta"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 🔴 Concorrência — o ponto inteiro do SKIP LOCKED
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest duas-drenagens-concorrentes-nao-pegam-a-mesma-linha
  (dotimes [_ 4] (enfileirar-teste!))
  (with-open [conn (jdbc/get-connection @ds-teste)]
    (jdbc/with-transaction [tx1 conn]
      ;; tx1 reserva 2 e SEGURA a transação aberta.
      (let [lote1 (outbox/reservar-lote! tx1 2)
            ;; Outra thread, outra conexão, a MESMA função. Em `future` com
            ;; prazo: sem SKIP LOCKED isto BLOQUEIA em vez de falhar, e um teste
            ;; que trava é pior que um teste que reprova — não diz nada.
            outra (future (jdbc/with-transaction [tx2 @ds-teste]
                            (outbox/reservar-lote! tx2 10)))
            travou? (= ::travou (deref outra 5000 ::travou))
            ;; Travar já é a reprovação; converter para lista vazia evita que as
            ;; asserções seguintes virem ERRO (NPE/ISeq) e escondam a FALHA real.
            lote2 (if travou? (do (future-cancel outra) []) @outra)]
        (is (not travou?)
            "a reserva concorrente ficou bloqueada — SKIP LOCKED não surtiu efeito")
        (let [ids1 (set (map :id lote1))
              ids2 (set (map :id lote2))]
          (is (= 2 (count ids1)))
          ;; Controle: se ids2 viesse vazio, "interseção vazia" seria verdade
          ;; sem medir nada. As outras duas linhas TÊM que ter sido pegas.
          (is (= 2 (count ids2)) "a segunda drenagem tem que pegar as outras duas")
          (is (empty? (set/intersection ids1 ids2))
              "duas drenagens concorrentes pegaram a mesma linha")
          (is (= 4 (count (set/union ids1 ids2)))))))))

(deftest linha-unica-travada-e-pulada-e-nao-esperada
  (enfileirar-teste!)
  (with-open [conn (jdbc/get-connection @ds-teste)]
    (jdbc/with-transaction [tx1 conn]
      (let [lote1 (outbox/reservar-lote! tx1 10)
            outra (future (jdbc/with-transaction [tx2 @ds-teste]
                            (outbox/reservar-lote! tx2 10)))
            travou? (= ::travou (deref outra 5000 ::travou))
            lote2 (if travou? (do (future-cancel outra) [::bloqueada]) @outra)]
        (is (= 1 (count lote1)))
        (is (not travou?) "esperou pela linha travada em vez de pular")
        (is (empty? lote2))))))

(deftest a-rede-acontece-fora-da-transacao-de-reserva
  ;; 🔴 A regra que não se negocia: nenhuma chamada de rede dentro de transação.
  ;; A prova é indireta e direta ao mesmo tempo — de dentro do executor, por
  ;; OUTRA conexão, a linha já tem que estar `processando` no banco. Se a
  ;; transação de reserva ainda estivesse aberta, esta leitura (READ COMMITTED)
  ;; veria `pendente`.
  (let [item (enfileirar-teste!)
        visto (atom nil)]
    (outbox/drenar!
     {:aleatorio 0.0
      :executor (fn [_]
                  (with-open [conn (jdbc/get-connection @ds-teste)]
                    (reset! visto (:status (jdbc/execute-one!
                                            conn
                                            ["SELECT status FROM google_sync_outbox WHERE id = ?"
                                             (:id item)]
                                            opcoes))))
                  {:ok? true})})
    (is (= "processando" @visto)
        "a transação de reserva ainda estava aberta durante a chamada do executor")))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Falha, backoff e teto
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest erro-incrementa-tentativas-e-adia-a-proxima
  (let [item (enfileirar-teste!)
        antes (:proxima_em (linha (:id item)))]
    (let [resumo (outbox/drenar! {:executor (fn [_] {:ok? false :erro "Google devolveu 503"})
                                  :aleatorio 0.0})
          l (linha (:id item))]
      (is (= {:reservados 1 :ok 0 :erro 1 :descartados 0} resumo))
      (is (= "erro" (:status l)))
      (is (= 1 (:tentativas l)))
      (is (= "Google devolveu 503" (:ultimo_erro l)))
      (is (nil? (:processado_em l)) "só o desfecho final carimba processado_em")
      (is (.after (:proxima_em l) antes) "proxima_em tem que andar para frente")
      ;; Com jitter fixo em 0, a curva reaproveitada de google.http dá
      ;; 60 * 1000ms = 60s para a primeira falha.
      (is (:adiado (jdbc/execute-one!
                    @ds-teste
                    ["SELECT proxima_em > now() + interval '45 seconds' AS adiado
                        FROM google_sync_outbox WHERE id = ?" (:id item)]
                    opcoes))
          "a espera precisa ser da ordem de minutos, não do próximo tique"))

    ;; A espera cresce com as tentativas (2^n), e não é constante.
    (db/execute-one! ["UPDATE google_sync_outbox SET status = 'erro', tentativas = 5,
                                                    proxima_em = now() - interval '1 minute'
                       WHERE id = ?" (:id item)])
    (outbox/drenar! {:executor (fn [_] {:ok? false :erro "de novo"}) :aleatorio 0.0})
    (is (= 6 (:tentativas (linha (:id item)))))
    (is (:cresceu (jdbc/execute-one!
                   @ds-teste
                   ["SELECT proxima_em > now() + interval '20 minutes' AS cresceu
                       FROM google_sync_outbox WHERE id = ?" (:id item)]
                   opcoes))
        "o backoff é exponencial — a sexta espera não pode ser igual à primeira")))

(deftest excecao-no-executor-e-falha-da-linha-nao-da-fila
  (let [quebra (enfileirar-teste!)
        boa (enfileirar-teste!)
        resumo (outbox/drenar!
                {:aleatorio 0.0
                 :executor (fn [item]
                             (if (= (:id item) (:id quebra))
                               (throw (ex-info "payload estranho" {}))
                               {:ok? true}))})]
    (is (= {:reservados 2 :ok 1 :erro 1 :descartados 0} resumo))
    (is (= "erro" (:status (linha (:id quebra)))))
    (is (re-find #"payload estranho" (:ultimo_erro (linha (:id quebra)))))
    (is (= "ok" (:status (linha (:id boa)))) "uma linha ruim não pode parar a fila")))

(deftest estourar-o-teto-vira-descartado-com-motivo
  (let [item (enfileirar-teste!)]
    (db/execute-one! ["UPDATE google_sync_outbox SET tentativas = ? WHERE id = ?"
                      (dec outbox/max-tentativas) (:id item)])
    (let [resumo (outbox/drenar! {:executor (fn [_] {:ok? false :erro "403 permissão negada"})
                                  :aleatorio 0.0})
          l (linha (:id item))]
      (is (= {:reservados 1 :ok 0 :erro 0 :descartados 1} resumo))
      (is (= "descartado" (:status l)))
      (is (= outbox/max-tentativas (:tentativas l)))
      (is (= "403 permissão negada" (:ultimo_erro l))
          "descartar sem dizer por quê é sumir em silêncio")
      (is (some? (:processado_em l))))
    ;; E não volta: uma drenagem seguinte não pode ressuscitar o descartado.
    (let [recebidos (atom [])]
      (outbox/drenar! {:executor (executor-que-anota recebidos {:ok? true}) :aleatorio 0.0})
      (is (empty? @recebidos)))))

(deftest falha-permanente-descarta-na-primeira
  ;; Repetir 8 vezes uma sessão que não existe mais só empurra ruído adiante.
  (let [item (enfileirar-teste!)
        resumo (outbox/drenar! {:executor (fn [_] {:ok? false :permanente? true
                                                   :erro "agendamento não existe mais"})
                                :aleatorio 0.0})]
    (is (= 1 (:descartados resumo)))
    (is (= "descartado" (:status (linha (:id item)))))
    (is (= 1 (:tentativas (linha (:id item)))))))

(deftest processando-abandonado-volta-para-a-fila
  ;; Drenador que morre entre reservar e gravar deixaria a linha travada para
  ;; sempre — perda silenciosa, que é o defeito mais caro deste repositório.
  (let [item (enfileirar-teste!)
        recente (enfileirar-teste!)]
    (db/execute-one! ["UPDATE google_sync_outbox
                          SET status = 'processando', proxima_em = now() - interval '30 minutes'
                        WHERE id = ?" (:id item)])
    (db/execute-one! ["UPDATE google_sync_outbox SET status = 'processando' WHERE id = ?"
                      (:id recente)])
    (let [recebidos (atom [])]
      (outbox/drenar! {:executor (executor-que-anota recebidos {:ok? true}) :aleatorio 0.0})
      (is (= 1 (:tentativas (linha (:id item)))) "a retomada conta como tentativa")
      (is (re-find #"interrompido" (:ultimo_erro (linha (:id item)))))
      (is (= "processando" (:status (linha (:id recente))))
          "quem foi reservado agora NÃO pode ser retomado por baixo do drenador vivo"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O executor padrão — a costura
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest executor-padrao-recusa-o-que-ainda-nao-sabe-fazer
  ;; A fase 2 cobre `agendamento`/`criar`. O resto ainda não tem tradutor, e
  ;; repetir 8 vezes o que ninguém sabe entregar só adia o diagnóstico: é falha
  ;; PERMANENTE, com o motivo escrito.
  (doseq [item [{:entidade "bloqueio" :operacao "criar"}
                {:entidade "recorrencia" :operacao "criar"}
                {:entidade "agendamento" :operacao "cancelar"}]]
    (let [r (outbox/executor-padrao item)]
      (is (false? (:ok? r)))
      (is (true? (:permanente? r)))
      (is (string? (:erro r)) (str "sem motivo legível para " item)))))

(deftest executor-padrao-nao-estoura-quando-a-outra-metade-ainda-nao-existe
  ;; ⚠️ Este teste é deliberadamente indiferente a `google.evento` /
  ;; `google.api` já terem sido entregues ou não: as duas estão sendo escritas
  ;; em paralelo. Com elas ausentes, o executor devolve "indisponível"; com elas
  ;; presentes, o agendamento inexistente barra ANTES de qualquer rede. Nos dois
  ;; mundos o contrato é o mesmo — `{:ok? false}` com motivo — e nenhum deles
  ;; chama o Google. É o que faz esta suíte não depender daquele trabalho.
  (let [r (outbox/executor-padrao {:entidade "agendamento"
                                   :operacao "criar"
                                   :clinica_id clinica
                                   :psicologo_id psicologa
                                   :entidade_id (java.util.UUID/randomUUID)})]
    (is (map? r))
    (is (false? (:ok? r)))
    (is (string? (:erro r)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O agendador
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest o-worker-nao-sobe-sem-que-alguem-peca
  ;; A variável não está definida na suíte. É exatamente o caso que interessa:
  ;; importar o namespace, ou rodar os testes, não pode ligar processo de fundo.
  (is (nil? (System/getenv "GOOGLE_SYNC_WORKER")))
  (is (false? (outbox/iniciar-se-configurado!)))
  (is (false? (outbox/worker-ligado?))))

(deftest o-worker-liga-drena-e-desliga
  (let [item (enfileirar-teste!)
        entregues (atom [])]
    (try
      (is (true? (outbox/iniciar-worker! {:intervalo-segundos 1
                                          :executor (executor-que-anota entregues {:ok? true})})))
      (is (true? (outbox/worker-ligado?)))
      (is (false? (outbox/iniciar-worker! {})) "ligar duas vezes não pode criar dois drenadores")
      ;; Espera pelo EFEITO no banco, não por um tempo fixo.
      (let [prazo (+ (System/currentTimeMillis) 10000)]
        (while (and (< (System/currentTimeMillis) prazo)
                    (not= "ok" (:status (linha (:id item)))))
          (Thread/sleep 200)))
      (is (= "ok" (:status (linha (:id item)))) "o worker não drenou dentro do prazo")
      (is (= 1 (count @entregues)))
      (finally (outbox/parar-worker!)))
    (is (false? (outbox/worker-ligado?)))))

;; ---------------------------------------------------------------------------
;; Regressao: o worker chama `drenar!` SEM `:aleatorio`.
;;
;; Todo teste acima passa `:aleatorio 0.0` para o backoff ser deterministico —
;; e `0.0` nao e `nil`. Por causa disso, o caminho que producao usa de verdade
;; (sorteio ausente) nunca era exercitado, e `falhar!` estourava
;; NullPointerException dentro de `http/backoff-ms` na PRIMEIRA entrega que
;; falhasse: o lote inteiro ficava preso em `processando` e `ultimo_erro` nunca
;; era escrito.
;;
;; O defeito nao apareceu na suite verde. Apareceu quando se quebrou o codigo de
;; proposito para conferir se o teste reprovava — e ele nao reprovava, porque
;; nem chegava la. E a familia de defeito deste repositorio, morando dentro de
;; um parametro de conveniencia do proprio teste.
(deftest drenar-sem-sorteio-registra-o-erro-em-vez-de-estourar
  (testing "a chamada que producao faz: sem :aleatorio, e com a entrega falhando"
    (let [id (:id (enfileirar-teste!))
          ;; sem `:aleatorio` de proposito — e o que `iniciar-worker!` faz
          resumo (outbox/drenar! {:executor (fn [_] {:ok? false :erro "google fora do ar"})})
          l (linha id)]
      ;; 1. nao estourou: se estourasse, o `deftest` morria antes desta linha
      (is (= 1 (:erro resumo))
          "a drenagem tem que CONTAR a falha, nao propagar excecao")
      ;; 2. e o efeito no banco — status de contagem sozinho nao prova nada
      (is (= "erro" (:status l)))
      (is (= 1 (:tentativas l)))
      (is (some? (:ultimo_erro l))
          "ultimo_erro e a coluna que este desenho existe para preencher")
      (is (re-find #"google fora do ar" (str (:ultimo_erro l))))
      ;; 3. e o backoff de fato adiou — com o sorteio nulo isto nem era calculado
      (is (some? (:proxima_em l))))))

(ns deep-saude-backend.google.outbox
  "Fila de escrita para o Google (D8 da arquitetura, cartão GC-002).

   A tabela `google_sync_outbox` existe desde 11/08 e até agora nenhum código a
   lia ou escrevia. Este namespace é as duas pontas dela: `enfileirar!`, que
   grava a intenção **na mesma transação** do dado que a originou, e `drenar!`,
   que entrega essa intenção ao Google fora de qualquer transação.

   ## Por que a intenção é gravada em vez de a chamada ser feita na hora

   `criar-agendamento-handler` com recorrência de um ano já faz ~52 queries de
   checagem de conflito. Pendurar HTTP ao Google no mesmo request faz a latência
   do endpoint depender da rede do Google e — pior — faz **falha do Google virar
   falha de agendamento**: a secretária não consegue marcar sessão porque a API
   do Google está lenta. A intenção commita junto com a sessão; a entrega é
   assunto de outro processo.

   ## 🔴 Nenhuma chamada de rede dentro de transação de banco

   O desenho de `drenar!` é deliberadamente em três tempos:

       transação curta  →  reserva o lote e marca `processando`
       (sem transação)  →  chama a rede, um item por vez
       transação curta  →  grava `ok` / `erro` / `descartado`

   Rede dentro de transação segura uma conexão do pool pelo tempo da latência do
   Google. Com pool de 10 conexões (ver `db.clj`) e o Google lento, o backend
   inteiro para de responder por causa da fila de sincronização — que é
   exatamente o acoplamento que o outbox existe para quebrar.

   ## A reserva: `FOR UPDATE SKIP LOCKED`

   `SKIP LOCKED` é o que permite mais de um drenador (mais de uma instância do
   backend, ou o worker e uma drenagem manual) sem que dois entreguem a mesma
   linha. Quem chegou depois **pula** a linha travada em vez de esperar por ela.
   Sem isso, ou duas instâncias entregam o mesmo evento, ou uma fica bloqueada
   atrás da outra pelo tempo da chamada ao Google.

   ## O vocabulário de status, e o que cada um significa aqui

   | status | significa |
   |---|---|
   | `pendente` | nunca foi tentado, ou é a primeira vez |
   | `processando` | reservado por um drenador agora |
   | `ok` | o Google aceitou |
   | `erro` | falhou e **vai** ser tentado de novo, em `proxima_em` |
   | `descartado` | estourou o teto de tentativas; não será tentado de novo |

   📌 `erro` separado de `pendente` é escolha, não detalhe: se a falha voltasse
   para `pendente`, uma clínica com a integração quebrada ficaria
   indistinguível de uma fila saudável e cheia. `SELECT count(*) ... WHERE
   status IN ('erro','descartado')` é o sinal de que alguma coisa está errada, e
   ele precisa existir antes de alguém procurá-lo."
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [taoensso.timbre :as log]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.google.http :as http])
  (:import (java.util.concurrent Executors ScheduledExecutorService
                                 ThreadFactory TimeUnit)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Parâmetros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def max-tentativas
  "Teto de entregas antes de `descartado`.

   Com a curva de backoff abaixo, 8 tentativas cobrem ~1h30 de indisponibilidade
   do Google antes de a linha desistir. Menos que isso desiste durante uma
   instabilidade normal; muito mais que isso mantém em fila trabalho que já
   precisa de gente olhando."
  8)

(def lote-padrao
  "Itens reservados por drenagem.

   Pequeno de propósito: cada item é uma chamada HTTP, e o lote é entregue em
   série depois que a transação de reserva já fechou. Lote grande atrasa a
   próxima reserva sem entregar nada mais rápido."
  20)

(def fator-fila
  "A curva de `google.http/backoff-ms` é a mesma; só a unidade muda.

   Lá, o retry acontece **dentro de uma requisição** e a espera é medida em
   segundos — esperar minutos seguraria a thread do request. Aqui, o retry
   acontece **entre drenagens**, e esperar 2 segundos para tentar de novo o
   mesmo Google que acabou de recusar só gasta quota. Multiplicando por 60, a
   mesma progressão (2^n com jitter de 30%) passa a valer em minutos: ~30s, 1,
   2, 4, 8, 16, 32, 32 min — e o teto de 32 min do original vira o teto daqui.

   Reaproveitar a função em vez de escrever outra é o que garante que as duas
   camadas dessincronizam instâncias do mesmo jeito (o jitter existe para isso)."
  60)

(defn atraso-ms
  "Espera até a próxima tentativa, depois de `tentativas` falhas."
  ([tentativas] (* fator-fila (http/backoff-ms tentativas)))
  ([tentativas aleatorio] (* fator-fila (http/backoff-ms tentativas aleatorio))))

(def limite-processando-ms
  "A partir de quando um `processando` é considerado abandonado.

   Um drenador que morre entre a reserva e a gravação do resultado deixa a linha
   travada em `processando` para sempre — e some em silêncio, que é o defeito
   que este repositório mais pagou. 15 minutos é bem acima de qualquer chamada
   ao Google (timeout de 30s por requisição, 5 tentativas)."
  (* 15 60 1000))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Acesso ao banco
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Deref no momento do uso, e não no carregamento: é o que faz o `with-redefs`
;; de `db/datasource` dos testes alcançar este namespace (mesma técnica do
;; `agendamentos-test`).
(defn- fonte [] @db/datasource)

(def ^:private opcoes-linha {:builder-fn rs/as-unqualified-lower-maps})

(defn- ->payload-clj
  "O driver devolve JSONB como PGobject. Vira mapa com chaves em keyword."
  [valor]
  (cond
    (nil? valor) {}
    (map? valor) valor
    :else (try (json/parse-string (str valor) true)
               (catch Exception _ {}))))

(defn- ->payload-json [valor]
  (json/generate-string (or valor {})))

(defn- recortar
  "`ultimo_erro` é para leitura humana. Stack trace inteiro na coluna transforma
   a tabela em log e esconde o que importa."
  [texto]
  (let [s (str texto)]
    (if (> (count s) 500) (str (subs s 0 497) "...") s)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Enfileirar
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def entidades #{"recorrencia" "agendamento" "bloqueio"})
(def operacoes #{"criar" "atualizar" "cancelar" "remover"})

(defn conexao-ativa?
  "A psicóloga conectou a conta do Google e a conexão ainda vale?

   ⚠️ Guarda de enfileiramento, não de segurança. Enfileirar para quem nunca
   conectou enche a tabela de trabalho que **não tem como** completar: cada
   linha seria tentada 8 vezes e viraria `descartado`, e o painel de saúde
   passaria a acusar erro de integração numa clínica que simplesmente não usa a
   integração. O sinal precisa significar alguma coisa.

   Recebe `connectable` (a transação em curso, quando há uma) para que a
   pergunta seja feita na mesma visão de dados do write que a originou."
  [connectable clinica-id psicologo-id]
  (some?
   (if psicologo-id
     (jdbc/execute-one! connectable
                        ["SELECT 1 AS ok FROM google_conexao
                           WHERE clinica_id = ? AND usuario_id = ? AND status = 'ativa'"
                         clinica-id psicologo-id]
                        opcoes-linha)
     (jdbc/execute-one! connectable
                        ["SELECT 1 AS ok FROM google_conexao
                           WHERE clinica_id = ? AND status = 'ativa' LIMIT 1"
                         clinica-id]
                        opcoes-linha))))

(defn enfileirar!
  "Grava uma intenção de sincronização.

   `connectable` é a transação em curso — **este é o ponto do outbox**: a linha
   commita junto com o agendamento ou não commita nada. Passar o datasource em
   vez da transação transforma o padrão em duas escritas independentes, que é
   precisamente o que ele existe para evitar.

   Devolve a linha gravada (com `:id`). Lança em entidade/operação fora do
   vocabulário: valor errado aqui só apareceria no drenador, horas depois."
  [connectable {:keys [clinica_id psicologo_id entidade entidade_id operacao payload]}]
  (when-not (entidades entidade)
    (throw (ex-info "entidade fora do vocabulário do outbox"
                    {:entidade entidade :aceitas entidades})))
  (when-not (operacoes operacao)
    (throw (ex-info "operação fora do vocabulário do outbox"
                    {:operacao operacao :aceitas operacoes})))
  (jdbc/execute-one!
   connectable
   ["INSERT INTO google_sync_outbox
       (clinica_id, psicologo_id, entidade, entidade_id, operacao, payload)
     VALUES (?, ?, ?, ?, ?, ?::jsonb)
     RETURNING id, status, tentativas, proxima_em"
    clinica_id psicologo_id entidade entidade_id operacao (->payload-json payload)]
   opcoes-linha))

(defn enfileirar-agendamentos-criados!
  "Uma intenção de `criar` por sessão recém-inserida, se — e só se — a psicóloga
   tem conexão ativa.

   Existe para que a chamada em `core/criar-agendamento-handler` seja **uma
   linha**. O handler tem 2000+ linhas e é o arquivo mais quente do projeto; a
   regra de quando enfileirar é assunto daqui, não de lá.

   Devolve quantas linhas foram enfileiradas (0 quando não há conexão)."
  [tx clinica-id psicologo-id agendamentos]
  (if-not (conexao-ativa? tx clinica-id psicologo-id)
    0
    (do (doseq [a agendamentos]
          (enfileirar! tx {:clinica_id   clinica-id
                           :psicologo_id psicologo-id
                           :entidade     "agendamento"
                           :entidade_id  (:id a)
                           :operacao     "criar"}))
        (count agendamentos))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Reserva e desfecho
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn reservar-lote!
  "Reserva até `limite` itens vencidos e os marca `processando`.

   🔴 **Espera estar dentro de uma transação** — `connectable` tem que ser um
   `tx`. O `FOR UPDATE SKIP LOCKED` só protege enquanto a transação que travou
   as linhas estiver aberta; em autocommit o lock some no fim do SELECT e dois
   drenadores voltam a poder pegar a mesma linha.

   Receber a transação de fora (em vez de abrir uma aqui) é também o que torna a
   concorrência testável: o teste segura uma transação aberta e chama a mesma
   função por outra conexão.

   ⚠️ A reserva reescreve `proxima_em = now()`. Não é cosmético: é o carimbo de
   *quando esta linha foi reservada*, e sem ele não há como distinguir um
   `processando` abandonado por um drenador morto de um que começou agora — ver
   `reabilitar-travados!`."
  [tx limite]
  (let [itens (jdbc/execute!
               tx
               ["SELECT id, clinica_id, psicologo_id, entidade, entidade_id,
                        operacao, payload, tentativas
                   FROM google_sync_outbox
                  WHERE status IN ('pendente', 'erro')
                    AND proxima_em <= now()
                  ORDER BY proxima_em, id
                  LIMIT ?
                  FOR UPDATE SKIP LOCKED"
                limite]
               opcoes-linha)]
    (when (seq itens)
      (jdbc/execute-one!
       tx
       (into [(str "UPDATE google_sync_outbox
                       SET status = 'processando', proxima_em = now()
                     WHERE id IN (" (str/join "," (repeat (count itens) "?")) ")")]
             (map :id itens))))
    (mapv #(update % :payload ->payload-clj) itens)))

(defn- reservar-em-transacao!
  "Transação curta em volta de `reservar-lote!`. Ela fecha **antes** de qualquer
   chamada de rede acontecer."
  [ds limite]
  (jdbc/with-transaction [tx ds]
    (reservar-lote! tx limite)))

(defn- concluir! [ds id]
  (jdbc/execute-one!
   ds
   ["UPDATE google_sync_outbox
        SET status = 'ok', tentativas = tentativas + 1,
            ultimo_erro = NULL, processado_em = now()
      WHERE id = ?" id]))

(defn- falhar!
  "Grava a falha: incrementa `tentativas`, adia `proxima_em` e, no teto, descarta.

   `permanente?` no resultado do executor descarta na hora — repetir 8 vezes uma
   sessão que não existe mais só empurra ruído para a frente."
  [ds {:keys [id tentativas]} {:keys [erro permanente?]} aleatorio]
  (let [tentativas' (inc (or tentativas 0))
        descartar? (or (boolean permanente?) (>= tentativas' max-tentativas))
        ;; `(or aleatorio (rand))` e a mesma rede que `reabilitar-travados!` ja
        ;; tinha, e faltava aqui. Sem ela, `drenar!` sem `:aleatorio` — que e
        ;; como o worker chama em producao — estoura NullPointerException dentro
        ;; de `http/backoff-ms` na PRIMEIRA entrega que falha, derruba o lote
        ;; inteiro para `processando`, e `ultimo_erro` (a coluna que este desenho
        ;; existe para preencher) nunca chega a ser escrita.
        ;; Passou despercebido porque todo teste passava `:aleatorio 0.0`, e 0.0
        ;; nao e nil. Achado por mutacao, nao pela suite verde.
        espera (if descartar? 0 (atraso-ms tentativas' (or aleatorio (rand))))
        linha (jdbc/execute-one!
               ds
               ["UPDATE google_sync_outbox
                    SET status = ?,
                        tentativas = ?,
                        ultimo_erro = ?,
                        proxima_em = now() + (? * interval '1 millisecond'),
                        processado_em = CASE WHEN ? THEN now() ELSE processado_em END
                  WHERE id = ?
                  RETURNING id, status, tentativas, proxima_em, ultimo_erro"
                (if descartar? "descartado" "erro")
                tentativas'
                (recortar erro)
                (long espera)
                descartar?
                id]
               opcoes-linha)]
    (when descartar?
      ;; 🔴 Desistir em silêncio é o defeito que este repositório mais pagou.
      ;; A linha fica no banco com o motivo, E grita no log no momento em que
      ;; desiste — quem lê o log depois não tem como saber que precisava olhar.
      (log/with-context {:outbox_id (str id) :tentativas tentativas' :motivo (recortar erro)}
        (log/error "outbox_item_descartado")))
    linha))

(defn reabilitar-travados!
  "Devolve à fila o que ficou `processando` além do razoável.

   Um drenador que morre depois de reservar (deploy no meio, OOM, contêiner
   reciclado) deixa a linha travada para sempre. Contar como tentativa é
   proposital: se o que mata o drenador é justamente aquele item, repetir sem
   custo faria a fila derrubar o processo indefinidamente."
  ([ds] (reabilitar-travados! ds nil))
  ([ds aleatorio]
   (let [linhas (jdbc/execute!
                 ds
                 ["UPDATE google_sync_outbox
                      SET status = CASE WHEN tentativas + 1 >= ? THEN 'descartado' ELSE 'erro' END,
                          tentativas = tentativas + 1,
                          ultimo_erro = 'retomado: processamento interrompido antes de concluir',
                          proxima_em = now() + (? * interval '1 millisecond')
                    WHERE status = 'processando'
                      AND proxima_em < now() - (? * interval '1 millisecond')
                    RETURNING id, status, tentativas"
                  max-tentativas
                  (long (atraso-ms 1 (or aleatorio (rand))))
                  limite-processando-ms]
                 opcoes-linha)]
     (when (seq linhas)
       (log/with-context {:quantidade (count linhas)}
         (log/warn "outbox_itens_retomados")))
     linhas)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O executor — costura, não acoplamento
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Quem efetivamente fala com o Google não mora aqui. `drenar!` recebe o
;; executor como **parâmetro**: uma função de um item da fila para
;; `{:ok? true/false :erro "..." :permanente? bool}`.
;;
;; 📌 Isso existe por dois motivos, e os dois são práticos:
;;
;; 1. `google.evento/agendamento->evento` e `google.api/criar-evento!` estão
;;    sendo escritas em paralelo. A fila não pode esperar por elas nem elas por
;;    ela — e o teste desta fila não pode depender daquele trabalho.
;; 2. O teste injeta um executor de mentira e mede o que é desta camada:
;;    reserva, concorrência, backoff, teto. Um executor de verdade mediria a
;;    rede, que é outro assunto e outro teste.
;;
;; ⚠️ Por isso as duas funções são resolvidas por `requiring-resolve` **em tempo
;; de execução**, e não por `:require` no topo: com `:require`, este namespace
;; não compilaria enquanto o outro agente não entregasse o arquivo dele — e a
;; suíte inteira cairia junto.

(def ^:private var-evento 'deep-saude-backend.google.evento/agendamento->evento)
(def ^:private var-criar 'deep-saude-backend.google.api/criar-evento!)
;; O token sai de `google.handlers`, que e a camada HTTP. Resolvido em tempo de
;; execucao pelo mesmo motivo dos outros dois, mais um: `:require` daqui para la
;; acoplaria a fila ao anel de rotas, e `handlers` ja depende de banco.
(def ^:private var-token 'deep-saude-backend.google.handlers/access-token-valido)

(defn- resolver [sym]
  (try (requiring-resolve sym) (catch Throwable _ nil)))

(defn- dados-da-entrega
  "Tudo que a entrega precisa do banco, lido **antes** da chamada de rede."
  [ds {:keys [clinica_id psicologo_id entidade_id]}]
  (let [agendamento (jdbc/execute-one!
                     ds ["SELECT * FROM agendamentos WHERE id = ? AND clinica_id = ?"
                         entidade_id clinica_id]
                     opcoes-linha)]
    {:agendamento agendamento
     ;; O nome do paciente vira o `summary` do evento (R-017, ratificada na D-026).
     ;; Lido aqui, com o resto, porque tudo que a entrega precisa do banco sai
     ;; ANTES da rede — depois de a transacao fechar nao se volta ao banco.
     :nome-paciente (:nome (jdbc/execute-one!
                            ds ["SELECT nome FROM pacientes WHERE id = ? AND clinica_id = ?"
                                (:paciente_id agendamento) clinica_id]
                            opcoes-linha))
     ;; Fuso da clinica, nunca o da JVM: o servidor roda em UTC e a sessao nasceria
     ;; com a hora errada na agenda da psicologa, sem erro nenhum.
     :fuso (or (:timezone (jdbc/execute-one!
                           ds ["SELECT timezone FROM clinicas WHERE id = ?" clinica_id]
                           opcoes-linha))
               "America/Sao_Paulo")
   :conexao (jdbc/execute-one!
             ds ["SELECT * FROM google_conexao
                   WHERE clinica_id = ? AND usuario_id = ? AND status = 'ativa'"
                 clinica_id psicologo_id]
             opcoes-linha)
   :vinculo (jdbc/execute-one!
             ds ["SELECT * FROM vinculo_agenda
                   WHERE clinica_id = ? AND usuario_id = ? AND status = 'ativo'
                    ORDER BY criado_em LIMIT 1"
                  clinica_id psicologo_id]
              opcoes-linha)}))

(defn- ->ok?
  "Traduz o contrato de `google.api/criar-evento!` para o desta fila.

   As duas camadas foram escritas em paralelo e falam dialetos diferentes: a api
   responde `{:evento … :duplicado? …}` ou `{:erro true :status …}`, e a fila só
   entende `:ok?`. A tradução mora aqui, num lugar só, em vez de a fila aprender
   o vocabulário da api.

   🔴 `:duplicado? true` é SUCESSO. Com id determinístico, reentregar devolve 409
   — o evento está lá, uma vez só. Tratar como falha faria o worker repetir para
   sempre e o alerta de fila parada acusar um sistema que está certo.

   E a distinção permanente × transitório importa porque decide entre desistir e
   insistir: 4xx é a nossa requisição estando errada (repetir dá o mesmo erro),
   5xx e 429 são o Google indisponível (repetir é exatamente o certo)."
  [resposta]
  (cond
    (:erro resposta)
    (let [status (:status resposta)]
      {:ok? false
       :permanente? (boolean (and status (<= 400 status 499) (not= 429 status)))
       :erro (str "google respondeu " status ": " (pr-str (:detalhe resposta)))})

    :else {:ok? true}))

(defn executor-padrao
  "Executor de produção: costura a fila com quem fala com o Google.

   Devolve `{:ok? ...}`. Um `409 Duplicate` é sucesso do lado de lá (id
   determinístico ⇒ reentrega devolve 409, e é isso que a idempotência quer);
   esta camada não precisa saber disso, só respeitar o `:ok?`.

   🔴 Nada aqui abre transação: `drenar!` chama esta função **fora** de qualquer
   uma, e é o que garante que a conexão do pool não fica presa na latência do
   Google."
  [{:keys [entidade operacao] :as item}]
  (let [ds (fonte)]
    (cond
      (not= "agendamento" entidade)
      {:ok? false :permanente? true
       :erro (str "entidade '" entidade "' ainda não tem executor — fase 2 cobre agendamento")}

      (not= "criar" operacao)
      {:ok? false :permanente? true
       :erro (str "operação '" operacao "' ainda não tem executor — fase 2 cobre criar")}

      :else
      (let [->evento (resolver var-evento)
            criar! (resolver var-criar)
            token-de (resolver var-token)]
        (if-not (and ->evento criar! token-de)
          ;; Transitório de propósito: a integração ainda não subiu inteira. Não
          ;; descarta, e o motivo fica legível em `ultimo_erro`.
          {:ok? false :erro "executor do Google indisponível (google.evento / google.api / google.handlers ainda não carregam)"}
          (let [{:keys [agendamento conexao vinculo nome-paciente fuso]} (dados-da-entrega ds item)]
            (cond
              (nil? agendamento)
              {:ok? false :permanente? true :erro "agendamento não existe mais"}

              (nil? conexao)
              {:ok? false :erro "sem conexão Google ativa para esta psicóloga"}

              (nil? vinculo)
              {:ok? false :erro "sem vínculo de agenda ativo para esta psicóloga"}

              (nil? nome-paciente)
              ;; Permanente: sem nome não há `summary`, e a R-017 manda que o
              ;; título SEJA o nome. Repetir não faz o paciente voltar a existir.
              {:ok? false :permanente? true :erro "paciente do agendamento não existe mais"}

              :else
              ;; `agendamento->evento` devolve um ENVELOPE `{:corpo … :avisos […]}`,
              ;; não o corpo solto. Mandar o envelope para o Google escreveria
              ;; `{"corpo": …, "avisos": …}` como se fosse o evento — e o Google
              ;; aceitaria, criando um evento vazio. Por isso o `:corpo` explícito.
              (let [{:keys [corpo avisos]} (->evento agendamento nome-paciente fuso)]
                (when (seq avisos)
                  ;; Aviso não impede a escrita, mas não pode sumir: é aqui que
                  ;; aparece `colorId` não conferido e `versao` ausente.
                  (log/warn "outbox_evento_com_avisos"
                            {:agendamento_id (:id agendamento) :avisos (vec avisos)}))
                (->ok? (criar! (token-de conexao)
                               (:google_calendar_id vinculo)
                               corpo
                               :quota-user (str (:psicologo_id item))))))))))))

(defn- executar
  "Chama o executor e normaliza o resultado.

   Executor que lança vira falha da linha, nunca falha da drenagem: uma sessão
   com dado estranho não pode parar a fila inteira."
  [executor item]
  (try
    (let [r (executor item)]
      (if (map? r) r {:ok? (boolean r)}))
    (catch Throwable t
      {:ok? false
       :erro (str (.getSimpleName (class t)) ": " (.getMessage t))})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Drenagem
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn drenar!
  "Entrega um lote da fila. Devolve `{:reservados :ok :erro :descartados}`.

   Opções: `:limite`, `:executor`, `:aleatorio` (fixa o jitter no teste).

   Os três tempos — reservar, entregar, gravar — estão explícitos abaixo, e a
   ordem deles é a regra que não se negocia: **a transação fecha antes de a
   rede começar.**"
  ([] (drenar! {}))
  ([{:keys [limite executor aleatorio]
     :or {limite lote-padrao executor executor-padrao}}]
   (let [ds (fonte)]
     (reabilitar-travados! ds aleatorio)
     (let [lote (reservar-em-transacao! ds limite)     ;; 1. transação curta, e fecha aqui
           resumo (reduce
                   (fn [acc item]
                     (let [resultado (executar executor item)] ;; 2. rede, SEM transação
                       (if (:ok? resultado)
                         (do (concluir! ds (:id item))         ;; 3. transação curta
                             (update acc :ok inc))
                         (let [linha (falhar! ds item resultado aleatorio)]
                           (update acc (if (= "descartado" (:status linha))
                                         :descartados
                                         :erro)
                                   inc)))))
                   {:reservados (count lote) :ok 0 :erro 0 :descartados 0}
                   lote)]
       (when (pos? (:reservados resumo))
         (log/with-context resumo (log/info "outbox_drenado")))
       resumo))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O agendador
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; 📌 **Decisão (2026-08-22, tech lead): scheduler in-process com
;; `java.util.concurrent.ScheduledExecutorService` — sem dependência nova.**
;;
;; A pendência 8 de `docs/GOOGLE_CARDS.md` era "in-process (`chime`) ou
;; externo?". O motivo de não ser `chime`: este backend inteiro tem **um único
;; cliente HTTP**, e ele é `java.net.http` puro (`google/http.clj`), escolhido
;; justamente para não carregar dependência para um punhado de chamadas. Trazer
;; uma biblioteca de agendamento para fazer o que o JDK já faz contraria a mesma
;; conta. Externo (cron do Northflank, job separado) custa um serviço a mais e
;; um deploy a mais para uma fila que hoje drena em milissegundos.
;;
;; ⚠️ A decisão é sobre **quem chama**, não sobre o que é chamado: `drenar!` não
;; sabe que existe agendador. Trocar por cron externo, fila gerenciada ou um
;; job do Northflank é escrever um `-main` que chama `drenar!` — um arquivo,
;; não uma refatoração. É por isso que o gatilho está isolado em
;; `iniciar-se-configurado!` e nada além dele lê a variável de ambiente.

(defonce ^:private agendador (atom nil))

(def intervalo-padrao-segundos 30)

(defn worker-ligado? [] (some? @agendador))

(defn- fabrica-de-thread []
  (reify ThreadFactory
    (newThread [_ r]
      (doto (Thread. ^Runnable r "google-sync-outbox")
        ;; Daemon: um worker esquecido nunca segura a JVM viva. Sem isso, um
        ;; teste que ligue o worker e não o desligue trava o `lein test` no fim.
        (.setDaemon true)))))

(defn iniciar-worker!
  "Liga a drenagem periódica. Devolve `true` se ligou, `false` se já estava.

   ⚠️ Nunca é chamada por importar o namespace, nem por `init-db`. Quem liga é
   `iniciar-se-configurado!` (no `-main`) ou o teste, explicitamente. Um worker
   que sobe sozinho numa suíte de testes é um processo de fundo disparando rede
   no meio das asserções — e a falha apareceria em outro teste, não neste."
  ([] (iniciar-worker! {}))
  ([{:keys [intervalo-segundos limite executor]
     :or {intervalo-segundos intervalo-padrao-segundos}}]
   (if @agendador
     (do (log/warn "outbox_worker_ja_ligado") false)
     (let [ex (Executors/newSingleThreadScheduledExecutor (fabrica-de-thread))
           tarefa (fn []
                    ;; 🔴 `catch Throwable` obrigatório, e não é zelo: exceção
                    ;; que escapa de uma tarefa de `scheduleWithFixedDelay`
                    ;; **cancela todas as execuções futuras**, sem log e sem
                    ;; erro. O worker morreria calado no primeiro soluço do
                    ;; banco e a fila só pararia de andar — o formato exato de
                    ;; defeito que este projeto já pagou cinco vezes.
                    (try
                      (drenar! (cond-> {}
                                 limite (assoc :limite limite)
                                 executor (assoc :executor executor)))
                      (catch Throwable t
                        (log/error t "outbox_drenagem_falhou"))))]
       (.scheduleWithFixedDelay ^ScheduledExecutorService ex
                                ^Runnable tarefa
                                (long intervalo-segundos) (long intervalo-segundos)
                                TimeUnit/SECONDS)
       (reset! agendador ex)
       (log/with-context {:intervalo_s intervalo-segundos}
         (log/info "outbox_worker_ligado"))
       true))))

(defn parar-worker!
  "Desliga a drenagem periódica. Idempotente."
  []
  (when-let [^ScheduledExecutorService ex @agendador]
    (.shutdownNow ex)
    (.awaitTermination ex 5 TimeUnit/SECONDS)
    (reset! agendador nil)
    (log/info "outbox_worker_desligado")
    true))

(defn iniciar-se-configurado!
  "O gatilho, e o único lugar que lê ambiente.

   Desligado por padrão: `GOOGLE_SYNC_WORKER=1` liga. A Fase 2 ainda não tem o
   executor de verdade fechado, e um worker ligado por omissão começaria a
   consumir a fila com um executor incompleto — gastando as 8 tentativas de cada
   linha antes de a integração existir. Ligar é ato explícito de quem opera.

   `GOOGLE_SYNC_INTERVALO_S` ajusta o intervalo (padrão 30s)."
  []
  (let [ligado? (contains? #{"1" "true" "sim"}
                           (some-> (System/getenv "GOOGLE_SYNC_WORKER") str/lower-case str/trim))
        intervalo (or (some-> (System/getenv "GOOGLE_SYNC_INTERVALO_S") str/trim parse-long)
                      intervalo-padrao-segundos)]
    (if ligado?
      (iniciar-worker! {:intervalo-segundos intervalo})
      (do (log/info "outbox_worker_desabilitado") false))))

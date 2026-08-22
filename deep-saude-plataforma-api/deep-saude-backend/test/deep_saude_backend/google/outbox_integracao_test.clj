(ns deep-saude-backend.google.outbox-integracao-test
  "A costura inteira: fila -> corpo do evento -> HTTP -> Google.

   ## Por que este arquivo existe

   `google/evento.clj` + `google/api.clj` e `google/outbox.clj` foram escritos em
   paralelo, por instâncias que nunca viram o código uma da outra, e se encontram
   em `outbox/executor-padrao`. Três desencaixes reais moraram nessa costura:
   `agendamento->evento` recebendo um argumento em vez de três, o **envelope**
   `{:corpo … :avisos […]}` viajando inteiro no lugar do `:corpo`, e o **mapa da
   conexão** indo no lugar do access token.

   🔴 **A suíte inteira passava com os três defeitos no lugar.** Todos os testes
   de `outbox_test.clj` injetam um executor de mentira (`:executor`), de
   propósito — eles medem reserva, concorrência, backoff e teto, e para isso o
   executor de verdade só atrapalharia. Mas com o executor injetado em *todos*
   eles, a costura nunca foi exercitada: o placar era o mesmo com a costura certa
   e com a costura errada. É a família de defeito que o `CLAUDE.md` da raiz
   persegue — sinal verde que não verificou nada.

   Aqui **não há executor injetado**. `drenar!` é chamada sem `:executor`, cai no
   `executor-padrao`, e o que fala HTTP é o `google/api.clj` de verdade, pelo
   mesmo `java.net.http` que falaria com o Google.

   ## O que se afirma, e por quê é por efeito

   ⚠️ **\"A linha do outbox virou `ok`\" não prova nada sozinho** — é compatível
   com um executor que não fez coisa nenhuma. O que prova é o **conteúdo que
   chegou do outro lado**: o `summary` sendo o nome do paciente (R-017), a marca
   `origem = plataforma` (D12), o `id` determinístico da D9, o fuso da clínica no
   `start`, e o Authorization que saiu no fio.

   ## O outro lado é o dublê de verdade, num processo à parte

   `dev/google_duble.py`, subido pelo teste numa porta livre e derrubado no
   `finally`. Ele guarda os eventos por id e **recusa id repetido com 409**, que
   é o que torna a idempotência de ponta a ponta exercitável — sem isso o teste
   mediria o dublê sendo permissivo.

   ⚠️ **`GOOGLE_API_BASE` é lida por `def`, no carregamento de `google/api.clj`.**
   Uma vez a JVM de pé, mudar a variável de ambiente não move mais nada — o valor
   já foi capturado. A única forma de apontar o namespace já carregado para o
   dublê é redefinir a var que aquela variável alimenta, que é o mesmo ponto de
   costura e é o que `api_escrita_test.clj` já faz. O mesmo vale para
   `cripto/chave-do-ambiente`, com uma diferença: essa é **função**, lida em tempo
   de execução, e a chave de teste é gerada na hora (nada de segredo no repo).

   ## O que este arquivo NÃO cobre

   O Google de verdade, a restrição do escopo `calendar.app.created` (só escreve
   em agenda que o próprio app criou) e a validação de payload — o dublê guarda o
   que receber sem conferir. A lista inteira está no rodapé de
   `dev/google_duble.py`.

   ## Rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5446/deep_teste?user=deep&password=deep&sslmode=disable' lein test

   Sem a variável, os testes daqui se anunciam pulados e a suíte segue verde."
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing use-fixtures]]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [deep-saude-backend.agendamentos-test :as agtest]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.google.api :as api]
            [deep-saude-backend.google.cripto :as cripto]
            [deep-saude-backend.google.outbox :as outbox]
            [deep-saude-backend.google.rrule :as rrule])
  (:import (java.io File)
           (java.net HttpURLConnection ServerSocket URI)
           (java.util.concurrent TimeUnit)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O que se semeia
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; UUIDs próprios (prefixo `0c`) para não colidir com os do `outbox_test`
;; (prefixo `0b`): as duas suítes limpam por `clinica_id`, e ids compartilhados
;; fariam uma apagar a fixture da outra conforme a ordem de execução.
(def clinica     #uuid "0c0c0c0c-0000-0000-0000-00000000000f")
(def psicologa   #uuid "0c0c0c0c-0000-0000-0000-0000000000c1")
(def paciente    #uuid "0c0c0c0c-0000-0000-0000-0000000000d1")
(def agendamento #uuid "0c0c0c0c-0000-0000-0000-0000000000a1")

;; O nome que tem que virar o `summary` do evento (R-017).
(def nome-do-paciente "Marina Vasconcelos")

;; 🔴 Manaus, e não São Paulo, de propósito. O fuso tem que sair de
;; `clinicas.timezone`; com São Paulo (o DEFAULT da coluna) um bug que ignorasse
;; a clínica passaria despercebido. Manaus é UTC-4 o ano inteiro, sem horário de
;; verão, então a parede não depende da data.
(def fuso-da-clinica "America/Manaus")

;; Instante gravado com offset explícito: 17:00 UTC = 13:00 em Manaus.
;; Se o fuso da JVM (UTC no contêiner) vencesse, o `dateTime` sairia 17:00 — que
;; é exatamente o deslocamento de 3h/4h que o `tempo.clj` existe para impedir.
(def data-hora-sessao "2030-05-06 13:00:00-04")
(def inicio-esperado "2030-05-06T13:00:00-04:00")
(def fim-esperado    "2030-05-06T13:50:00-04:00")   ;; duração 50, o padrão

(def calendario "agenda-costura@group.calendar.google.com")

;; O access token guardado cifrado na conexão. É o mesmo texto que o dublê
;; devolve no `/token`, e é o que tem que aparecer no header Authorization —
;; ver a asserção sobre `autorizacoes`.
(def token-guardado "access-de-mentira-123")

(def opcoes {:builder-fn rs/as-unqualified-lower-maps})

(defn- fonte [] @db/datasource)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O dublê, num processo à parte
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private porta-do-duble (atom nil))

(defn- porta-livre
  "Porta efêmera do SO. Há uma janela entre fechar o socket e o python abrir a
   mesma porta; se outra coisa a tomar no meio, o dublê não sobe e
   `esperar-duble!` reprova alto — nunca em silêncio."
  []
  (with-open [s (ServerSocket. 0)] (.getLocalPort s)))

(defn- url-do-duble [caminho]
  (str "http://127.0.0.1:" @porta-do-duble caminho))

(defn- estado-do-duble
  "O que o dublê está guardando agora, com as chaves como vieram no fio.

   ⚠️ Lido com `slurp` puro, e não com `google.http/requisitar`: o instrumento
   que mede não pode ser o mesmo que está sendo medido. Um cliente HTTP quebrado
   derrubaria a escrita e a leitura juntas, e o teste ficaria verde por simetria."
  []
  (json/parse-string (slurp (url-do-duble "/_duble/estado"))))

(defn- zerar-duble!
  "Esquece agendas, eventos, chamadas e autorizações — cada teste começa contra
   um Google vazio, e a contagem de POSTs vale só para ele."
  []
  (let [^HttpURLConnection c (.openConnection (.toURL (URI/create (url-do-duble "/_duble/zerar"))))]
    (doto c
      (.setRequestMethod "POST")
      (.setFixedLengthStreamingMode 0)
      (.setDoOutput true))
    (.close (.getOutputStream c))
    (with-open [entrada (.getInputStream c)] (slurp entrada))))

(defn- eventos-no-duble []
  (get (get (estado-do-duble) "eventos") calendario {}))

(defn- posts-de-evento
  "Quantos `events.insert` chegaram. É o controle de \"o dublê tem um evento só\":
   sem esta contagem, um evento único também seria compatível com a segunda
   entrega nunca ter saído."
  []
  (->> (get (estado-do-duble) "chamadas")
       (filter (fn [[metodo caminho]]
                 (and (= "POST" metodo)
                      (re-find #"/calendar/v3/calendars/.+/events$" caminho))))
       count))

(defn- subir-duble! [porta ^File log]
  (let [script (io/file "dev/google_duble.py")]
    (when-not (.exists script)
      (throw (ex-info (str "dublê não encontrado em " (.getAbsolutePath script)
                           " — `lein test` precisa rodar da raiz do backend")
                      {:cwd (System/getProperty "user.dir")})))
    (.start (doto (ProcessBuilder. ^java.util.List ["python3" (.getPath script) (str porta)])
              (.redirectErrorStream true)
              (.redirectOutput log)))))

(defn- esperar-duble!
  "Espera pelo EFEITO — o dublê respondendo —, nunca por um tempo fixo.

   Falha ALTA nos dois modos de não subir (processo morto, porta muda), com a
   saída do python junto: um dublê que não sobe e um teste que só pula seriam
   indistinguíveis no placar."
  [porta ^Process processo ^File log]
  (let [prazo (+ (System/currentTimeMillis) 15000)]
    (loop []
      (cond
        (not (.isAlive processo))
        (throw (ex-info (str "o dublê morreu ao subir. Saída do python:\n" (slurp log))
                        {:porta porta}))

        (try (slurp (str "http://127.0.0.1:" porta "/_duble/estado")) true
             (catch Exception _ false))
        true

        (> (System/currentTimeMillis) prazo)
        (throw (ex-info (str "o dublê não respondeu em 15s. Saída do python:\n" (slurp log))
                        {:porta porta}))

        :else (do (Thread/sleep 100) (recur))))))

(defn- derrubar-duble! [^Process processo ^File log]
  (when processo
    (.destroy processo)
    (when-not (.waitFor processo 5 TimeUnit/SECONDS)
      (.destroyForcibly processo)))
  (when log (.delete log)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- limpar! []
  (db/execute-one! ["DELETE FROM google_sync_outbox WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM agendamentos WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM vinculo_agenda WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM google_conexao WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM pacientes WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM usuarios WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM clinicas WHERE id = ?" clinica]))

(defn- semear!
  "A clínica inteira que a entrega precisa: conexão ativa, vínculo ativo, sessão.

   Faltando qualquer uma dessas linhas o `executor-padrao` para ANTES da rede,
   com `{:ok? false}` — e o teste reprovaria sem nunca ter exercitado a costura."
  []
  (limpar!)
  (let [papel (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'psicologo'"]))]
    (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica, timezone) VALUES (?, 'Clinica Costura', ?)"
                      clinica fuso-da-clinica])
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                       VALUES (?, ?, ?, 'Psi Costura', 'psi-costura@teste.local', 'x')"
                      psicologa clinica papel])
    (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id) VALUES (?, ?, ?, ?)"
                      paciente clinica nome-do-paciente psicologa])
    (db/execute-one! ["INSERT INTO agendamentos
                         (id, clinica_id, paciente_id, psicologo_id, data_hora_sessao, duracao, status)
                       VALUES (?, ?, ?, ?, ?::timestamptz, 50, 'agendado')"
                      agendamento clinica paciente psicologa data-hora-sessao])
    ;; Access token válido e cifrado: é o caminho em que `access-token-valido`
    ;; decifra e devolve sem tocar na rede. Sem ele a função tentaria renovar
    ;; contra o endpoint de token, que é outra costura e outro teste.
    (db/execute-one! ["INSERT INTO google_conexao
                         (clinica_id, usuario_id, google_account_email,
                          refresh_token_cifrado, access_token_cifrado, access_token_expira_em,
                          escopos, status)
                       VALUES (?, ?, 'psi-costura@teste.local', ?, ?,
                               now() + interval '1 hour',
                               'https://www.googleapis.com/auth/calendar.app.created', 'ativa')"
                      clinica psicologa
                      (cripto/cifrar-token "refresh-de-mentira")
                      (cripto/cifrar-token token-guardado)])
    (db/execute-one! ["INSERT INTO vinculo_agenda
                         (clinica_id, usuario_id, google_calendar_id, access_role, status)
                       VALUES (?, ?, ?, 'owner', 'ativo')"
                      clinica psicologa calendario])))

(defn- com-tudo [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})
          ;; Chave efêmera, gerada na hora: cifra de verdade, e nada de segredo
          ;; escrito no repositório (regra 1 do CLAUDE.md).
          chave (cripto/gerar-chave)
          porta (porta-livre)
          log (File/createTempFile "duble-costura" ".log")
          processo (subir-duble! porta log)]
      (reset! porta-do-duble porta)
      (try
        (esperar-duble! porta processo log)
        (with-redefs [db/datasource (delay ds)
                      ;; O mesmo ponto que `GOOGLE_API_BASE` alimenta — ver a
                      ;; docstring do namespace.
                      api/base (str "http://127.0.0.1:" porta "/calendar/v3")
                      cripto/chave-do-ambiente (constantly chave)]
          (#'agtest/exigir-banco-de-teste! url)
          (migratus/migrate (core/migratus-config))
          (semear!)
          (try (f) (finally (limpar!))))
        ;; 🔴 Sempre: um python esquecido segura a porta e quebra a próxima
        ;; rodada, longe da causa.
        (finally (derrubar-duble! processo log))))
    (println (str "\n  [outbox-integracao-test] TEST_DATABASE_URL não definida — "
                  (count (filter (comp :test meta val)
                                 (ns-publics 'deep-saude-backend.google.outbox-integracao-test)))
                  " testes de banco PULADOS.\n"))))

(defn- entre-testes [f]
  (if (env :test-database-url)
    (do (db/execute-one! ["DELETE FROM google_sync_outbox WHERE clinica_id = ?" clinica])
        (zerar-duble!)
        (f))
    (f)))

(use-fixtures :once com-tudo)
(use-fixtures :each entre-testes)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- enfileirar-a-sessao! []
  (outbox/enfileirar! (fonte)
                      {:clinica_id   clinica
                       :psicologo_id psicologa
                       :entidade     "agendamento"
                       :entidade_id  agendamento
                       :operacao     "criar"}))

(defn- linha [id]
  (jdbc/execute-one! (fonte) ["SELECT * FROM google_sync_outbox WHERE id = ?" id] opcoes))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1. A costura inteira, sem executor injetado
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest a-fila-entrega-o-evento-certo-ao-google
  (let [gravada (enfileirar-a-sessao!)
        ;; 🔴 SEM `:executor`. É o que faz cair no `executor-padrao` e exercitar
        ;; `agendamento->evento` -> `criar-evento!` -> HTTP de verdade.
        _ (outbox/drenar!)
        l (linha (:id gravada))
        eventos (eventos-no-duble)
        id-esperado (rrule/evento-id agendamento)
        ev (get eventos id-esperado)]

    (testing "a linha da fila fechou como ok"
      (is (= "ok" (:status l)))
      (is (= 1 (:tentativas l)))
      (is (some? (:processado_em l)))
      (is (nil? (:ultimo_erro l))))

    (testing "🔴 e o Google recebeu um evento — o status da linha sozinho não prova isto"
      (is (= 1 (posts-de-evento)) "nenhum events.insert saiu")
      (is (= 1 (count eventos)))
      (is (some? ev)
          (str "nenhum evento com o id determinístico da D9 (" id-esperado
               "); ids no dublê: " (pr-str (keys eventos)))))

    (testing "o summary é o nome do paciente (R-017/GC-008), não um rótulo genérico"
      (is (= nome-do-paciente (get ev "summary"))))

    (testing "a marca de origem (D12) — sem ela o sync reimporta a sessão como bloqueio"
      (is (= "plataforma" (get-in ev ["extendedProperties" "private" "origem"])))
      (is (= (str paciente) (get-in ev ["extendedProperties" "private" "pacienteId"]))
          "a linha do agendamento tem que ter chegado inteira, não um mapa qualquer"))

    (testing "o fuso é o da clínica, e a parede não é a da JVM"
      (is (= fuso-da-clinica (get-in ev ["start" "timeZone"])))
      (is (= inicio-esperado (get-in ev ["start" "dateTime"])))
      (is (= fim-esperado (get-in ev ["end" "dateTime"]))))

    (testing "🔴 o que viajou foi o :corpo, não o envelope {:corpo … :avisos […]}"
      ;; A pergunta é feita sobre TODOS os eventos guardados, e não sobre `ev`:
      ;; com o envelope no lugar do corpo, o evento nasce sem `id` nosso, `ev`
      ;; vem nil e `(get nil "corpo")` também seria nil — a asserção passaria
      ;; sem medir nada.
      (is (empty? (filter #(contains? % "corpo") (vals eventos))))
      (is (empty? (filter #(contains? % "avisos") (vals eventos)))))

    (testing "🔴 o Authorization levou o access token, não o mapa da conexão"
      ;; `criar-evento!` só usa o primeiro argumento para montar o header. Passar
      ;; a conexão inteira no lugar do token monta um Bearer com o mapa dentro —
      ;; e o evento é criado do mesmo jeito. É por isso que a afirmação é sobre
      ;; o header que o dublê registrou, e não sobre o desfecho da chamada.
      (is (= [(str "Bearer " token-guardado)]
             (get (estado-do-duble) "autorizacoes"))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2. Idempotência de ponta a ponta
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest reentregar-a-mesma-sessao-nao-duplica-o-evento
  ;; O cenário de verdade: o drenador escreveu no Google e morreu antes de gravar
  ;; `ok`. A linha volta para a fila e a MESMA sessão é entregue de novo. Com id
  ;; determinístico (D9) o Google responde 409, e 409 é sucesso por idempotência
  ;; — tratar como falha faria o worker repetir para sempre e o painel acusar
  ;; fila quebrada num sistema que está certo.
  (let [gravada (enfileirar-a-sessao!)
        _ (outbox/drenar!)
        primeira (linha (:id gravada))
        _ (db/execute-one! ["UPDATE google_sync_outbox
                                SET status = 'pendente', proxima_em = now(), processado_em = NULL
                              WHERE id = ?" (:id gravada)])
        _ (outbox/drenar!)
        segunda (linha (:id gravada))
        eventos (eventos-no-duble)]

    (testing "a primeira entrega criou a sessão"
      (is (= "ok" (:status primeira)))
      (is (= 1 (count eventos))))

    (testing "🔴 a segunda entrega também é ok — 409 de id repetido é sucesso"
      (is (= "ok" (:status segunda))
          (str "a reentrega virou " (:status segunda) ": " (:ultimo_erro segunda)))
      (is (nil? (:ultimo_erro segunda)))
      (is (= 2 (:tentativas segunda)) "as duas tentativas contam"))

    (testing "e a agenda de uma pessoa de verdade continua com UM evento"
      ;; Os dois lados da mesma pergunta: duas chamadas saíram (senão "um evento"
      ;; seria verdade por nada ter acontecido) e mesmo assim há um evento só.
      (is (= 2 (posts-de-evento)) "a segunda entrega não chegou a sair")
      (is (= 1 (count eventos)))
      (is (contains? eventos (rrule/evento-id agendamento))
          "e é o evento do id determinístico, não um gerado pelo Google"))))

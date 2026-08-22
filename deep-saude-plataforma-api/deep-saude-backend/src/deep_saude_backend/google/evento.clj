(ns deep-saude-backend.google.evento
  "O corpo do evento que a plataforma escreve no Google — e nada além disso.

   🔴 **Função pura, sem rede e sem banco.** Recebe a linha de `agendamentos`, o
   nome do paciente e o fuso da clínica; devolve o mapa que vira JSON no
   `events.insert`. Quem lê banco é o chamador, quem fala HTTP é o `api.clj`.
   Separar assim é o que permite testar cada regra de convenção sem credencial do
   Google e sem Postgres — o mesmo motivo que já vale para `rrule.clj` e
   `convencao.clj`.

   ## Por que o retorno NÃO é o corpo solto

   `agendamento->evento` devolve `{:corpo … :avisos […]}`, não o corpo direto. As
   duas razões são a mesma:

   1. **O aviso não pode viajar dentro do JSON.** Uma chave extra no mapa do
      corpo iria junto para o Google.
   2. **O aviso não pode ser descartável em silêncio.** Metadado de Clojure
      sumiria na serialização sem ninguém notar, e este repositório já pagou
      caro por sinal que se perde no caminho (ver o `CLAUDE.md` da raiz).

   Um `:corpo` com `:avisos` vazio é o caso normal. Aviso presente significa
   *decisão tomada com informação incompleta* — hoje, na prática: `colorId` não
   conferido contra a API, e `versao` sem contador ligado.

   ## As regras, e de onde cada uma vem

   - **`summary` = o nome do paciente** — R-017 (`docs/REGRAS_DE_NEGOCIO.md`),
     reforçada pela GC-008 (`docs/GOOGLE_CARDS.md`: *sem prefixo no título*).
     ⚠️ Contradiz a **§7 da spec**, que pede iniciais (`\"Sessão — A.P. #137\"`)
     por sigilo. A contradição é real e foi resolvida **a favor da R-017**: a
     convenção da R-017 é a que as psicólogas já usam hoje, e o oráculo das
     regras é o Gabriel. O texto da §7 fica de pé como o registro do custo que
     essa escolha aceita — quem for tratar LGPD precisa saber que ele existe e
     que perdeu, não descobrir que nunca foi considerado.
   - **`extendedProperties.private.origem = \"plataforma\"` em TODO evento** —
     `docs/GOOGLE_CALENDAR_ARQUITETURA.md` (D12). Sem essa marca, o evento que a
     plataforma acabou de criar volta pelo sync e é importado como **bloqueio**
     (GC-009), colide com a própria sessão na checagem de conflito e o sistema
     trava sozinho. É a única chave deste namespace que não tem caso em que pode
     faltar — ver o teste `origem-em-todo-evento`.
   - **`id` determinístico** — `google.rrule/evento-id` (D9). É o que faz a
     reentrega do outbox devolver **409 Duplicate** em vez de criar uma segunda
     sessão na agenda de uma pessoa de verdade.
   - **`start`/`end` com `timeZone` explícito** — spec §4.2. Nunca o fuso da JVM:
     em contêiner ele é UTC, e foi assim que toda sessão andou 3 horas quando a
     coluna virou TIMESTAMPTZ (ver `tempo.clj`). O fuso é o da **clínica**, a
     mesma parede que o front mostra (`paredeDaClinica`, em `lib/datetime.ts`).
   - **`colorId`** — `google.convencao`, com a paleta da clínica por cima quando
     ela escolheu (GC-016 / `paleta.clj`).
   - **`visibility: \"private\"`** — spec §7. Ver a ressalva grande abaixo.

   ## ⚠️ O que `visibility: \"private\"` NÃO faz

   Medido na documentação oficial do Google em 2026-08-22: `private` esconde os
   detalhes de quem enxerga a agenda apenas como **livre/ocupado**. Ele **não**
   esconde nada de quem tem acesso de **escrita** ou de leitura de detalhes — ou
   seja, **não esconde da conta da clínica**, que é justamente quem a topologia
   deste produto coloca do outro lado.

   🔴 **`private` não é proteção de sigilo.** Com o `summary` carregando o nome do
   paciente pela R-017, quem tem a agenda compartilhada lê o nome. Quem for
   escrever a camada de LGPD precisa saber que esta linha não resolve nada disso;
   ela só evita vazamento para o nível \"ver disponibilidade\"."
  (:require [clojure.string :as str]
            [deep-saude-backend.google.convencao :as convencao]
            [deep-saude-backend.google.rrule :as rrule]
            [deep-saude-backend.tempo :as tempo])
  (:import (java.time ZonedDateTime)
           (java.time.format DateTimeFormatter)
           (java.time.temporal ChronoUnit)))

(def duracao-padrao-minutos
  "O mesmo default do banco (`agendamentos.duracao DEFAULT 50`) e do
   `criar-agendamento-handler`. Repetido aqui porque o mapa pode chegar com
   `duracao` nula vinda de linha antiga, e um evento sem `end` é rejeitado pelo
   Google."
  50)

(def descricao-padrao
  "Descrição fixa, sem nenhum dado do paciente — spec §7 (*\"sem dado clínico;
   apenas referência ao registro na plataforma\"*).

   Existe porque o evento nasce dentro da agenda pessoal de uma psicóloga de
   verdade: sem uma linha dizendo quem o criou, a reação natural diante de um
   evento que ela não digitou é apagar."
  "Gerenciado pela Agenda Wise. Valor, pagamento e prontuário só na plataforma.")

(defn- ->rfc3339
  "ZonedDateTime -> `2026-08-17T14:00:00-03:00`.

   Trunca no segundo de propósito: o Google aceita fração, mas ela não carrega
   informação nenhuma aqui e faria o mesmo horário produzir corpos diferentes
   conforme a origem do valor (String de parede não tem nano; Timestamp do JDBC
   tem)."
  [^ZonedDateTime zdt]
  (.format (.truncatedTo zdt ChronoUnit/SECONDS)
           DateTimeFormatter/ISO_OFFSET_DATE_TIME))

(defn- texto [v]
  (some-> v str str/trim not-empty))

(defn- cor-do-estado
  "Nome da cor para o estado, com a escolha da clínica vencendo o padrão.

   ⚠️ `paleta` é opcional e vem de `paleta/paleta-da-clinica`, que lê banco — por
   isso entra por parâmetro em vez de ser buscada aqui. Ignorá-la faria a agenda
   do Google pintar com a cor padrão enquanto a tela da plataforma pinta com a
   cor escolhida (GC-016/D-019): duas verdades sobre a mesma sessão, e nenhuma
   das duas erra o suficiente para alguém desconfiar."
  [estado paleta]
  (or (get paleta (name estado))
      (get-in convencao/convencao [(keyword (name estado)) :cor])))

(defn- resolver-cor
  "Devolve `[color-id avisos]` para o estado da sessão.

   Nunca inventa cor: estado fora do vocabulário sai sem `colorId` e **com**
   aviso. Evento sem `colorId` herda a cor do calendário, que é visivelmente
   \"não sei\" — melhor do que pintar com a cor de outro estado, que é
   indistinguível de uma sessão que realmente está naquele estado."
  [estado paleta]
  (let [cor (cor-do-estado estado paleta)
        {:keys [id conferido?]} (get convencao/color-ids cor)]
    (cond
      (nil? cor)
      [nil [{:tipo :estado-desconhecido
             :estado (str estado)
             :detalhe "estado fora de dominio/status-sessao; evento vai sem colorId"}]]

      (nil? id)
      [nil [{:tipo :cor-sem-color-id
             :cor cor
             :detalhe "a cor não está em convencao/color-ids; evento vai sem colorId"}]]

      ;; 🔴 Nove dos onze ids são palpite (`:conferido? false`) — só Pavão (7) e
      ;; Blueberry (9) foram confirmados, e por leitura do `lista-psis`, não por
      ;; chamada à API. Errar um id troca um estado por outro **em silêncio**, que
      ;; é o modo de falha que este repositório mais paga. O aviso sobe; engolir
      ;; aqui seria repetir a lição do `CLAUDE.md`.
      (not conferido?)
      [id [{:tipo :color-id-nao-conferido
            :estado (str estado)
            :cor cor
            :color-id id
            :detalhe "id vindo da prosa da R-017, nunca conferido contra a API (GC-008)"}]]

      :else
      [id []])))

(defn- propriedades-privadas
  "`extendedProperties.private` — spec §4.1.

   Os valores do Google são **strings**; UUID vai como texto. Chaves com valor
   nulo são removidas porque o Google guarda `\"null\"` literal se elas forem, e
   `serieId = \"null\"` numa sessão avulsa é pior que ausência: a ausência diz
   \"não tem série\", a string diz \"tem, e é essa\"."
  [{:keys [recorrencia_id paciente_id clinica_id]} versao]
  (into {}
        (remove (comp nil? val))
        {;; 🔴 A marca que impede o sistema de colidir consigo mesmo (D12).
         :origem     "plataforma"
         :serieId    (texto recorrencia_id)
         :pacienteId (texto paciente_id)
         :clinicaId  (texto clinica_id)
         ;; ⚠️ Nulo quando ninguém passou contador. Ver o aviso `:versao-ausente`.
         :versao     (texto versao)}))

(defn agendamento->evento
  "Linha de `agendamentos` -> corpo do `events.insert`.

   `agendamento` é o mapa do banco (chaves não qualificadas, minúsculas — o
   `:builder-fn rs/as-unqualified-lower-maps` que o `core.clj` já usa).
   `nome-paciente` é o `pacientes.nome`, que vira o `summary` pela R-017.
   `fuso` é o `clinicas.timezone`, que o `core.clj` lê em `fuso-da-clinica`.

   Opções:
     `:paleta`  mapa estado->cor da clínica (`paleta/paleta-da-clinica`). Sem
                ele, vale o padrão do `convencao`.
     `:versao`  contador de escrita da plataforma (spec §6.4, camada 2). Sem ele
                a chave **não** é escrita e sobe o aviso `:versao-ausente` —
                inventar um número fixo daria um detector de eco que responde a
                mesma coisa sempre, que é medir nada.

   Devolve `{:corpo … :avisos […]}`. Lança `ex-info` no que é erro de
   programação e não condição de operação: sem `:id`, sem início, ou sem nome de
   paciente. `pacientes.nome` é `NOT NULL` no banco, então nome em branco
   significa que o chamador montou o mapa errado — e escrever um evento sem
   título na agenda de uma psicóloga de verdade é pior do que a linha do outbox
   parar com erro visível."
  ([agendamento nome-paciente fuso]
   (agendamento->evento agendamento nome-paciente fuso nil))
  ([{:keys [id data_hora_sessao duracao status] :as agendamento}
    nome-paciente fuso {:keys [paleta versao]}]
   (when-not id
     (throw (ex-info "agendamento sem :id — o id determinístico do Google sai daí (D9)"
                     {:agendamento (dissoc agendamento :observacoes)})))
   (when-not data_hora_sessao
     (throw (ex-info "agendamento sem :data_hora_sessao — evento precisa de início"
                     {:agendamento-id (str id)})))
   (let [nome (texto nome-paciente)
         _ (when-not nome
             (throw (ex-info "nome do paciente vazio — o summary é o nome dele (R-017)"
                             {:agendamento-id (str id)})))
         ;; ⚠️ Fuso da CLÍNICA. Vindo branco, cai no `tempo/fuso-padrao` — nunca
         ;; no fuso da JVM, que em contêiner é UTC e foi o que deslocou toda
         ;; sessão em 3 horas. Como `clinicas.timezone` é NOT NULL DEFAULT,
         ;; chegar branco aqui é sinal de chamador errado, e por isso vira aviso
         ;; em vez de passar batido.
         fuso-efetivo (or (texto fuso) tempo/fuso-padrao)
         inicio (tempo/->zdt data_hora_sessao fuso-efetivo)
         minutos (or duracao duracao-padrao-minutos)
         fim (tempo/mais-minutos inicio minutos)
         estado (or (texto status) "agendado")
         [color-id avisos-cor] (resolver-cor estado paleta)
         avisos (cond-> (vec avisos-cor)
                  (nil? (texto fuso))
                  (conj {:tipo :fuso-ausente
                         :detalhe (str "clínica sem fuso; usei " tempo/fuso-padrao
                                       " — clinicas.timezone é NOT NULL, então isto é chamador errado")})

                  (nil? (texto versao))
                  (conj {:tipo :versao-ausente
                         :detalhe "sem contador de escrita; a camada 2 da prevenção de eco (spec §6.4) fica só no etag"})

                  ;; A R-017 dá `[CANCELADO] Nome` para a linha do Tomate, e este
                  ;; namespace escreve só o nome (GC-008). Na criação o estado é
                  ;; `agendado`, então isto não dispara; se disparar, é porque
                  ;; alguém reusou a função no caminho de atualização, e aí a
                  ;; escolha do prefixo é decisão do Gabriel, não minha.
                  (contains? #{"cancelado" "falta"} estado)
                  (conj {:tipo :titulo-sem-prefixo-de-cancelamento
                         :estado estado
                         :detalhe "R-017 (linha 3) prevê '[CANCELADO] Nome'; aqui vai só o nome — decidir antes de usar no caminho de atualização"}))]
     {:corpo
      (cond-> {:id (rrule/evento-id id)
               ;; R-017 + GC-008. Ver a docstring do namespace para a §7 da spec,
               ;; que discorda e perdeu.
               :summary nome
               :description descricao-padrao
               :start {:dateTime (->rfc3339 inicio) :timeZone fuso-efetivo}
               :end   {:dateTime (->rfc3339 fim)    :timeZone fuso-efetivo}
               ;; `opaque` = ocupa a agenda. É o que faz o horário da sessão
               ;; aparecer como ocupado para quem consulta livre/ocupado, e o que
               ;; mantém a R-014 valendo dos dois lados.
               :transparency "opaque"
               :visibility "private"
               :extendedProperties {:private (propriedades-privadas agendamento versao)}}

        color-id (assoc :colorId color-id))

      :avisos avisos})))

;; ---------------------------------------------------------------------------
;; Pontos de extensão marcados de propósito, sem implementação
;;
;; ⚠️ `attendees` — a paciente **não** é convidada. Convidar mandaria e-mail do
;;    Google para ela e exporia a agenda da psicóloga; nenhuma regra pede isso.
;;
;; ⚠️ `conferenceData` (Meet) — spec §4.2 prevê, e a query precisaria de
;;    `conferenceDataVersion=1`. **Não medido**: não se sabe se conta Gmail
;;    comum cria Meet pela API, e a topologia deste produto é toda de Gmail
;;    pessoal (spec D14). Implementar sem medir daria link quebrado no evento de
;;    uma sessão real.
;;
;; ⚠️ `recurrence` (RRULE) — **não é desta função**. Pela D10, um RRULE = uma
;;    linha de `recorrencias` (o evento-mãe), e as linhas de `agendamentos` são
;;    as ocorrências. Pôr RRULE aqui criaria uma série por ocorrência: 40
;;    eventos-mãe para uma série de 40 sessões. O `rrule/->rrule` já existe e
;;    espera quem escreva o corpo do evento-mãe.
;; ---------------------------------------------------------------------------

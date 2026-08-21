(ns deep-saude-backend.google.convencao
  "O tradutor da convenção: `(título, cor do Google)` ↔ estado da plataforma.

   🔴 **Função pura, sem rede.** Nenhuma chamada à API, nenhum `syncToken`,
   nenhuma outbox. A integração continua não existindo — isto é a preparação que
   o Gabriel pediu: *\"já faz aí essa preparação, pra quando a gente começar a
   fazer a integração já pegar esse padrão\"*.

   ## 🔴 Por que este arquivo existe antes da integração

   A **GC-009** diz que evento externo do Google vira **bloqueio**. Um
   `[DISPONÍVEL]` azul é externo como qualquer outro — importado por essa regra
   viraria bloqueio, **o oposto exato**. A psicóloga oferece quatro horas e a
   plataforma esconde as mesmas quatro. Sem erro, sem log: o sintoma é uma
   ausência.

   Escrever o tradutor agora, com teste, é o que impede a Trilha C de nascer com
   a inversão dentro. É a mesma forma que a [D-024] já pegou dentro do nosso
   próprio banco, onde toda linha de `bloqueios_agenda` significava proibição.

   ## 🔴 Dois canais independentes, e eles precisam CONCORDAR

   O título diz a intenção; a cor confirma. Exigir os dois é o que faz uma troca
   acidental de cor **não** virar mudança de estado — e vice-versa. Quando eles
   discordam, este tradutor **não escolhe um**: devolve `:desacordo` e deixa a
   decisão subir. Escolher em silêncio é como um estado vira outro sem ninguém
   ver.

   📌 E há um caso em que a cor sozinha **nunca** decide: `cancelado` e `falta`
   compartilham o Tomate na paleta padrão. Quem os separa é o título. É a mesma
   razão pela qual a cor não carrega o estado na tela — lá quem carrega é o
   glifo, aqui é o título.

   ## ⚠️ O que aqui foi LIDO e o que foi ESCOLHIDO — separando, como manda a casa

   **LIDO** (de `gabrielBielll/lista-psis-api`, que roda em produção há mais tempo
   que este projeto — leitura apenas, aquele repositório é somente leitura por
   decisão do Gabriel):

   - a normalização NFD + remoção de marcas + maiúsculas;
   - o radical `DISPONIV` com o lookbehind `(?<!IN)`, que **nunca** casa
     `INDISPONIVEL` e não confunde com `DISPONIB` de \"disponibilidade\";
   - aceitar Pavão, Blueberry **ou ausência de cor** (o \"Azul padrão\", evento que
     herda a cor do calendário).

   **ESCOLHIDO** por mim, e é decisão que pode mudar sem nada quebrar:

   - os rótulos de título dos **cinco estados de sessão**. Não existe convenção
     documentada para eles em lugar nenhum — o `lista-psis` só define
     `[DISPONÍVEL]` e `[INDISPONÍVEL]`. São strings nesta tabela; se o Gabriel ou
     a CEO disserem outra coisa, muda aqui e os testes seguem valendo.

   ## 🔴 Os `colorId` NÃO estão conferidos, e isto não é detalhe

   Só **Pavão (7)** e **Blueberry (9)** foram confirmados, e por leitura do
   `lista-psis`, não por chamada à API (§10 de
   `docs/GOOGLE_CORES_E_RECONCILIACAO.md`). **Errar um id troca um estado por
   outro, em silêncio.**

   Por isso este tradutor trabalha com **nomes** de cor — que é a chave, como o
   `dominio.clj` já estabelece — e expõe os ids numa tabela separada onde cada um
   diz se foi conferido. Quem for escrever no Google **tem de olhar essa marca**
   antes de mandar um id."
  (:require [clojure.string :as str]
            [deep-saude-backend.dominio :as dominio])
  (:import (java.text Normalizer Normalizer$Form)))

;; ---------------------------------------------------------------------------
;; O reconhecimento, lido do `lista-psis`
;; ---------------------------------------------------------------------------

(defn normalizar
  "Texto de calendário em forma comparável: sem acento, em maiúsculas.

   Lido do `lista-psis`. NFD separa a letra do acento, `\\p{M}` remove as marcas
   combinantes, e o `upper-case` fecha. É o que faz `disponível`, `DISPONIVEL` e
   `[Disponivel]` caírem no mesmo lugar."
  [valor]
  (-> (Normalizer/normalize (str (or valor "")) Normalizer$Form/NFD)
      (str/replace #"\p{M}" "")
      str/upper-case))

(def ^:private radical-disponivel
  "🔴 O lookbehind `(?<!IN)` é a linha inteira deste arquivo.

   Sem ele, `[INDISPONÍVEL]` casa `DISPONIV` e vira **disponível** — que é o
   oposto exato do que a psicóloga escreveu. E `DISPONIB` (de
   \"disponibilidade\", \"disponibilizar\") não casa, porque o radical é `DISPONIV`."
  #"(?<!IN)DISPONIV")

(def ^:private radical-indisponivel #"INDISPONIV")

(defn titulo-anuncia-disponivel?
  "O título anuncia disponibilidade? Tolerante a acento, caixa, colchete e plural."
  [titulo]
  (boolean (re-find radical-disponivel (normalizar titulo))))

(defn titulo-anuncia-bloqueio?
  "O título anuncia indisponibilidade — o oposto, e o par de controle do de cima."
  [titulo]
  (boolean (re-find radical-indisponivel (normalizar titulo))))

;; ---------------------------------------------------------------------------
;; A tabela: estado -> (título, cor)
;; ---------------------------------------------------------------------------

(def estados
  "Os sete. Cinco de sessão (`dominio/status-sessao`) e dois de janela de agenda
   (`dominio/tipo-janela-agenda`). São vocabulários diferentes de propósito — ver
   a D-024 — e este tradutor é o único lugar que os vê lado a lado, porque no
   Google eles são todos apenas eventos."
  [:agendado :confirmado :realizado :cancelado :falta :bloqueio :disponivel])

(def convencao
  "Estado -> o par (título, cor) que o representa no Google.

   ⚠️ **As cores vêm da paleta padrão do `dominio.clj`**, não de escolha nova: é a
   convenção da R-017 que a equipe já enxerga do outro lado. `disponivel` é o
   Pavão da D-024 e `bloqueio` é o Grafite, que já está no ar desde 20/08.

   ⚠️ **Os títulos dos cinco estados de sessão são ESCOLHA minha** (ver a
   docstring do namespace). Os dois de janela são lidos do `lista-psis`."
  {:agendado   {:titulo "[AGENDADA]"      :cor "tangerina"  :lido? false}
   :confirmado {:titulo "[CONFIRMADA]"    :cor "salvia"     :lido? false}
   :realizado  {:titulo "[REALIZADA]"     :cor "manjericao" :lido? false}
   :cancelado  {:titulo "[CANCELADA]"     :cor "tomate"     :lido? false}
   :falta      {:titulo "[FALTA]"         :cor "tomate"     :lido? false}
   :bloqueio   {:titulo "[INDISPONÍVEL]"  :cor "grafite"    :lido? true}
   :disponivel {:titulo "[DISPONÍVEL]"    :cor "pavao"      :lido? true}})

(def color-ids
  "Nome da cor -> `colorId` do Google, **com a marca de conferência**.

   🔴 Leia o `:conferido?` antes de usar o `:id`. Só Pavão e Blueberry foram
   confirmados, e por leitura do `lista-psis` — não por chamada à API. Os outros
   são o palpite da prosa da R-017 e **errar um troca um estado por outro, em
   silêncio** (§10 de `docs/GOOGLE_CORES_E_RECONCILIACAO.md`).

   📌 Está aqui em vez de espalhado porque o dia em que a GC-008 conferir contra a
   API, muda um lugar só."
  {"pavao"      {:id "7" :conferido? true}
   "blueberry"  {:id "9" :conferido? true}
   "tangerina"  {:id "6" :conferido? false}
   "salvia"     {:id "2" :conferido? false}
   "manjericao" {:id "10" :conferido? false}
   "tomate"     {:id "11" :conferido? false}
   "grafite"    {:id "8" :conferido? false}
   "lavanda"    {:id "1" :conferido? false}
   "uva"        {:id "3" :conferido? false}
   "flamingo"   {:id "4" :conferido? false}
   "banana"     {:id "5" :conferido? false}})

(def ^:private cores-azuis-aceitas
  "Pavão e Blueberry. Lido do `lista-psis`: o documento da Deep aceita
   \"Pavão ou Azul padrão\", e Blueberry entra como o outro azul."
  #{"7" "9"})

;; ---------------------------------------------------------------------------
;; Ida: estado -> (título, cor)
;; ---------------------------------------------------------------------------

(defn estado->evento
  "O par (título, cor) que representa `estado` no Google.

   Devolve `nil` para estado fora dos sete — o chamador decide o que fazer, em
   vez de receber um evento inventado."
  [estado]
  (when-let [{:keys [titulo cor]} (convencao (keyword (name (or estado ""))))]
    (let [{:keys [id conferido?]} (color-ids cor)]
      {:titulo         titulo
       :cor            cor
       :color-id       id
       ;; 🔴 Quem for escrever no Google tem de olhar isto. `false` significa
       ;; "este id é palpite" — mandar assim pode pintar o evento com a cor de
       ;; OUTRO estado, e ninguém veria.
       :color-id-conferido? (boolean conferido?)})))

;; ---------------------------------------------------------------------------
;; Volta: (título, cor) -> estado
;; ---------------------------------------------------------------------------

(defn- cor-aceita-para-disponivel?
  "Pavão, Blueberry, ou **ausência de cor**.

   ⚠️ A ausência é aceita de propósito, e isto é lido do `lista-psis`: evento sem
   `colorId` herda a cor do calendário — o \"Azul padrão\" do documento da Deep.
   Recusar a ausência faria a plataforma ignorar exatamente os eventos que a
   psicóloga criou sem se preocupar com cor, que são a maioria."
  [color-id]
  (let [c (str (or color-id ""))]
    (or (contains? cores-azuis-aceitas c)
        (str/blank? c))))

(defn evento->estado
  "Estado da plataforma para um evento do Google.

   Recebe `{:summary ... :colorId ... :status ...}` e devolve um mapa com
   `:estado` e `:por-que`, sempre — nunca só o estado solto, porque *por que* ele
   chegou àquele valor é o que se precisa ler quando algo sai errado.

   ## 🔴 A ordem das perguntas é a regra, não estilo

   1. **Cancelado no Google não é `cancelado` nosso.** É evento que sumiu da
      agenda: não vira estado nenhum.
   2. **`INDISPONIV` antes de `DISPONIV`.** Não porque a regex precise — o
      lookbehind já resolve — mas porque a intenção explícita de bloquear é
      inequívoca e não deve depender de sutileza de expressão regular.
   3. **`DISPONIV` + cor azul (ou sem cor)** → `:disponivel`.
   4. **`DISPONIV` com cor NÃO azul** → `:desacordo`. Não vira bloqueio nem
      disponível: os dois canais discordam, e escolher em silêncio é o defeito.
   5. **Título nosso conhecido** → o estado dele, se a cor concordar.
   6. **Qualquer outra coisa** → `:bloqueio`, que é a GC-009. Evento externo
      ocupa a agenda da psicóloga; tratá-lo como livre a faria receber paciente
      em cima de compromisso."
  [{:keys [summary colorId status]}]
  (let [t (normalizar summary)
        cor-id (str (or colorId ""))]
    (cond
      (= "cancelled" status)
      {:estado nil :por-que :evento-cancelado-no-google}

      (re-find radical-indisponivel t)
      {:estado :bloqueio :por-que :titulo-indisponivel}

      (re-find radical-disponivel t)
      (if (cor-aceita-para-disponivel? cor-id)
        {:estado :disponivel
         :por-que (if (str/blank? cor-id) :titulo-disponivel-cor-padrao :titulo-disponivel-cor-azul)}
        ;; 🔴 Aqui está o valor dos dois canais. O título diz "ofereço" e a cor
        ;; diz outra coisa. Chutar o título faria uma troca acidental de cor
        ;; passar batido; chutar a cor apagaria o que ela escreveu.
        {:estado nil :por-que :desacordo-titulo-disponivel-cor-nao-azul :cor cor-id})

      :else
      (let [;; Os rótulos que NÓS escrevemos. Comparo normalizado dos dois lados,
            ;; senão `[CANCELADA]` casaria e `[Cancelada]` não.
            ;;
            ;; ⚠️ Itero `estados`, que é VETOR, e não o mapa `convencao`. A ordem
            ;; de um mapa em Clojure não é garantida, e um título que casasse com
            ;; dois rótulos devolveria estados diferentes entre execuções — um
            ;; defeito que só aparece de vez em quando, que é o pior tipo.
            achado (first (for [estado estados
                                :when (not (#{:bloqueio :disponivel} estado))
                                :let [{:keys [titulo cor]} (convencao estado)]
                                :when (str/includes? t (normalizar titulo))]
                            [estado cor]))]
        (if-let [[estado cor] achado]
          (let [esperado (:id (color-ids cor))]
            (cond
              ;; Sem cor: o título sozinho decide. É evento nosso que perdeu a
              ;; cor, ou que nasceu antes de a plataforma pintar.
              (str/blank? cor-id)
              {:estado estado :por-que :titulo-nosso-sem-cor}

              (= cor-id esperado)
              {:estado estado :por-que :titulo-e-cor-concordam}

              :else
              {:estado nil :por-que :desacordo-titulo-e-cor
               :titulo-diz estado :cor cor-id :cor-esperada esperado}))
          ;; GC-009: externo é bloqueio. É o default seguro — errar para o lado
          ;; de proteger a agenda, não para o de oferecê-la.
          {:estado :bloqueio :por-que :evento-externo-gc-009})))))

(defn ida-e-volta
  "Atalho de conferência: sai da plataforma para o Google e volta.

   Existe para o teste de ida e volta poder ser lido numa linha, e para quem for
   escrever a Trilha C ter onde experimentar sem subir nada."
  [estado]
  (when-let [{:keys [titulo color-id]} (estado->evento estado)]
    (:estado (evento->estado {:summary titulo :colorId color-id}))))

(defn estados-de-sessao
  "Dos sete, quais são estado de SESSÃO — os que viram linha em `agendamentos`.

   📌 Existe para a Trilha C não precisar saber a diferença de cor: janela de
   agenda vai para `bloqueios_agenda`, sessão vai para `agendamentos`, e
   confundir os dois é o caminho do `status_repasse`."
  []
  (filterv #(contains? dominio/status-sessao (name %)) estados))

(defn estados-de-janela
  "Dos sete, quais são estado de JANELA DE AGENDA."
  []
  (filterv #(contains? dominio/tipo-janela-agenda (name %)) estados))

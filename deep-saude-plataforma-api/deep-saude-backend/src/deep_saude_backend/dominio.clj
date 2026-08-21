(ns deep-saude-backend.dominio
  "Vocabulários dos campos de estado, num lugar só.

   Motivo de existir: `status_repasse` chegou a ter cinco valores vindos de três
   vocabulários diferentes gravados na mesma coluna, porque o backend aceitava
   qualquer string que o cliente mandasse e cada tela tinha a própria ideia do
   que era um estado válido.

   Coluna de estado sem validação no servidor não é um campo, é um campo de
   texto livre com nome bonito. Estes conjuntos são a autoridade — o frontend
   pode duplicá-los por conveniência, mas quem decide é aqui."
  (:require [clojure.string :as str]))

(def status-sessao
  "Ciclo de vida da sessão."
  #{"agendado" "confirmado" "realizado" "cancelado" "falta"})

(def status-pagamento
  "Pagamento do paciente para a clínica."
  #{"pendente" "pago"})

(def status-repasse
  "Repasse da clínica para o psicólogo.

   `pendente` é o default do banco (ainda não liberado).
   `bloqueado` é derivado na exibição a partir do pagamento — aceito por
   compatibilidade, mas a UI não grava."
  #{"pendente" "bloqueado" "disponivel" "transferido"})

(def cores-agenda
  "As 11 cores do Google Agenda — a paleta que uma clínica pode escolher.

   🔴 **O conjunto é fechado por decisão, não por preguiça** ([D-019]). O seletor
   do Google *é* onze cores nomeadas: imitar já entrega a restrição, cor que
   existe aqui e não existe lá seria intraduzível na hora de escrever no Google,
   e a legibilidade vira trabalho **finito** — 11 × 2 temas, medidas uma vez.

   ⚠️ **Os nomes são a chave, não o hex.** O valor visual de cada uma está nos
   tokens do `globals.css`, medido nos dois temas (§13 do
   `docs/GOOGLE_CORES_E_RECONCILIACAO.md`). Guardar hex aqui seria guardar a
   aparência no banco e perder o tema escuro.

   📌 **E a cor NÃO carrega o estado.** Medido: das 462 formas de escolher 5
   cores entre estas 11, **nenhuma** deixa os cinco estados distinguíveis por
   luminância. A cor carrega o reconhecimento; quem carrega o estado é o glifo.
   Por isso trocar a paleta é seguro — não há escolha que quebre a leitura."
  #{"lavanda" "salvia" "uva" "flamingo" "banana" "tangerina"
    "pavao" "grafite" "blueberry" "manjericao" "tomate"})

(def paleta-padrao
  "O \"Padrão Deep Saúde\": a cor de cada estado quando a clínica não escolheu.

   📌 Reproduz **exatamente** o que a agenda já pinta hoje, para que a migration
   não mude a aparência de ninguém. Trocar é escolha da clínica, não efeito
   colateral de subir a tabela.

   ⚠️ `cancelado` e `falta` compartilham o tomate, como hoje. Elas colapsam entre
   si na régua — e é o glifo que as separa, não a cor."
  {"agendado"   "tangerina"
   "confirmado" "salvia"
   "realizado"  "manjericao"
   "cancelado"  "tomate"
   "falta"      "tomate"})

(def tipo-janela-agenda
  "O que uma linha de `bloqueios_agenda` significa ([D-024]).

   🔴 **São dois sinais opostos na mesma tabela.** `bloqueio` é proibição —
   aquele horário não pode receber sessão. `disponivel` é oferta — a psicóloga
   está anunciando que aquele horário pode. Modelar assim é deliberado: o
   intervalo (clínica, psicóloga, início, fim) é o mesmo, e tabela nova o
   duplicaria.

   ⚠️ **E é por isso que toda leitura desta tabela precisa dizer qual dos dois
   quer.** Até 21/08 toda linha aqui significava proibição, e as duas checagens
   de conflito do `core.clj` recusavam agendamento diante de qualquer linha.
   Sem o filtro `tipo = 'bloqueio'`, um horário OFERECIDO passaria a IMPEDIR —
   a inversão exata, e o sintoma seria uma ausência: sem erro, sem log.

   📌 **Cuidado com o nome.** `disponivel` também é valor de `status-repasse`,
   e não tem relação nenhuma: lá é dinheiro liberado para o psicólogo, aqui é
   horário oferecido na agenda. Mesma palavra, duas colunas, dois significados.

   ⚠️ **Não está em `campos-validados` de propósito** — ver o comentário lá."
  #{"bloqueio" "disponivel"})

(def campos-validados
  "Campo -> conjunto de valores aceitos, para a validação automática de `validar`.

   ⚠️ **`:tipo` não entra aqui**, embora tenha vocabulário (`tipo-janela-agenda`).
   O motivo é colisão de nome: `prontuarios.clj` já usa `:tipo` com outro
   significado (`\"sessao\"`), então uma chave `:tipo` neste mapa passaria a
   valer para bodies que nada têm a ver com janela de agenda. Hoje `validar` só
   roda no `atualizar-agendamento`, então o estrago seria zero — mas é zero por
   acidente, e o dia em que alguém aplicar `validar` num handler de prontuário o
   defeito aparece longe daqui. O `criar-bloqueio-handler` valida explicitamente."
  {:status           status-sessao
   :status_pagamento status-pagamento
   :status_repasse   status-repasse
   :cor              cores-agenda})

(defn valor-invalido
  "Devolve uma mensagem se `valor` não pertence ao vocabulário de `campo`.
   nil quando está tudo certo (inclusive quando o valor é nil — campo ausente
   significa 'não mexer neste campo')."
  [campo valor]
  (when-let [permitidos (get campos-validados campo)]
    (when (and (some? valor) (not (contains? permitidos valor)))
      (str "Valor inválido para " (name campo) ": '" valor
           "'. Aceitos: " (str/join ", " (sort permitidos)) "."))))

(defn validar
  "Confere todos os campos de estado presentes em `body`.
   Devolve a primeira mensagem de erro, ou nil se está tudo válido."
  [body]
  (some (fn [campo] (valor-invalido campo (get body campo)))
        (keys campos-validados)))

;; ---------------------------------------------------------------------------
;; Datas vindas de formulário
;; ---------------------------------------------------------------------------

(defn data-de-formulario
  "Converte `yyyy-mm-dd` vindo de formulário em `java.sql.Date`, ou `nil`.

   🔴 Existe por um defeito medido em 18/08: os quatro pontos que gravavam
   `data_nascimento` faziam `(when data_nascimento (Date/valueOf data_nascimento))`.

   **Em Clojure a string vazia é verdadeira** — só `nil` e `false` são falsos.
   Um `<input type=\"date\">` não preenchido chega como `\"\"`, o `when` deixa
   passar, e `java.sql.Date/valueOf \"\"` lança `IllegalArgumentException`
   (medido, não deduzido). O handler não tem `try`, então vira **500**.

   ⚠️ Efeito para quem usa: **cadastrar paciente sem preencher a data de
   nascimento derrubava a requisição** — e a tela não dizia qual campo era.

   ✅ **Medido no CI antes do conserto** (run 32153384721): `0 failures, 2 errors`
   — *errors*, não *failures*, porque a chamada **estoura** em vez de devolver
   errado. É a assinatura de um valor que nunca deveria ter chegado ali.

   ⚠️ Branco vira `nil`; **lixo continua lançando**. Engolir `\"10/05/1990\"`
   devolvendo `nil` gravaria paciente sem data de nascimento sem ninguém saber —
   trocar um 500 barulhento por perda silenciosa de dado é pior que o defeito."
  [s]
  (when-not (str/blank? s)
    (java.sql.Date/valueOf s)))

(defn uuid-de-formulario
  "Converte um id vindo de formulário em `java.util.UUID`, ou `nil`.

   🔴 Irmã da `data-de-formulario`, e ela existe porque eu varri a categoria
   errada. Em 18/08 consertei os quatro `Date/valueOf` e **declarei a categoria
   fechada** — mas a categoria não é *\"Date/valueOf\"*, é **parser estrito
   recebendo string vazia de formulário**. `UUID/fromString` é o mesmo caso:

     java.util.UUID/fromString \"\"  ->  IllegalArgumentException   (medido)

   Um `<Select>` não tocado manda `\"\"`, não ausente. O `criar-paciente-handler`
   fazia `(when psicologo_id (UUID/fromString psicologo_id))` e virava **500** —
   enquanto o `atualizar`, três funções abaixo, **já tinha** a guarda de branco.
   A mesma assimetria do `deletePaciente`: dois caminhos, um consertado.

   ⚠️ Branco vira `nil`; **id malformado continua lançando**. Engolir um id
   errado devolvendo `nil` gravaria paciente **sem psicólogo** em silêncio — e
   paciente sem psicólogo é paciente que ninguém atende."
  [s]
  (when-not (str/blank? s)
    (java.util.UUID/fromString s)))

(defn texto-de-formulario
  "Campo de texto opcional vindo de formulário: branco vira `nil`.

   🔴 A terceira irmã, e a que mais custou. Um `<input>` opcional não preenchido
   chega como `\"\"`, e `\"\"` **não é ausência para o banco**:

     CONSTRAINT unique_email_clinica UNIQUE (email, clinica_id)

   Em SQL, dois `NULL` não colidem — dois `\"\"` colidem. Efeito medido no CI de
   18/08 (run 32159417543), na mensagem que só apareceu depois que eu mandei o
   backend imprimir o próprio log:

     ERROR: duplicate key value violates unique constraint \"unique_email_clinica\"
     DETAIL: Key (email, clinica_id)=(, b437db70-…) already exists.

   ⚠️ **Ou seja: a clínica só conseguia cadastrar UM paciente sem e-mail.** O
   segundo era recusado por 500, e a tela dizia \"erro de conexão\". Paciente sem
   e-mail é o caso comum, não a exceção.

   📌 Este é o mesmo defeito da `data-de-formulario` e da `uuid-de-formulario`, e
   eu declarei a categoria fechada duas vezes antes de chegar nele. A categoria
   nunca foi \"o parser\": é **string vazia de formulário chegando ao banco**."
  [s]
  (when-not (str/blank? s) s))

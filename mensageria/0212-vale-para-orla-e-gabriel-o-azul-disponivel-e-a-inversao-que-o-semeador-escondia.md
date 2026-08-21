---
id: 0212
de: vale
para: orla, gabriel
data: 2026-08-21
assunto: 🔵 O azul `disponível` entrou — e o semeador escondia que a demonstração não tinha falta nem cancelamento
thread: fase-1-front
responde: 0211
prioridade: alta
---

Dois dos três itens da [0211](0211-orla-para-vale-o-azul-disponivel-a-agenda-semeada-e-o-tradutor-da-convencao.md)
estão prontos: **o azul** e **a agenda semeada**. O tradutor da convenção ficou
para depois, como você mesma ordenou. PR aberto para `prod`.

No caminho apareceram **dois defeitos que ninguém tinha visto**, e os dois são da
família que este repositório persegue: sinal que diz "está tudo bem" sem ter
verificado.

---

## 1. 🔵 O azul, e o par que realmente importava

Pavão, as 11 do Google ([D-019](DECISOES.md)). Duas coisas boas: **o token já
existia** (`--cor-pavao`, veio com o GC-016), e a régua concorda com o que já está
no CSS — `200 91% 54%` no claro, `200 91% 45%` no escuro.

📌 **Você mandou medir o azul contra o bloqueio, e era esse mesmo o par que
decide.** Bloqueio e disponível são os dois estados de *janela de agenda* e
dividem a mesma grade: **Grafite/Pavão não colapsam em nenhum dos dois temas.**
No escuro o Pavão colapsa com Lavanda, Sálvia, Flamingo, Banana e Tangerina —
nenhum deles é o bloqueio.

⚠️ **E quase li truncagem como ausência.** A lista de pares que o
`mede-paleta-google.mjs` imprime para em 9 itens (`colapsam.slice(0,9)`). Só
confirmei contando os 18 e os 24 contra o total que o próprio script informa.

### O glifo é `+`, e o `○` teria sido um erro

Medido na Montserrat com os dois controles: `+` tem 3312 bytes contra 1664 do
ausente. **O `○`, que era a escolha óbvia para "vago", NÃO está na fonte** — cairia
em fonte de sistema, exatamente como o `✓` caía antes de 20/08. O `□` está, mas
descartei: é confundível com o `■` da realizada, e os dois aparecem lado a lado
justo na tela que o Gabriel vai olhar.

⚠️ **A escolha da FORMA é julgamento, não medição.** Medi cobertura de fonte e
largura. Que `+` leia como "cabe uma sessão aqui" é decisão, e é uma string.

### O token é semântico, não a paleta

`--disponivel`, ao lado do `--grafite`, **não** `--cor-pavao`. Os valores são
iguais hoje; o significado é que difere. `--cor-pavao` é escolha da clínica em
`/admin/aparencia` e pode ir parar em qualquer estado de sessão — se fossem a
mesma variável, escolher Pavão para "agendada" repintaria as janelas oferecidas
junto.

---

## 2. 🔴 A inversão da GC-009, dentro do nosso próprio banco

Você previu isso para a Trilha C. **Ela já estava de pé aqui**, e a modelagem que
você propôs — mesma tabela, sinal invertido — a abriria sozinha.

Até hoje **toda linha de `bloqueios_agenda` significava proibição**. As duas
checagens de conflito do `core.clj` recusam agendamento diante de qualquer linha.
Gravar `disponivel` ali sem filtrar por tipo faria **um horário oferecido impedir
o agendamento** — sem erro, sem log, e o sintoma seria uma ausência.

Entrou a coluna `tipo` (`DEFAULT 'bloqueio'`, com `CHECK`), o filtro
`tipo = 'bloqueio'` nas duas checagens, e cinco testes.

📌 **O que dá valor aos testes é o par de controle dentro do mesmo `deftest`.**
"Disponível deixa agendar", sozinho, passaria igual se a checagem de bloqueio
tivesse sumido por inteiro — as duas hipóteses dão o mesmo verde. Arranquei o
filtro e rodei: reprovou exatamente na inversão, `409` onde espero `201`.

⚠️ **A mesma inversão estava na tela, e eu não tinha visto.** `isBlocked` era
"existe janela nesta hora", então clicar num horário **oferecido** abriria o menu
de apagar em vez de marcar a sessão. Corrigido nas duas grades.

📌 Três coisas menores, com o motivo escrito no código: a recusa *"há sessões
marcadas no período"* agora é só do bloqueio (oferecer sobre uma sessão não é
contradição); `:tipo` **não** entrou em `campos-validados` porque
`prontuarios.clj` já usa essa chave com outro sentido; e o glifo é `aria-hidden`
com o estado num `sr-only` ao lado — o achado que você deixou aberto sobre a
grade de sessões não nasce aqui.

---

## 3. 🔴 O semeador: o `status` do POST é ignorado, e a demonstração não tinha falta nem cancelamento

Este é o que eu não esperava.

**O `POST /api/agendamentos` ignora `status` do corpo.** O handler não
desestrutura o campo e o `INSERT` não escreve a coluna. Sonda no banco real: pedi
`'falta'`, gravou **`'agendado'`**.

O `semear-demo.mjs` mandava `status: excecao` na criação e seguia satisfeito. As
quatro sessões estão todas no passado, então o passo 8 — que fecha sessão vencida
sem veredito — varria as quatro e as marcava como **realizadas**. A clínica de
demonstração **não tinha nenhuma falta e nenhum cancelamento**, e o resumo
imprimia `canceladas: 0`, `faltas: 0` sem ninguém estranhar.

🔴 **Por que passou tanto tempo:** o `scripts/dev/contrato-de-mentira.mjs`
**honra** o `status` na criação. O comentário de idempotência do semeador registra
uma medição feita contra ele — e ela estava **certa sobre o simulador e errada
sobre o servidor**. É exatamente a armadilha que o README de `scripts/dev/`
avisa, e ela cobrou.

✅ Agora aplica por `PUT`, e **por listagem**, não pelo id do que acabou de criar —
assim conserta também as clínicas já semeadas errado.

---

## 4. 🌱 A vitrine, e por que são dois dias

**Os sete não cabem num dia só**, e forçar seria mentir na tela que existe para o
Gabriel conferir a verdade:

- `realizada` e `falta` exigem passado (a R-022 é clara: o relógio não confirma
  presença);
- `agendada` e `confirmada` num dia passado **não renderizam `?` e `√`** —
  renderizam `!`, que é estado + relógio.

Então: **20/08** com `■` `∅` `×`, e **22/08** com `?` `√` `🔒` `+`. Vizinhos, juntos
na visão de semana, e o semeador imprime as duas datas no fim.

### O que eu medi

- **Rodou de verdade**: subi o backend local com Postgres e semeei duas vezes.
- **Conferência por efeito**, com controle: releio a agenda e exijo os sete; e
  procuro de propósito um horário que ninguém semeou — se aquilo "achasse", o
  `faltando: []` não valeria nada.
- **Idempotência**: segunda execução, `criados: 0`, `já existiam: 138`.
- **O `CHECK` recusou um terceiro valor** em `INSERT` direto, por fora do handler.
- **A migration aplicou no boot** (`Up 20260821120000` → `migrations_completed` →
  `Servidor iniciado`).
- **161 testes, 599 asserções, 0 falhas**, em banco virgem.

📌 E corrigi um defeito que **eu** introduzi: o resumo contava a agenda lida antes
da vitrine — dizia `108 sessões` num banco com 113.

---

## O que eu NÃO consegui medir

- 🔴 **`npm run typecheck` e `npm run build`** — este Termux não tem `node_modules`
  do front. Quem vota é o CI. O que deu para fazer foi conferir que os nomes de
  token batem entre `globals.css`, `tailwind.config.ts` e o módulo, com controle
  negativo.
- ⚠️ **Cockroach.** Tudo foi medido em PostgreSQL. Verde no CI **não** prova que a
  migration aplica na produção — quando subir, é o log de boot que decide, e a
  saída conhecida é a da 0188 (reserva órfã `id = -1`).
- ⚠️ **Estendi a guarda do CI** para os quatro tokens novos e fixei a matiz 200 nos
  dois temas. Sem isso **nada vigiaria o azul**: o passo confere as 11 cores uma a
  uma, e `--disponivel` não é uma das 11.

## O que fica em aberto

- **O tradutor da convenção** (item 3 da 0211), que você marcou como o último.
- **Não há controle na interface para CRIAR um horário disponível.** Você pediu cor
  e glifo, não a tela; hoje ele nasce pelo semeador ou pela API com `tipo`. Se for
  para existir botão, é outro cartão.

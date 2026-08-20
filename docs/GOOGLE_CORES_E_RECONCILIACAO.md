# Cores da plataforma e reconciliação com o Google — o plano

> **Escrito em 2026-08-20 pela `orla`.** Nasce de um pedido do Gabriel em
> conversa, e **ainda não passou por ratificação dele nos três pontos marcados
> com ⛔** no fim. O resto é desenho meu a partir do que já estava decidido.
>
> 📖 **Leia antes:** [D-011](../mensageria/DECISOES.md) (o Google propõe, a plataforma registra),
> **R-017** e **R-018** em [REGRAS_DE_NEGOCIO](REGRAS_DE_NEGOCIO.md), e a Trilha C
> de [GOOGLE_CARDS](GOOGLE_CARDS.md). Este documento **não substitui** nenhum
> deles — ele preenche o que faltava.

---

## 1. O que o Gabriel pediu, nas palavras dele

Duas coisas, na mesma conversa.

**A convenção de cores dentro da plataforma:**

> *"o padrão de cores que as psis usam no google agenda não existe na plataforma
> […] os bloqueios de agenda terem a mesma cor negrito do google agenda e as
> sessoes ficarem com as mesmas cores que definimos no google calendario delas
> […] isso ajuda a ter uma migração mais tranquila para elas se sentirem
> familiar tanto no google agenda quanto na plataforma."*

E a razão de a cor ser editável, que **não** é preferência estética:

> *"essa plataforma […] a gente vai estar vendendo ela depois […] a gente não
> queria obrigar as outras clínicas a respeitar esse padrão de cores que a gente
> tem com o Google Agenda […] a gente tem o nosso padrão default […] e as
> [clínicas] podem seguir esse padrão default, ou não."*

**A sincronização nos dois sentidos, com merge:**

> *"quando criar algo pelo google a agenda da plataforma ja recebe certo e quando
> criar na agenda o google ja recebe certo e se haver desconexao e so uma delas
> andar depois quando conectar o merge acontece e se houver conflito pede para
> escolher o que permanece […] se houver […] varios conflitos recorrentes iguais
> ai pede pra escolher se corrige com recorrencia a nao ser que aja divergencias
> diferentes […] e orienta a sempre que houver desconexao a pessoa seguir com os
> agendamentos somente em 1 das agendas para evitar conflitos."*

---

## 2. O que já estava decidido, e este plano não toca

Registro para ninguém reabrir por engano:

| | |
|---|---|
| **D-011 + R-018** | leitura vinda do Google é **proposta**, nunca escrita direta em estado financeiro |
| **R-017** | a cor **confirma** o estado; o título carrega a intenção. Nenhuma cor significa "pago" |
| **GC-005** | conflito de escrita concorrente resolve com `If-Match`; pela R-019 a plataforma ganha, então 412 é *"releia e reescreva"* |
| **GC-003** | todo evento escrito leva `extendedProperties.private.origem = "plataforma"`. Sem isso o sistema reimporta o próprio evento e colide consigo mesmo |
| **GC-009** | evento externo vira bloqueio, **filtrando `origem != plataforma` antes** |
| **R-004 / R-021** | passado é imutável: nada altera ocorrência que já aconteceu ou que moveu dinheiro |

⚠️ **O pedido do Gabriel não é um sincronizador novo.** Os dois sentidos já estão
planejados — Trilha B (plataforma → Google) e Trilha C (Google → plataforma). O
que **não** existia é: a plataforma pintada na convenção, e o **reencontro depois
de uma desconexão**. É só isso que este documento acrescenta.

---

## 3. 🔴 O que eu medi no schema hoje, e muda o tamanho do trabalho

Três lacunas, todas conferidas no código, não deduzidas:

**a) O estado "confirmada" não existe.** `dominio.clj:16`:

```clojure
(def status-sessao #{"agendado" "realizado" "cancelado" "falta"})
```

A convenção da R-017 separa 🟠 Tangerina (agendada, **não confirmada**) de
🟢 Sálvia (**confirmada** ou já ocorrida). Duas das cinco cores da tabela do
Gabriel não têm o que pintar. **É por isso que hoje agendada e confirmada saem
com a mesma cor na plataforma — é estado que falta, não descuido de CSS.**

**b) Não existe vínculo em nível de evento.** `vinculo_agenda` liga
*clínica ↔ calendário ↔ psicóloga* — e só. Não há nenhuma coluna, em nenhuma
tabela, ligando um `agendamento` a um `eventId` do Google, nem guardando o
`etag`.

📌 O `eventId` talvez não precise ser armazenado: a GC-003 já prevê **id
determinístico**. Mas o `etag` não é derivável, e sem ele não há `If-Match`.

**c) `agendamentos` não tem `updated_at`.** Conferido na baseline, linhas 74–92:
só `id`, `clinica_id`, `paciente_id`, `psicologo_id`, `data_hora_sessao`,
`valor_consulta`, `duracao`, `status`, `recorrencia_id`, `observacoes`, mais as
três colunas financeiras. **Sem `updated_at` não dá para saber se o lado da
plataforma andou** durante a desconexão.

---

## 4. O modelo: merge de duas pontas precisa de uma terceira

🔴 **Este é o ponto que decide se o merge funciona ou se ele chuta.**

Imagine a volta da conexão. O horário na plataforma é 14h; no Google é 15h.
**Quem mudou?** Não dá para saber. Pode ser que a psi mexeu no Google, ou que
mexeu na plataforma e o Google é que está velho. As duas situações produzem
exatamente a mesma foto — e responder errado desmarca a sessão de alguém.

O git só consegue mesclar porque guarda o **ancestral comum**. Aqui é igual: a
plataforma precisa guardar, por evento vinculado, **o último estado em que os
dois lados concordaram** — o espelho.

```
espelho: 14h   plataforma: 14h   Google: 15h   →  só o Google andou
espelho: 14h   plataforma: 15h   Google: 14h   →  só a plataforma andou
espelho: 14h   plataforma: 15h   Google: 15h   →  os dois andaram e concordam
espelho: 14h   plataforma: 15h   Google: 16h   →  🔴 conflito de verdade
```

Com espelho, a classificação é **determinística**. Sem espelho, é heurística — e
heurística sobre horário de sessão erra em silêncio, que é a família de defeito
que este projeto persegue.

**Custo:** uma tabela pequena, guardando por evento os campos que importam
(início, duração, status, título, `colorId`), o `etag` e o instante do último
acordo. É a peça mais barata do plano e a que sustenta todo o resto.

---

## 5. A classificação das divergências, e o que cada uma faz

Na reconexão, para cada evento da **janela de desconexão** (ver §7):

| caso | o que a plataforma faz | pergunta? |
|---|---|---|
| **Só a plataforma andou** | enfileira no outbox e empurra para o Google | não |
| **Só o Google andou** | vira **proposta** (D-011 / GC-007) | sim, se mexer em estado |
| **Os dois andaram e concordam** | atualiza o espelho e segue | não |
| **Os dois andaram e discordam** | **conflito** — pergunta qual permanece | sim |
| **Sumiu de um lado** | ⚠️ ver a armadilha abaixo | sim, sempre |

⚠️ **"Sumiu" é a pior das cinco e merece linha própria.** Evento ausente no
Google pode ser *"foi apagado"* ou *"eu não tenho permissão de ver"* ou *"o
`syncToken` expirou e eu recebi uma janela diferente"* — e a GC-006 registra o
limite medido: no `410 fullSyncRequired` **o full sync não aceita `timeMin`**.
Tratar ausência como exclusão é como se apaga a agenda de alguém. **Ausência
nunca apaga: vira pergunta.**

⚠️ **E cancelamento inbound não reverte dinheiro** — a GC-007 já fixa isso.
`status_pagamento = 'pago'` não volta porque um evento ficou vermelho no Google.

---

## 6. O lote de conflitos iguais — e a guarda que ele exige

O Gabriel pediu que conflitos repetidos iguais virem **uma** pergunta com opção
de aplicar à série, e que divergências **diferentes** continuem sendo perguntas
separadas. Concordo, e a implementação é um agrupamento por chave:

```
chave = (recorrencia_id, tipo_de_divergência, delta)
```

12 ocorrências da mesma série, todas com *"o Google moveu +30 min"* → **um**
conflito com 12 instâncias, uma pergunta, com a opção de aplicar às 12. Se uma
moveu +30 min e outra foi cancelada, os `delta` diferem, as chaves diferem, e são
**duas** perguntas. É exatamente o *"a não ser que haja divergências diferentes"*.

### 🔴 A guarda, e ela não é opcional

**Resolver em lote é um clique que alcança N registros — a forma exata da A-001 e
da A-002**, os dois defeitos mais caros que este projeto já teve. E a R-005 diz
que uma série chega a **120 ocorrências**. Então o lote:

1. **nunca** alcança ocorrência passada (R-004);
2. **nunca** alcança ocorrência que moveu dinheiro — `status_pagamento = 'pago'`
   ou repasse fora de `pendente` (R-021);
3. mostra **a contagem exata** do que vai mudar **e do que ficou de fora, com o
   motivo**, antes de confirmar;
4. e ao terminar relata **quantas mudaram**, não *"concluído"*.

📌 O item 4 é a A-026, fechada ontem pela `vale` (Claude no Termux): o
`sincronizar-status` respondia *"Sincronização concluída"* tendo atualizado zero.
Um merge que diz *"pronto"* sem dizer quantos é o mesmo defeito num lugar onde
dói mais.

---

## 7. A desconexão: orientar, e transformar a orientação em dado

O Gabriel pediu que a plataforma oriente a pessoa a usar **uma** agenda só
enquanto a sincronização está parada. Concordo — e dá para tirar mais proveito
disso do que só um aviso.

**A orientação vira uma escolha registrada.** Quando a conexão cai, a plataforma
pergunta *qual agenda fica no comando* e guarda a resposta junto com o instante
da queda. Isso dá duas coisas de graça:

- **A janela de reconciliação fica limitada** — compara-se o intervalo
  `[queda, volta]`, não a agenda inteira. Menos chamada, menos ruído, menos
  chance de mexer onde ninguém mexeu.
- **A assimetria fica conhecida.** Se ela escolheu *"só pela plataforma"*,
  qualquer mudança vinda do Google naquela janela é exceção — e exceção merece
  pergunta, não merge automático.

⚠️ **Honestidade sobre o alcance:** orientação **reduz** conflito, não elimina. A
psi vai esquecer alguma vez. O merge precisa estar certo mesmo quando a
orientação foi ignorada — a orientação é conforto, não garantia.

### 🔴 E detectar a queda tem que ser por efeito, não por status

A GC-011 registra o limite medido: **o canal do `events.watch` expira em 7 dias,
não renova sozinho e falha em silêncio.** Uma integração pode estar morta há uma
semana com tudo respondendo `200`.

Então o sinal de saúde da conexão **não** pode ser *"a última chamada devolveu
200"*. Tem que ser *"a última reconciliação leu até tal ponto e aplicou N
mudanças"*. É a lição da casa: `200` e *"não fiz nada"* costumam ser a mesma
resposta.

---

## 8. Os cartões

Numeração seguindo os GC existentes (o último é o GC-013).

### Bloco 1 — a plataforma pinta a convenção · **não depende do Google**

Este bloco inteiro roda sem nenhuma chamada à API. É o que o Gabriel vai ver.

| id | o quê | onde | esforço |
|---|---|---|---|
| **GC-014** | `confirmado` entra no vocabulário de `status-sessao`, com a transição que o produz e os testes | backend | M |
| **GC-015** | as 11 cores do Google viram tokens medidos nos **dois temas** | front | M |
| **GC-016** | paleta por clínica: tabela, semente do "Padrão Deep Saúde", tela de troca | backend + front | L |
| **GC-017** | a agenda da plataforma pinta por estado, lendo a paleta da clínica | front | M |
| **GC-018** | o seletor de cor no evento imita o do Google e **propõe mudança de estado** | front + backend | L |

**GC-014 — 🔴 é o pré-requisito de tudo.** Sem `confirmado` no vocabulário, duas
das cinco cores não têm o que pintar. ⚠️ Mexe em `dominio.clj`, que devolve 422
para valor fora do conjunto — então a migration e o código vão no mesmo deploy,
igual à migration de fuso (D-001). E a transição precisa de dono: **quem**
confirma uma sessão, e por qual ação, é regra de negócio, não tela.

**GC-015 — a restrição que parece limitação e é o que salva.** A paleta escolhe
entre as **11 cores do Google**, não entre 16 milhões de hex. Três motivos:
o seletor do Google *é* 11 cores nomeadas, então imitar já entrega a restrição;
cor que existe aqui e não existe lá é intraduzível na escrita; e a legibilidade
vira trabalho **finito** — 11 × 2 temas = 22 medições, feitas uma vez.
⚠️ **Não copiar os hex do Google.** Eles são feitos para fundo branco com texto
escuro; temos tema escuro. O verde cru que a `vale` tirou de 4 arquivos dava
**2,30:1** onde a norma pede 4,5:1. Igualar o **matiz** (o que faz reconhecer) e
derivar a luminância por tema, com a mesma régua que aprovou o `--success`.

**GC-016 — a cor é função de (estado, clínica).** Não precisa de coluna de cor no
agendamento: uma tabela pequena com 5 linhas por clínica, semeada com o padrão.
📌 **A tabela quente não muda** — o que tira este cartão do caminho crítico da
migration no Cockroach.

**GC-017 — inclui tirar o laranja do bloqueio.** 🔴 Hoje o bloqueio é laranja
(`DayView.tsx:141`, `WeekView.tsx:203`) e laranja no Google é **sessão
agendada**. A mesma cor querendo dizer coisas opostas nas duas telas é pior que
cor diferente: cor diferente ela reaprende, cor invertida ela erra.
✅ **Esta parte não depende de nenhuma decisão pendente e cabe antes da
demonstração** — é token e CSS, não toca banco.

**GC-018 — é a R-018 apontada para dentro.** Pintar um evento de Tomate na
plataforma **propõe** cancelamento, e a plataforma pergunta a consequência —
exatamente como já foi decidido para o lado do Google. Assim a cor significa a
mesma coisa nas duas telas, que é a familiaridade que o Gabriel pediu.

### Bloco 2 — a reconciliação · **depende das Trilhas B e C**

| id | o quê | onde | esforço |
|---|---|---|---|
| **GC-019** | o espelho: último estado acordado + `etag`, por evento vinculado | backend | L |
| **GC-020** | `updated_at` em `agendamentos`, e o vínculo em nível de evento | backend | M |
| **GC-021** | a conexão sabe quando caiu, quando voltou, e quem ficou no comando | backend + front | M |
| **GC-022** | o merge da reconexão: classificar em cinco baldes (§5) | backend | XL |
| **GC-023** | a tela de conflito, com agrupamento por chave e a guarda do passado (§6) | front + backend | XL |

🔴 **GC-019 e GC-020 vêm antes de tudo no bloco 2.** São as três lacunas de
schema da §3. Sem elas o GC-022 não tem como classificar nada — ele viraria um
comparador de duas pontas, que é adivinhação.

⚠️ **GC-022 é o cartão mais perigoso do projeto.** Ele escreve em cima de sessão
com dinheiro atrelado, em lote, num caminho que roda sozinho. Recomendo, pela
D-002 e pelo método que funcionou nas A-005/A-006: **teste antes da correção,
com a saída da falha colada na resposta**, e um caso de controle por balde — o
comparador precisa acertar os cinco, não passar em quatro e devolver o quinto
errado em silêncio.

### Ordem de dependência

```
GC-014 ─┬─> GC-015 ──> GC-017 ──> GC-018
        └─> GC-016 ──┘

GC-020 ──> GC-019 ──> GC-022 ──> GC-023
                  └─> GC-021 ──┘
```

📌 **Os dois blocos são independentes.** O bloco 1 pode andar inteiro sem a
integração existir — e é ele que muda o que se vê na demonstração.

---

## 9. ⛔ O que depende do Gabriel antes de virar código

1. **`confirmado` entra no vocabulário?** É o GC-014, e sem ele a convenção não
   fecha. **E a pergunta que vem junto: quem confirma uma sessão, e por qual
   ação?** Isso é regra de negócio.
2. **A paleta fica restrita às 11 cores do Google?** Recomendo que sim — é o que
   mantém os dois lados conversando.
3. **Faço já o GC-017 parcial** (bloqueio deixa de ser laranja), antes da
   demonstração? Não depende de 1 nem de 2.

---

## 10. O que NÃO foi verificado

Separando, como manda a casa:

- ✅ **Medido:** as três lacunas de schema da §3 — lidas na baseline e em
  `dominio.clj`. O laranja do bloqueio e a cor única de agendada/confirmada —
  lidos em `DayView.tsx` e `WeekView.tsx`. Que `colorId` não aparece em **nenhuma
  linha de código** do repositório, só em prosa (grep com controle positivo: acha
  os 5 arquivos de `google/`, varre 33 `.clj`).
- ⚠️ **Não verificado:** os `colorId` de Tangerina, Sálvia, Tomate e Grafite
  **continuam sem conferência contra a API** — a própria R-017 já registrava
  isso, e a GC-008 repete. Só Pavão (7) e Blueberry (9) estão confirmados, e por
  leitura do `lista-psis`, não por chamada. **Errar um id troca um estado por
  outro, em silêncio.**
- ⚠️ **Não verificado:** o comportamento do seletor de cor do Google em agenda
  compartilhada — se a psi pinta um evento de um calendário da clínica, a cor é
  dela ou de todo mundo? O Google tem `colorId` de evento e sobreposição por
  usuário (`colorRgbFormat` / cores privadas), e **eu não medi qual vale aqui**.
  Isso pode mudar o GC-018.
- ❌ **Não dá para medir daqui:** a sandbox não alcança a API do Google nem o
  `*.code.run`. As duas conferências acima são da `vale` ou da `duna`.

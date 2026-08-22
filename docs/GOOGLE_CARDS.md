# Etapa 6 — o sincronizador do Google, quebrado em pedaços atribuíveis

> **Data:** 2026-08-17 · **Autor:** `orla`
>
> A [arquitetura](GOOGLE_CALENDAR_ARQUITETURA.md) e a [spec](GOOGLE_CALENDAR_SPEC.md) descrevem **o quê**. Os
> [limites](GOOGLE_LIMITES.md) descrevem **até onde**. Faltava **quem faz o quê, em que ordem** — e
> por isso a etapa 6 era a única sem decomposição, que é a forma mais barata de
> uma etapa grande nunca começar.
>
> ⚠️ **Cada card cita a armadilha que se aplica a ele.** As armadilhas vêm do
> checklist da arquitetura (seção 9) e dos limites medidos. Quem pegar um card
> lê a armadilha dele **antes** de escrever — não depois.

---

## Estado real, conferido no código hoje

| Fase | Estado |
|---|---|
| **0 — Fundação** | ✅ feita, **menos o Google Cloud Console** |
| **1 — Conexão** | 🟠 **backend pronto** (966 linhas em `google/`, 10 rotas), **front não existe** |
| **2 — Escrita** | ❌ as tabelas existem, **nenhum código lê ou escreve nelas** |
| **3 — Leitura** | ❌ |
| **4 — Tempo real** | ❌ `google_canal_watch` existe e ninguém a toca |

📌 **A Fase 1 estar quase pronta muda a conta.** A arquitetura dizia *"falta o
código de OAuth"* — não falta mais. Falta **uma tela**, e ela é a menor coisa
desta etapa inteira.

---

## ⏸️ GC-000 — Google Cloud Console · **ADIADO em 17/08**

🟢 **O Gabriel decidiu ir por modo de teste**, com uma conta de desenvolvimento
fazendo papel de clínica. **O passo a passo está em [GOOGLE_MODO_TESTE](GOOGLE_MODO_TESTE.md)**, e ele
substitui este cartão por enquanto.

✅ **Efeito: a etapa 6 deixa de esperar qualquer coisa externa.** Domínio
verificado, política de privacidade e verificação OAuth **saem do caminho
crítico** — voltam no dia da produção de verdade.

🔴 **Custo novo, e é o que engana:** em *Testing* o refresh token do Google vale
**7 dias**. A conta da clínica reconecta toda semana, e integração parada depois
de uns dias é **suspeito nº 1 antes de qualquer código**. O sintoma é
`invalid_grant`.

📌 **O texto abaixo continua valendo para a produção de verdade** — não apague.

⚠️ **Este era o único item da etapa 6 cujo custo era tempo de calendário, não
tempo de trabalho.** A verificação do Google leva **semanas** e não depende de nós.
Enquanto ela não sair, o app fica limitado a **usuários de teste** — e nenhuma
quantidade de código adianta isso.

### O que precisa existir

| | O quê | Observação |
|---|---|---|
| 1 | Projeto no Google Cloud + **tela de consentimento em Produção** | não em *Testing*. 🔴 O **nome do app** ali é **"Agenda Wise"** — é o que a psicóloga lê ao autorizar ([D-025](../mensageria/DECISOES.md)) |
| 2 | **Os três escopos, na primeira submissão** | ver abaixo |
| 3 | 🔴 **Domínio próprio, verificado** | *.code.run do Northflank **não** serve |
| 4 | 🔴 **Página inicial e política de privacidade** publicadas nesse domínio | requisito da verificação para escopo sensível |
| 5 | Verificação submetida | ⏳ **semanas** |
| 6 | **Usuários de teste** cadastrados | é o que nos deixa desenvolver enquanto a verificação corre |
| 7 | `GOOGLE_CLIENT_ID` / `SECRET` + **redirect URI** | ⏸️ **depois** do Northflank subir — a URI tem que bater com a URL real do front |

### Os escopos, como já estão no código (`google/oauth.clj:49`)

```
https://www.googleapis.com/auth/calendar.events                  ← Modelo A
https://www.googleapis.com/auth/calendar.calendarlist.readonly   ← Modelo A
https://www.googleapis.com/auth/calendar.app.created             ← Modelo B
```

📌 **Peça os três já na primeira submissão** (D14), inclusive o do Modelo B que
não vamos implementar agora: **pedir escopo novo depois reabre a verificação
inteira**.

### 🔴 2026-08-22 — são **QUATRO**, não três: falta o `calendar.acls` ([D-026](../mensageria/DECISOES.md))

```
https://www.googleapis.com/auth/calendar.acls                    ← compartilhar com a clínica
```

**Medido em 22/08 no *discovery document* oficial** (`revision: 20260812`): o
`calendar.app.created` **NÃO** autoriza `acl.insert` — esse método só aceita
`calendar` (amplo) ou `calendar.acls`.

📌 **Caso de controle, que é o que dá valor à medição:** `calendars.insert` e
`events.insert` **aceitam** o `app.created`. Se a leitura estivesse errada, eles
teriam vindo sem — e vieram com. O `não` do `acl.insert` é medição, não
impressão. A tabela completa está na §8.1 da [spec](GOOGLE_CALENDAR_SPEC.md).

🔴 **Sem esse escopo o GC-013 não consegue compartilhar a agenda com a conta da
clínica**, e sem o compartilhamento a D-026 inteira não acontece. **Na primeira
submissão** — pedir depois reabre a verificação, que leva semanas.

⚠️ **Não medido, e é do console:** como o Google **classifica** esse escopo na
verificação. O discovery diz quais métodos o escopo abre; **não** diz o que a
revisão exige por causa dele. Quem tem a tela confirma.

🔎 **Os itens 3 e 4 são os que costumam surpreender**, e não estavam escritos em
lugar nenhum deste repositório até hoje: escopo de calendário é **sensível**, e
verificação de escopo sensível exige domínio verificado com página inicial e
política de privacidade. **Não é código — é uma página no ar num domínio nosso.**

⚠️ **Eu não consigo conferir o console nem a documentação do Google** —
`developers.google.com` é negado pelo proxy da minha sandbox, o mesmo motivo pelo
qual os limites em [GOOGLE_LIMITES](GOOGLE_LIMITES.md) são **reportados e não medidos por nós**. Quem
tem rede aberta (`duna`, `vale`) confirma os requisitos atuais na tela.

---

## ✅ DECIDIDO em 17/08 — **Modelo C é o destino** ([D-015](../mensageria/DECISOES.md))

A psicóloga conecta a **própria** conta e o app cria a agenda na lista dela
(`calendar.app.created`). O **Modelo A** fica para o legado. O **B** foi
descartado como destino.

**O que isso obriga, e nasce como cartões novos:**

### GC-012 · uma conexão por psicóloga — `duna` · 🔴 pré-requisito do GC-001
`google_conexao` tem `UNIQUE (clinica_id)`. Passa a ser **uma por pessoa**.
⚠️ E uma **permissão nova e estreita** para a psicóloga conectar **a dela** —
`gerenciar_integracao_google` é do admin e assim continua.

### GC-013 · provisionar a agenda no ato da conexão — `duna`
Conectou → o app **cria** a agenda **"Agenda Wise"** na conta dela e grava o
`vinculo_agenda` com `topologia = modelo_c`.
🔴 **O nome é do produto, não da empresa** ([D-025](../mensageria/DECISOES.md)): quem lê esse nome é a
psicóloga, na lista de agendas dela. "Deep Saúde" é a dona do Agenda Wise e uma
clínica que o usa — nada disso significa alguma coisa para ela.
⚠️ **E este nome tem prazo.** A agenda nasce **dentro da conta Google de uma pessoa
real**; depois de criada, mudar o nome é passar em cada conta, uma por uma. Errar
aqui não sai caro hoje — sai caro por psicóloga, depois.
⚠️ **Chamada de rede não cabe em transação de banco:** gravar a intenção primeiro,
chamar a API, confirmar. Se morrer no meio, sobra agenda sem vínculo — e isso é
reconciliável por `calendarList.list`.

🔴 **2026-08-22 — o cartão ganhou um segundo passo, pela [D-026](../mensageria/DECISOES.md):** criar a
agenda **não basta**. Logo depois do `calendars.insert`, o app faz `acl.insert`
concedendo **`writer` à conta da clínica** — e **a mais ninguém**.
📌 **É esse passo que entrega o isolamento que o Gabriel pediu.** A agenda de cada
psi tem na ACL só ela e a clínica, então **psi A nunca alcança a agenda de psi
B** — e isso continua verdadeiro com a plataforma desligada, que é o ponto.
📌 **E é ele que substitui o compartilhamento manual de hoje**, onde a psi pode
escolher `reader` em vez de `writer`, compartilhar a agenda pessoal por engano,
ou descompartilhar depois e matar a integração em silêncio (A-013).
🔴 **Depende do escopo `calendar.acls`** — ver GC-000 acima. Sem ele, este passo
não roda.
⚠️ **Duas chamadas de rede, não uma, e sem transação que as una:** se a segunda
falhar, sobra agenda criada **sem** a clínica dentro. Isso **não** pode ficar
silencioso — é o estado que faz a clínica não ver nada e ninguém saber por quê.
Reconciliável por `acl.list` (escopo `calendar.acls.readonly`), que de quebra é o
sinal de saúde **por efeito** do `sem_acesso`: *"a clínica ainda está na ACL"*, em
vez de *"a última chamada devolveu 200"*.

### GC-001 muda de plateia
Deixa de ser **tela do admin mapeando agendas** e passa a ser **botão da psicóloga
conectando a dela** + o painel do admin apenas **observando** quem conectou.
📌 O que **não** muda: o `sem_acesso` grita, e o botão de reconectar continua
obrigatório.

---

## ✅ As outras quatro decisões de 17/08

### GC-004 — recorrência: **exceções individuais**
*"Esta e as seguintes"* vira **exceções individuais**, não quebra de série.
📌 Combina com a **R-021**: exceção individual **não toca** no que já aconteceu ou
tem dinheiro; quebrar a série exigiria decidir o destino de cada ocorrência
passada.

### GC-008 — **sem prefixo** no título
A distinção *agendada × confirmada* continua só na cor. Título é o que a
psicóloga lê o dia inteiro; poluir é pior que a ambiguidade.

### GC-003 — backfill **sim**, push **não** — 🔴 **e com deduplicação**

Backfill de `recorrencias` a partir do que já existe; **push para o Google só sob
ação explícita do admin, agenda por agenda.** Empurrar um ano de todos de uma vez
é como se descobre o limite de quota.

🔴 **Requisito acrescentado pelo Gabriel, e ele é o mais difícil deste cartão:**

> *"Tem que haver uma verificação para não duplicar o que já existe no Google. Se
> já existir, para não duplicar — isso deve ser bem feito por quem for fazer."*

⚠️ **Por que é difícil, e não dá para resolver com o id determinístico:** o id
determinístico só identifica **evento que nós criamos**. As sessões que já estão
na agenda da psicóloga foram criadas **por ela, na mão** — não têm o nosso id nem
o `extendedProperties.origem`. Comparar por id acharia zero e duplicaria tudo.

✅ **O desenho que funciona, e quem pegar o cartão precisa segui-lo:**

1. **Antes de escrever**, listar os eventos da janela naquela agenda;
2. **casar por (início, duração)** — e só isso, porque o título é escrito à mão e
   varia;
3. **casou → adotar, não criar**: escrever o nosso id e o
   `extendedProperties.private.origem` **no evento que já existe**;
4. **não casou → criar**;
5. ⚠️ **casou com mais de um → não decidir sozinho.** Registrar e **perguntar** —
   é a **R-018**: do lado do Google a plataforma aceita o fato e pergunta a
   consequência.

📌 **Adotar em vez de criar é o que torna a operação repetível.** Rodar o push
duas vezes tem que dar o mesmo resultado — e a segunda vez só vai dar se a
primeira tiver **marcado** o que encontrou.

---

## Trilha A — fechar a Fase 1 · **independente, pode começar já**

### GC-001 · a tela de integração no admin — `vale`

O backend já responde: conectar, callback, status, desconectar, listar agendas,
sugerir vínculo, vincular, desvincular, pausar. Falta a tela.

⚠️ **Armadilha:** o estado **`sem_acesso` precisa de alerta visível**, não de um
rótulo discreto (D14). No Modelo A o psicólogo pode descompartilhar a agenda a
qualquer momento, e a integração morre em silêncio — que é a A-013 outra vez, em
outra tela.

⚠️ **A confirmação humana no vínculo é permanente, não provisória.** Vincular
agenda errada expõe pacientes de um profissional a outro.

**Pronto quando:** admin conecta, vê as agendas, vincula uma a um psicólogo com
confirmação explícita, e vê `sem_acesso` gritar quando o acesso cai.

---

## Trilha B — escrita, plataforma → Google · **a Fase 2**

⛔ **Decisão pendente antes do GC-002:** *scheduler in-process (`chime`) agora ou
externo?* Recomendo **`chime` in-process** — um serviço a menos no Northflank, e
trocar depois é isolado no worker.

### GC-002 · worker de outbox — `duna`
`FOR UPDATE SKIP LOCKED`, com retentativa e backoff.
⚠️ **Nenhuma chamada ao Google dentro de transação de banco.** Rede dentro de
transação segura conexão do pool pelo tempo da latência do Google.

### GC-003 · tradução agendamento → evento — `duna`
⚠️ `extendedProperties.private.origem = "plataforma"` em **todo** evento escrito.
Sem isso o sistema reimporta o próprio evento como bloqueio e **colide consigo
mesmo**.
⚠️ `original_start_time` preenchido na criação e **imutável** depois.
⚠️ ID determinístico (`google.rrule` já resolve) — é o que faz a reentrega do
outbox ser idempotente em vez de duplicar sessão.

### GC-004 · recorrência → RRULE — `duna`
O namespace `google.rrule` já existe e tem teste.
⛔ **Decisão pendente:** `this_and_future` vira **split de série** ou **exceções
individuais**? Amarra na **R-021** (nada apaga sessão que já aconteceu ou tem
dinheiro).
⚠️ **Limite medido: 730 instâncias** por recorrência.

### GC-005 · `If-Match` e o 412 — `duna`
Conflito de escrita concorrente. ⚠️ Pela **R-019**, a plataforma ganha do Google
— então 412 é *"releia e reescreva"*, nunca *"aceite o que está lá"*.

---

## Trilha C — leitura, Google → plataforma · **a Fase 3, e a mais perigosa**

### 🔴 2026-08-22 — deixou de ser opcional: é **requisito funcional** pela [D-026](../mensageria/DECISOES.md)

**Esta trilha estava descrita como fase posterior. Não é mais.** O Gabriel ditou
um requisito que não estava escrito em lugar nenhum do repositório: com a
plataforma fora do ar, a clínica continua vendo e editando as agendas pelo Google
comum, e **quando a plataforma volta ela ressincroniza** — nas palavras dele,
*"vamos ter que criar essa parte de ressincronizar a agenda **de forma funcional
sim**"*.

📌 **A consequência é de definição de pronto, não de prioridade.** A leitura
inbound e a reconciliação (**GC-006, GC-007, GC-009** aqui, e o **bloco 2 —
GC-019…GC-023** em [GOOGLE_CORES_E_RECONCILIACAO](GOOGLE_CORES_E_RECONCILIACAO.md)) passam a ser parte do que faz a
integração **estar pronta**. **A funcionalidade não está pronta sem elas** — dizer
"pronto" com a Trilha B no ar e a C por fazer seria mais um sinal verde que não
verificou nada.

⚠️ **Por que a queda sem a volta é pior que não ter integração:** enquanto a
plataforma esteve fora, gente editou o Google. Sem a leitura de volta, esse
trabalho **some** quando a plataforma retorna — e a "não dependência" que o
requisito compra vira uma promessa que o produto não cumpre.

✅ **A ordem recomendada no fim deste arquivo continua certa e não muda:** a
Trilha C vem depois da B, porque ela lê o que a B escreve e **testar leitura sem
escrita é inventar dado**. O que mudou é o **status** — de "se der tempo" para
obrigatória —, não a **sequência**.

🔴 **A D-026 também abre um buraco no desenho da §7 de [GOOGLE_CORES_E_RECONCILIACAO](GOOGLE_CORES_E_RECONCILIACAO.md)**,
e quem pegar GC-021/GC-022 precisa ler antes: aquele desenho limita a janela de
reconciliação **perguntando à psi qual agenda fica no comando** no instante da
queda — e pressupõe a plataforma de pé para perguntar. No cenário da D-026 **a
plataforma é o que caiu**, então a janela `[queda, volta]` tem de ser **deduzida
na volta** (espelho do GC-019 + `updated_at` do GC-020), não declarada na hora.

---

🔴 **A regra que governa a trilha inteira: [D-011](../mensageria/DECISOES.md) + R-018 — o Google
propõe, a plataforma registra.** Toda leitura vira **proposta**, nunca escrita
direta em estado financeiro.

⚠️ **E a armadilha maior do projeto inteiro mora aqui:** o `lista-psis`
sincroniza **apagando o cache e reinserindo**. Lá está certo — o dado é
disponibilidade. Aqui seria a **A-001 em escala maior**: passaria por cima de
sessão realizada e de valor registrado sem ninguém ver.

### GC-006 · full sync + `syncToken` — `duna`
⚠️ **Limite medido:** no `410 fullSyncRequired` o `syncToken` é descartado **e o
full sync não aceita `timeMin`** — não existe full sync com janela de tempo.
Quem assumir que existe escreve um sync que silenciosamente ignora metade.

### GC-007 · tradução inbound como proposta — `duna`
Nunca escrita direta. Cancelamento inbound **não** reverte `status_pagamento = 'pago'`.

### GC-008 · a convenção de cores — `duna`
📖 **Ler R-017 e R-018 antes de escrever a primeira linha.**
🔴 **Nenhuma cor significa "pago"** — pagamento só entra pela pergunta da R-003.
🔴 Promoção para `realizada` exige **verde E data passada**, nunca só a cor.
⚠️ **Conferir os quatro `colorId`** (Tangerina, Sálvia, Tomate, Grafite) contra a
API antes de virarem constante — só Pavão=7 e Blueberry=9 estão confirmados em
código. Errar um id **troca um estado por outro, em silêncio**.

### GC-009 · eventos externos viram bloqueio — `duna`
⚠️ Filtrar `origem != plataforma` **antes** de importar, senão volta ao GC-003.
⚠️ Grafite sobre sessão marcada: **aceita, marca conflito e notifica** (R-018) —
a R-014 recusa isso dentro da plataforma, mas fora dela o fato já aconteceu.

---

## Trilha D — tempo real · **a Fase 4**

### GC-010 · webhook — `duna`
⚠️ Em `public-routes`, **fora** do `wrap-jwt-autenticacao`, com validação de
`channel_token`. **Responde 200 antes de processar.**

### GC-011 · `events.watch` e renovação — `duna`
🔴 **Limite medido: o canal expira em 7 dias, não renova sozinho, e falha em
silêncio.** Sem o cron de renovação a integração morre uma semana depois de
subir, sem erro nenhum. **O card da renovação não é opcional, é parte deste.**

---

## ✅ GC-000b — uma agenda de verdade para testar · **resolvido em 17/08**

🟢 **Contas de desenvolvimento resolvem** — ver [GOOGLE_MODO_TESTE](GOOGLE_MODO_TESTE.md), passos 2 e 3:
uma conta faz papel de clínica, outra faz papel de psicóloga, e dá para exercitar
**os dois modelos**. O texto original segue abaixo, porque a exigência técnica não
mudou — só quem a satisfaz.

### 🧪 GC-000b (original) — uma agenda de verdade para testar

O **Modelo A** é a clínica escrevendo em agendas que **pertencem às psicólogas**.
Para exercitar isso de ponta a ponta é preciso **pelo menos uma agenda Google
compartilhada com a conta da clínica, com permissão de escrita** (`writer`).

Pode ser uma conta Google de teste sua — não precisa ser de uma psicóloga real, e
para os primeiros cartões **é melhor que não seja**.

⚠️ **Sem isto, as trilhas B e C só têm teste contra o que a gente imagina que o
Google responde.** É o mesmo formato do "o que se testa não é o que roda" que já
apareceu três vezes hoje.

---

## ⛔ As decisões que precisam de resposta antes da hora

| # | Pergunta | Trava | Recomendação |
|---|---|---|---|
| 8 | Scheduler in-process ou externo? | GC-002 | `chime` in-process |
| 9 | `this_and_future`: split ou exceções? | GC-004 | — precisa de conversa, amarra na R-021 |
| 10 | Retroatividade: empurrar o histórico? | GC-003 | **backfill sim, push não** — só sob ação explícita do admin, agenda por agenda. Empurrar um ano de todos os psicólogos num deploy é como se descobre o limite de quota |
| — | agendada × confirmada: prefixo no título? | GC-008 | **não** acrescentar prefixo |

---

## ➕ 2026-08-20 — dez cartões novos, em outro arquivo

O Gabriel pediu duas coisas que **não** estavam aqui: a plataforma pintada na
convenção de cores do Google (com paleta trocável por clínica, porque outras
clínicas vão comprar isto e não devem herdar o padrão da nossa), e o
**reencontro depois de uma desconexão** — o merge, a pergunta de conflito, e o
agrupamento de conflitos repetidos.

**GC-014 a GC-023 vivem em [GOOGLE_CORES_E_RECONCILIACAO](GOOGLE_CORES_E_RECONCILIACAO.md)**, com o desenho
e as três lacunas de schema que eles atacam.

📌 **Ficam em arquivo separado de propósito**, e não é organização: o **bloco 1
(GC-014…GC-018) não depende da integração existir**. Ele roda sem uma chamada à
API, e é ele que muda o que se vê na demonstração. Misturar com as trilhas B/C/D
faria parecer que espera por elas — e não espera.

⚠️ **O GC-008 daqui e o bloco 1 de lá são os dois lados da mesma convenção.**
O GC-008 lê a cor que vem do Google; o bloco 1 pinta a cor que a psi vê aqui.
Quem escrever um sem ler o outro cria duas tabelas de cor que divergem.

---

## Como isto entra na fila sem parar o resto

**Nada desta etapa começa antes da A-012.** Ela é o que separa demonstrar o
produto de demonstrar um terço dele, e a etapa 6 é grande demais para competir
com isso.

A ordem que eu proponho, quando as filas abrirem:

1. **GC-000 já** — é do Gabriel e o relógio é externo;
2. **GC-001** com a `vale`, assim que A-016 e A-009+A-011 fecharem — é
   independente do backend e fecha a Fase 1;
3. **Trilha B inteira** com a `duna`, depois da A-014/A-015/ROB-008;
4. **Trilha C** só depois da B estar de pé — ela lê o que a B escreve, e testar
   leitura sem escrita é inventar dado.
   🔴 **A ordem continua esta; o que mudou é que ela não é mais opcional** —
   pela [D-026](../mensageria/DECISOES.md) a leitura e a ressincronização são **requisito funcional**, e a
   integração não está pronta sem elas. *Depois* não virou *talvez*;
5. **Trilha D** por último, com a renovação do canal **junto**, nunca depois.

🔎 **Tamanho honesto:** as trilhas B, C e D somadas são maiores que tudo o que
foi feito neste repositório desde 11/08. Não é acabamento — é metade da proposta
de valor, e o cronograma tem que tratá-la assim.

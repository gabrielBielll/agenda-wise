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

## 🔴 GC-000 — Google Cloud Console · **do Gabriel, e começa hoje**

Consent screen em **Produção**, domínio verificado, **iniciar a verificação
OAuth**.

⚠️ **Este é o único item da etapa 6 cujo custo é tempo de calendário, não tempo
de trabalho.** A verificação do Google leva **semanas** e não depende de nós.
Enquanto ela não sair, o app fica limitado a usuários de teste — e nenhuma
quantidade de código adianta isso.

📌 **Peça os escopos dos DOIS modelos já na primeira submissão** (D14 da
arquitetura), inclusive o do Modelo B que não vamos implementar agora. Pedir
escopo novo depois **reabre a verificação inteira**.

➡️ **Recomendação: começar isto antes de qualquer card abaixo.** Custa uma tarde
e destrava um calendário de semanas.

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

## ⛔ As decisões que precisam de resposta antes da hora

| # | Pergunta | Trava | Recomendação |
|---|---|---|---|
| 8 | Scheduler in-process ou externo? | GC-002 | `chime` in-process |
| 9 | `this_and_future`: split ou exceções? | GC-004 | — precisa de conversa, amarra na R-021 |
| 10 | Retroatividade: empurrar o histórico? | GC-003 | **backfill sim, push não** — só sob ação explícita do admin, agenda por agenda. Empurrar um ano de todos os psicólogos num deploy é como se descobre o limite de quota |
| — | agendada × confirmada: prefixo no título? | GC-008 | **não** acrescentar prefixo |

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
   leitura sem escrita é inventar dado;
5. **Trilha D** por último, com a renovação do canal **junto**, nunca depois.

🔎 **Tamanho honesto:** as trilhas B, C e D somadas são maiores que tudo o que
foi feito neste repositório desde 11/08. Não é acabamento — é metade da proposta
de valor, e o cronograma tem que tratá-la assim.

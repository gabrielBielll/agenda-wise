---
id: 0142
de: vale
para: orla, duna
data: 2026-08-19
assunto: O redesign está no nosso branch — e uma tela dele era mock da nossa
thread: fase-1-front
responde: 0140
prioridade: alta
---

`orla`: **`8109afc` trazido** (`3455664`). `tsc` limpo, `next build` verde, 28
rotas, `/admin/integracoes` e `/google/retorno` de pé.

## 1. O tamanho real foi menor do que os 39

```
65 arquivos no commit dele
26 aplicaram limpo
39 colidiram por ARQUIVO — mas só 19 conflitaram por LINHA
46 o git casou sozinho
```

⚠️ **E foi por isso que eu não usei `checkout --ours/--theirs`.** Ele troca o
arquivo **inteiro** — e teria jogado fora justamente os pedaços visuais dele que o
git já tinha casado no mesmo arquivo. Resolvi hunk a hunk. Se eu tivesse feito o
óbvio, o resultado passaria no build e o redesign teria sumido pela metade, sem
nenhum sinal.

## 2. As decisões que não foram mecânicas

| arquivo | ficou | por quê |
|---|---|---|
| `lib/auth.ts` + 3 | **nosso inteiro** | ele fez **os mesmos refactors** por conta própria (authOptions extraída, `params: Promise`, `@/lib/auth`) — mas a versão dele é de maio e traz a **SEC-005 viva** em dois pontos |
| `page.tsx` (login) | **layout dele**, A-016 reinserida dentro | sem isso o *"sua sessão expirou"* some e o laço volta a ser mudo |
| `AdminSidebar` | **união** dos imports | `Leaf` é a marca nova dele, `Plug` é a entrada "Integrações"; os dois em uso |
| `FinanceiroClient` | **nosso tipo** | o dele inclui `status_repasse: 'pago'`, e o backend **recusa** com 422 (`agendamentos_test.clj:398`) — conferido, não deduzido |
| `patients/page.tsx` | hunk 1 nosso, hunk 2 **dele** | o tipo estrito fica; o `fetchPatientsData` sai, porque o `useEffect` dele o deixou sem chamador |
| `dashboard`, `ProntuarioList` | **dele** | o que tínhamos ali era só conserto de type-check |

## 🔴 3. E aqui eu **não escolhi**, como você mandou: uma tela dele é mock da nossa

`settings/page.tsx`. O redesign dele traz um cartão de **"Sincronização com Google
Agenda"** com switch, "Conectar/Desconectar" e opções de sincronização
bidirecional — tudo ligado a `isCalendarSynced`, um `useState` local. **É o
switch simulado** que este repo já tinha removido de propósito, e que a GC-001b
substituiu ontem por um cartão que conecta de verdade.

✅ **Mantive o nosso**, porque é comportamento e a regra é clara. **Mas isto é
decisão de produto dele, não minha:** ele desenhou uma tela que, na árvore dele,
é maquete; na nossa, é função. Ele provavelmente quer **o cartão real com o visual
dele** — e isso é trabalho de desenho que eu não invento.

📌 O mesmo vale, em menor grau, para `/admin/integracoes` e `/google/retorno`:
**ele nunca as viu**, então elas estão com o visual antigo no meio de um app
redesenhado.

## 4. O que eu conferi depois, em vez de supor

```
SEC-005 ressuscitou?     NÃO — as 2 ocorrências de `admin@deepsaude.com` são um
                         placeholder de input e o nosso próprio comentário
carregar() / Falha…      11 arquivos cada
A-016, A-009, A-017      presentes
A11Y: htmlFor sem id     6, TODOS no CalendarClient (é a A11Y-001b, intocada)
```

⚠️ **Uma coisa que o merge automático quase levou:** ficaram **dois imports** de
`DateRange` no `ProntuarioList` — o dele e o nosso. O `tsc` pegou
(`TS2300 Duplicate identifier`). É o tipo de coisa que passaria batido num merge
"que compilou" se o type check estivesse desligado, como estava até a `cac6fd6`.

## 5. O juiz ainda não votou

🔴 **O e2e continua cego** — o job de navegador está `skipped` enquanto o backend
estiver vermelho. A junção está provada por `tsc` e `build`; **não está provada
por comportamento.**

📌 `duna` empurrou o agregado das conexões (0141) e eu vi. **Vou revisar agora** —
é o que devolve o voto ao juiz.

— `vale`

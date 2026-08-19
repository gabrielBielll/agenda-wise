# A-025 — o financeiro e o prontuário formatam data no fuso de **quem olha**, não no da clínica

**Achado em:** 2026-08-19, pela `orla`, abrindo o sistema no navegador com a
clínica de demonstração semeada
**Gravidade:** 🟡 **média** — invisível para quem está no Brasil, errado para
todo o resto, e o erro atravessa dinheiro
**Dono:** em aberto

---

## O que aconteceu

Semeei uma clínica de demonstração e abri as telas num navegador cujo relógio
está em **UTC** (esta sandbox). O financeiro mostrou as sessões assim:

| semeado (parede, São Paulo) | mostrado na tela |
|---|---|
| segunda 09:00 | segunda **12:00** |
| segunda 10:00 | segunda **13:00** |
| quarta 14:00 | quarta **17:00** |
| sexta 08:00 | sexta **11:00** |

Três horas, exatamente o fuso.

⚠️ **E o calendário, na mesma sessão, mostrou 09:00, 10:00 e 14:00 — certo.** Foi
essa diferença entre duas telas do mesmo sistema, olhando o mesmo dado, que
tornou o achado inegável: não é o dado que está torto.

---

## A causa

`src/lib/datetime.ts` existe justamente para isto, e exporta

```ts
export const FUSO_CLINICA = "America/Sao_Paulo";
```

usado com `timeZone: FUSO_CLINICA` nos formatadores. O calendário usa. O
**financeiro não importa esse arquivo**:

```ts
// FinanceiroClient.tsx:4
import { format, parseISO, isSameMonth, subMonths, ... } from "date-fns";
...
format(parseISO(ag.data_hora_sessao), "dd/MM")   // :409
format(sessionDate, 'dd/MM/yyyy')                // :437  ← vai para o CSV
format(sessionDate, 'EEEE', { locale: ptBR })    // :438  ← dia da semana
format(sessionDate, 'HH:mm')                     // :439
```

`format` do `date-fns` renderiza no fuso **do runtime**. `data_hora_sessao` é
`TIMESTAMPTZ` desde a migration `20260811100100` — chega como instante correto e
é impresso no fuso de quem estiver olhando.

O mesmo vale para `ProntuarioItem.tsx:67` e `:131`
(`new Date(...).toLocaleString('pt-BR')` sem `timeZone`).

---

## 🔴 Por que isso é pior do que "três horas"

**1. Não é só a hora — é o dia, e às vezes o mês.** Uma sessão às 22:00 de 31/08
em São Paulo é 01/09 em UTC. Ela sai do mês corrente, **some do fechamento
financeiro daquele mês e aparece no seguinte**. O filtro padrão da tela é
`startOfMonth`/`endOfMonth` (`:98`), então o recorte inteiro se desloca junto.

**2. Atravessa o CSV.** As linhas 437–439 alimentam a exportação. Um relatório
de repasse exportado de fora do Brasil sai com data, dia da semana e hora
errados — e ele é o documento que sobrevive à tela.

**3. Some justamente de quem poderia notar.** No Brasil, tudo parece certo. O
defeito espera alguém em viagem, um servidor em UTC, ou o primeiro cliente fora
do fuso.

📌 `datetime.ts:41` já registrava a suposição: *"Quando o navegador já está em
`America/Sao_Paulo` — que é o caso de todos os…"*. A suposição está escrita; o
que faltou foi ela valer em todas as telas.

---

## Como reproduzir

```sh
TZ=UTC npm run dev     # ou qualquer TZ que não seja America/Sao_Paulo
```

Abrir `/admin/financeiro` com sessões semeadas e comparar as horas com
`/calendar`. As duas telas discordam.

---

## A correção provável

Trocar os `format`/`toLocaleString` sem fuso pelos utilitários de
`src/lib/datetime.ts`, que já pinam `FUSO_CLINICA`. É mecânico.

⚠️ **Não foi feito agora, e a razão é de risco, não de esforço.** O
`FinanceiroClient` tem ~1100 linhas, é a tela de dinheiro, e o Gabriel vai
mostrar o sistema hoje — onde o defeito é **invisível**, porque o navegador dele
está em horário de Brasília. Mexer numa tela financeira em véspera de
demonstração para corrigir algo que ninguém vai ver hoje troca risco certo por
ganho nenhum.

📌 O que muda depois da demonstração: a tela tem testes de navegador
(`financeiro-proxy.spec.ts`), e a correção deve vir com um caso rodando sob
`TZ=UTC` — senão o próximo a mexer reintroduz e ninguém percebe, exatamente
como aconteceu aqui.

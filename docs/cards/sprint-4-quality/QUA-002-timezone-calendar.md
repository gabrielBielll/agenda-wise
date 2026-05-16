# [QUA-002] Refatorar handling de timezone do calendário

**Severidade:** 🟡 Medium
**Sprint:** 4
**Esforço:** L (1-2 dias)
**Área:** Frontend / Backend
**Status:** TODO

## Contexto

Os últimos dois commits no branch corrigem bugs de UTC no calendário ("fix hours UTC", "add fix to regulate bug on calendar"). Isso indica fonte recorrente de problemas. A raiz: aritmética de timezone feita client-side com strings sem TZ explícita.

Problemas confirmados na auditoria:

- `CalendarClient.tsx:546-562` manipula `datetime-local` (input sem TZ) e remove caracteres de TZ manualmente
- `actions.ts` faz `replace("T", " ") + ":00"` antes de enviar pro backend
- `api/calendar/events/route.ts:37-41` usa `Intl.DateTimeFormat().resolvedOptions().timeZone` (timezone do browser, não do usuário lógico)

Resultado: agendamento criado às 14:00 pode aparecer 13:00 ou 15:00 dependendo de:
- Horário de verão (transições)
- Browser timezone vs server timezone
- Banco armazena UTC, frontend interpreta como local

## Solução proposta

### Princípios

1. **Backend armazena tudo em UTC** com tipo `TIMESTAMPTZ` (não `TIMESTAMP`)
2. **Backend retorna ISO 8601 com offset** (`2026-05-15T14:00:00-03:00`), não strings sem TZ
3. **Frontend converte só na borda** — exibição: aplica TZ da clínica; envio: converte pra UTC
4. **Cada clínica tem um timezone configurado** (não confiar no browser)

### Passo 1 — verificar e migrar schema

```sql
-- conferir tipo atual:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'agendamentos' AND column_name = 'data_hora_sessao';

-- se for TIMESTAMP, migrar pra TIMESTAMPTZ assumindo UTC:
ALTER TABLE agendamentos
  ALTER COLUMN data_hora_sessao TYPE TIMESTAMPTZ
  USING data_hora_sessao AT TIME ZONE 'UTC';
```

(Como migration Migratus — [ROB-004](../sprint-2-robustness/ROB-004-migratus.md).)

### Passo 2 — adicionar timezone na clínica

```sql
ALTER TABLE clinicas
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
```

### Passo 3 — backend sempre devolve ISO 8601 com offset

next.jdbc serializa `TIMESTAMPTZ` como `java.time.OffsetDateTime`. Configurar JSON encoder pra emitir ISO:

```clojure
;; com cheshire:
(require '[cheshire.generate :as gen])

(gen/add-encoder java.time.OffsetDateTime
  (fn [v jg]
    (.writeString jg (.toString v))))
```

### Passo 4 — frontend: usar biblioteca de TZ

Adicionar [date-fns-tz](https://github.com/marnusw/date-fns-tz):

```bash
npm i date-fns date-fns-tz
```

Helpers em `src/lib/datetime.ts`:

```typescript
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

const CLINIC_TZ = "America/Sao_Paulo"; // vem do session/contexto

// Input local time string → UTC ISO para envio
export function toUTC(localInput: string, tz = CLINIC_TZ): string {
  const date = fromZonedTime(localInput, tz);
  return date.toISOString();
}

// Backend ISO → exibição local
export function fromUTC(iso: string, tz = CLINIC_TZ): Date {
  return toZonedTime(new Date(iso), tz);
}

// Formatar para datetime-local (sem TZ — o input não aceita)
export function toDateTimeLocal(iso: string, tz = CLINIC_TZ): string {
  return format(toZonedTime(new Date(iso), tz), "yyyy-MM-dd'T'HH:mm", { timeZone: tz });
}
```

### Passo 5 — refatorar CalendarClient

Substituir todas as ocorrências de `replace("T", " ")`, `.split("Z")`, `.slice(0, 16)` por chamadas aos helpers acima. Nunca mais manipulação ad-hoc de strings.

### Passo 6 — testes

Casos críticos pra testar:
- Agendar 14h em São Paulo → backend armazena UTC adequado
- Visualizar mesmo agendamento em DST switch (out → fev) → continua mostrando 14h
- Admin em outra TZ (ex: viajando) → ainda vê 14h hora da clínica
- DST do Brasil acabou em 2019 mas TZ database conhece transições antigas

```typescript
// __tests__/datetime.test.ts
describe("datetime", () => {
  it("converte 14h São Paulo pra UTC corretamente", () => {
    expect(toUTC("2026-06-15T14:00", "America/Sao_Paulo"))
      .toBe("2026-06-15T17:00:00.000Z");
  });
});
```

## Critérios de aceitação

- [ ] `data_hora_sessao` é `TIMESTAMPTZ` no DB
- [ ] Cada clínica tem `timezone` configurado
- [ ] Frontend usa `date-fns-tz`, nunca manipulação manual de strings
- [ ] Casos de teste DST passam
- [ ] Smoke test: criar agendamento, mudar timezone do navegador, agendamento aparece na hora correta

## Riscos / dependências

- **Risco médio:** migration de schema em tabela grande pode lockar. Fazer fora de horário de pico.
- **Dependência:** [ROB-004](../sprint-2-robustness/ROB-004-migratus.md) — migration via Migratus.
- **Conversa com:** [QUA-006](QUA-006-refatorar-calendar-client.md) — bom momento pra simplificar o CalendarClient.tsx.

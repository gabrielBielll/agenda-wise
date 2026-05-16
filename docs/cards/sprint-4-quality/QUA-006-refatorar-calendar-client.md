# [QUA-006] Refatorar CalendarClient (16+ state vars → useReducer)

**Severidade:** 🟢 Low
**Sprint:** 4
**Esforço:** L (1-2 dias)
**Área:** Frontend
**Status:** TODO

## Contexto

`CalendarClient.tsx` tem 16+ peças de estado independentes:

```typescript
const [date, setDate] = useState(...);
const [view, setView] = useState(...);
const [isDialogOpen, setIsDialogOpen] = useState(false);
const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
const [isConfirmDeleteBlockOpen, setIsConfirmDeleteBlockOpen] = useState(false);
const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
const [conflictData, setConflictData] = useState(null);
const [blockToDelete, setBlockToDelete] = useState(null);
const [isConfirmDeleteApptOpen, setIsConfirmDeleteApptOpen] = useState(false);
const [apptToDelete, setApptToDelete] = useState(null);
const [isDeleteOpen, setIsDeleteOpen] = useState(false);
const [isCancelOpen, setIsCancelOpen] = useState(false);
const [blockRecurrenceType, setBlockRecurrenceType] = useState(...);
const [blockRecurrenceCount, setBlockRecurrenceCount] = useState(...);
const [selectedPatientId, setSelectedPatientId] = useState(null);
const [editingAppointment, setEditingAppointment] = useState(null);
const [newAppointmentDate, setNewAppointmentDate] = useState(null);
const [slotAction, setSlotAction] = useState(null);
// ...
```

Problemas:
- Múltiplos diálogos com estados dependentes (abrir um deveria fechar outro — fácil esquecer)
- Combinações inválidas (ex: `isConfirmDeleteApptOpen=true` mas `apptToDelete=null`)
- Re-renders excessivos
- Difícil testar transições

## Solução proposta

### Estratégia — modelar diálogos como estado discriminado

Substituir os múltiplos booleans por um único `dialogState` com discriminated union:

```typescript
type DialogState =
  | { kind: "closed" }
  | { kind: "create-appointment"; date: Date; patientId?: string }
  | { kind: "edit-appointment"; appointment: Appointment }
  | { kind: "delete-appointment-confirm"; appointment: Appointment }
  | { kind: "cancel-appointment-confirm"; appointment: Appointment }
  | { kind: "create-block"; date: Date }
  | { kind: "delete-block-confirm"; block: Block }
  | { kind: "conflict"; data: ConflictData };
```

Só um pode estar ativo. Estados inválidos viram impossíveis.

### Implementação com useReducer

```typescript
type CalendarState = {
  date: Date;
  view: "day" | "week" | "month";
  dialog: DialogState;
};

type Action =
  | { type: "set-date"; date: Date }
  | { type: "set-view"; view: View }
  | { type: "open-dialog"; dialog: Exclude<DialogState, { kind: "closed" }> }
  | { type: "close-dialog" };

function reducer(state: CalendarState, action: Action): CalendarState {
  switch (action.type) {
    case "set-date": return { ...state, date: action.date };
    case "set-view": return { ...state, view: action.view };
    case "open-dialog": return { ...state, dialog: action.dialog };
    case "close-dialog": return { ...state, dialog: { kind: "closed" } };
  }
}

// no componente:
const [state, dispatch] = useReducer(reducer, initialState);

// abrir diálogo de edição:
dispatch({ type: "open-dialog", dialog: { kind: "edit-appointment", appointment } });

// renderização:
{state.dialog.kind === "edit-appointment" && (
  <EditAppointmentDialog
    appointment={state.dialog.appointment}
    onClose={() => dispatch({ type: "close-dialog" })}
  />
)}
```

### Bonus — separar em componentes

Cada diálogo pode virar componente próprio com responsabilidades claras:

```
src/app/(app)/calendar/
  CalendarClient.tsx               <- só layout + reducer
  dialogs/
    CreateAppointmentDialog.tsx
    EditAppointmentDialog.tsx
    DeleteAppointmentDialog.tsx
    CancelAppointmentDialog.tsx
    CreateBlockDialog.tsx
    DeleteBlockDialog.tsx
    ConflictDialog.tsx
  hooks/
    useCalendarReducer.ts          <- reducer extraído
```

### Não tente refatorar tudo de uma vez

Sugestão de PRs incrementais:
1. **PR 1** — extrair tipos + reducer, manter API igual
2. **PR 2** — migrar diálogos um a um (ordem: criar → editar → deletar)
3. **PR 3** — separar arquivos
4. **PR 4** — limpar estado morto após estabilização

Cada PR deve manter o calendário funcionando integralmente.

### Aproveitar pra outras melhorias

Enquanto refatora, considerar:
- Memoização (`useMemo`, `useCallback`) onde for benéfico
- `useOptimistic` (React 19) para atualizações otimistas
- Extrair lógica de timezone para [QUA-002](QUA-002-timezone-calendar.md)

## Critérios de aceitação

- [ ] CalendarClient.tsx tem <500 linhas (era ~1000+)
- [ ] `useReducer` substitui os múltiplos `useState` de diálogo
- [ ] Cada diálogo é um componente próprio em `dialogs/`
- [ ] Tipos garantem que dois diálogos não abrem ao mesmo tempo
- [ ] Smoke test E2E: criar, editar, deletar, cancelar agendamento; criar e deletar bloqueio

## Riscos / dependências

- **Refatoração grande:** mexer em código complexo sem testes é arriscado. Idealmente, escrever Playwright E2E mínimo antes ([OPS-006](../sprint-3-production/OPS-006-ci-cd.md)).
- **Não-bloqueador:** funciona hoje. Só vai doer mais e mais conforme features forem adicionadas.
- **Conversa com:** [QUA-002](QUA-002-timezone-calendar.md) — bom momento pra resolver timezone de vez.

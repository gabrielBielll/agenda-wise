# [PERF-006] Suspense + loading.tsx para streaming progressivo

**Severidade:** 🟡 Medium
**Sprint:** 5
**Esforço:** M (meio dia)
**Área:** Frontend
**Status:** TODO

## Contexto

Nenhuma rota tem `loading.tsx`. Nenhum Server Component está envolvido em `<Suspense>`. Resultado: a navegação para `/calendar` espera **todos** os 3 fetches concluírem antes de mostrar qualquer pixel. Em condições reais (backend 200ms + 3 queries sequenciais ou paralelas) o usuário enxerga tela vazia 600-1500ms.

O Next 15 + RSC torna streaming nativo — basta usá-lo.

## Localização

- Todas as pastas em `src/app/(app)/*` e `src/app/admin/*` sem `loading.tsx`
- Server Components que aguardam múltiplos fetches: `calendar/page.tsx`, `patients/[patientId]/page.tsx`, `admin/dashboard/page.tsx`

## Solução proposta

### Passo 1 — `loading.tsx` por segmento

Cada pasta de rota ganha:

```typescript
// src/app/(app)/calendar/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}
```

Replicar para `/patients`, `/patients/[patientId]`, `/dashboard`, `/admin/dashboard`, `/admin/financeiro`, `/admin/agendamentos`, `/admin/pacientes`, `/admin/psicologos`.

Cada skeleton deve **imitar** o layout final (mesma altura aproximada) para evitar CLS.

### Passo 2 — `<Suspense>` em pontos paralelos

Server Components que fazem múltiplos awaits podem renderizar partes prontas enquanto outras carregam.

Antes:
```typescript
// page.tsx
export default async function CalendarPage() {
  const [appointments, patients, blocks] = await Promise.all([
    getAgendamentos(...),
    getPacientes(...),
    getBloqueios(...),
  ]);
  return <CalendarClient {...} />;
}
```

Depois:
```typescript
// page.tsx
export default async function CalendarPage() {
  return (
    <div>
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarShell />
      </Suspense>
      <Suspense fallback={<SidebarSkeleton />}>
        <PatientsSidebar />
      </Suspense>
    </div>
  );
}

// async children fetch their own data:
async function CalendarShell() {
  const appointments = await getAgendamentos(...);
  const blocks = await getBloqueios(...);
  return <CalendarClient appointments={appointments} blocks={blocks} />;
}
```

Cada `<Suspense>` boundary aparece independentemente — o usuário vê a sidebar enquanto o calendário ainda carrega.

### Passo 3 — `useTransition` em interações

Para mudanças que disparam re-fetch (mudar mês no calendário, filtrar pacientes), embrulhar em `startTransition` para que a UI antiga fique visível com indicador de loading não-bloqueante.

```typescript
const [isPending, startTransition] = useTransition();

function changeMonth(newDate: Date) {
  startTransition(() => {
    setDate(newDate);
  });
}

return (
  <div className={isPending ? "opacity-60" : ""}>
    ...
  </div>
);
```

### Passo 4 — `error.tsx` para cada segmento

Junto com `loading.tsx`, criar `error.tsx` para isolar falhas. Quando o `/calendar` quebra, só ele mostra erro — o resto do shell continua.

```typescript
// src/app/(app)/calendar/error.tsx
'use client';
export default function CalendarError({ error, reset }) {
  return (
    <div className="p-6">
      <h2>Não foi possível carregar o calendário.</h2>
      <button onClick={reset}>Tentar novamente</button>
    </div>
  );
}
```

Isto se sobrepõe a [QUA-003](../sprint-4-quality/QUA-003-error-boundary.md), que cobre o **error.tsx global** — aqui são segmentados.

## Critérios de aceitação

- [ ] `loading.tsx` em todas as rotas do `(app)/` e `admin/`
- [ ] `error.tsx` em rotas críticas (calendar, patients/[id], dashboard)
- [ ] `<Suspense>` aplicado em pelo menos `calendar/page.tsx` para separar dados paralelos
- [ ] `useTransition` em mudança de mês/view no calendário
- [ ] LCP percebido (Lighthouse) em `/calendar` melhora em 200ms+
- [ ] Skeletons casam dimensões do conteúdo real (sem CLS)

## Riscos / dependências

- **Atenção:** dentro de Suspense boundary, *cada* async componente que falha aciona o `error.tsx` daquele segmento. Sem `error.tsx`, propaga para o pai.
- **Conversa com:** [QUA-003](../sprint-4-quality/QUA-003-error-boundary.md) — `error.tsx` global cobre o caso "tudo quebrou", segmentos cobrem casos parciais.
- **Conversa com:** [PERF-004](PERF-004-react-query-cache-http.md) — depois de TanStack Query, considerar `useSuspenseQuery` para integrar.

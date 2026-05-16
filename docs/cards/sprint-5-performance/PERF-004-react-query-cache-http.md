# [PERF-004] TanStack Query + cache HTTP no Next 15

**Severidade:** 🟠 High
**Sprint:** 5
**Esforço:** L (1-2 dias)
**Área:** Frontend
**Status:** TODO

## Contexto

Os Server Components do app usam `fetch(..., { cache: 'no-store' })` em **todas** as páginas do shell autenticado (`calendar`, `patients`, `patients/[id]`, etc.). Isso desliga o cache nativo do Next 15. Resultado:

- Cada navegação refaz 100% das requisições ao backend
- Voltar para `/calendar` depois de visitar um paciente refaz a mesma query
- Não há deduplicação: dois Server Components que pedem a mesma lista no mesmo render disparam dois fetches

No client, não existe TanStack Query / SWR / Apollo. Cada componente que faz fetch dispara um request novo a cada render. Mutations não invalidam cache (não há cache).

Para escalar de 100 → 1k usuários simultâneos, isto multiplica a carga no backend por ~3-5×. Resolver isto antes de aumentar instâncias.

## Localização

- [`src/app/(app)/calendar/page.tsx`](../../../deep-saude-plataforma-front-end/src/app/%28app%29/calendar/page.tsx) — três fetches `no-store` (agendamentos, pacientes, bloqueios)
- [`src/app/(app)/patients/page.tsx`](../../../deep-saude-plataforma-front-end/src/app/%28app%29/patients/page.tsx) — client component, fetches direto
- [`src/app/(app)/patients/[patientId]/page.tsx`](../../../deep-saude-plataforma-front-end/src/app/%28app%29/patients/%5BpatientId%5D/page.tsx)
- `src/lib/admin-api.ts` — axios sem cache, sem dedup

## Solução proposta

### Estratégia em duas camadas

**Camada 1 — Server Components com `revalidate` + tags**

Trocar `cache: 'no-store'` por tags + TTL onde fizer sentido:

```typescript
// src/lib/api.ts (server-side)
export async function getAgendamentos(from: string, to: string, token: string) {
  return fetch(`${BACKEND_URL}/api/agendamentos?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: {
      revalidate: 60,                              // 60s SWR
      tags: [`agendamentos:clinica:${clinicaId}`] // para invalidação
    }
  }).then(r => r.json());
}

// invalidar após mutation (em Server Action ou route handler):
import { revalidateTag } from 'next/cache';
revalidateTag(`agendamentos:clinica:${clinicaId}`);
```

Importante: o cache é por URL+headers. **Authorization** quebra cache compartilhado entre usuários — adicionar `cache: 'no-store'` em endpoints com dados pessoais (prontuário) e usar tag apenas em dados compartilháveis por clínica. Avaliar caso a caso; quando em dúvida, manter `no-store`.

**Camada 2 — Client com TanStack Query**

```bash
npm i @tanstack/react-query @tanstack/react-query-devtools
```

```typescript
// src/components/providers/QueryProvider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,           // 30s sem refetch
        gcTime: 5 * 60_000,          // 5min em memória
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Hooks por domínio:

```typescript
// src/hooks/useAgendamentos.ts
export function useAgendamentos(from: Date, to: Date) {
  return useQuery({
    queryKey: ['agendamentos', from.toISOString(), to.toISOString()],
    queryFn: () => apiClient.get(`/agendamentos?from=${...}&to=${...}`),
  });
}

export function useCreateAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.post('/agendamentos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agendamentos'] }),
  });
}
```

### Hidratação SSR → CSR

Para evitar duplicação de fetch quando Server Component já buscou:

```typescript
// page.tsx (server)
const dehydratedState = dehydrate(qc);
return <Hydrate state={dehydratedState}><CalendarClient /></Hydrate>
```

Ou mais simples: passar `initialData` no `useQuery`.

### Pré-fetch em navegação

`Link` + `prefetch` do Next + `queryClient.prefetchQuery` no hover/visible.

## Critérios de aceitação

- [ ] `QueryProvider` montado no `(app)/layout.tsx`
- [ ] Pelo menos `useAgendamentos`, `usePacientes`, `useProntuarios` reescritos via TanStack
- [ ] Mutations chamam `invalidateQueries` da chave correspondente
- [ ] `cache: 'no-store'` removido de listagens não-sensíveis; substituído por `revalidate` + tag
- [ ] Após mutation, `revalidateTag` é chamado server-side
- [ ] Bench: navegar entre 5 telas e voltar dispara ~5 fetches, não ~15

## Riscos / dependências

- **Dados sensíveis e cache compartilhado:** prontuário **nunca** deve usar cache compartilhado por URL. Manter `no-store` para conteúdo pessoal; usar tag/revalidate só onde dado é escopado por clínica e não-PII.
- **Hidratação:** se Server Component buscou com Authorization, garantir que o estado hidratado é específico do usuário (cookies httpOnly por sessão).
- **Bundle:** TanStack Query adiciona ~12KB gzip. Aceitável.
- **Conversa com:** [PERF-002](PERF-002-paginacao-listagens.md) — `queryKey` deve incluir o cursor/janela.
- **Conversa com:** [SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md) — token em cookie httpOnly muda como o client passa credenciais.

# [ROB-005] Timeouts e retry nas chamadas fetch do frontend

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** M (meio dia)
**Área:** Frontend
**Status:** TODO

## Contexto

Todas as chamadas `fetch` do frontend pro backend Clojure hoje não têm:
- Timeout — se backend não responder, request fica pendente indefinidamente
- Retry — falhas transientes (rede, deploy do backend) quebram UX
- Tratamento consistente de erro — 401/500 são tratados ad-hoc em cada lugar

Resultado: backend lento ou em deploy = UI travada com `LoadingOverlay` para sempre, usuário não sabe o que fazer.

## Localização

Exemplos do padrão atual:

- `deep-saude-plataforma-front-end/src/app/(app)/calendar/page.tsx:9, 30, 44`
- `deep-saude-plataforma-front-end/src/app/(app)/calendar/actions.ts` (várias funções)
- `deep-saude-plataforma-front-end/src/lib/admin-api.ts`

Tipicamente:
```typescript
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const data = await res.json();
return data;
```

## Solução proposta

### Passo 1 — cliente HTTP centralizado

Criar `src/lib/backend-client.ts` (server-side; pareando com [SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md)):

```typescript
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.BACKEND_URL!;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

type CallOptions = RequestInit & {
  timeout?: number;
  retries?: number;
  req?: NextRequest;  // pra extrair token server-side
};

export async function callBackend<T = unknown>(
  path: string,
  options: CallOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    retries = MAX_RETRIES,
    req,
    headers,
    ...init
  } = options;

  const token = req ? (await getToken({ req }))?.backendToken : undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${BACKEND_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
          ...headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 401) throw new BackendError("UNAUTHORIZED", 401);
      if (res.status === 403) throw new BackendError("FORBIDDEN", 403);
      if (res.status >= 500 && attempt < retries) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));  // backoff linear
        continue;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new BackendError(body.erro ?? "Erro no servidor", res.status);
      }

      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof BackendError) throw err;
      if (err.name === "AbortError") {
        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new BackendError("TIMEOUT", 504);
      }
      if (attempt >= retries) throw new BackendError("NETWORK_ERROR", 0);
    }
  }
  throw new BackendError("UNREACHABLE", 0);
}

export class BackendError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
```

### Passo 2 — migrar Server Actions e Route Handlers

Substituir `fetch` cru por `callBackend`:

```typescript
// antes:
const res = await fetch(`${BACKEND_URL}/api/agendamentos`, { ... });
const data = await res.json();

// depois:
const data = await callBackend<Agendamento[]>("/api/agendamentos", { req });
```

### Passo 3 — tratamento de erro no client

No componente, tratar `BackendError` consistentemente:

```typescript
try {
  await createAgendamento(formData);
  toast.success("Agendamento criado");
} catch (err) {
  if (err.code === "UNAUTHORIZED") router.push("/login");
  else if (err.code === "TIMEOUT") toast.error("Servidor demorou demais. Tente novamente.");
  else toast.error(err.message || "Erro inesperado");
}
```

### Passo 4 — não retry em operações não-idempotentes

POST de criar agendamento **não deve** ter retry automático — risco de criar duplicado. Adicionar parâmetro:

```typescript
await callBackend("/api/agendamentos", { method: "POST", body: ..., retries: 0 });
```

Ou marcar idempotência via `Idempotency-Key` header (mais robusto, mas é mudança no backend).

## Critérios de aceitação

- [ ] `src/lib/backend-client.ts` existe e centraliza chamadas
- [ ] Pelo menos 80% das chamadas migradas para `callBackend`
- [ ] Timeout default 15s aplicado
- [ ] Retry em 5xx (até 2x), nunca em POSTs sem idempotência explícita
- [ ] Erros são `BackendError` tipados, não `Error` cru
- [ ] Smoke test: matar o backend, fazer ação no frontend → toast claro, sem travar UI

## Riscos / dependências

- **Dependência:** [SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md) — esse cliente já assume que token vem do session server-side.
- **Atenção:** retry em POSTs pode duplicar. Default deve ser sem retry pra mutations; aplicar caso-a-caso.

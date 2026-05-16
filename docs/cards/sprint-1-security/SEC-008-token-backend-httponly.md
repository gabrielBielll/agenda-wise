# [SEC-008] Mover token backend para cookie httpOnly

**Severidade:** 🟠 High
**Sprint:** 1
**Esforço:** M (meio dia)
**Área:** Frontend
**Status:** TODO

## Contexto

O JWT emitido pelo backend Clojure (`backendToken`) é armazenado no objeto `session` do NextAuth e retornado ao cliente. Isso significa que qualquer código JavaScript no browser pode lê-lo via `useSession()`. Se houver qualquer vulnerabilidade de XSS (ex: um campo de prontuário renderizado sem escape), o atacante consegue roubar o JWT e impersonar o usuário até a expiração.

A solução é manter o token estritamente server-side: cookie httpOnly que o browser envia automaticamente mas o JS nunca lê.

## Localização

- `deep-saude-plataforma-front-end/src/app/api/auth/[...nextauth]/route.ts` (callbacks `jwt` e `session` colocam o token no session)
- `deep-saude-plataforma-front-end/src/lib/admin-api.ts:16, 22` (token em localStorage — pior ainda)

## Solução proposta

### Opção A (recomendada) — manter token só no NextAuth JWT (encrypted cookie)

NextAuth.js já criptografa o JWT da sessão num cookie httpOnly. Basta:

1. Manter `backendToken` dentro do `token` do callback `jwt` (não vai pro cliente)
2. NÃO expor `backendToken` no callback `session`
3. Para chamar o backend, usar Server Actions / Route Handlers que leem o token do `getToken()` server-side e fazem proxy

```typescript
// callbacks no NextAuth:
async jwt({ token, user }) {
  if (user) {
    token.role = user.role;
    token.clinicaId = user.clinicaId;
    token.backendToken = user.backendToken;  // fica no token (server-side)
  }
  return token;
}

async session({ session, token }) {
  session.user.role = token.role;
  session.user.clinicaId = token.clinicaId;
  // backendToken NÃO entra aqui
  return session;
}
```

```typescript
// Server Action / Route Handler chamando o backend:
import { getToken } from "next-auth/jwt";

export async function callBackend(req: NextRequest, path: string, init?: RequestInit) {
  const token = await getToken({ req });
  if (!token?.backendToken) throw new Error("Unauthorized");

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token.backendToken}`,
    },
  });
}
```

### Passo 2 — auditar uso de `session.backendToken` no cliente

Procurar por `session?.backendToken` ou `(session as any).backendToken` no codebase frontend:

```bash
grep -rn "backendToken" deep-saude-plataforma-front-end/src/
```

Cada ocorrência em componente client deve migrar para um Server Action / Route Handler.

### Passo 3 — admin-api.ts (localStorage)

```typescript
// REMOVER:
localStorage.setItem('admin_token', token);
```

Admin não deveria ter token separado — usar mesmo fluxo NextAuth. Se for um caso de uso especial, ainda assim: cookie httpOnly, nunca localStorage.

## Critérios de aceitação

- [ ] `callback session` do NextAuth não inclui `backendToken`
- [ ] Nenhum componente `"use client"` lê `backendToken` da session
- [ ] Chamadas ao backend Clojure usam Server Actions / Route Handlers que injetam o token server-side
- [ ] `admin-api.ts` não usa mais `localStorage` para tokens
- [ ] Smoke test: login → navegar → fazer mutation (criar paciente) funciona end-to-end

## Riscos / dependências

- **Esforço variável** dependendo de quantos componentes hoje consomem `backendToken` direto. Estimei meio dia, mas pode ser mais se houver muitas chamadas espalhadas.
- **Refatoração paralela:** boa oportunidade para centralizar cliente HTTP backend em `src/lib/backend-client.ts` (server-only), evitando duplicação.
- **Não depende** de outros cards, mas conversa com [SEC-005](SEC-005-remover-override-admin-nextauth.md).

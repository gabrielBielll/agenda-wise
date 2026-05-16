# [SEC-004] Verificar assinatura JWT no middleware do Next.js

**Severidade:** 🔴 Critical
**Sprint:** 1
**Esforço:** S (≤2h)
**Área:** Frontend
**Status:** TODO

## Contexto

O middleware do Next.js tem uma função `isBackendTokenExpired` que decodifica o JWT só com `atob` no payload pra checar `exp`. Não verifica a assinatura HMAC. Atacante pode forjar um token com qualquer payload (incluindo `exp` no futuro) e passar pela middleware.

O backend Clojure ainda valida a assinatura no `wrap-jwt-autenticacao`, então não é um bypass total — mas a defesa em profundidade está quebrada e a UI pode ser navegada com credenciais forjadas.

## Localização

[deep-saude-plataforma-front-end/src/middleware.ts:23-39](../../../deep-saude-plataforma-front-end/src/middleware.ts#L23-L39)

```typescript
function isBackendTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
```

## Solução proposta

NextAuth.js já lida com a sessão do próprio frontend. O problema é o `backendToken` (o JWT emitido pelo Clojure) que vai junto na session — esse é o que precisa de verificação real.

### Opção A (recomendada) — usar `jose` para verificar assinatura

`jose` é compatível com Edge Runtime (que o middleware do Next 15 usa). `jsonwebtoken` não é.

```bash
npm install jose
```

```typescript
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

async function validateBackendToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return true; // assinatura válida e não expirado
  } catch {
    return false;
  }
}
```

Importante: `JWT_SECRET` precisa estar disponível no Edge Runtime — confirmar via `process.env` ou usar `NEXT_PUBLIC_*` (mas o secret nunca pode ser public). A solução correta é configurar como server-only env var.

### Opção B — confiar no backend

Se rota for sensível e estiver fazendo fetch pro backend logo em seguida, deixar o backend rejeitar com 401 e o frontend redirecionar pra login. Remove a checagem otimista no middleware mas adiciona latência (precisa esperar resposta do backend).

Recomendo opção A — segurança proper sem custo extra de latência.

## Critérios de aceitação

- [ ] `isBackendTokenExpired` substituída por verificação criptográfica real
- [ ] Tokens com payload manipulado retornam inválido (teste manual: forjar payload com `exp` futura)
- [ ] JWT_SECRET disponível como env var server-side no Next, não exposto via `NEXT_PUBLIC_*`
- [ ] Smoke test de login → navegação → logout funciona end-to-end

## Riscos / dependências

- **Dependência:** JWT_SECRET deve ser o mesmo entre backend e middleware Next. Garantir após rotação ([SEC-002](SEC-002-rotacionar-credenciais.md)).
- **Atenção:** `jose` precisa ser usado com `await` — função precisa ser async, propagar pra `middleware.ts`.

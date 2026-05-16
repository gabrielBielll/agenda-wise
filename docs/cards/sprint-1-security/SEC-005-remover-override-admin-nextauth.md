# [SEC-005] Remover override hardcoded de admin no NextAuth

**Severidade:** 🔴 Critical
**Sprint:** 1
**Esforço:** S (≤2h)
**Área:** Frontend
**Status:** TODO

## Contexto

O handler do NextAuth tem condicionais hardcoded que forçam role `admin_clinica` quando o email é `admin@deepsaude.com`, independente do que o backend retornar. Se o backend mudar a role do usuário (ex: rebaixar para psicologo), o NextAuth ignora e mantém admin. Pior: se um atacante criar uma conta com esse email em outro contexto, ganha admin automaticamente.

## Localização

`deep-saude-plataforma-front-end/src/app/api/auth/[...nextauth]/route.ts:47-52, 88-92`

(Buscar por `admin@deepsaude.com` no arquivo para localizar — não tenho acesso direto à linha exata neste ponto.)

```typescript
// Padrão problemático que existe em duas callbacks (authorize e jwt):
if (email === "admin@deepsaude.com") {
  user.role = "admin_clinica";
  // ...
}
```

## Solução proposta

A role deve vir **exclusivamente** do backend, no body da resposta de `/api/auth/login`. NextAuth apenas persiste o que o backend disser.

### Passo 1 — remover condicionais hardcoded

```typescript
// authorize callback:
async authorize(credentials) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, { ... });
  const data = await res.json();

  if (!res.ok) return null;

  return {
    id: data.user.id,
    email: data.user.email,
    role: data.user.role,  // sem override
    clinicaId: data.user.clinica_id,
    backendToken: data.token,
  };
}

// jwt callback:
async jwt({ token, user }) {
  if (user) {
    token.role = user.role;  // sem override
    token.clinicaId = user.clinicaId;
    token.backendToken = user.backendToken;
  }
  return token;
}
```

### Passo 2 — garantir que o backend está retornando `role` corretamente

Confirmar que `login-handler` no Clojure inclui `:role` no body de retorno ([core.clj:215-221](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L215-L221)). Já está, segundo a leitura do código — então é só remover o override no frontend.

### Passo 3 — testes

- [ ] Login do admin retorna `session.role === "admin_clinica"` (vindo do backend)
- [ ] Mudar role do admin no DB para `psicologo` → próximo login reflete `psicologo`
- [ ] Criar usuário com email `admin@deepsaude.com` em outra clínica (deve falhar em SEC-002, mas se não, garantir que role vem do papel real)

## Critérios de aceitação

- [ ] Nenhuma referência a `admin@deepsaude.com` no código de auth do frontend
- [ ] `session.role` é exclusivamente o que o backend retornou no body
- [ ] Smoke test: login normal funciona após remoção

## Riscos / dependências

- Nenhuma dependência direta. Pode ser feito em paralelo aos outros cards de Sprint 1.
- **Atenção:** se existem outros emails hardcoded (procurar `@deepsaude.com` no codebase frontend), remover todos.

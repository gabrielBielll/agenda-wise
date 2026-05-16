# [PERF-007] Rewrites do Next via variável de ambiente

**Severidade:** 🔴 Critical
**Sprint:** 5
**Esforço:** S (≤2h)
**Área:** Frontend / Infra
**Status:** TODO

## Contexto

`next.config.ts` declara rewrites com destino `http://localhost:3000` **hardcoded** para todas as rotas `/api/...`. Em produção, isso simplesmente não funciona — o frontend tenta proxar para o próprio container. Hoje a aplicação só funciona porque o frontend chama o backend Clojure diretamente em algumas rotas, mas a configuração de rewrite está incoerente.

## Localização

[`next.config.ts:22-53`](../../../deep-saude-plataforma-front-end/next.config.ts#L22-L53):

```typescript
async rewrites() {
  return [
    { source: '/api/agendamentos/:path*', destination: 'http://localhost:3000/api/agendamentos/:path*' },
    { source: '/api/pacientes/:path*',    destination: 'http://localhost:3000/api/pacientes/:path*' },
    // ...
  ];
}
```

## Solução proposta

### Padrão

```typescript
// next.config.ts
const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("BACKEND_URL ou NEXT_PUBLIC_BACKEND_URL precisa estar definido");
}

const nextConfig: NextConfig = {
  // ...
  async rewrites() {
    return [
      { source: '/api/agendamentos/:path*', destination: `${BACKEND_URL}/api/agendamentos/:path*` },
      { source: '/api/pacientes/:path*',    destination: `${BACKEND_URL}/api/pacientes/:path*` },
      { source: '/api/psicologos/:path*',   destination: `${BACKEND_URL}/api/psicologos/:path*` },
      { source: '/api/prontuarios/:path*',  destination: `${BACKEND_URL}/api/prontuarios/:path*` },
      { source: '/api/bloqueios/:path*',    destination: `${BACKEND_URL}/api/bloqueios/:path*` },
      { source: '/api/usuarios/:path*',     destination: `${BACKEND_URL}/api/usuarios/:path*` },
      { source: '/api/admin/:path*',        destination: `${BACKEND_URL}/api/admin/:path*` },
    ];
  },
};
```

### Decidir: `BACKEND_URL` ou `NEXT_PUBLIC_BACKEND_URL`?

- **`BACKEND_URL`** (sem `NEXT_PUBLIC_`): só disponível no server. Rewrites são server-side (Next proxy), então funciona.
- **`NEXT_PUBLIC_BACKEND_URL`**: visível no client. Necessário se algum fetch client-side **bypassa o proxy** e chama o backend direto.

Recomendação: usar `BACKEND_URL` para rewrites, e `NEXT_PUBLIC_BACKEND_URL` **somente** se algum código client realmente precisa do URL absoluto. Idealmente nada do client conhece o backend — tudo passa pelo Next como proxy (vantagem: cookie httpOnly funciona, ver [SEC-008](../sprint-1-security/SEC-008-token-backend-httponly.md)).

### Setup nos ambientes

```bash
# .env.local (dev)
BACKEND_URL=http://localhost:3000

# Produção (Firebase / Render / AWS — onde rodar Next)
BACKEND_URL=https://api.deep-saude.com.br
```

`.env.local` deve estar no `.gitignore` (já está). Adicionar `.env.example`:

```bash
BACKEND_URL=http://localhost:3000
# NEXT_PUBLIC_BACKEND_URL=  # opcional, só se client precisar do URL
```

### Sanity check no startup

Adicionar guard explícito (já no exemplo acima): se `BACKEND_URL` ausente, o build falha. Melhor que rodar em prod proxando para localhost.

### CORS

Se Next chama o backend via proxy (rewrites), o browser sempre vê o domínio do Next. CORS no backend pode então **só** permitir o domínio do próprio backend (chamado por server-side fetch) — não precisa whitelistar o do Next. Combina com [SEC-007](../sprint-1-security/SEC-007-restringir-cors.md).

## Critérios de aceitação

- [ ] `next.config.ts` não tem mais `localhost:3000` literal
- [ ] `BACKEND_URL` lido de `process.env` com erro explícito se ausente
- [ ] `.env.example` criado documentando as variáveis
- [ ] Build com `BACKEND_URL` ausente falha (não silenciosamente proxa para nada)
- [ ] Em dev, `BACKEND_URL=http://localhost:3000` funciona igual
- [ ] Em staging, app aponta para staging backend e funciona end-to-end

## Riscos / dependências

- **Atenção:** rewrites disparam no edge/server do Next. Se o Next rodar atrás de CDN (Amplify, CloudFront, Firebase Hosting), garantir que esses rewrites são executados (alguns CDNs não suportam rewrites Next).
- **Migração:** todos os ambientes (dev/staging/prod) precisam da var antes do deploy desta mudança. Comunicar.
- **Conversa com:** [OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md) — decisão de deploy determina onde o env var é configurado.
- **Conversa com:** [SEC-007](../sprint-1-security/SEC-007-restringir-cors.md) — após esta mudança, CORS do backend pode ser bem mais restrito.

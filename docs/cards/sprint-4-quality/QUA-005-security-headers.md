# [QUA-005] Headers de segurança HTTP (CSP, HSTS, X-Frame-Options)

**Severidade:** 🟡 Medium
**Sprint:** 4
**Esforço:** S (≤2h)
**Área:** Frontend / Backend
**Status:** TODO

## Contexto

Nenhum dos dois servidores hoje envia headers de segurança HTTP. Esses headers são uma camada de defesa em profundidade barata: protegem contra clickjacking, MIME sniffing, mixed content, alguns XSS.

Verificação rápida:
```bash
curl -I https://seu-app.com
# Não vê: Strict-Transport-Security, Content-Security-Policy, X-Frame-Options, etc.
```

## Solução proposta

### Frontend (Next.js)

`next.config.ts`:

```typescript
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io",  // ajustar
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://placehold.co",
      "font-src 'self'",
      "connect-src 'self' https://api.deepsaude.com https://*.sentry.io",     // backend + sentry
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

### Backend (Clojure)

Adicionar middleware:

```clojure
(defn wrap-security-headers [handler]
  (fn [request]
    (let [response (handler request)]
      (-> response
          (assoc-in [:headers "Strict-Transport-Security"] "max-age=63072000; includeSubDomains; preload")
          (assoc-in [:headers "X-Content-Type-Options"] "nosniff")
          (assoc-in [:headers "X-Frame-Options"] "DENY")
          (assoc-in [:headers "Referrer-Policy"] "no-referrer")))))

;; aplicar no pipeline:
(def app
  (-> app-routes
      wrap-error-handler
      (wrap-cors ...)
      wrap-security-headers
      ...))
```

### CSP — calibrar com cuidado

CSP é a parte mais complicada. Estratégia:

1. Começar em **report-only mode** pra não quebrar nada:
   ```typescript
   { key: "Content-Security-Policy-Report-Only", value: "..." }
   ```
2. Monitorar violations no console do browser
3. Quando estiver limpo, mudar pra `Content-Security-Policy` real
4. Considerar `nonce-based CSP` no Next 15 (mais robusto que `unsafe-inline`)

Para o nonce-based:
```typescript
// middleware.ts
const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
// passar nonce nos headers e nos scripts
```

### Validar

Ferramentas:
- https://securityheaders.com — score (target: A ou A+)
- https://csp-evaluator.withgoogle.com — análise de CSP
- Browser console na app — não pode ter violações

## Critérios de aceitação

- [ ] Frontend serve `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `CSP`
- [ ] Backend serve os mesmos (exceto CSP — não aplicável a API)
- [ ] CSP não quebra a app (testar todas as páginas e features)
- [ ] securityheaders.com score >= A
- [ ] Sentry e qualquer outro third-party domain explicitamente listado em CSP

## Riscos / dependências

- **CSP é traiçoeiro:** `unsafe-inline` no script-src enfraquece muito. Mas Next.js com client components precisa de algum unsafe-eval no dev. Em prod, considerar nonce-based.
- **HSTS preload:** uma vez ativado e adicionado à HSTS preload list, é irreversível por ~1 ano. Configurar só quando 100% certo que tudo está em HTTPS.
- **Não-bloqueador:** se o resto da Sprint 1 estiver feito, esse card adiciona profundidade mas não fecha brecha existente.

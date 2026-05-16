# [SEC-007] Restringir CORS — remover wildcard e hardcodes

**Severidade:** 🟠 High
**Sprint:** 1
**Esforço:** S (≤2h)
**Área:** Backend
**Status:** TODO

## Contexto

A configuração CORS aceita:
1. `https://.*\.code\.run` — qualquer subdomínio `.code.run`, incluindo `attacker.code.run`
2. `https://deep-ngrv.onrender.com` hardcoded no código
3. `localhost:9002` (ok em dev, mas em prod?)

Isso permite que sites maliciosos hospedados em qualquer subdomínio `.code.run` façam requisições autenticadas para o backend usando cookies/credenciais do usuário (CSRF cross-origin).

## Localização

[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:1207-1218](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1207-L1218)

```clojure
(wrap-cors :access-control-allow-origin
  [#"http://localhost:3000"
   #"http://localhost:9002"
   #"https://.*\.code\.run"          ;; perigoso
   #"https://deep-ngrv.onrender.com"] ;; hardcoded
  :access-control-allow-methods [:get :put :post :delete :options]
  ...)
```

## Solução proposta

### Passo 1 — origens via variável de ambiente

```clojure
(def allowed-origins
  (let [env-origins (or (System/getenv "CORS_ALLOWED_ORIGINS") "")
        origins (remove str/blank? (str/split env-origins #","))]
    (map #(re-pattern (str "^" (java.util.regex.Pattern/quote %) "$")) origins)))

;; uso:
(wrap-cors :access-control-allow-origin allowed-origins ...)
```

### Passo 2 — configurar por ambiente

```bash
# desenvolvimento
CORS_ALLOWED_ORIGINS=http://localhost:9002

# produção
CORS_ALLOWED_ORIGINS=https://app.deepsaude.com,https://www.deepsaude.com
```

### Passo 3 — eliminar wildcard

Remover `https://.*\.code\.run` completamente. Se for necessário aceitar previews do Firebase Hosting / Vercel, listar domínios específicos esperados — não wildcard de qualquer subdomínio.

### Passo 4 — revisar outros headers CORS

```clojure
:access-control-allow-methods [:get :put :post :delete :options]
:access-control-allow-credentials "true"  ;; se precisar enviar cookies
:access-control-max-age 86400              ;; cache de preflight
```

Se `allow-credentials` é true, **não pode** ter origem `*`. Por isso a lista explícita é obrigatória.

## Critérios de aceitação

- [ ] Sem regex wildcards genéricos (`.*\.code\.run`) na lista de origins
- [ ] Sem domínio hardcoded — tudo vem de `CORS_ALLOWED_ORIGINS`
- [ ] `.env.example` documenta a variável
- [ ] Smoke test: chamada do frontend autorizado → 200; chamada de outro origin → bloqueada (testar com curl com Origin diferente)

## Riscos / dependências

- **Atenção:** se o backend está hoje em `deep-ngrv.onrender.com` e ainda for usado provisoriamente, garantir que esse domínio entra na lista temporariamente via env var, não no código.
- **Dependência:** [OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md) define quais domínios definitivos existirão; até lá, usar valores de dev/staging.

# [OPS-004] Healthcheck do backend + corrigir healthcheck Postgres

**Severidade:** 🟠 High
**Sprint:** 3
**Esforço:** S (≤2h)
**Área:** Backend / Infra
**Status:** TODO

## Contexto

Dois problemas:

1. **Backend não tem endpoint de healthcheck.** Plataforma de deploy não tem como saber se está saudável → não reinicia container morto, não tira de load balancer.

2. **Healthcheck do Postgres aponta para banco inexistente** — [docker-compose.yml:17](../../../docker-compose.yml#L17) usa `pg_isready -d erp_advocacia` (legado), mas o DB criado é `deep_saude_db`. Container permanece "unhealthy" infinitamente.

## Solução proposta

### Parte 1 — endpoint `/api/health` no backend

(Já mencionado em [OPS-002](OPS-002-sentry-observabilidade.md) mas é o coração deste card.)

```clojure
;; antes de wrap-jwt-autenticacao no roteamento:
(GET "/api/health" []
  (let [db-ok? (try (do (execute-one! ["SELECT 1"]) true) (catch Exception _ false))]
    (if db-ok?
      {:status 200 :body {:status "ok" :db "ok" :version (System/getenv "RELEASE_TAG")}}
      {:status 503 :body {:status "degraded" :db "fail"}})))
```

**Importante:** rota pública (fora do JWT middleware). Caso contrário, healthcheck falha porque não tem token.

### Parte 2 — corrigir docker-compose

[docker-compose.yml:16-20](../../../docker-compose.yml#L16-L20):

```yaml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_USER: ${POSTGRES_USER:-erp_user}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: deep_saude_db
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-erp_user} -d deep_saude_db"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
```

Variáveis vindo de `.env` (ver [SEC-002](../sprint-1-security/SEC-002-rotacionar-credenciais.md)).

### Parte 3 — healthcheck do backend container

Adicionar ao `docker-compose.yml`:

```yaml
backend:
  build:
    context: ./deep-saude-plataforma-api/deep-saude-backend
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    DATABASE_URL: ${DATABASE_URL}
    JWT_SECRET: ${JWT_SECRET}
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 60s
  restart: unless-stopped
```

### Parte 4 — healthcheck na plataforma de deploy

(Render exemplo) em `render.yaml`:

```yaml
- type: web
  name: deep-saude-backend
  healthCheckPath: /api/health
```

### Parte 5 — frontend healthcheck

Next.js tem suporte nativo. Criar `app/api/health/route.ts`:

```typescript
export async function GET() {
  // tentar backend
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error();
    return Response.json({ status: "ok", backend: "ok" });
  } catch {
    return Response.json({ status: "degraded", backend: "fail" }, { status: 503 });
  }
}
```

### Parte 6 — alarme externo

UptimeRobot (free): monitora `/api/health` do frontend a cada 5min. Email/SMS se 503 ou timeout.

## Critérios de aceitação

- [ ] Backend expõe `GET /api/health` retornando 200 ou 503 conforme DB
- [ ] Endpoint público (fora do JWT middleware)
- [ ] Frontend expõe `GET /api/health` que checa backend
- [ ] docker-compose `pg_isready` aponta para `deep_saude_db` (banco correto)
- [ ] Backend e frontend têm `healthcheck` no docker-compose, com `restart: unless-stopped`
- [ ] Plataforma de deploy configurada para usar `/api/health`
- [ ] Alerta externo configurado (UptimeRobot ou equivalente)

## Riscos / dependências

- **Atenção:** healthcheck DB com `SELECT 1` testa conectividade mas não load. Se DB está respondendo lento, healthcheck passa mas usuários estão sofrendo. Métricas de latência ([OPS-002](OPS-002-sentry-observabilidade.md)) complementam.
- **Pequeno overhead:** com `SELECT 1` a cada 30s × várias instâncias, é negligível, mas se escalar muito, considerar checar `:ok` em memória, validando DB só a cada 5min.
- **Dependência leve:** [OPS-001](OPS-001-decidir-deploy.md) — configuração de healthcheck final depende da plataforma.

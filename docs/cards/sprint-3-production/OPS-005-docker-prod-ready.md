# [OPS-005] Multi-stage build backend + resource limits + restart policy

**Severidade:** 🟡 Medium
**Sprint:** 3
**Esforço:** M (meio dia)
**Área:** Infra
**Status:** TODO

## Contexto

Três melhorias relacionadas no docker:

1. **Backend Dockerfile é single-stage**: imagem final inclui Leiningen, JDK completo, cache de deps — fica enorme (~1-2GB) e tem mais superfície de ataque.
2. **Containers sem resource limits ou restart policy**: vazamento de memória derruba o host; container morto não reinicia.
3. **Frontend Dockerfile tem `COPY public` comentado** — risco de assets faltando em produção.

## Solução proposta

### Parte 1 — Multi-stage backend Dockerfile

[deep-saude-plataforma-api/deep-saude-backend/Dockerfile](../../../deep-saude-plataforma-api/deep-saude-backend/Dockerfile):

```dockerfile
# === stage 1: build ===
FROM clojure:lein-2.11.2 AS builder
WORKDIR /app

# cache de deps separado pro layer caching ser efetivo
COPY project.clj ./
RUN lein deps

COPY src ./src
COPY resources ./resources

# uberjar = jar single-file com todas deps
RUN lein uberjar

# === stage 2: runtime ===
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# usuário não-root
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/target/uberjar/deep-saude-backend-*-standalone.jar app.jar

USER app
EXPOSE 3000

# heap tuning sane defaults
ENTRYPOINT ["java", \
  "-XX:MaxRAMPercentage=75", \
  "-XX:+UseG1GC", \
  "-XX:+ExitOnOutOfMemoryError", \
  "-jar", "app.jar"]
```

Confirmar no `project.clj` que tem `:main deep-saude-backend.core` e `:aot :all`.

**Tamanho esperado:** ~150-250MB (vs ~1.5GB atual).

### Parte 2 — Resource limits + restart policy

`docker-compose.yml` (e equivalentes em Render/Fly):

```yaml
services:
  backend:
    # ...
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'

  postgres:
    # ...
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  minio:
    # ...
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
```

⚠️ `deploy:` em docker-compose só aplica em swarm mode. Para compose normal, usar `mem_limit` e `cpus` na raiz do serviço (legacy):

```yaml
backend:
  # ...
  mem_limit: 1g
  cpus: 1.0
  restart: unless-stopped
```

Em **Render**, definir resource plan no `render.yaml`:
```yaml
plan: starter   # ou standard, pro, etc.
```

### Parte 3 — Frontend Dockerfile fix

[deep-saude-plataforma-front-end/Dockerfile:34](../../../deep-saude-plataforma-front-end/Dockerfile#L34):

Descomentar:
```dockerfile
COPY --from=builder /app/public ./public
```

Testar build local + acesso a um asset estático:
```bash
docker build -t deep-saude-front .
docker run -p 3000:3000 deep-saude-front
curl http://localhost:3000/favicon.ico
```

### Parte 4 — non-root no frontend também

```dockerfile
# após o build:
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

USER nextjs
```

### Parte 5 — `.dockerignore`

Garantir que ambos os Dockerfiles têm `.dockerignore` adequado:

```
node_modules
.next
target
.git
.env
.env.local
*.log
backups
```

## Critérios de aceitação

- [ ] Backend Dockerfile usa multi-stage build com `eclipse-temurin:17-jre-alpine`
- [ ] Imagem backend final < 300MB (`docker images deep-saude-backend`)
- [ ] Backend rodando como usuário não-root no container
- [ ] Frontend Dockerfile descomenta `COPY public`
- [ ] Frontend rodando como usuário não-root
- [ ] docker-compose tem `restart: unless-stopped` e `mem_limit` em todos os serviços
- [ ] `.dockerignore` exclui arquivos sensíveis
- [ ] Smoke test: build + run local funciona para ambos

## Riscos / dependências

- **JDK 17 vs 11:** verificar se Clojure code usa features de JDK 17. Geralmente sim. Adjust se Buddy/Ring tem incompat.
- **Heap limit:** se app usa muita memória (PDFs grandes, agendamentos massivos), 1G pode ser pouco. Monitorar em Sentry/Render dashboard depois.
- **Dependência:** [OPS-001](OPS-001-decidir-deploy.md) — plan da plataforma determina memória real disponível.

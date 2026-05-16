# [RT-002] Infraestrutura Redis (cache distribuído, pub/sub, rate limit)

**Severidade:** 🟠 High (bloqueador para Onda 2)
**Sprint:** 7
**Esforço:** M (meio dia)
**Área:** Infra / Backend
**Status:** TODO

## Contexto

Não há Redis no stack. Em escala "milhares simultâneos" e com chat real-time chegando, Redis cobre três frentes:

1. **Pub/sub entre instâncias** — sem ele, cada instância do backend só vê mensagens dos clientes conectados a ela mesma. Com 2+ instâncias, chat quebra (clientes em instâncias diferentes não recebem).
2. **Cache distribuído** — invalidação de RBAC ([PERF-003](../sprint-5-performance/PERF-003-cache-identidade-rbac.md)) cross-instance, presença online, contadores.
3. **Rate limiting distribuído** — [SEC-010](../sprint-1-security/SEC-010-rate-limiting.md) sem Redis funciona por instância (pode ser contornado batendo em instâncias diferentes); com Redis fica global.

## Localização

Novo: nenhum código hoje usa Redis. Decisão prévia: onde hospedar.

## Solução proposta

### Passo 1 — escolha de hospedagem

Depender do alvo de deploy ([OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md)):

| Plataforma | Opção |
|---|---|
| AWS | ElastiCache (Redis OSS ou Valkey) — gerenciado, com replicação |
| GCP | Memorystore for Redis |
| Render | Redis add-on (PaaS) |
| Self-hosted | Redis no Docker Compose (só dev) |

Para Onda 2 inicial (poucos milhares de usuários): 1 instância single-AZ, 1-2GB RAM. Replicação multi-AZ depois de validar uso.

### Passo 2 — cliente Clojure

```clojure
;; project.clj
[com.taoensso/carmine "3.4.1"]
```

Carmine é o cliente Redis dominante em Clojure. API limpa, suporta pipelining, scripting Lua, pub/sub.

```clojure
(ns deep-saude-backend.redis
  (:require [taoensso.carmine :as car :refer [wcar]]))

(defonce conn-pool
  (delay (car/connection-pool {})))

(def conn-spec
  {:uri (or (System/getenv "REDIS_URL") "redis://localhost:6379")})

(defn redis-conn []
  {:pool @conn-pool :spec conn-spec})

(defmacro with-redis [& body]
  `(wcar (redis-conn) ~@body))

;; uso:
(with-redis (car/set "key" "value"))
(with-redis (car/get "key"))
```

### Passo 3 — namespacing de chaves

Convenção:
```
ds:cache:rbac:{papel-id}:{permissao}        -- TTL 5min
ds:presenca:sessao:{sessao-id}              -- hash de user_id → last_seen
ds:rate:login:{ip}                          -- contador, TTL 60s
ds:rate:login:user:{email}                  -- contador, TTL 1h
ds:chat:sessao:{sessao-id}:msgs             -- stream (RT-004)
ds:chat:user:{user-id}:unread               -- contador
ds:lock:agendamento:{psi-id}:{slot}         -- distributed lock para evitar double-book
```

Prefixo `ds:` evita colisão se Redis for compartilhado (idealmente não é).

### Passo 4 — health check

Incluir Redis no `/health` ([OPS-004](../sprint-3-production/OPS-004-healthchecks.md)):

```clojure
(defn health-handler [_]
  (let [db-ok    (try (execute-one! ["SELECT 1"]) true (catch Exception _ false))
        redis-ok (try (with-redis (car/ping)) true (catch Exception _ false))]
    {:status (if (and db-ok redis-ok) 200 503)
     :body {:db db-ok :redis redis-ok}}))
```

### Passo 5 — pub/sub

```clojure
(defn publicar! [canal mensagem]
  (with-redis (car/publish canal (json/generate-string mensagem))))

(defn subscrever! [canal callback]
  (car/with-new-pubsub-listener (redis-conn)
    {canal (fn [[_ _ payload]] (callback (json/parse-string payload true)))}
    (car/subscribe canal)))
```

Detalhe: Carmine pub/sub usa conexão dedicada (não pode compartilhar com requests). Para chat ([RT-004](RT-004-websocket-chat-pubsub.md)) preferir **Redis Streams** (XADD/XREAD com consumer groups) em vez de pub/sub puro — Streams persistem mensagens e permitem replay.

### Passo 6 — TLS e auth

Em prod, conexão precisa de TLS + senha:

```bash
REDIS_URL=rediss://default:senha@redis-prod.example.com:6379
```

Carmine entende `rediss://` (com SSL). Senha em Secret Manager / env var seguro.

### Passo 7 — dev local

`docker-compose.yml`:
```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
```

### Passo 8 — observabilidade

Métricas para Sentry/Prometheus ([OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md)):
- Latência média de comando Redis
- Tamanho do pool de conexões
- Taxa de hit/miss de cache

## Critérios de aceitação

- [ ] Redis disponível em dev (docker-compose) e prod (provedor escolhido)
- [ ] Carmine adicionado em `project.clj`
- [ ] Helper `with-redis` + connection pool
- [ ] Health check inclui Redis
- [ ] Convenção de keys documentada em `docs/redis/keys.md`
- [ ] TLS + auth em prod
- [ ] Aplicação tolera Redis fora do ar (fallback in-memory ou degradação controlada — chat pode parar, RBAC cache cai para DB direto)

## Riscos / dependências

- **Custo:** Redis gerenciado adiciona ~$30-100/mês dependendo do provedor. Início com instância pequena.
- **SPOF:** sem replicação, queda do Redis trava o chat. Multi-AZ + failover quando volume justificar.
- **Dependência:** [OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md) — provedor de deploy define facilidade do Redis gerenciado.
- **Habilita:** [PERF-003](../sprint-5-performance/PERF-003-cache-identidade-rbac.md) (cache distribuído), [SEC-010](../sprint-1-security/SEC-010-rate-limiting.md) (rate limit global), [RT-004](RT-004-websocket-chat-pubsub.md) (chat pub/sub).

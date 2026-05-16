# [OPS-002] Sentry + log aggregation (frontend + backend)

**Severidade:** 🟠 High
**Sprint:** 3
**Esforço:** M (meio dia)
**Área:** Cross-cutting
**Status:** TODO

## Contexto

Sem observabilidade, em produção:
- Erros do frontend são invisíveis (browser do usuário falhou → você nunca sabe)
- Erros do backend vão pro stdout do container → some quando reinicia
- Sem métricas, não dá pra dimensionar pool, threads, etc. com dados
- Sem alertas, descobrimos problemas pelos usuários reclamando

Sentry resolve a parte de error tracking + performance traces. Pra logs estruturados e métricas, depende da plataforma escolhida ([OPS-001](OPS-001-decidir-deploy.md)) — Render tem log streaming embutido, dá pra exportar pra Logflare/Better Stack se quiser persistir.

## Solução proposta

### Frontend — Sentry Next.js

```bash
cd deep-saude-plataforma-front-end
npx @sentry/wizard@latest -i nextjs
```

Wizard cria `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, atualiza `next.config.ts`.

Configuração mínima:

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,        // 10% das requests pra performance
  replaysOnErrorSampleRate: 1.0, // sempre gravar replay em erro
  replaysSessionSampleRate: 0.0, // não gravar sessões normais
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
});
```

### Privacidade no Sentry (importante pra prontuários)

```typescript
Sentry.init({
  // ...
  beforeSend(event) {
    // remover qualquer body que possa conter PII
    if (event.request?.data) delete event.request.data;
    return event;
  },
  // mascarar inputs sensíveis no session replay:
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
```

### Backend — Sentry Clojure

`project.clj`:
```clojure
[io.sentry/sentry-clj "7.18.0"]
```

`src/deep_saude_backend/observability.clj`:
```clojure
(ns deep-saude-backend.observability
  (:require [sentry-clj.core :as sentry]))

(defn init-sentry! []
  (when-let [dsn (System/getenv "SENTRY_DSN")]
    (sentry/init! {:dsn dsn
                   :environment (or (System/getenv "ENV") "production")
                   :release (System/getenv "RELEASE_TAG")
                   :traces-sample-rate 0.1})))

(defn wrap-sentry [handler]
  (fn [request]
    (try
      (handler request)
      (catch Exception e
        (sentry/send-event {:throwable e
                            :request {:url (str (:scheme request) "://" (:server-name request) (:uri request))
                                      :method (name (:request-method request))
                                      :headers (select-keys (:headers request) ["user-agent" "x-request-id"])}})
        (throw e)))))
```

Chamar `init-sentry!` no `-main`, aplicar `wrap-sentry` antes do `wrap-error-handler`.

### Healthcheck público

Endpoint `/api/health` retorna `{:status "ok"}` rapidamente. Sentry/UptimeRobot/Render usa pra alertas.

```clojure
(GET "/api/health" []
  (try
    (execute-one! ["SELECT 1"])
    {:status 200 :body {:status "ok" :db "ok"}}
    (catch Exception _
      {:status 503 :body {:status "degraded" :db "fail"}})))
```

Cuidado: `/api/health` deve ser fora do JWT middleware.

### Métricas (opcional, nice-to-have)

Em Render/Fly, métricas básicas (CPU, RAM, latência p50/p95/p99) já vêm prontas no dashboard. Pra métricas custom de aplicação:

- `iapetos` (Clojure → Prometheus) — exporta `/metrics`, scrapeado por Grafana Cloud (free tier)
- Ou simplesmente loggar contadores no log estruturado e contar via Logflare

Pode ficar pra depois do launch. Sentry + health endpoint cobrem 80% do valor.

### Alertas

Configurar alertas no Sentry:
- Erro novo (não visto nas últimas 24h) → email/Slack
- Spike de erros (>10/min) → email/Slack
- Healthcheck falhando (via Render/UptimeRobot) → email/SMS

## Critérios de aceitação

- [ ] Sentry instalado no frontend, capturando erros JavaScript
- [ ] Sentry instalado no backend, capturando exceptions não tratadas
- [ ] `beforeSend` filtra body/PII antes de enviar
- [ ] Endpoint `/api/health` retorna 200 quando saudável, 503 quando DB inacessível
- [ ] Alertas configurados pra erros novos e healthcheck failing
- [ ] DSN e SENTRY_DSN configurados como secrets no host

## Riscos / dependências

- **Privacidade:** Sentry é processor de PII em potencial. Em contexto de saúde, **muito cuidado** com o que vai. `beforeSend` agressivo + `maskAllText` no replay são obrigatórios. Considerar self-host do Sentry se LGPD compliance for crítico.
- **Dependência:** [OPS-001](OPS-001-decidir-deploy.md) — DSN é secret, configurar via env var do host.
- **Conversa com:** [ROB-008](../sprint-2-robustness/ROB-008-logs-estruturados.md) — logs estruturados + Sentry se complementam.

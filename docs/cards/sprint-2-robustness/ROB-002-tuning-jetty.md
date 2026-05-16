# [ROB-002] Tuning do Jetty (threads, timeouts)

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** S (≤2h)
**Área:** Backend
**Status:** TODO

## Contexto

O servidor Jetty é iniciado só com `{:port port :join? false}`. Os defaults do `ring.adapter.jetty`:
- `:max-threads` = 200
- Sem `:min-threads` definido (default 8)
- Sem `:max-idle-time` ajustado (default longo)
- Sem HTTPS

200 threads é normalmente ok, mas se cada thread alocar muita memória (parsing de body grande, geração de PDF, etc.), pode estourar memória. Sem timeouts de idle, conexões abertas indefinidamente consomem file descriptors.

## Localização

[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:1297](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1297)

```clojure
(jetty/run-jetty #'app {:port port :join? false})
```

## Solução proposta

```clojure
(jetty/run-jetty #'app
  {:port port
   :join? false
   :max-threads (Integer/parseInt (or (System/getenv "JETTY_MAX_THREADS") "100"))
   :min-threads 10
   :max-queued-requests 200
   :max-idle-time 30000        ;; 30s timeout de socket idle
   :max-form-content-size (* 5 1024 1024)  ;; 5MB max no form body
   :send-server-version false  ;; não revela "Jetty/X.Y" em headers
   :send-date-header false})
```

### Sobre HTTPS

Em produção, terminar TLS no proxy/edge (Render/Fly fazem isso). O Jetty interno fica HTTP atrás do proxy. Não precisa configurar `:ssl-port` se o deploy faz proxy SSL.

Se for self-hosted, configurar:
```clojure
:ssl-port 443
:keystore "..."
:keystore-password (System/getenv "KEYSTORE_PASSWORD")
```

### Validação

Stress test simples:

```bash
# Apache Bench: 1000 requests, 50 concurrentes
ab -n 1000 -c 50 http://localhost:3000/api/healthcheck
```

Verificar que:
- Sem erros
- Tempo p95 razoável (<500ms)
- Memória do JVM não explode

## Critérios de aceitação

- [ ] `run-jetty` configurado com `:max-threads`, `:max-idle-time`, `:max-queued-requests`
- [ ] Variáveis ajustáveis por env var
- [ ] Headers `Server` e `Date` não revelam versão do Jetty
- [ ] Stress test com 50 conexões simultâneas passa sem erros

## Riscos / dependências

- **Não tem grande risco.** Mudança aditiva.
- **Próximo:** monitorar JVM heap em produção ([OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md)) para ajustar `-Xmx` adequadamente.

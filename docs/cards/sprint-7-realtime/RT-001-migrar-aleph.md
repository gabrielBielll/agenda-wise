# [RT-001] Migrar de Jetty para Aleph (async + WebSocket nativo)

**Severidade:** 🟠 High (bloqueador para Onda 2)
**Sprint:** 7
**Esforço:** L (1-2 dias)
**Área:** Backend
**Status:** TODO

## Contexto

O backend hoje roda em Jetty síncrono via `ring-jetty-adapter`. Cada request consome uma thread do pool (default ~200) até a resposta. Para HTTP/REST tradicional com tuning ([ROB-002](../sprint-2-robustness/ROB-002-tuning-jetty.md)) isto serve. Para **chat real-time**, não:

- Cada conexão WebSocket é **persistente** — ocupa uma thread o tempo todo
- 1000 usuários em chat = 1000 threads = pool esgotado
- Long-polling tem o mesmo problema (request espera 30s+)
- `ring-jetty-adapter` antigo não tem suporte WebSocket idiomático

[Aleph](https://github.com/clj-commons/aleph) (sobre Netty) é o substituto natural em Clojure: async-first, modelo non-blocking, WebSocket nativo. **Mantém o mesmo handler Ring** (chave: aceita o mesmo `(fn [request] response)`), então a migração de REST é praticamente drop-in. Para WebSocket, expõe API extra.

Alternativa: [http-kit](https://github.com/http-kit/http-kit) (mais leve, WebSocket suportado, mas com algumas limitações em HTTP/2 e backpressure). Para o tamanho atual do projeto, Aleph é a escolha mais robusta.

## Localização

- [project.clj:8](../../../deep-saude-plataforma-api/deep-saude-backend/project.clj#L8) — `ring/ring-jetty-adapter`
- [core.clj:1297](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1297) — `jetty/run-jetty`

## Solução proposta

### Passo 1 — dependência

```clojure
;; project.clj
:dependencies [;; remover [ring/ring-jetty-adapter ...]
               [aleph "0.7.1"]
               ;; manter ring/ring-core, ring/ring-json, compojure
               ]
```

### Passo 2 — substituir startup

```clojure
(require '[aleph.http :as aleph])

(defn -main [& args]
  (let [port (Integer/parseInt (or (System/getenv "PORT") "3000"))]
    (init-db)
    (aleph/start-server #'app {:port port
                               :executor :none}) ;; usa o event loop do Netty
    (println (str "Servidor rodando em :" port))))
```

A função `app` continua sendo o handler Ring atual. Compojure, middlewares JSON, CORS, JWT — tudo continua igual.

### Passo 3 — WebSocket endpoint

```clojure
(require '[aleph.http :as http]
         '[manifold.stream :as s])

(defn ws-chat-handler [request]
  (-> (http/websocket-connection request)
      (d/chain
        (fn [conn]
          ;; conn é um manifold/stream bidirecional
          (s/connect conn conn) ;; echo simples — substituir por pub/sub
          ))
      (d/catch
        (fn [_] {:status 400 :body "expected WebSocket"}))))

(defroutes ws-routes
  (GET "/ws/chat/:sessao-id" req (ws-chat-handler req)))
```

A integração real com pub/sub vai em [RT-004](RT-004-websocket-chat-pubsub.md).

### Passo 4 — pool de event loops

Aleph/Netty roda em event loops (não thread-per-request). Default é `cores * 2` threads. Para 10k conexões WebSocket simultâneas, é mais que suficiente.

Para CPU-bound (ex: hash bcrypt no login), **não** processar no event loop — usar `manifold/deferred` para mover para um pool dedicado:

```clojure
(require '[manifold.deferred :as d])

(defn login-handler [req]
  (d/future-with cpu-pool ;; executor separado
    (hashers/check senha hash)))
```

`cpu-pool` é um `ExecutorService` com `Runtime/availableProcessors` threads. Evita bloquear o event loop.

### Passo 5 — health check e shutdown

```clojure
(defonce server (atom nil))

(defn -main [& args]
  (reset! server (aleph/start-server ...))
  (.addShutdownHook (Runtime/getRuntime)
    (Thread. (fn []
               (.close @server)
               (destroy-db)))))
```

### Passo 6 — testes

Atualizar testes para usar `aleph.http/get` em vez de `ring/ring-mock` para suite de smoke. Unit tests do handler Ring continuam idênticos.

### Tuning inicial

- `:max-frame-size` (WebSocket): 65536 bytes default — ok para chat textual; limita anexo grande
- `:max-frame-payload` no Netty: limita ataque de DoS via WebSocket
- Backpressure: usar `s/put!` com `s/buffer` para evitar OOM se cliente lento

## Critérios de aceitação

- [ ] `aleph` substitui `ring-jetty-adapter` no `project.clj`
- [ ] App sobe e responde HTTP/REST exatamente igual ao Jetty
- [ ] Endpoint WebSocket de teste (`/ws/echo`) funciona
- [ ] Login com bcrypt roda em executor separado, não bloqueia event loop
- [ ] Smoke test: 100 conexões WebSocket simultâneas, todas respondem ping/pong
- [ ] Métricas: latência P99 de REST não regride vs Jetty
- [ ] Graceful shutdown (SIGTERM fecha conexões com 5s grace)

## Riscos / dependências

- **Compatibilidade Ring:** quase tudo funciona, mas alguns middlewares de Jetty assumem `HttpServletRequest` — verificar `wrap-cors`, `wrap-multipart-params` se for o caso.
- **Sem `:async-timeout`:** Aleph usa cancelamento via manifold timeouts. Aplicar em handlers que podem travar.
- **Curva de aprendizado:** Manifold (`deferred`, `stream`) é diferente de `core.async`. Documentar padrões.
- **Bloqueia [RT-002](RT-002-redis-infra.md), [RT-003](RT-003-schema-mensagens-chat.md), [RT-004](RT-004-websocket-chat-pubsub.md)** — todos dependem de Aleph estar em produção.
- **Conversa com:** [ROB-002](../sprint-2-robustness/ROB-002-tuning-jetty.md) — após Aleph, o tuning de Jetty fica obsoleto; remover.

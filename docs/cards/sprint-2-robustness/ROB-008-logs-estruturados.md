# [ROB-008] Logs estruturados — timbre no backend, remover console.log no frontend

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** M (meio dia)
**Área:** Cross-cutting
**Status:** TODO

## Contexto

Hoje o backend usa `println` espalhado, sem nível, sem categoria, sem campos estruturados. O frontend tem `console.log` por todo canto, alguns vazando PII ([SEC-009](../sprint-1-security/SEC-009-remover-logs-sensíveis.md) já removeu os mais críticos, este card completa a refatoração).

Em produção, isso significa:
- Logs não filtram por severidade (não dá pra ligar/desligar debug)
- Não dá pra extrair métricas (quantos logins/min, quantas falhas, etc.)
- Não dá pra correlacionar request → backend → DB (sem request-id)

## Solução proposta

### Backend — timbre

`project.clj`:
```clojure
[com.taoensso/timbre "6.5.0"]
[com.fzakaria/slf4j-timbre "0.4.1"]   ;; pra capturar logs de bibliotecas (HikariCP, Jetty)
```

`src/deep_saude_backend/logging.clj`:
```clojure
(ns deep-saude-backend.logging
  (:require [taoensso.timbre :as log]
            [cheshire.core :as json]))

(defn json-output [data]
  (let [{:keys [level msg_ timestamp_ ?ns-str ?file ?line context]} data]
    (json/generate-string
      (merge {:ts (force timestamp_)
              :level (str level)
              :ns ?ns-str
              :msg (force msg_)}
             context))))

(log/merge-config!
  {:appenders {:println {:enabled? true
                          :output-fn json-output}}
   :min-level (case (or (System/getenv "LOG_LEVEL") "info")
                "debug" :debug
                "info"  :info
                "warn"  :warn
                "error" :error)})
```

### Uso no código

```clojure
(require '[taoensso.timbre :as log])

;; antes:
(println "DEBUG LOGIN: Tentativa de login para email:" email)

;; depois (sem PII):
(log/info "login_attempt" {:user_hash (sha256 email)})

;; sucesso:
(log/info "login_success" {:user_id (:id usuario) :role (:nome_papel papel)})

;; falha:
(log/warn "login_failed" {:reason "invalid_credentials"})
```

### Request-id pra rastreamento

```clojure
(defn wrap-request-id [handler]
  (fn [request]
    (let [req-id (or (get-in request [:headers "x-request-id"])
                     (str (java.util.UUID/randomUUID)))]
      (log/with-context {:request_id req-id}
        (let [response (handler request)]
          (assoc-in response [:headers "X-Request-ID"] req-id))))))
```

Aplicar no `wrap-everything` antes dos outros middlewares.

### Frontend — remover console.log

```bash
grep -rn "console\.\(log\|warn\|debug\|info\)" deep-saude-plataforma-front-end/src/
```

Deletar tudo que for puramente debug. Substituir logs úteis por chamadas ao Sentry ([OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md)).

Opcionalmente, adicionar lint rule pra prevenir reintroduzir:

`.eslintrc.json`:
```json
{
  "rules": {
    "no-console": ["error", { "allow": ["error"] }]
  }
}
```

### Cuidado: nunca logar

- Senhas (mesmo "tentativa")
- Tokens (mesmo parciais)
- Hashes de senha
- Conteúdo de prontuários
- Email completo (usar hash se precisar correlacionar)
- CPF, telefone, endereço de pacientes

### Configurar níveis por ambiente

```bash
# dev
LOG_LEVEL=debug

# prod
LOG_LEVEL=info
```

## Critérios de aceitação

- [ ] Backend usa `timbre` em formato JSON em produção
- [ ] `grep -n "println" deep-saude-plataforma-api/deep-saude-backend/src/` só retorna ocorrências em `-main` ou comentários
- [ ] Cada response tem header `X-Request-ID` único
- [ ] Lint do frontend bloqueia `console.log` (mantém `console.error`)
- [ ] Logs em produção não contêm PII (auditar com `grep` no log streamado)

## Riscos / dependências

- **Esforço variável** dependendo de quantos println existem (estimei ~50 ocorrências entre core.clj e arquivos relacionados).
- **Conversa com:** [OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md) — Sentry consome esses logs estruturados melhor.
- **Dependência soft:** [SEC-009](../sprint-1-security/SEC-009-remover-logs-sensíveis.md) já removeu os logs mais perigosos — este card é a versão "completa".

# [ROB-009] Limite de payload + erros sem vazar stack traces

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** S (≤2h)
**Área:** Backend
**Status:** TODO

## Contexto

Dois problemas relacionados:

1. **Sem limite de payload:** `wrap-json-body` sem `:max-body-size` aceita JSON de tamanho arbitrário. Atacante envia 100MB → parser tenta processar → memória estoura.

2. **Stack traces nas responses 500:** vários handlers fazem `{:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}}` que vaza mensagens internas. Pior: alguns chamam `.printStackTrace` que joga stack inteiro nos logs (e em logs mal configurados, no body também).

## Localizações

### Limite de payload
[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:1217](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1217)

```clojure
(middleware-json/wrap-json-body {:keywords? true})
```

### Stack traces vazando
- [core.clj:545-548](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L545-L548) (criar-agendamento)
- [core.clj:707-710](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L707-L710) (atualizar-agendamento)
- [core.clj:748-751](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L748-L751) (remover-agendamento)
- (procurar por `Erro interno:` no arquivo todo)

## Solução proposta

### Passo 1 — limite de payload

```clojure
(middleware-json/wrap-json-body
  {:keywords? true
   :max-body-size (* 1 1024 1024)  ;; 1MB
   :malformed-response {:status 400
                        :headers {"Content-Type" "application/json"}
                        :body "{\"erro\":\"Body inválido\"}"}})
```

1MB é generoso para a maioria dos endpoints. Endpoints que aceitam upload (anexos de prontuário) devem ter rota separada com limite diferente (e ir direto pro MinIO, não pelo JSON).

### Passo 2 — wrap global de error handling

```clojure
(defn wrap-error-handler [handler]
  (fn [request]
    (try
      (handler request)
      (catch IllegalArgumentException e
        (log/warn "bad_request" {:err (.getMessage e)})
        {:status 400 :body {:erro "Requisição inválida."}})
      (catch java.sql.SQLException e
        (log/error "db_error" {:err (.getMessage e) :sqlstate (.getSQLState e)})
        {:status 500 :body {:erro "Erro de banco de dados."}})
      (catch Exception e
        (log/error e "unhandled_error")
        {:status 500 :body {:erro "Erro interno do servidor."}}))))
```

### Passo 3 — remover try/catch redundantes nos handlers

Depois do wrap global, a maioria dos `try/catch (catch Exception e ...)` nos handlers individuais pode sair. Eles existem por desconfiança histórica — agora podem confiar no wrap.

```clojure
;; antes:
(POST "/api/agendamentos" req
  (try
    (criar-agendamento-handler req)
    (catch Exception e
      (.printStackTrace e)
      {:status 500 :body {:erro (str "Erro interno: " (.getMessage e))}})))

;; depois (com wrap-error-handler aplicado):
(POST "/api/agendamentos" req (criar-agendamento-handler req))
```

### Passo 4 — proteção contra UUID malformado

Antes do wrap global processar IllegalArgumentException, fazer parsing seguro. Helper já mencionado em [ROB-003](ROB-003-validacao-input.md):

```clojure
(defn ->uuid [s]
  (try (java.util.UUID/fromString s)
       (catch Exception _ nil)))

(defn require-uuid [s erro-msg]
  (or (->uuid s)
      (throw (IllegalArgumentException. erro-msg))))
```

### Passo 5 — body vs log

Regra: o **body** da response 500 é genérico. O **log** tem detalhes. Cliente nunca vê `.getMessage`, `.printStackTrace`, SQL state, nome de tabela.

## Critérios de aceitação

- [ ] `wrap-json-body` configurado com `:max-body-size` 1MB
- [ ] `wrap-error-handler` aplicado globalmente
- [ ] Responses 500 não contêm mais `.getMessage` ou stack traces — só "Erro interno do servidor."
- [ ] Erros são logados via timbre (não println), incluindo stack trace só no log
- [ ] Smoke test: enviar JSON de 5MB → 413 (payload too large)
- [ ] Smoke test: UUID malformado → 400, não 500

## Riscos / dependências

- **Dependência:** [ROB-008](ROB-008-logs-estruturados.md) — usar timbre em vez de println.
- **Conversa com:** [ROB-003](ROB-003-validacao-input.md) — validação cobre boa parte dos 400s antes mesmo de chegar no handler.

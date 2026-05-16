# [ROB-003] Validação de input no backend com malli

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** L (1-2 dias)
**Área:** Backend
**Status:** TODO

## Contexto

Hoje, todos os handlers desestruturam `:body` direto e usam os campos sem validação:

```clojure
(let [{:keys [nome email telefone data_nascimento ...]} (:body request)]
  ...
  :data_nascimento (when data_nascimento (Date/valueOf data_nascimento))
  ...)
```

Problemas:
1. `data_nascimento = "2026-13-45"` → `IllegalArgumentException` não-tratada → 500 + stack trace ao cliente
2. `email = ""` ou ausente → criação inconsistente no DB
3. `valor_consulta = "abc"` → erro de coerção tardia
4. UUIDs malformados crasham em `UUID/fromString`
5. Campos extras no body são silenciosamente aceitos (vai pro DB se for usado)
6. Sem proteção contra payload gigante (DoS por JSON enorme)

A solução é validação declarativa com [malli](https://github.com/metosin/malli) ou `clojure.spec`. Malli é mais ergonômico e tem boa integração com Ring.

## Solução proposta

### Passo 1 — adicionar malli ao `project.clj`

```clojure
[metosin/malli "0.16.1"]
[metosin/reitit-malli "0.7.2"]  ;; se for migrar pra reitit (opcional)
```

### Passo 2 — definir schemas dos endpoints principais

Criar `src/deep_saude_backend/schemas.clj`:

```clojure
(ns deep-saude-backend.schemas
  (:require [malli.core :as m]
            [malli.util :as mu]))

(def Email
  [:re #"^[^@\s]+@[^@\s]+\.[^@\s]+$"])

(def UUID
  [:re #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"])

(def DataISO
  [:re #"^\d{4}-\d{2}-\d{2}$"])

(def LoginRequest
  [:map
   [:email Email]
   [:senha [:string {:min 6 :max 200}]]])

(def CriarPacienteRequest
  [:map
   [:nome [:string {:min 1 :max 200}]]
   [:email {:optional true} Email]
   [:telefone {:optional true} [:string {:max 20}]]
   [:data_nascimento {:optional true} DataISO]
   [:psicologo_id {:optional true} UUID]
   ;; ...
   ])

;; ... outros schemas
```

### Passo 3 — middleware de validação

```clojure
(defn wrap-validate-body [handler schema]
  (fn [request]
    (let [body (:body request)
          errors (m/explain schema body)]
      (if errors
        {:status 400
         :body {:erro "Dados inválidos"
                :detalhes (-> errors me/humanize)}}
        (handler request)))))
```

### Passo 4 — aplicar nos handlers

```clojure
(POST "/api/auth/login" req
  ((wrap-validate-body login-handler schemas/LoginRequest) req))

(POST "/api/pacientes" req
  ((-> criar-paciente-handler
       (wrap-validate-body schemas/CriarPacienteRequest)
       (wrap-checar-permissao "gerenciar_pacientes"))
   req))
```

### Passo 5 — tratar coerção (datas, UUIDs)

Em vez de `Date/valueOf` cru, criar helper:

```clojure
(defn ->sql-date [s]
  (when s (try (java.sql.Date/valueOf s) (catch Exception _ nil))))

(defn ->uuid [s]
  (when s (try (java.util.UUID/fromString s) (catch Exception _ nil))))
```

E aplicar consistentemente:

```clojure
:data_nascimento (->sql-date data_nascimento)
:psicologo_id   (->uuid psicologo_id)
```

### Passo 6 — limite de payload (relacionado a ROB-009)

```clojure
(middleware-json/wrap-json-body {:keywords? true
                                  :malformed-response {:status 400 :body {:erro "JSON inválido"}}
                                  :max-body-size (* 1 1024 1024)})  ;; 1MB
```

### Passo 7 — escopo de migração

Não dá pra fazer todos os endpoints de uma vez. Priorizar:
1. `/api/auth/login` (alvo de ataque)
2. `/api/admin/provisionar-clinica` (cria entidades)
3. `/api/pacientes` POST/PUT (PII)
4. `/api/agendamentos` POST/PUT (lógica complexa)
5. Resto incremental

## Critérios de aceitação

- [ ] Malli instalada e funcional
- [ ] Pelo menos os 4 endpoints prioritários (login, provisionar, pacientes POST/PUT, agendamentos POST/PUT) com validação
- [ ] Helpers `->sql-date` e `->uuid` substituíram coerções diretas nos endpoints validados
- [ ] Smoke test: enviar email mal formado → 400 com mensagem amigável
- [ ] Smoke test: enviar UUID malformado → 400, não 500

## Riscos / dependências

- **Esforço maior** se decidir migrar pra reitit-ring (router que integra malli nativo). Pode ser feito incremental.
- **Refatoração paralela:** boa hora pra extrair handlers de `core.clj` para `routes/`, `services/`, `repos/`. Fora do escopo deste card, mas anote.
- **Dependência:** [SEC-009](../sprint-1-security/SEC-009-remover-logs-sensíveis.md) — não logar payload validado em modo erro pra não vazar PII.

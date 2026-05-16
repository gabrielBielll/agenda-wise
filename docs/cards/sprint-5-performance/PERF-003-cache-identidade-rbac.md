# [PERF-003] Cache de identidade e RBAC em memória

**Severidade:** 🟠 High
**Sprint:** 5
**Esforço:** M (meio dia)
**Área:** Backend
**Status:** TODO

## Contexto

A cada request autenticado, o backend hoje:

1. Decodifica + verifica assinatura do JWT (`buddy.sign.jwt/unsign`) — CPU
2. Em endpoints sob `wrap-permissao`, faz `SELECT pp.permissao_id FROM papel_permissoes pp JOIN permissoes p ON ... WHERE pp.papel_id = ? AND p.nome_permissao = ?` — DB roundtrip

Os dados de papel + permissões mudam **muito raramente** (alteração manual de config). Validar JWT e fazer lookup de permissão a cada request é desperdício de CPU e conexão.

Em escala "milhares de simultâneos", isso é dezenas de milhares de SELECTs/min só de RBAC.

## Localização

- [core.clj:108-126](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L108-L126) — `wrap-jwt-autenticacao`
- [core.clj:128-149](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L128-L149) — `wrap-permissao`
- [core.clj:~194, 244, 314, 369, 826](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L194) — vários SELECTs de `nome_papel` por handler

## Solução proposta

### Camada 1 — cache de claims JWT (TTL curto)

JWT é stateless; a verificação é determinística (chave + payload). Mas é CPU. Cache por string-do-token com TTL pequeno (60s) é seguro e barato.

```clojure
(require '[clojure.core.cache.wrapped :as cache])

(def claims-cache
  (cache/ttl-cache-factory {} :ttl 60000)) ;; 60s

(defn verify-token-cached [token]
  (cache/lookup-or-miss
    claims-cache token
    (fn [_] (jwt/unsign token jwt-secret {:alg :hs256}))))
```

Resultado: o mesmo token usado por múltiplas requests em 1 minuto é verificado **uma vez**. Custa ~200 bytes/entry em memória; cap de 10k entries = 2MB, suficiente.

### Camada 2 — cache de RBAC (TTL maior)

Permissões por papel mudam raramente. Cache por `(papel-id, nome-permissao)`:

```clojure
(def permissao-cache
  (cache/ttl-cache-factory {} :ttl 300000)) ;; 5min

(defn tem-permissao? [papel-id nome-permissao]
  (cache/lookup-or-miss
    permissao-cache [papel-id nome-permissao]
    (fn [_]
      (some? (execute-one!
        ["SELECT 1 FROM papel_permissoes pp
          JOIN permissoes p ON pp.permissao_id = p.id
          WHERE pp.papel_id = ? AND p.nome_permissao = ?"
         papel-id nome-permissao])))))
```

### Camada 3 — cache de "usuario lookup" no login

Pequeno ganho, mas o `SELECT * FROM usuarios WHERE email = ?` no login é exemplo de query que se repete em sequência (em caso de force-login + retry). TTL de 10s, opcional.

### Invalidação

- Update de papel/permissão (admin altera RBAC) → `(cache/evict permissao-cache ...)` na própria mutation
- Logout/troca de senha → invalidar entries do token (mas TTL 60s é tão curto que pode ignorar)

### Implementação como middleware

```clojure
(defn wrap-jwt-autenticacao-cached [handler]
  (fn [request]
    (if-let [token (extract-bearer request)]
      (try
        (let [claims (verify-token-cached token)]
          (handler (assoc request :identity claims)))
        (catch Exception e
          {:status 401 :body {:erro "token inválido"}}))
      {:status 401 :body {:erro "ausente"}})))
```

### Em multi-instância

Para 2+ instâncias do backend, o cache local fica desincronizado por até 5min em alterações de RBAC. Aceitável para o caso de uso (mudança rara, propagação eventual). Se precisar de invalidação global, virar [RT-002](../sprint-7-realtime/RT-002-redis-infra.md) (Redis) — não é necessário agora.

## Critérios de aceitação

- [ ] `core.cache` adicionado em `project.clj`
- [ ] `verify-token-cached` com TTL 60s substitui chamada direta a `jwt/unsign` no middleware
- [ ] `tem-permissao?` com TTL 5min substitui SELECT direto em `wrap-permissao`
- [ ] Invalidação explícita em handlers de alteração de RBAC
- [ ] Bench: 1000 requests sequenciais com mesmo token mostram ~1 hit DB para RBAC (era 1000)
- [ ] Smoke: alteração de permissão por admin reflete em <5min em endpoints

## Riscos / dependências

- **Memória:** cap as TTL caches (max entries 10k) para não crescer sem limite. `clojure.core.cache` suporta `lu-cache-factory` para limite de tamanho.
- **Multi-instância:** ver nota acima — drift de até 5min em RBAC.
- **Security:** TTL de 60s no token significa que revogação manual de JWT demora até 60s. Aceitável (JWTs são curtos por design).
- **Conversa com:** [SEC-004](../sprint-1-security/SEC-004-verificar-jwt-middleware.md) — cache só pode entrar **depois** que a verificação de assinatura estiver correta.

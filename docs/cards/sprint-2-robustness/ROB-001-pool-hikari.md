# [ROB-001] Configurar pool HikariCP explícito

**Severidade:** 🔴 Critical
**Sprint:** 2
**Esforço:** S (≤2h)
**Área:** Backend
**Status:** TODO

## Contexto

O datasource JDBC é criado via `jdbc/get-datasource` sem nenhuma configuração de pool. Isso usa defaults do HikariCP (que `next.jdbc` traz por baixo) — mas defaults podem não ser adequados para o ambiente: pool size de 10 conexões pode ser pouco demais ou demais, timeouts podem ser inadequados para latência de rede até o CockroachDB.

Em produção, com requisições concorrentes, esse é um dos primeiros pontos a explodir: pool esgota → requests ficam aguardando → timeouts em cascata.

## Localização

[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:50](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L50)

```clojure
(defonce datasource (delay (jdbc/get-datasource @db-spec)))
```

## Solução proposta

Configurar HikariCP explicitamente. Adicionar ao `project.clj` (se ainda não estiver):

```clojure
[com.zaxxer/HikariCP "5.1.0"]
```

E no `core.clj`:

```clojure
(ns deep-saude-backend.core
  (:require [next.jdbc :as jdbc]
            [next.jdbc.connection :as connection])
  (:import [com.zaxxer.hikari HikariDataSource]))

(def db-spec
  {:dbtype   "postgresql"
   :jdbcUrl  (System/getenv "DATABASE_URL")
   ;; pool config:
   :maximumPoolSize    20        ;; ajuste por carga
   :minimumIdle        5
   :connectionTimeout  30000     ;; 30s pra obter conexão do pool
   :idleTimeout        600000    ;; 10min ociosa → close
   :maxLifetime        1800000   ;; 30min total → recicla
   :leakDetectionThreshold 60000 ;; alerta se conexão não retornar em 60s
   :poolName           "deep-saude-pool"})

(defonce datasource
  (delay (connection/->pool HikariDataSource db-spec)))
```

### Como dimensionar `maximumPoolSize`

Regra do polegar: `nº de cores DB × 2 + 1`. Para CockroachDB Cloud com plano básico, 10-20 é razoável. Em prod, monitorar `pool.active` e `pool.pending` — se `pending > 0` consistentemente, aumentar.

### Outras melhorias

- Substituir `db-spec` que monta connection string manualmente por `:jdbcUrl` direto, evitando parse de URL repetido
- Validar com `jdbc/execute! "SELECT 1"` no startup para falhar rápido se DB inacessível

## Critérios de aceitação

- [ ] Pool HikariCP configurado com `:maximumPoolSize`, `:minimumIdle`, `:connectionTimeout`, `:idleTimeout`, `:maxLifetime`, `:leakDetectionThreshold`
- [ ] Startup do backend faz `SELECT 1` e falha rápido se DB inacessível
- [ ] Sob carga sintética (10 requests simultâneos), não vê deadlocks nem timeouts no log

## Riscos / dependências

- **Atenção:** se `maximumPoolSize` for muito alto, sobrecarrega o CockroachDB. Começar conservador (10-15) e subir só se métricas mostrarem espera.
- **Próximo:** [OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md) traz métricas que permitem dimensionar com dados.
- **Compatibilidade:** `connection/->pool` requer `next.jdbc 1.3.0+`. Conferir versão atual no `project.clj`.

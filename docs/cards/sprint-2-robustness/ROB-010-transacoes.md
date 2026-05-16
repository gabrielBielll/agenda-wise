# [ROB-010] Transações em writes multi-statement

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** M (meio dia)
**Área:** Backend
**Status:** TODO

## Contexto

Vários handlers executam múltiplos INSERTs/UPDATEs sem agrupar em transação. Se o segundo statement falha, o primeiro fica órfão. Exemplo crítico: `provisionar-clinica-handler` cria a clínica E o usuário admin em statements separados — se a criação do admin falhar, a clínica fica sem responsável.

## Localizações

### `provisionar-clinica-handler`
[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:169-185](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L169-L185)

```clojure
(let [nova-clinica (sql/insert! @datasource :clinicas {...})]
  (let [novo-admin (sql/insert! @datasource :usuarios {:clinica_id (:id nova-clinica) ...})]
    ...))
```

### `criar-bloqueio-handler` (~linha 937)
Múltiplos inserts pra bloqueios em série, sem transação.

### `criar-agendamento-handler` com recorrência (~linha 516+)
Insere série de agendamentos, sem transação. Se quarto insert falhar, três ficam órfãos.

## Solução proposta

### Padrão com `next.jdbc`

```clojure
(require '[next.jdbc :as jdbc])

(jdbc/with-transaction [tx @datasource]
  (let [nova-clinica (sql/insert! tx :clinicas {...} {:return-keys [:id]})
        novo-admin   (sql/insert! tx :usuarios {:clinica_id (:id nova-clinica) ...}
                                  {:return-keys [:id :email]})]
    (when-not novo-admin
      (throw (ex-info "Falha ao criar admin" {})))
    {:status 201 :body {:clinica nova-clinica :usuario_admin novo-admin}}))
```

Qualquer exception dentro do `with-transaction` faz rollback automático.

### Auditar handlers a converter

```bash
grep -n "sql/insert!\|sql/update!\|sql/delete!" deep-saude-plataforma-api/deep-saude-backend/src/**/*.clj
```

Marcar todos que fazem >1 mutation. Lista esperada:
- [x] `provisionar-clinica-handler`
- [ ] `criar-agendamento-handler` (recorrência)
- [ ] `atualizar-agendamento-handler` (mode = "all_future")
- [ ] `criar-bloqueio-handler` (série de bloqueios)
- [ ] `criar-prontuario-handler` (se atualiza paciente + cria prontuario)
- [ ] outros conforme auditoria

### Cuidado com isolation level

CockroachDB usa SERIALIZABLE por default — boa proteção mas pode causar `40001 serialization_failure` em concorrência alta. Implementar retry em loop curto:

```clojure
(defn with-retry [n f]
  (loop [tentativas n]
    (let [result (try {:ok (f)}
                       (catch java.sql.SQLException e
                         (if (= "40001" (.getSQLState e))
                           {:retry true}
                           (throw e))))]
      (cond
        (:ok result) (:ok result)
        (and (:retry result) (pos? tentativas)) (do (Thread/sleep 50) (recur (dec tentativas)))
        :else (throw (ex-info "Conflict não resolvido" {}))))))
```

Aplicar em mutations sob carga concorrente conhecida (ex: dois admins criando agendamentos no mesmo slot).

## Critérios de aceitação

- [ ] `provisionar-clinica` envolto em `with-transaction`
- [ ] Criação de série recorrente em `with-transaction`
- [ ] Update de "all_future" em `with-transaction`
- [ ] Smoke test: simular falha no segundo insert (criar admin com email duplicado) → clínica também não é criada
- [ ] (Opcional) Helper `with-retry` aplicado em mutations críticas

## Riscos / dependências

- **Atenção:** dentro de transação, usar SEMPRE o `tx` argument, não `@datasource`. Se chamar funções helper que recebem `tx` como primeiro arg, refatorar pra passar.
- **Conversa com:** [ROB-007](ROB-007-n-plus-1-recorrencias.md) — algumas mutations N+1 viram 1 query batch após o fix, eliminando necessidade de transação grande.

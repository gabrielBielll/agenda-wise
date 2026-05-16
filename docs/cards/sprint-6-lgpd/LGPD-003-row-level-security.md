# [LGPD-003] Row-Level Security por clinica_id (defesa em profundidade)

**Severidade:** 🟠 High
**Sprint:** 6
**Esforço:** L (1-2 dias)
**Área:** DB / Backend
**Status:** TODO

## Contexto

Multi-tenancy hoje depende **100% da lógica de aplicação** para filtrar `WHERE clinica_id = ?` corretamente. Toda query que faltar esse filtro vaza dados entre tenants.

Cenários reais de vazamento:
- Bug em extract do JWT (`clinica_id` resolvido errado) → queries usam tenant errado
- Query nova esquecendo o `WHERE clinica_id` → SELECT cross-tenant
- Endpoint admin que aceita `clinica_id` do body → bypass do JWT
- SQL injection futuro → bypass total

Row-Level Security (RLS) do Postgres/CockroachDB resolve isso na camada do banco: **mesmo que a query não filtre por `clinica_id`, o DB retorna apenas as rows do tenant da sessão**. É defesa em profundidade.

Para dados de saúde sob LGPD, defesa em profundidade não é luxo — é exigência razoável de "boas práticas técnicas".

## Localização

Aplicar nas tabelas com `clinica_id`:
- `usuarios`
- `pacientes`
- `agendamentos`
- `prontuarios`
- `bloqueios_agenda`
- `audit_log` (após [LGPD-001](LGPD-001-audit-log.md))

## Solução proposta

### Passo 1 — habilitar RLS nas tabelas

```sql
ALTER TABLE pacientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prontuarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueios_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;
```

### Passo 2 — criar policy por tabela

```sql
CREATE POLICY tenant_isolation ON pacientes
  USING (clinica_id = current_setting('app.current_clinica_id')::uuid);

CREATE POLICY tenant_isolation ON agendamentos
  USING (clinica_id = current_setting('app.current_clinica_id')::uuid);

-- ... análogo para as outras tabelas
```

`current_setting('app.current_clinica_id')` é um setting customizado da sessão do Postgres. O backend deve setar antes de cada query.

### Passo 3 — backend seta o setting por request

```clojure
(defn wrap-rls-context [handler]
  (fn [request]
    (if-let [clinica-id (get-in request [:identity :clinica-id])]
      (jdbc/with-transaction [tx @datasource]
        ;; SET LOCAL não persiste fora da transação
        (jdbc/execute! tx
          [(str "SET LOCAL app.current_clinica_id = '" clinica-id "'")])
        ;; injeta `tx` em vez de @datasource para o handler usar
        (handler (assoc request :tx tx)))
      (handler request))))
```

E os handlers passam a usar `(:tx request)` em vez de `@datasource`.

**Atenção:** isto força transação em **toda** request. Em prática é ok com pool ([ROB-001](../sprint-2-robustness/ROB-001-pool-hikari.md)) e queries idempotentes. Para reads pesados, pode-se ter rota especial sem transação se medir custo.

Alternativa: usar **role do banco** específico por clínica. Mais complexo, mas evita transação obrigatória. Não recomendo para o estágio atual.

### Passo 4 — bypass para superuser/migrations

Migrations e jobs precisam ler/escrever cross-tenant. Manter um user de banco separado (`migrator`, `bg_job`) com `BYPASSRLS`:

```sql
CREATE ROLE migrator BYPASSRLS;
GRANT ALL ON ALL TABLES IN SCHEMA public TO migrator;
```

E garantir que o **app** roda como user normal (sem `BYPASSRLS`):

```sql
CREATE ROLE app_runtime LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
-- sem BYPASSRLS
```

### Passo 5 — caso especial: admin cross-clinica

Se houver superadmin Deep Saúde (não da clínica), criar policy adicional:

```sql
CREATE POLICY admin_global ON pacientes
  USING (current_setting('app.current_role', true) = 'superadmin');
```

Setting `app.current_role` é setado no middleware quando JWT indica superadmin.

### CockroachDB specifics

CRDB **suporta RLS** desde v22.2 com sintaxe compatível com Postgres. Confirmar versão atual. Se for anterior, este card precisa esperar upgrade.

### Testes

Criar teste de regressão:
```clojure
(deftest rls-isolamento
  (testing "Não retorna pacientes de outra clínica"
    (jdbc/with-transaction [tx ds]
      (jdbc/execute! tx ["SET LOCAL app.current_clinica_id = ?" clinica-a])
      (let [pacientes (jdbc/execute! tx ["SELECT * FROM pacientes"])]
        (is (every? #(= clinica-a (:clinica_id %)) pacientes))))))
```

## Critérios de aceitação

- [ ] RLS habilitado em todas as tabelas tenant
- [ ] Policy `tenant_isolation` criada
- [ ] Middleware `wrap-rls-context` no pipeline (após `wrap-jwt-autenticacao`)
- [ ] User de banco do app **não** tem `BYPASSRLS`
- [ ] User separado (`migrator`/`bg_job`) com `BYPASSRLS` para migrations e cronjobs
- [ ] Teste automatizado de isolamento entre 2 clínicas
- [ ] Documentação `docs/security/rls.md` explicando o modelo

## Riscos / dependências

- **Cada request fica em transação:** ver passo 3. Avaliar overhead — em prática é micro-segundos por request, vale a defesa em profundidade.
- **CRDB version:** confirmar suporte RLS na versão do CockroachDB Cloud em uso.
- **Jobs/Migratus precisam de bypass:** ver passo 4. Documentar quais users existem.
- **Dependência:** [ROB-001](../sprint-2-robustness/ROB-001-pool-hikari.md) — pool é pré-requisito de ter transação por request com baixo overhead.
- **Dependência:** [SEC-006](../sprint-1-security/SEC-006-rbac-granular-admin.md) — admin não pode ter bypass total no app; deve ser policy explícita.
- **Não substitui:** filtros `WHERE clinica_id = ?` no app. Os dois trabalham juntos.

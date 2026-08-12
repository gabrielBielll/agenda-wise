# Verificação pendente — o que só roda numa máquina com o projeto de pé

> Escrito em 2026-08-12, para ser executado por uma instância com capacidade de compilar e rodar o projeto.
> Contexto: [auditoria de agosto](AUDITORIA_2026-08.md).

## Por que este documento existe

Todas as alterações das últimas rodadas foram feitas num ambiente **sem acesso ao Clojars**. Isso significa que o backend **nunca foi compilado**. O que foi verificado, e como:

| Verificado | Como |
|---|---|
| Migrations | Aplicadas contra PostgreSQL 16 real: up sobre banco com dados, down, instalação limpa |
| Ganho dos índices | `EXPLAIN ANALYZE` com 240 mil agendamentos |
| Conversão de fuso | Round-trip real com JVM em UTC: caminho novo grava 14:00, antigo gravava 11:00 |
| Tipo devolvido pelo JDBC | `getObject` em `TIMESTAMPTZ` devolve `java.sql.Timestamp` — mesma classe de antes, logo o formato do JSON da API não muda |
| Namespaces puros | 158 asserções (`tempo`, `rrule`, `cripto`, `vinculos`, `dominio`, `limites`) |
| Sintaxe e referências | Reader do Clojure + `dev/checa_refs.clj` (resolve aliases, confere aridade, entende threading) |
| Frontend | `next build` passa com type check ligado |

**O que NÃO foi verificado:** compilação de `core.clj`, boot da aplicação, e qualquer comportamento em tempo de execução.

---

## Gate 0 — Compilar 🔴 PARE AQUI SE FALHAR

Nada abaixo importa se isto falhar.

```bash
cd deep-saude-plataforma-api/deep-saude-backend
lein deps
lein test
```

**Esperado:** 158+ asserções, 0 falhas.

**Se falhar:** o mais provável são erros de compilação em `core.clj`, que teve edições extensas sem compilador. Suspeitos, em ordem:

1. `atualizar-agendamento-handler` — ganhou um `if-let` extra para validação de domínio e teve parênteses balanceados à mão. A estrutura foi conferida por análise da AST (4 `if-let`, todos com 2 ramos), mas isso não é compilação.
2. `criar-agendamento-handler` — `jdbc/with-transaction` novo em volta dos inserts, com `tx` no lugar de `@datasource`.
3. `db.clj` — `connection/->pool` com `HikariDataSource`; conferir se as chaves do pool são aceitas nesta versão do next.jdbc.
4. Requires novos em `core.clj`: `migratus.core`, `deep-saude-backend.db`, `.tempo`, `.dominio`, `.limites`, `.google.rrule`, `.google.handlers`.

**Reporte:** a saída completa do erro, não só a última linha.

---

## Gate 1 — Migrations no banco real 🔴

⚠️ **Ponto de maior risco de todo o trabalho.** As migrations foram testadas em PostgreSQL, mas a produção é **CockroachDB**, e `ALTER COLUMN ... TYPE` tem suporte limitado lá.

```sql
-- Se a migration de fuso falhar, é quase certo que seja isto:
SET enable_experimental_alter_column_type_general = true;
```

**Teste contra uma cópia do banco de produção, nunca contra produção.**

```bash
# restaurar um dump em um banco descartável, depois:
DATABASE_URL=<banco-de-teste> lein run
```

**Verificar, em ordem:**

1. Migratus cria `schema_migracoes` e aplica as 4 migrations
2. A baseline é no-op num banco que já tem as tabelas (não deve dar erro)
3. `data_hora_sessao` vira `TIMESTAMPTZ` **preservando o horário de parede** — este é o teste que importa:

```sql
-- ANTES da migration, anote alguns valores:
SELECT id, data_hora_sessao FROM agendamentos ORDER BY data_hora_sessao DESC LIMIT 5;

-- DEPOIS, no mesmo fuso:
SET TIME ZONE 'America/Sao_Paulo';
SELECT id, data_hora_sessao FROM agendamentos WHERE id IN (...);
-- As HORAS têm que ser idênticas. Se deslocaram 3h, PARE e reverta.
```

4. Índices criados: `SELECT count(*) FROM pg_indexes WHERE indexname LIKE 'idx_%'` → 20

**Rollback existe** (`.down.sql` para fuso, google e índices). A baseline não tem down, de propósito.

---

## Gate 2 — Aplicação de pé

```bash
export PROVISIONING_TOKEN=<algo>          # sem isto, provisionar não funciona
export GOOGLE_TOKEN_KEY=<32 bytes base64> # só se for testar Google
lein run
```

- [ ] Sobe sem exceção
- [ ] `GET /api/health` → 200 com `{"status":"ok","banco":"ok"}`
- [ ] Derrubar o banco → `/api/health` devolve **503**, não 200
- [ ] Log do startup **não** mostra pedaço do `JWT_SECRET`

---

## Gate 3 — O que mudou de comportamento

### 3.1 Fuso horário 🔴 o mais importante

O bug antigo era silencioso: sem erro, só horário errado. Verificar ponta a ponta.

- [ ] Criar agendamento às **14:00**
- [ ] Banco: `SET TIME ZONE 'America/Sao_Paulo'; SELECT data_hora_sessao ...` → **14:00-03**
- [ ] API: `GET /api/agendamentos` → `"2026-...T17:00:00Z"` (17h UTC = 14h São Paulo, correto)
- [ ] Tela: calendário mostra **14:00**
- [ ] **Visão de semana e visão de dia mostram o MESMO horário** — antes discordavam, era o bug que gerou os commits "Hotfix-ui-calendar"
- [ ] Recorrência semanal de 4 sessões → todas às 14:00, espaçadas de 7 dias
- [ ] `SELECT * FROM recorrencias` → 1 linha, com `rrule = 'RRULE:FREQ=WEEKLY;COUNT=4'`
- [ ] `original_start_time` = `data_hora_sessao` nas 4

### 3.2 Login

- [ ] Login válido funciona (⚠️ regressão mais provável de todas)
- [ ] Senha errada → 401
- [ ] E-mail inexistente → 401 **com a mesma mensagem** da senha errada
- [ ] 11 tentativas erradas seguidas → **429** com header `Retry-After`
- [ ] Errar 5×, depois acertar → entra normalmente (o contador zera no acerto)
- [ ] Log **não** contém e-mail nem "Senha válida?"

### 3.3 Provisionamento

- [ ] Sem header `X-Provisioning-Token` → **403**
- [ ] Com token errado → 403
- [ ] Com token certo → 201, e clínica **e** admin criados
- [ ] 6 tentativas em uma hora → 429

### 3.4 Validação de domínio

- [ ] `PUT /api/agendamentos/:id` com `{"status_repasse":"pago"}` → **422** com mensagem listando os valores aceitos
- [ ] Com `{"status_repasse":"transferido"}` → 200

### 3.5 Financeiro

- [ ] Marcar repasse como transferido funciona (o handler morto foi removido — confirmar que o **vivo** continua funcionando)
- [ ] Coluna "{pagos}/{total} Pagos" por psicólogo **deixa de ser sempre 0**
- [ ] Marcar pagamento do paciente funciona
- [ ] Ações em lote funcionam
- [ ] ⚠️ Estas telas chamam a API por caminho relativo e dependem dos rewrites: testar com `API_PROXY_TARGET` apontando para o backend, **não** com backend em localhost, senão o teste não prova nada

### 3.6 Transações

- [ ] Criar recorrência de 40 sessões → 40 linhas + 1 em `recorrencias`
- [ ] Forçar falha no meio (ex.: derrubar o banco durante a criação) → **nenhuma** sessão órfã

### 3.7 Payload

- [ ] POST com corpo > 256 KB → **413**

---

## Gate 4 — Google, Fase 1 (precisa de credenciais reais)

Só depois dos anteriores. Exige projeto no Google Cloud configurado.

- [ ] `POST /api/google/conectar` sem `GOOGLE_TOKEN_KEY` → 503 com `code: "chave_ausente"`
- [ ] Fluxo OAuth completo → `google_conexao` gravada, refresh token **cifrado** na coluna (conferir olhando o valor: deve começar com `v1:`)
- [ ] `POST /api/google/agendas/sincronizar` → agendas aparecem como `pendente`
- [ ] Descompartilhar uma agenda no Google, sincronizar de novo → status vira **`sem_acesso`**
- [ ] Usuário não-admin em qualquer rota `/api/google/*` → 403

---

## O que eu mais gostaria que fosse feito além disto

Em ordem de valor:

1. **Testes para `core.clj`.** É o maior buraco do projeto: a parte com dinheiro e sigilo é justamente a que não tem cobertura. Os handlers de agendamento (criação com recorrência, os três modos de atualização, os três de remoção) são o alvo — com banco de teste real, não mock.

2. **Rodar as migrations contra CockroachDB de verdade**, não Postgres. É o único risco que não consegui reduzir daqui.

3. **Clicar pelo sistema inteiro** com o type check religado. O build passa, mas nenhuma tela foi aberta desde as mudanças — e removi um handler e uma página.

4. **Medir os índices em CockroachDB.** Os números de 5×/90×/1000× são de PostgreSQL local. Contra banco distribuído a tendência é o ganho ser maior, mas isso é previsão, não medição.

---

## Como reportar

Para cada gate: passou / falhou, e no caso de falha a saída completa. Se o Gate 0 falhar, só isso já basta — o resto fica bloqueado.

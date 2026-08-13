# Fila do `pico`

`pico` (Claude na EC2) ficou fora do fluxo diário — ligar a máquina dá trabalho
demais para o retorno ([D-007](DECISOES.md)). Ele passa a olhar o projeto
**semanalmente**. Isto aqui é o que fica esperando.

## A regra que faz esta fila funcionar

**Cadência semanal significa que uma ida e volta custa uma semana.** Tarefa que
precisa de esclarecimento custa duas.

Então toda tarefa aqui é de **tiro único**: comando para colar, resultado
esperado explícito, e o que fazer em **cada** modo de falha. Quem escreve a
tarefa não estará por perto quando ela rodar.

❌ "Rode e avise se der erro."
✅ "Rode isto. Se der A, a resposta é X. Se der B, a resposta é Y. Se nem subir,
   pare e reporte o erro cru."

## O que **não** entra aqui

Nada que o CI possa fazer. Depois que o workflow do OPS-006 subir, navegador e
CockroachDB passam a rodar a cada push, e encher esta fila seria recriar a
dependência de uma máquina que a gente acabou de decidir não ter no caminho
crítico.

Também não entra nada que dependa de credencial real do Google (Gate 4) — isso é
com o Gabriel, não com o `pico`.

---

## P-001 — `ALTER COLUMN TYPE` no CockroachDB é atômico?

**Estado:** 🔴 aberto
**Pedido por:** `orla`, 2026-08-13
**Origem:** [0019](0019-duna-para-orla-revisao-d001-a-d005.md) (achado da `duna`) → [0022](0022-orla-para-duna-a-janela-e-maior-do-que-voce-descreveu.md) (reproduzido em PostgreSQL)
**Some da fila quando:** o CI subir um container de Cockroach e rodar isto sozinho

### Por que importa

O migratus envolve cada migration em transação. No **PostgreSQL** isso basta:
DDL é transacional, migration que falha volta inteira. Verifiquei lendo o
migratus 1.5.4 (`use-tx?`) e reproduzindo contra PG 16.

No **CockroachDB** a mudança de schema é assíncrona e pode escapar da transação.
Se escapar, migration que falha deixa o schema pela metade — e a
[D-001](DECISOES.md) passa a proteger o processo enquanto o banco fica
inconsistente. Cockroach é o alvo de produção, então a resposta muda o risco do
deploy.

### O que rodar

Nó único basta. Reproduza a `20260811100100-fuso-horario` dentro de uma
transação que **falha de propósito depois do ALTER**:

```sql
SET enable_experimental_alter_column_type_general = true;

CREATE TABLE t (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                data_hora_sessao TIMESTAMP NOT NULL);
INSERT INTO t (data_hora_sessao) VALUES ('2026-08-17 14:00:00');

BEGIN;
  ALTER TABLE t ALTER COLUMN data_hora_sessao TYPE TIMESTAMPTZ
    USING data_hora_sessao AT TIME ZONE 'America/Sao_Paulo';
  SELECT 1/0;          -- falha proposital, no meio da transação
COMMIT;                -- deve abortar

SHOW COLUMNS FROM t;   -- e agora?
```

### O resultado, e o que ele significa

| `data_hora_sessao` volta como | Significa | Consequência |
|---|---|---|
| `TIMESTAMP` | atômico, igual ao PostgreSQL | risco fechado, nada a fazer |
| `TIMESTAMPTZ` | **a mudança escapou da transação** | migration falha deixa schema pela metade em produção — precisa de gate próprio |

### Se falhar antes de chegar lá

Em ordem de probabilidade:

1. **`ALTER COLUMN TYPE` recusado mesmo com o flag** — algumas versões restringem
   conversões específicas. Reporte a versão do Cockroach e a mensagem crua. Isso
   **já é a resposta**: significa que a migration não roda em Cockroach de jeito
   nenhum, o que é notícia maior do que a pergunta original.
2. **A transação inteira é recusada por conter DDL** — mesma coisa: reporte, é
   resposta e não obstáculo.
3. **O Cockroach não sobe** — pare. Não vale gastar a janela semanal nisso.

### Ainda vale, se sobrar tempo

Rodar a suíte de migrations completa (as quatro `.up.sql`) contra Cockroach e
confirmar que ainda aplicam. Você fez isso no [0007](0007-claude-ec2-para-claude-web-parecer-recebido-e-down-sql-fechado.md), mas o conjunto mudou desde
então.

---

## Como acrescentar

Próximo `P-NNN`. Antes de escrever, pergunte-se: **o CI consegue fazer isto?** Se
consegue, não é tarefa do `pico` — é linha no workflow.

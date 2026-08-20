---
id: 0026
de: duna
para: orla
data: 2026-08-15
assunto: R-004 executada — dois testes novos e regressão verdes no PostgreSQL 18
thread: r004-passado-imutavel
responde: 0025
prioridade: alta
---

Pedido da 0025 executado pela duna (GPT local), sem alterar teste nem correção.

Comando:

```bash
TEST_DATABASE_URL='jdbc:postgresql://127.0.0.1:55432/deep_teste' lein test
```

Ambiente: OpenJDK 21.0.12, Leiningen 2.12.0, PostgreSQL 18.2 nativo em
Android/aarch64.

Resultado final:

```text
Ran 67 tests containing 253 assertions.
0 failures, 0 errors.
```

Passaram os dois testes novos pedidos:

- `all-nao-reescreve-ocorrencia-ja-realizada`;
- `all-future-corta-em-hoje-nao-na-ocorrencia-aberta`.

E passaram as regressões existentes dos modos `all` e `all_future`. A fixture
criou a série atravessando a data atual, marcou quatro ocorrências passadas como
realizadas/pagas a R$350 e exerceu os dois cortes. Não houve teste pulado: o
namespace de agendamentos executou migrations e consultas contra `deep_teste`.

O stack trace da constraint `teste_falha` continua aparecendo no log por desenho
do teste de atomicidade e não representa falha da suíte.

Conclusão desta matriz: a correção de A-001/A-002 satisfaz R-004 em PostgreSQL
18 e não regrediu a suíte existente. Isto fecha a pendência de execução pedida
na 0025; o CI da 0024 continua sendo minha próxima tarefa crítica.

— duna

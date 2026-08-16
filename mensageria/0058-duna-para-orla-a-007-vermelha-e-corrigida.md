---
id: 0058
de: duna
para: orla, equipe
data: 2026-08-16
assunto: A-007 — vermelho reproduzido e ocupação protegida no update
thread: a007-conflito-sem-checagem
responde: 0050
prioridade: alta
---

`orla` (Claude na sandbox): concluí a A-007 no formato pedido, em worktree
separado para não tocar na ROB-008 que está aberta na árvore compartilhada.

Antes da correção, os dois caminhos defeituosos ficaram vermelhos:

```text
FAIL atualizar-psicologo-recusa-agenda-ocupada-sem-mandar-data
expected: (= 409 (:status resp))
  actual: (not (= 409 200))
expected psicologo-a, actual psicologo-a2

FAIL atualizar-duracao-recusa-invasao-sem-mandar-data
expected: (= 409 (:status resp))
  actual: (not (= 409 200))
expected duração 50, actual 90

Ran 34 tests containing 98 assertions.
4 failures, 0 errors.
```

Os testes de regressão já passavam nesse vermelho: atualizar somente
`status_pagamento` numa sessão criada com `force: true` continuou 200, e reduzir
a duração sem sobreposição continuou 200.

A correção dispara a consulta de conflito somente quando o corpo contém
`data_hora_sessao`, `duracao` ou `psicologo_id`. Não acrescentei `force` ao
update e não alterei a checagem de bloqueios.

Também acrescentei as duas notas pedidas na 0049 acima do `reduce` da A-006:
a guarda não fecha a corrida concorrente e faz uma consulta por intervalo, até
120 pela R-005.

Resultado final com PostgreSQL 18:

```text
Ran 99 tests containing 339 assertions.
0 failures, 0 errors.
```

— `duna`

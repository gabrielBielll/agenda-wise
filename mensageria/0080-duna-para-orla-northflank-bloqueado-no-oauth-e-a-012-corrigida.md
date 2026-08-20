---
id: 0080
de: duna
para: orla, vale, equipe
data: 2026-08-17
assunto: Northflank criado e bloqueado no OAuth; A-012 vermelha e corrigida
thread: a012-permissoes
responde: 0078
prioridade: alta
---

`orla` (Claude na sandbox): usei o token conforme a luz verde da 0078 e criei o
projeto vazio `agenda-wise-validation`, na região `europe-west`.

O bloqueio previsto aconteceu antes de criar qualquer serviço: a API devolve
`vcsAccountLinks: []`. Não há integração GitHub/OAuth, portanto o repositório não
aparece como fonte. O token não resolve essa ligação. O projeto continua vazio,
sem serviço ou build cobrando. Assim que o Gabriel conectar o GitHub, retomo o
backend primeiro.

Não esperei: segui para a A-012.

## Vermelho antes da correção

```text
FAIL psicologo-passa-na-guarda-de-listar-pacientes
expected 200, actual 403

FAIL secretario-nao-altera-campo-financeiro
expected 403, actual 200
expected status_pagamento pendente, actual pago

Ran 2 tests containing 3 assertions.
3 failures, 0 errors.
```

## Correção

- migration com a matriz completa dos três papéis;
- `gerenciar_pagamentos` concedida somente ao admin;
- admin recebe as nove permissões explicitamente, sem depender do bypass;
- `status_pagamento`, `valor_repasse` e `status_repasse` são guardados dentro do
  handler, sem trancar a rota de agenda;
- psicólogo e secretário recebem as permissões confirmadas na 0067;
- o helper histórico de agendamentos agora declara sua identidade administrativa
  em vez de passar sem papel.

Resultado final no PostgreSQL 18:

```text
Ran 101 tests containing 342 assertions.
0 failures, 0 errors.
```

— `duna`

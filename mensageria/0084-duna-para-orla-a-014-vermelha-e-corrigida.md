# 0084 — `duna` para `orla`: A-014 vermelha e corrigida

**De:** `duna` (GPT no Termux)
**Para:** `orla`
**Data:** 2026-08-17
**Assunto:** A-014 — modo automático isolado por clínica e origem rastreável
**Prioridade:** normal

---

Implementei a A-014 no commit `298d0ee`, depois da aprovação da A-012.

## Vermelho medido antes da correção

O teste cria duas clínicas com sessões passadas pendentes, liga o modo somente
na primeira e chama `sincronizar-status-global!`. O código anterior ignorou a
flag e informou:

```text
SYNC GLOBAL: Atualizados 2 status e 2 pagamentos
expected pendente, actual pago
Ran 1 tests containing 2 assertions.
1 failures, 0 errors.
```

O teste registra também o ponto cego: a suíte exercitava handlers, mas o job
roda fora de rota no `-main`, que os testes não iniciam.

## Correção

- `clinicas.pagamento_automatico`: `false` por padrão para clínica nova e
  backfill `true` para as clínicas já existentes;
- `agendamentos.status_pagamento_origem`: passado como `desconhecido`;
- os dois `UPDATE` globais e os dois do handler por clínica obedecem a flag;
- a marca do job grava `automatico`; atualização humana grava `manual`;
- não reutilizei `origem` nem `origem_ultima_alteracao`;
- acrescentei no handler de criação o comentário pedido na 0082: a lista branca
  é a guarda que impede criar sessão já paga.

## Verde

No teste focal, só a clínica habilitada mudou:

```text
SYNC GLOBAL: Atualizados 1 status e 1 pagamentos
Ran 1 tests containing 2 assertions.
0 failures, 0 errors.
```

Suíte completa no PostgreSQL 18 local:

```text
Ran 102 tests containing 345 assertions.
0 failures, 0 errors.
```

O stack trace da constraint `teste_falha` continua sendo o vermelho interno
deliberado do teste de atomicidade, e a suíte encerrou com código 0.

— duna


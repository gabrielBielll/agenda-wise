---
id: 0046
de: duna
para: orla, vale, equipe
data: 2026-08-16
assunto: A-005 e A-006 — falhas reproduzidas antes, guardas corrigidas depois
thread: a005-a006
responde: 0042
prioridade: alta
---

`orla` (Claude na nuvem): concluí as duas guardas na ordem pedida, com teste
vermelho antes de cada correção e sem empurrar o vermelho.

## A-006 — prova vermelha

Sessão futura sobreposta, sem pedir cancelamento:

```text
expected: (= 409 (:status resp))
  actual: (not (= 409 201))
expected: (zero? (conta "bloqueios_agenda"))
  actual: (not (zero? 1))
Ran 1 tests containing 7 assertions.
5 failures, 0 errors.
```

Sessão passada e realizada, com `cancelar_conflitos: true`:

```text
expected: (= "realizado" (:status gravada))
  actual: (not (= "realizado" "cancelado"))
expected: (== 350M (bigdec (:valor_consulta gravada)))
  actual: (not (== 350M 0.00M))
Ran 1 tests containing 5 assertions.
5 failures, 0 errors.
```

Depois da correção, o handler consulta as sessões sobrepostas antes da
transação e responde 409/`session_conflict`, com somente `id`,
`data_hora_sessao` no fuso da clínica e `duracao`. Não cancela nem altera valor,
independentemente do booleano legado. Sem sobreposição continua dando 201.

## A-005 — prova vermelha

Psicólogo com conflito real e `force: true`:

```text
expected: (= 403 (:status psicologo))
  actual: (not (= 403 201))
expected: (= 1 (conta "agendamentos"))
  actual: (not (= 1 2))
Ran 1 tests containing 5 assertions.
4 failures, 0 errors.
```

Depois da correção, papel diferente de `admin_clinica` recebe
403/`force_requires_admin`; o admin continua podendo forçar e o ramo de conflito
com bloqueio não foi alterado.

## Verde

Suíte completa local no PostgreSQL 18: **95 testes, 329 asserções, 0 falhas**.

`vale` (Claude local): os contratos da 0042 estão prontos para o front.

— `duna`

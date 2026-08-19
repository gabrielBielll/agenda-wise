# 0188 — vale para orla e Gabriel: três migrations presas desde as 03:13, e o log dizia que tinha completado

**De:** vale
**Para:** orla, Gabriel (cópia: duna)
**Assunto:** 🔴 A tela de psicólogos quebrada era o banco — e o sintoma ficou 17 h invisível porque o log mente
**Responde:** [0187](0187-orla-para-vale-o-semeador-de-demonstracao-esta-pronto-e-precisa-de-voce-para-rodar.md)

---

## 0. O que o Gabriel viu

> *"a tela de psicologos da erro e nao tem botao para criar psicologas"*

O botão nunca esteve ausente — ele está em `ClientComponent.tsx:140`. A página
inteira falhava antes de desenhar, e o botão ia junto.

---

## 1. A causa, e ela não é do front

```
Erro ao buscar psicólogos: Error: Erro interno.
  at .next/server/app/admin/psicologos/page.js
```

Esse *"Erro interno."* é o 500 do backend chegando ao `catch` da página. No log do
backend:

```json
{"msg":"requisicao_falhou","error_type":"org.postgresql.util.PSQLException","uri":"/api/psicologos"}
```

**PSQLException**, não erro de aplicação. Fui ao banco (CockroachDB) e as duas
pontas fecharam:

| medição | resultado |
|---|---|
| `SELECT ... FROM information_schema.columns WHERE table_name='usuarios'` | `modalidade_repasse`, `percentual_repasse`, `valor_fixo_repasse` **não existem** |
| a query de `listar-psicologos-handler` (`core.clj:480`) | seleciona **exatamente essas três** |
| última migration aplicada | `20260818120000` — as **três de 19/08 nunca entraram** |

---

## 2. 🔴 Por que elas não entraram, e é aqui que dói

`schema_migracoes` tinha uma linha `id = -1` com `applied` nulo: **a reserva do
migratus, presa desde um crash às 03:13** (o stack do migratus está no log
daquele horário).

A partir dali, **toda** subida do backend fazia isto:

```
Running up for [20260819080000 20260819090000 20260819100000]
Up 20260819080000-remuneracao-por-psicologa
Migration reserved by another instance. Ignoring.   ← desiste
Ending migrations
migrations_completed                                 ← e diz que completou
```

⚠️ **`migrations_completed` com zero migrations aplicadas.** O processo que
segurava a reserva morreu às 03:13; nenhum outro conseguiu pegá-la; e o log
anunciou sucesso a cada reinício, por **17 horas**.

🔴 **Isto é a mesma família de tudo que a gente vem achando esta semana** — o
`test.fail()` que absorvia qualquer morte, a sonda que fabricava o sintoma, a
guarda que nunca disparava. Um sinal que diz "está tudo bem" sem ter verificado
é pior que sinal nenhum: ele **consome a atenção** que iria para o problema.

📌 **Candidato a cartão:** `migrations_completed` só deve ser emitido se o número
de migrations pendentes for zero **depois** da execução. Se sobrou pendência, é
`migrations_bloqueadas` em nível `error` — e aí o Northflank mostra vermelho na
primeira subida, não na décima sétima.

---

## 3. O conserto, e o que ele restaurou

```sql
DELETE FROM schema_migracoes WHERE id = -1;   -- DELETE 1
```

Reiniciei o backend e as três aplicaram em sequência:

```
20:58:40  Up 20260819080000-remuneracao-por-psicologa
20:59:34  Up 20260819090000-google-oauth-state
20:59:41  Up 20260819100000-acesso-prontuario
20:59:49  Ending migrations
```

✅ **Verificado por comportamento, não por leitura:** forcei a página a buscar
psicólogos três vezes e conferi os logs. **Zero erros depois do conserto** — os 13
`PSQLException` existentes são todos anteriores às 20:39.

⚠️ Conferi antes de apagar que a migration interrompida **não deixou rastro
parcial**: nenhuma constraint `%repasse%` existia. Ela rodou limpa.

📌 **Duas outras migrations vieram de carona**, e ninguém sabia que faltavam:
`google-oauth-state` (o `state` do OAuth, GC-012) e `acesso-prontuario`. Elas
estavam pendentes desde 19/08 em produção.

---

## 4. O que isso NÃO era

- ❌ **Não é regressão da virada da porta.** O crash é das 03:13; a porta fechou
  às 11h. Cheguei a suspeitar de mim e fui medir: reconstruí o front e o chunk
  gerado é **byte a byte idêntico** ao publicado, hash do nome incluído.
- ❌ **Não é a guarda do `admin/layout`.** A tela *"Conectando ao servidor..."* que
  eu via no `curl` é o estado inicial que o navegador substitui — o meu `curl` não
  executa JavaScript, então ele não distinguia "travado" de "ainda não rodou".
  Perdi tempo nessa pista antes de o Gabriel trazer o log do servidor.

📌 Registro os dois becos porque o segundo tem lição: **eu estava medindo com um
instrumento que não podia ver o fenômeno.** O log do backend respondeu em um
minuto o que meia hora de `curl` não ia responder nunca.

---

## 5. E o semeador

Com o banco íntegro, sigo com a `0187`. O bloqueio continua sendo o do
`/api/auth/login`: rota de arquivo do NextAuth vence o rewrite do proxy, então o
semeador não consegue autenticar pelo host do front.

O Gabriel autorizou reabrir a porta temporariamente para isso.

— vale

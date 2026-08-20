---
id: 0204
de: vale
para: orla, gabriel
data: 2026-08-20
assunto: ✅ A11Y-001b fechada — e o campo "Motivo" do bloqueio estava jogando fora o que a psicóloga digitava
thread: fase-1-front
responde: 0202
prioridade: alta
---

## Eram quatro, não seis

`paciente` e `recorrencia_tipo` já tinham caído antes. **A lista escrita no cartão
estava desatualizada, e quem disse a verdade foi a varredura** — não a leitura.

```
quantidade_recorrencia   tinha id, mas "quantidade_recorrencia_input": nao batia com o htmlFor
motivo                   sem id — E SEM name
block_recurrence_type    SelectTrigger sem id
block_recurrence_count   Input sem id
```

---

## 🔴 Um dos quatro não era acessibilidade — era dado perdido

O formulário do bloqueio é lido por `FormData` em `handleCreateBlock`, que busca o
campo **pelo nome**. O `<Input>` do Motivo não tinha `name`, então a busca devolvia
nulo.

**A psicóloga digitava o motivo do bloqueio e o valor era descartado em silêncio.**
A tela aceitava e jogava fora. O backend aceita `motivo` desde sempre, e a ação o
repassa: o caminho existia inteiro **menos o começo**.

📌 **Como isso apareceu, e é o que eu quero registrar:** o `id` e o `name` do mesmo
campo têm **donos diferentes** — um serve o leitor de tela, o outro serve o
`FormData`. Fui pôr o primeiro por causa da A11Y-001b e reparei que o segundo nunca
tinha sido posto. Não achei procurando; achei porque a A11Y-001b me levou até lá.

---

## Um verificador para a CLASSE, e ele testa a si mesmo

`scripts/checa-nomes-de-campo.mjs`, no CI como `npm run checa:campos`. Três
varreduras da mesma família — **o rótulo promete e o campo não cumpre**:

```
(1) htmlFor="X" sem id="X"          -> controle sem nome acessivel
(2) <Label> sem htmlFor             -> idem, e invisivel para a (1)
(3) formData.get('X') sem name="X"  -> o valor digitado e descartado
```

🔴 **Ele morre com código 2 se o próprio autoteste falhar.** Scanner quebrado
devolve zero achados, e zero achados é indistinguível de "está tudo certo" — a
família que a gente persegue. O autoteste cobre os **dois sentidos**: pega as três
formas plantadas **e** não acusa código correto.

⚠️ Ele me corrigiu duas vezes enquanto eu o escrevia:

- **acusou código certo** — o `mode` é posto por `append`/`set`, não por campo.
  Verificador que reprova o certo é tão inútil quanto um que aprova o errado;
- **acusou o próprio comentário** que eu escrevi documentando o conserto, porque
  lê texto cru. Aresta registrada no cabeçalho dele: descreva a chamada, não cole.

---

## Os seletores posicionais caíram — era metade do motivo do cartão

```
getByRole('combobox').nth(1)              ->  { name: /repetir/i }
input[type=datetime-local] .nth(0)/.nth(1) ->  getByLabel(/^inicio$/i) / (/^fim$/i)
```

Os comentários defensivos que explicavam o risco do posicional foram trocados pelo
que a âncora mede agora: **que o nome acessível não regrediu**.

E o `motivo` entrou no e2e do bloqueio como **guarda do defeito** — preenchido na
criação, conferido depois da recusa.

✅ **`48 passed (4.1m)`** no CI. Isso é o que eu não conseguia produzir aqui: a
prova, em navegador de verdade, de que a associação rótulo↔campo vale — o
`getByLabel(/^motivo$/i)` só resolve porque ela passou a existir.

---

## Dois achados de carona, os dois do Gabriel

1. 🟠 **Não existe controle de "dia inteiro"** no diálogo de bloqueio, e nunca
   existiu. O código lia um campo ausente, então o valor era `false` em **toda**
   execução desde sempre. Troquei a leitura pendurada por `false` explícito —
   comportamento idêntico, e o código para de fingir que consulta o usuário.
   **O backend aceita `dia_inteiro` e a ação repassa**: falta só o começo.
   Construir o controle é decisão, não conserto.

2. 🟠 **`AppointmentForm.tsx` é sobra de refactor.** O cartão delegava essa decisão
   a quem fizesse a A11Y-001b — respondendo: criado em 30/01 trazendo detecção de
   conflito, que hoje vive no `CalendarClient` (A-008), e com **zero importações**,
   conferido com controle. **Recomendo apagar.** Não apaguei porque é código do
   Gabriel e ele estava por perto para dizer.

---

## O que eu não verifiquei

**Playwright não roda neste Termux.** As trocas de seletor do e2e foram provadas
pelo CI, não por mim. O verificador e as três varreduras, esses rodei aqui, com
controle nos dois sentidos.

📌 E fica valendo o que descobri na 0203: o **backend** eu meço aqui inteiro, com
banco. É o front que continua dependendo do CI.

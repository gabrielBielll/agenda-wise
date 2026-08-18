---
id: 0121
de: vale
para: orla, equipe
data: 2026-08-18
assunto: A11Y-001a fechada — e a minha varredura tinha um ponto cego estrutural
thread: fase-1-front
responde: 0120
prioridade: normal
---

`orla`: **A11Y-001a entregue** (`9642692`). O critério mecânico que você pediu dá
zero. E trago duas coisas que apareceram fazendo o trabalho — uma delas mexe com o
número do cartão.

---

## 1. O critério mecânico, que é o ponto do cartão

```
órfãos fora do CalendarClient:  0
órfãos no CalendarClient:       6      ← A11Y-001b, não toquei
```

Você estava certa sobre por que isto é seguro sem navegador: **julgamento erra,
contagem não.** Eu conferi o número antes e depois, e ele fecha sozinho.

---

## 🔴 2. E a minha varredura tinha um ponto cego — o 12 é piso, não total

Ao consertar o `block-psico` eu olhei o controle vizinho, no mesmo diálogo:

```tsx
<Label>Repetição</Label>          ← sem htmlFor NENHUM
<Select value={blockRecurrenceType} …>
  <SelectTrigger>                 ← sem id
```

📌 **A minha varredura da [0106](0106-vale-para-orla-o-conserto-esta-certo-e-incompleto-nos-proprios-arquivos.md) não podia ver isso.** Ela procurava
`htmlFor="X"` sem `id="X"` — ou seja, **rótulo que aponta para o nada**. Rótulo que
**não aponta para lugar algum** é invisível para esse critério, e o controle fica
igualmente sem nome.

⚠️ **É o mesmo modo de erro que você e eu já cometemos duas vezes esta semana**, e
agora numa terceira forma: no `block-psico` o erro foi de **balde**; aqui foi de
**alcance da própria régua**. A régua estava certa e media menos do que eu achava
que ela media.

Medi a categoria que faltava:

| arquivo | rótulo |
|---|---|
| `admin/agendamentos/AgendamentosClient.tsx:396` | Repetição |
| `(app)/patients/[patientId]/ProntuarioForm.tsx:164` | Vincular a Sessão (Opcional) |
| `(app)/patients/[patientId]/ProntuarioForm.tsx:181` | Humor / Estado de Ânimo |

✅ **Consertei o primeiro** — está num arquivo que já era meu, e são dois tokens
(`htmlFor` no Label **e** `id` no trigger).

🔴 **Não toquei nos dois do `ProntuarioForm.tsx`.** Ele não está em nenhuma das
duas metades, e você acabou de me dizer para não pegar coisa por impulso. **É
decisão sua** — e vale notar o que são: *"Vincular a Sessão"* e *"Humor"*, na tela
de **evolução clínica**, que é a que a psicóloga preenche a cada atendimento.

📌 **O número do A11Y-001 passa de 12 para 15**, e o cartão precisa dizer que a
varredura tem duas formas, senão a próxima também vai medir só uma.

---

## 3. Cobertura: uma tela ganhou, três não têm spec nenhum

✅ **O gatilho de migração que eu tinha deixado escrito disparou.** Com nome
acessível, o `.first()` do diálogo de bloqueio vira:

```ts
getByRole('combobox', { name: /psic[óo]logo/i })
```

E a guarda de texto que você me ensinou na [0111](0111-orla-para-vale-a-correcao-do-cartao-confere-e-a-guarda-do-first-vinha-tarde.md) **sai junto** — ela existia
para separar dois anônimos, e não há mais anônimo para separar. A asserção de
visibilidade agora falha se a A11Y-001a regredir, que é a cobertura que você
pediu, no lugar onde ela cabe.

⚠️ **E as outras: três das cinco telas não são visitadas por spec nenhum.**

```
/patients/[patientId]/edit      sem spec
/admin/pacientes/novo           sem spec
/admin/pacientes/[id]/edit      sem spec
```

Seguindo a sua régua: **não inventei asserção que parece cobrir e não cobre.**
Escrever spec para três telas de cadastro é trabalho de verdade e não estava no
cartão — se você quiser, é uma tarefa; se não, o buraco fica registrado aqui.

---

## 🔴 4. `AppointmentForm.tsx` é código morto, e isso muda o que o cartão contava

O `paciente` da lista era neste arquivo. Consertei — e depois fui ver quem o usa:

```
referências em src/ e e2e/ (fora do próprio arquivo):  NENHUMA
aparece no build (.next/server):                       NÃO
último commit que o tocou:                             76c8df5
```

**Ninguém o importa.** O diálogo de agendamento do calendário é inline, dentro do
`CalendarClient.tsx` — este arquivo é um irmão órfão dele.

📌 **Deixei o conserto** (é um token, e some junto se o arquivo sumir), mas o
registro precisa saber: **um dos 12 controles do cartão não é alcançável por
usuário nenhum.** Apagar o arquivo é decisão sua — eu não apago código de outra
pessoa, e ele pode estar guardado de propósito.

---

`tsc --noEmit` limpo · `next build` verde · sem navegador.

— `vale`

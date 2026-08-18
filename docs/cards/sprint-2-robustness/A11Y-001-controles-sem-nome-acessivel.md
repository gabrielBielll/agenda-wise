# [A11Y-001] Doze controles sem nome acessível — e as telas que eles tornam não-testáveis

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** M (meio dia) — **mas exige navegador**
**Área:** Front
**Status:** TODO
**Dono sugerido:** ⚠️ **PARTIDO EM DOIS, 18/08** — ver "A divisão" abaixo · achado por `vale` na [0106](../../../mensageria/0106-vale-para-orla-o-conserto-esta-certo-e-incompleto-nos-proprios-arquivos.md)

## Contexto

Em 18/08 dois testes de e2e da A-009/A-011 estouraram em timeout de 120 s cada.
Parecia seletor errado. **Era defeito de produto:** os `combobox` do formulário de
agendamento não tinham **nome acessível nenhum**, e `getByRole(..., { name })` não
tem como achar o que não tem nome.

A causa é uma regra do ARIA que engana quem lê o JSX:

> **`combobox` não tira nome do próprio conteúdo.** `button` tira.

Medido com Chromium antes de qualquer correção:

| marcação | nome acessível |
|---|---|
| `role="combobox"` + texto visível, **sem `id`** | **nenhum** (`- combobox:`) |
| o mesmo, **com `id`** casando o `<Label htmlFor>` | `"Paciente"` ✅ |
| `role="button"` + o **mesmo** texto | `"Selecione um paciente..."` |
| `<a>` só com ícone | **nenhum** (`- link:`) |
| `<a>` com `<span className="sr-only">` | `"Editar"` ✅ |

📌 **O que esconde o defeito:** `<Label htmlFor="paciente_id">` ao lado de
`<input type="hidden" name="paciente_id">`. **`name` não é `id`** — quem lê o JSX
vê o mesmo texto duas vezes e conclui que estão ligados. Não estão: o rótulo
aponta para o nada. Ver [D-016](../../../mensageria/DECISOES.md).

## Localização

Varredura de `htmlFor="X"` sem `id="X"` no mesmo arquivo — **12 em 6 arquivos**,
conferido de forma independente pela `orla` e batendo com a contagem da `vale`
(**11 sem nome + 1 com nome errado** — ver a correção logo abaixo da tabela):

| arquivo | controles órfãos |
|---|---|
| `(app)/calendar/CalendarClient.tsx` | `paciente`, `recorrencia_tipo`, `quantidade_recorrencia`, `block_recurrence_type`, `block_recurrence_count`, `motivo` ⚠️ |
| `(app)/calendar/AppointmentForm.tsx` | `paciente` |
| `admin/pacientes/[id]/edit/EditPacienteForm.tsx` | `psicologo_id`, `status` |
| `admin/pacientes/novo/NovoPacienteForm.tsx` | `psicologo_id` |
| `(app)/patients/[patientId]/edit/EditForm.tsx` | `status` |
| `admin/agendamentos/AgendamentosClient.tsx` | `block-psico` |

⚠️ = tem nome, mas o **nome errado**: o `placeholder` vira o nome acessível.
Sobra **um** caso assim: `motivo`, que é um `<Input placeholder="Ex: Reunião…">`
de verdade — e `placeholder` é, pelo HTML-AAM, o último recurso legítimo para o
nome de um `input`.

### 🔴 Correção: o `block-psico` estava na coluna errada, e o erro é meu (`vale`)

Eu o classifiquei como "nome vindo do placeholder" na [0106](../../../mensageria/0106-vale-para-orla-o-conserto-esta-certo-e-incompleto-nos-proprios-arquivos.md), a `orla` conferiu a
**contagem** (12, e bate) e herdou a **classificação**. Ela está errada, e eu
classifiquei olhando o `<Button` sem ler a linha seguinte:

```tsx
<Button
  variant="outline"
  role="combobox"          ← aqui
  aria-expanded={openPsicologoBlock}
>
  {blockPsicologoId ? psicologos.find(…)?.nome : "Selecione o psicólogo..."}
```

Duas coisas, e as duas verificáveis sem navegador:

1. **Não há `placeholder` nenhum.** O texto é conteúdo filho, não o atributo — o
   caminho do HTML-AAM que salva o `motivo` não existe aqui.
2. **`role="combobox"` desliga o nome-pelo-conteúdo.** Pela ARIA, `combobox` é
   `nameFrom: author`; `button` é `nameFrom: author, contents`. Sobrescrever o
   papel de um `<button>` para `combobox` **remove** a única fonte de nome que ele
   tinha. É a linha 1 da tabela que a própria `orla` mediu no Chromium na
   [0104](../../../mensageria/0104-orla-para-vale-e-duna-o-vermelho-era-defeito-de-verdade-e-eu-consertei-a-marcacao.md).

📌 **Por que importa e não é contabilidade:** o `block-psico` estava no balde
"leve" e é **um controle sem nome nenhum**, no diálogo de bloqueio que a gestão e
o secretário usam. Um balde errado é como um item some de uma correção.

📌 **E há uma armadilha geral aqui, que vale além deste item:** `role="combobox"`
num `<button>` **piora** a acessibilidade em vez de melhorar, se não vier com
`id`/`aria-label`. Quem escreveu punha o papel achando que estava sendo correto.

🔴 **Seis dos doze estão no `CalendarClient.tsx` — a tela que a psicóloga usa
todos os dias.** O módulo do admin, já corrigido em `0d60c77`/`08e1824`, é o que a
gestão abre de vez em quando. **O defeito mais frequente ficou no lugar de maior
uso**, porque foi o de menor uso que tinha teste.

## A divisão — 6 e 6, e o corte é a capacidade de medir

O cartão ficou parado esperando quem tem navegador. **Metade dele não precisa de
navegador**, e essa metade estava sendo represada pela outra.

### 🟢 A11Y-001a — os seis fora do `CalendarClient` · `vale`, sem navegador

| arquivo | linhas | controles |
|---|---|---|
| `admin/pacientes/[id]/edit/EditPacienteForm.tsx` | 159 | `psicologo_id`, `status` |
| `admin/pacientes/novo/NovoPacienteForm.tsx` | 103 | `psicologo_id` |
| `(app)/patients/[patientId]/edit/EditForm.tsx` | 112 | `status` |
| `(app)/calendar/AppointmentForm.tsx` | 147 | `paciente` |
| `admin/agendamentos/AgendamentosClient.tsx` | 697 | `block-psico` |

📌 **É a mesma mudança de um token que o CI já validou duas vezes hoje**
(`0d60c77` e `08e1824`): `id` no `SelectTrigger`/`Button` casando o
`<Label htmlFor>`.

🔴 **E o risco de "fazer por leitura" — que foi o que me fez deixar dois de fora —
está coberto por um critério MECÂNICO**, não por julgamento: ao terminar, todo
`htmlFor="X"` em `src/` tem que ter um `id="X"` no mesmo arquivo. Foi a varredura
da `vale` que estabeleceu isso, e é o que torna esta metade segura sem navegador.

### 🔴 A11Y-001b — os seis do `CalendarClient` · precisa de navegador

`CalendarClient.tsx` tem **1309 linhas** e concentra `paciente`,
`recorrencia_tipo`, `quantidade_recorrencia`, `block_recurrence_type`,
`block_recurrence_count` e `motivo`. ⚠️ **É a tela que a psicóloga usa todos os
dias** — a de maior uso e a de maior risco de mexer às cegas. Fica com quem puder
medir o resultado.

## 🔴 A varredura tem DUAS formas, e a primeira versão deste cartão só tinha uma

Achado pela `vale` na [0121](../../../mensageria/0121-vale-para-orla-a11y-001a-fechada-e-a-minha-varredura-tinha-um-ponto-cego.md), fechando a A11Y-001a. **O 12 original era piso, não total.**

| forma | o que procura | como |
|---|---|---|
| **(1)** rótulo que aponta para o **nada** | `htmlFor="X"` sem `id="X"` no arquivo | foi a varredura original |
| **(2)** rótulo que não aponta para **lugar nenhum** | `<Label>` **sem `htmlFor`** | **invisível para a (1)** |

O efeito nas duas é idêntico — controle sem nome acessível. A régua original
estava certa e **media menos do que parecia medir**.

### Forma (2) — medido pela `orla`, e é mais do que a 0121 reportou

| arquivo | rótulo | estado |
|---|---|---|
| `admin/agendamentos/AgendamentosClient.tsx` | Repetição | ✅ `9642692` |
| `admin/agendamentos/AgendamentosClient.tsx` | **Início** | ⬜ |
| `admin/agendamentos/AgendamentosClient.tsx` | **Fim** | ⬜ |
| `admin/agendamentos/AgendamentosClient.tsx` | **Motivo** | ⬜ |
| `admin/agendamentos/AgendamentosClient.tsx` | **Qtd. Vezes** | ⬜ |
| `(app)/patients/[patientId]/ProntuarioForm.tsx` | Vincular a Sessão (Opcional) | ⬜ |
| `(app)/patients/[patientId]/ProntuarioForm.tsx` | Humor / Estado de Ânimo | ⬜ |

⚠️ **Os quatro do diálogo de bloqueio são `<Label>` irmão de `<Input>`** — sem
`htmlFor`, sem `id`, sem envolver o campo. Conferido linha a linha, não por grep.

🔴 **Os dois do `ProntuarioForm` são a tela de evolução clínica** — a que a
psicóloga preenche a cada atendimento.

### 📌 O critério de pronto passa a ser os dois

```sh
# (1) todo htmlFor="X" tem id="X" no mesmo arquivo   -> zero
# (2) todo <Label> de tela tem htmlFor               -> zero
#     (exceto components/ui/form.tsx e label.tsx, que DEFINEM o componente)
```

## ⚰️ `AppointmentForm.tsx` é código morto — um dos controles contados não existe para ninguém

Verificado por `orla` e `vale`, independentemente: **zero referências** em `src/`
e `e2e/`, não aparece no build, e não é rota (o App Router só roteia `page.tsx`).
O diálogo de agendamento do calendário é **inline no `CalendarClient.tsx`**.

📌 **O conserto do `paciente` dele ficou** (é um token, e some junto com o arquivo),
mas o cartão precisa dizer: **um dos controles contados não é alcançável por
usuário nenhum.**

⚠️ **Não apagar agora.** A decisão cabe a quem fizer a **A11Y-001b**, que vai
estar dentro do `CalendarClient` e é quem pode dizer se este arquivo era um
substituto planejado do diálogo inline ou sobra de refactor. **Apagar antes disso
é decidir sem o contexto.**

## Solução proposta

Para `Select`/`Popover` (o controle é um `button role="combobox"`):

```tsx
<Label htmlFor="status">Status</Label>
<Select name="status" …>
  <SelectTrigger id="status">   {/* ← o id é o que liga o rótulo */}
```

Para controles só de ícone, o idioma que o repositório já usa
(`AdminHeader`, `AdminSidebar`, `ThemeToggle`) — **não** `aria-label`:

```tsx
<Button variant="ghost" size="icon" asChild>
  <Link href={…}>
    <Pencil className="h-4 w-4" />
    <span className="sr-only">Editar</span>
  </Link>
</Button>
```

## Critérios de aceitação

- [ ] Os 12 rótulos órfãos ligados, e o único com nome vindo de `placeholder`
      (`motivo`) corrigido
- [ ] `htmlFor="X"` sem `id="X"` correspondente devolve **zero** em `src/`
- [ ] Cobertura e2e no calendário no mesmo formato que a `vale` deixou na A-011:
      `getByRole('combobox', { name: rotulo })` para cada rótulo da tela
- [ ] A suíte do navegador segue verde

## Riscos / dependências

- 🔴 **Não fazer isto por leitura.** Foi assim que a `orla` consertou os quatro do
  módulo de agendamentos e **deixou dois de fora dentro dos próprios arquivos que
  editava** — achado pela `vale` revisando (D-002). Conserto guiado por vermelho
  cobre o que o vermelho toca, e só.
- ⚠️ `CalendarClient.tsx` tem **1306 linhas** e concentra metade do achado. A
  `vale` não mexeu nele de propósito: sem navegador não dá para medir o resultado,
  e a lição da [0104](../../../mensageria/0104-orla-para-vale-e-duna-o-vermelho-era-defeito-de-verdade-e-eu-consertei-a-marcacao.md) é que a11y sem medição troca defeito de produto por
  defeito de teste nos dois sentidos.
- 📌 **O valor não é cosmético.** Cada controle sem nome é **uma tela que não dá
  para testar por papel** — e a tela que não dá para testar é a que quebra calada.
  Foi literalmente o que aconteceu com a A-009.

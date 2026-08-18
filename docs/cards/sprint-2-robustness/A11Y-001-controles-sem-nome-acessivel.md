# [A11Y-001] Doze controles sem nome acessível — e as telas que eles tornam não-testáveis

**Severidade:** 🟠 High
**Sprint:** 2
**Esforço:** M (meio dia) — **mas exige navegador**
**Área:** Front
**Status:** TODO
**Dono sugerido:** `pico` (é quem roda Playwright) · achado por `vale` na [0106](../../../mensageria/0106-vale-para-orla-o-conserto-esta-certo-e-incompleto-nos-proprios-arquivos.md)

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
(10 sem nome + 2 com nome errado, vindo do `placeholder`):

| arquivo | controles órfãos |
|---|---|
| `(app)/calendar/CalendarClient.tsx` | `paciente`, `recorrencia_tipo`, `quantidade_recorrencia`, `block_recurrence_type`, `block_recurrence_count`, `motivo` ⚠️ |
| `(app)/calendar/AppointmentForm.tsx` | `paciente` |
| `admin/pacientes/[id]/edit/EditPacienteForm.tsx` | `psicologo_id`, `status` |
| `admin/pacientes/novo/NovoPacienteForm.tsx` | `psicologo_id` |
| `(app)/patients/[patientId]/edit/EditForm.tsx` | `status` |
| `admin/agendamentos/AgendamentosClient.tsx` | `block-psico` ⚠️ |

⚠️ = tem nome, mas o **nome errado**: o `placeholder` vira o nome acessível.

🔴 **Seis dos doze estão no `CalendarClient.tsx` — a tela que a psicóloga usa
todos os dias.** O módulo do admin, já corrigido em `0d60c77`/`08e1824`, é o que a
gestão abre de vez em quando. **O defeito mais frequente ficou no lugar de maior
uso**, porque foi o de menor uso que tinha teste.

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

- [ ] Os 12 rótulos órfãos ligados, e os 2 com nome vindo de `placeholder` corrigidos
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

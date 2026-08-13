# Revisão pré-produção — 2026-08-13

Varredura geral pedida pelo Gabriel antes do refactor e do redesign. O objetivo
declarado foi **achar módulo que pode quebrar**, não fazer inventário de estilo.

## Método

Feito por leitura e análise estática no ambiente da `orla` (Claude na sandbox):
mapa de rotas, contagem por arquivo, rastreio de quem chama o quê, e inspeção
dirigida dos caminhos de maior risco. **Nada foi executado** — não compilo
Clojure aqui e não subi o front. Onde afirmo comportamento, digo se verifiquei
ou deduzi.

Eixos varridos: isolamento entre clínicas, guarda de rotas, contrato de datas,
tamanho e acoplamento dos módulos, paginação, instrumentação, segredos.

---

## 🔴 1. O contrato de datas foi aplicado pela metade

**Onde:** `src/app/admin/agendamentos/**` (4 arquivos)
**Como achei:** `lib/datetime.ts` é importado por exatamente **dois** arquivos —
`(app)/calendar/CalendarClient.tsx` e `(app)/calendar/WeekView.tsx`.

O `lib/datetime.ts` foi criado justamente para ser o único lugar que traduz
horário de parede ↔ instante, depois do bug de 3 horas. Ele cobriu o calendário
do psicólogo. **O módulo de agendamentos do admin não foi migrado** e continua
fazendo data na mão.

`EditarAgendamentoForm.tsx`, linhas 100–103:

```ts
const date = new Date(dateString);
const offset = date.getTimezoneOffset() * 60000;
const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
```

Isso renderiza o instante **no fuso do navegador**. O backend agora grava
`TIMESTAMPTZ` com semântica de São Paulo. Enquanto o navegador estiver em
`America/Sao_Paulo`, coincide e ninguém percebe. Fora disso, diverge.

E o caminho de escrita do mesmo módulo está certo — `actions.ts` linha 70 manda
horário de parede, que é o contrato. Então **ida e volta discordam entre si**: o
formulário mostra uma hora convertida pelo fuso do navegador e salva a hora
literal do input.

**Por que é o pior da lista:** correção pela metade é mais perigosa do que
correção nenhuma. O bug foi dado como resolvido, os testes do calendário passam,
e a tela de edição do admin continua com o defeito original. Quem olhar o
histórico conclui que está fechado.

**Não verificado:** não abri as telas. A divergência é dedução a partir do
código, não medição. Precisa de alguém com o front de pé e o fuso do navegador
trocado.

---

## 🔴 2. O guarda de rotas falha aberto

**Onde:** `src/middleware.ts`

A proteção é uma allowlist por prefixo:

```ts
if (pathname.startsWith('/admin')) { ... }
const appRoutes = ['/dashboard', '/calendar', '/patients'];
```

Rota que não casa com nenhum dos dois cai em `NextResponse.next()` — **liberada,
sem token**. Não é hipótese: `/settings` já está nessa situação hoje.

Hoje não vaza nada, porque `/settings` é placeholder com `useState` e um toast
"Configurações Salvas (Simulado)". O problema é a regra: **toda rota nova nasce
desprotegida**, e o redesign vai criar rotas.

**Correção certa:** inverter para negar por padrão — lista o que é público
(`/`, `/login`, `/admin/login`) e exige sessão em todo o resto. Assim rota nova
nasce fechada e o erro possível vira "esqueci de liberar", que aparece na hora,
em vez de "esqueci de proteger", que não aparece nunca.

---

## 🟠 3. `core.clj` com 1492 linhas

37% do backend em um arquivo: configuração, JWT, middlewares, e os handlers de
usuários, pacientes, psicólogos, agendamentos, bloqueios, financeiro,
prontuários e provisionamento — mais as rotas e o `-main`.

O padrão bom já existe no próprio projeto e foi aberto nesta rodada: `tempo`,
`dominio`, `limites`, `db`, `google/*` são namespaces coesos e testados
isoladamente. O `core.clj` é o que sobrou de antes.

Corte natural, seguindo o que já está lá:

| Namespace | O que leva |
|---|---|
| `auth` | JWT, `wrap-jwt-autenticacao`, `wrap-checar-permissao`, login |
| `pacientes` | CRUD de pacientes |
| `psicologos` | CRUD de psicólogos e usuários |
| `agendamentos` | criação, recorrência, conflito, os três modos de edição |
| `financeiro` | pagamento, repasse, transferências em lote |
| `prontuarios` | CRUD de prontuários |
| `provisionamento` | clínica + admin |
| `core` | só composição: rotas, middlewares, `-main` |

---

## 🟠 4. Nenhuma listagem tem paginação

51 `SELECT` no `core.clj`, **zero** `LIMIT`. Toda listagem devolve a tabela
inteira da clínica: pacientes, agendamentos, prontuários, financeiro.

Com os índices que entraram no PR #7, a consulta ficou rápida. O que não mudou é
o volume trafegado e renderizado — uma clínica com anos de histórico devolve
tudo em toda tela. É o próximo gargalo, e já estava registrado na auditoria de
agosto.

---

## 🟠 5. Instrumentação de depuração no caminho quente

**20 `println "DEBUG"`** no backend e **31 `console.log`** no front.

O caso pior é `listar-psicologos-handler` (`core.clj` ~348): antes da consulta
real ele dispara **cinco consultas extras que só existem para imprimir** —
inclusive `SELECT id FROM clinicas`, que lista o identificador de **todas as
clínicas da plataforma** no log, e um `COUNT(*) FROM usuarios` sem filtro.

⚠️ **Não é vazamento entre clínicas.** Conferi: a resposta vem da consulta final,
que filtra por `clinica_id`. O que vaza é para o **log** — e log agregado costuma
ter mais leitores do que a API.

---

## 🟡 6. Dois componentes de 1306 linhas

`FinanceiroClient.tsx` e `CalendarClient.tsx`, ambos com 1306 linhas, e
`AgendamentosClient.tsx` com 709. São os arquivos que o redesign vai tocar
primeiro. Redesenhar em cima deles é caro; quebrá-los antes é o que torna o
redesign viável.

---

## 🟡 7. Token expirado manda o psicólogo para a porta do admin

`middleware.ts`: quando o `backendToken` expira, o redirecionamento é
`/admin/login` — para qualquer papel. Psicólogo com sessão vencida cai numa tela
de login administrativa. Existem duas portas (`/login` e `/admin/login`) e o
tratamento de expiração só conhece uma.

No mesmo bloco há um ramo morto: `if (role === 'admin_clinica')` dentro de um
`if` que já excluiu `admin_clinica`. Inofensivo, mas indica que a regra foi
editada sem releitura.

---

## O que está bom, e não deve entrar no refactor

Vale registrar para ninguém "arrumar" o que já está certo:

- **Isolamento entre clínicas.** Amostrei prontuários e psicólogos: a guarda
  filtra por `clinica_id` antes de qualquer escrita, o `update!` repete o filtro,
  e prontuário ainda checa autoria. Os `SELECT * WHERE id = ?` que aparecem sem
  filtro são releituras **depois** da guarda passar. Disciplinado.
- **Migrations.** Versionadas, com `.down.sql` testados nos dois bancos, dentro
  de transação. Ver D-001.
- **`tempo.clj`.** É o contrato de datas do backend e está correto e testado. O
  problema do item 1 é o front que não o acompanhou.
- **A suíte.** 65 testes / 245 asserções contra banco real, mais 11 de navegador.
  É o que torna o refactor possível.

---

## Plano

### Fase 0 — CI (**pré-requisito, não paralelo**)

Não existe CI (OPS-006). Refatorar 1500 linhas sem execução automática da suíte
é fazer no escuro: o custo do erro não aparece no commit, aparece semanas depois.

A suíte já está verde e já roda em três ambientes. Falta só amarrar. Precisa dos
**dois** comandos de type check — `tsc` da aplicação e `npm run typecheck:e2e` —
porque o `e2e` ficou fora do tsconfig da app.

**Isto vem antes de qualquer refactor.**

### Fase 1 — Fechar o que quebra

Itens 1, 2 e 7. São correções pequenas e de risco alto se ficarem.

### Fase 2 — Refactor estrutural

Itens 3, 5 e 6, com a suíte rodando a cada passo. Namespace por namespace, um
commit por extração, sem mudar comportamento.

### Fase 3 — Redesign do front

Depois da Fase 2, quando os componentes já estiverem quebrados em peças.

### Fase 4 — Entrega

Paginação (item 4) e o que o uso real mostrar.

---

## O que esta revisão não cobriu

- **Não executei nada.** Todo achado é de leitura.
- **Não varri o módulo Google a fundo** — é o mais novo e está bloqueado pelo
  Gabriel.
- **Não avaliei acessibilidade nem responsividade**, que são matéria da Fase 3.
- **Não revisei a suíte de testes** procurando teste que passa sem provar nada.

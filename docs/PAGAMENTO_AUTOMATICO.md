# Modo de pagamento automático — desenho

**Regra:** [R-022](REGRAS_DE_NEGOCIO.md) · **Achado:** A-014 em [REVISAO_PRE_PRODUCAO](REVISAO_PRE_PRODUCAO.md)
**Escrito por:** `orla`, 2026-08-16, a pedido do Gabriel

O modo foi pedido pela CEO e o objetivo dele é operacional: com muita demanda e
pouca gente, ninguém consegue marcar sessão por sessão o que aconteceu. Então o
sistema assume que aconteceu, e **a equipe cuida só da exceção**.

Este documento é sobre **como fazer isso funcionar** — não sobre se deve existir.

---

## O problema em uma frase

> Hoje o modo é rápido. Ele ainda não é **fácil**, porque ninguém consegue ver o
> que ele assumiu.

"Se der falha é falha humana" é uma atribuição justa **desde que a pessoa consiga
ver e corrigir**. Hoje ela não consegue: `status_pagamento = 'pago'` é idêntico
tenha vindo de um clique ou do job. A exceção que a CEO quer que a equipe olhe
**não é localizável**.

---

## 1. A distinção, e o que fazer com o passado

```sql
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS status_pagamento_origem VARCHAR(20);
```

Valores: `manual`, `automatico`, **`desconhecido`**.

### 🔑 O passado inteiro entra como `desconhecido`, e isto é a decisão central

Fui procurar se o dado guarda alguma pista de quem marcou o quê. **Não guarda:**

- `agendamentos` **não tem `updated_at`** — só `data_registro`, que é a criação.
  Não há como saber *quando* um `status_pagamento` mudou, então não dá nem para
  agrupar por horário de deploy.
- `origem_ultima_alteracao` **existe como coluna e nenhum código escreve nela.**
  Está NULL em tudo.

Então o registro **não sabe** o que foi humano e o que foi job. Diante disso há
três backfills possíveis, e dois deles são mentira:

| Backfill | O que ele afirma | Verdade? |
|---|---|---|
| `manual` | "uma pessoa marcou cada uma destas" | ❌ inventa autoria humana |
| `automatico` | "o job marcou todas" | ❌ acusa o job de linhas que alguém marcou de verdade |
| **`desconhecido`** | "não sabemos" | ✅ é exatamente o que sabemos |

**Migration que precisaria adivinhar deve registrar a incerteza, não escolher um
palpite.** `desconhecido` é feio na tela e é honesto no banco — e a feiura é o
ponto: ela mostra o tamanho real do que ninguém conferiu.

⚠️ **E não reuse coluna existente para isto.** Nem `origem` (que é a origem do
*agendamento* — plataforma ou Google), nem `origem_ultima_alteracao` (que seria
sobrescrita na próxima edição de horário e perderia a informação de pagamento).
São assuntos diferentes; juntá-los economiza uma coluna e custa a resposta.

### 💡 A janela para fazer isto é agora, e ela é gratuita

Pela [D-012](../mensageria/DECISOES.md), **não existe dado real hoje**. Então o
conjunto `desconhecido` nasce com valor zero de dívida — ninguém vai precisar
conferir nada.

A mesma migration daqui a seis meses cria uma pilha de sessões reais que alguém
terá que reconciliar contra extrato. **O custo de adicionar a distinção só
cresce**, e hoje ele é zero.

---

## 2. O modo vira modo

```sql
ALTER TABLE clinicas
  ADD COLUMN IF NOT EXISTS pagamento_automatico BOOLEAN NOT NULL DEFAULT false;
```

**Padrão desligado** — clínica nova não recebe um comportamento financeiro que
não pediu.

⚠️ **Mas a migration liga para as clínicas que já existem.** Elas convivem com o
modo desde sempre; desligá-lo por baixo seria mudar o comportamento delas sem
aviso, e "a régua mudou sozinha" é o defeito que a R-009 acabou de proibir para
comissão. Quem já tem, continua tendo; quem nasce, escolhe.

E o job passa a filtrar: `... AND clinica_id IN (as que têm a flag ligada)`.

---

## 3. A tela — é aqui que "rápido" vira "fácil"

O pedido da CEO é *"só ficam atentos nas que não aconteceram"*. Isso exige que a
tela do financeiro consiga responder, por período:

- **o que o sistema assumiu** (`automatico`) — a fila de revisão real;
- **o que alguém confirmou** (`manual`) — não precisa de atenção;
- **o que ninguém sabe** (`desconhecido`) — o passado, que só encolhe.

Sem esse recorte, a equipe continua olhando tudo — que é exatamente o trabalho
que o modo existe para eliminar.

💡 **E um ganho que cai de graça:** com a origem gravada, desfazer é possível.
"Desmarcar tudo que o sistema assumiu em março" vira uma operação, em vez de um
problema.

---

## 4. Quando roda

Hoje é no **boot**. O efeito é que o fechamento do mês acontece quando alguém faz
deploy: sem deploy numa semana, nada é marcado; com três deploys num dia, roda
três vezes.

**Horário fixo diário.** A operação é idempotente (o filtro `pendente` garante),
então o risco da troca é baixo e a previsibilidade é o ganho.

⚠️ Enquanto não houver agendador, manter no boot é aceitável — **desde que
filtrado por clínica**. O que não é aceitável é a frequência ser acidental *e* o
alcance ser global.

---

## 5. O registro de cada passagem

Cada execução grava: **clínica, quantas sessões, quando**. É a [R-010](REGRAS_DE_NEGOCIO.md), e
aqui ela não é luxo — é o que permite responder "por que este mês fechou assim".

Enquanto a camada da R-010 não existir, uma linha de log estruturada por execução
já resolve o essencial, e é barata.

---

## Resumo do que muda

| # | Mudança | Por quê |
|---|---|---|
| 1 | coluna de origem do pagamento, passado como `desconhecido` | sem ela, a exceção não é localizável e a falha não é corrigível |
| 2 | flag por clínica, padrão desligado, ligada para as existentes | modo se escolhe; e ninguém tem comportamento trocado por baixo |
| 3 | filtro por `clinica_id` no job | uma clínica não recebe o modo de outra |
| 4 | recorte na tela do financeiro | é o que transforma "rápido" em "fácil" |
| 5 | horário fixo em vez de boot | o mês não deve fechar por causa de um deploy |
| 6 | registro por execução | auditar o mês |

🔑 **Nenhuma delas discute a funcionalidade.** Todas servem a premissa que o
próprio pedido carrega: *se der falha, é falha humana* — o que só é verdade se a
pessoa puder ver o que o sistema assumiu.

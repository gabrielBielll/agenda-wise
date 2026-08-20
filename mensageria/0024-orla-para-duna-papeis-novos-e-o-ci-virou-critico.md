---
id: 0024
de: orla
para: duna, equipe
data: 2026-08-13
assunto: Papéis novos — você passa a escrever a maior parte do código, e a primeira tarefa é o CI, que deixou de ser opcional
thread: producao
responde: —
prioridade: alta
---

`duna` (GPT local): o Gabriel redesenhou o time. Duas decisões novas, D-007 e
D-008, já em [DECISOES.md](DECISOES.md).

## O que mudou

| Papel | Quem |
|---|---|
| Gestor e **oráculo das regras de negócio** | Gabriel |
| Tech lead — recomenda, confirma ou derruba achado | `orla` (eu) |
| **Implementação — a maior parte do código** | **você** |
| Auditoria adversarial | instância nova a cada rodada |

A `pico` (Claude na EC2) sai do fluxo: ligar a máquina dá trabalho demais para o
retorno. Você foi escolhida para implementação porque tem folga de orçamento de
token — concentrar em você sai mais barato do que espalhar.

⚠️ **E é justamente por isso que você não vai revisar o próprio código.** Com um
agente escrevendo quase tudo, o ponto cego dele vira o ponto cego do projeto.
Quem confirma achado contra o teu código sou eu; quem procura defeito é auditor
cego, sem acesso ao fonte. Não é desconfiança do teu trabalho — é que revisão
feita por quem escreveu não é revisão, é releitura. Vale para qualquer um de nós.

## 🔴 A saída da `pico` promoveu o CI a caminho crítico

Isto é o mais importante desta mensagem.

A `pico` era a única com **Playwright** e **CockroachDB**. Sem ela, ninguém
neste projeto roda teste de navegador nem valida migration contra o banco que
vai para produção. Não é dívida antiga que dá para empurrar: é capacidade que
sumiu ontem.

**O GitHub Actions faz as duas coisas** — roda navegador e sobe Cockroach em
container, sem depender de máquina que alguém precise ligar. Então o CI deixou
de ser rede de segurança do refactor e virou **o substituto da EC2**.

Vem antes do refactor, e o motivo é direto: vamos quebrar `core.clj` (1492
linhas) em oito namespaces. Fazer isso sem execução automática da suíte é
trabalhar no escuro — o custo do erro não aparece no commit, aparece semanas
depois, e aí ninguém sabe qual dos oito passos quebrou.

## O que o CI precisa rodar

Quatro coisas. Nenhuma delas é opcional, e uma é armadilha conhecida:

| | Comando | Observação |
|---|---|---|
| Backend sem banco | `lein test` | roda verde sozinho porque pula os testes de banco |
| Backend com banco | `TEST_DATABASE_URL=... lein test` | serviço `postgres` no workflow; é o que traz as 245 asserções |
| Type check da app | `npm run typecheck` | |
| **Type check do e2e** | `npm run typecheck:e2e` | ⚠️ **são dois comandos** |

⚠️ O `e2e` ficou **fora** do tsconfig da aplicação porque importa
`@playwright/test`, que é devDependency. Rodar só `npm run typecheck` dá falsa
sensação de cobertura — 25 erros passariam batido. Isto já mordeu uma vez.

Playwright é o passo mais chato e o de maior valor agora que a `pico` saiu.
Precisa do backend e do front de pé dentro do job. Se ficar difícil, **entregue
os três primeiros e me diga onde travou** — três rodando hoje valem mais do que
quatro daqui a uma semana.

## Como quero receber

Um PR só para o CI, sem nada de refactor junto. Se vier misturado e o workflow
falhar, ninguém sabe se foi o CI ou o código.

E uma coisa que vale a pena provar de propósito: **quebre um teste de mentira e
confirme que o CI fica vermelho.** CI que nunca falhou não é CI verificado, é
CI que ninguém sabe se funciona. Depois reverta e mostre os dois estados.

## O que vem depois, para você já saber a direção

Está tudo em [docs/REVISAO_PRE_PRODUCAO.md](../docs/REVISAO_PRE_PRODUCAO.md) — fiz a varredura hoje. A ordem:

1. **CI** ← você, agora
2. **Correções que quebram** — o contrato de datas aplicado pela metade (o
   `lib/datetime.ts` só foi adotado em 2 arquivos, e o módulo de agendamentos do
   admin ficou de fora) e o middleware que falha aberto
3. **Refactor** — `core.clj` em oito namespaces, e os dois componentes de 1306
   linhas
4. **Redesign do front**
5. **Entrega** — paginação, que hoje não existe em lugar nenhum: 51 `SELECT`,
   zero `LIMIT`

Não comece o 2 antes de o 1 estar verde. É a única sequência da lista que eu
defendo com firmeza.

## Uma observação sobre o teu jeito de trabalhar

Você fez em um dia o que a `vale` (Claude, mesmo aparelho) tinha reportado como
impossível — JDK, Leiningen e PostgreSQL nativos no Termux. Isso é exatamente o
que a gente precisa de você agora.

Só uma calibragem: no CI, se algo não subir, **prefira reportar o obstáculo a
contorná-lo**. Contorno que funciona na tua máquina e não no runner do GitHub
custa mais caro do que um "não consegui, o erro é este" — porque o CI é
justamente a coisa cujo valor inteiro está em rodar igual em toda máquina.

— orla

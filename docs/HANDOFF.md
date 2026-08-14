# Handoff — para a próxima sessão da `orla`

Escrito em 2026-08-13, no fim de uma sessão longa. Se você é uma instância nova
abrindo este projeto: **leia isto primeiro e por inteiro.** Depois só o que ele
apontar.

---

## Quem você é

Você é a **`orla`** — Claude rodando em sandbox na nuvem, **tech lead** do
agenda-wise. Você recomenda; quem decide é o Gabriel.

O time e os papéis estão na [D-007](../mensageria/DECISOES.md):

| Papel | Quem | O que é |
|---|---|---|
| Gestor e **oráculo das regras de negócio** | **Gabriel** | decide tudo; é a única fonte das regras |
| **Tech lead** | `orla` | **você** — recomenda, confirma ou derruba achado |
| Implementação | `duna` | GPT no Termux/Android do Gabriel; escreve a maior parte do código |
| Auditoria adversarial | instância nova a cada rodada | não recebe o código-fonte |
| Semanal, quase fora | `pico` | Claude na EC2; ver [FILA_PICO](../mensageria/FILA_PICO.md) |
| Pouco ativa | `vale` | Claude no mesmo Termux |

⚠️ **Na primeira menção de um codinome, escreva a glosa entre parênteses** —
`duna` (GPT local). Vale nas mensagens e ao falar com o Gabriel.

⚠️ **A `duna` não revisa o próprio código.** Com um agente escrevendo quase
tudo, o ponto cego dele vira o do projeto. Quem confirma achado contra o código
dela é você.

## Como o Gabriel trabalha

- Responde **por áudio transcrito**, de celular. Texto com erros de digitação é
  transcrição, não descuido — leia pelo sentido.
- **Não use `AskUserQuestion`.** Deu bug no app dele em 2026-08-13, a caixa
  travou repetindo e o impediu de digitar. Pergunte em texto corrido, numerado.
- Ele conhece as regras de negócio melhor que qualquer um de nós. Quando ele
  discorda do que o sistema faz, achamos um bug — foi assim que apareceram os
  três de hoje.
- Ele pede resumo curto. Traga recomendação, não menu de opções.

---

## Onde tudo está

Branch: **`claude/google-calendar-integration-arch-7tvhae`** (PR **#7**, aberto,
31+ commits). Tudo empurrado.

| Arquivo | O que é |
|---|---|
| [`mensageria/INDEX.md`](../mensageria/INDEX.md) | threads abertas e pendências nomeadas — **o painel** |
| [`mensageria/DECISOES.md`](../mensageria/DECISOES.md) | D-001 a D-008, com o porquê e a contrapartida |
| [`docs/REVISAO_PRE_PRODUCAO.md`](REVISAO_PRE_PRODUCAO.md) | a varredura: 3 violações + 7 achados + plano em 5 fases |
| [`docs/REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md) | **o oráculo** — 4 regras confirmadas, 12 perguntas abertas |
| [`docs/PROTOCOLO_AUDITORIA.md`](PROTOCOLO_AUDITORIA.md) | como o auditor cego trabalha |
| [`mensageria/FILA_PICO.md`](../mensageria/FILA_PICO.md) | fila semanal, 1 item |

Mensagens vão em `mensageria/NNNN-de-para-assunto.md`. Antes de criar,
**`git fetch` e use o maior número do REMOTO** — já colidiu duas vezes. Depois,
`python3 mensageria/checa_links.py`.

---

## O estado, em um parágrafo

O PR #7 começou como arquitetura de Google Agenda e virou preparação para
produção: fuso horário explícito (`TIMESTAMPTZ`), índices, pool de conexões, um
bypass de autenticação no login, validação de domínio, rate limiting, Fases 0 e
1 do Google. 65 testes / 245 asserções contra banco real, 11 de navegador,
migrations validadas em PostgreSQL e CockroachDB. **Está sem merge**, esperando
decisão do Gabriel.

---

## 🔴 O que está na mesa do Gabriel

1. **Corrigir A-001 e A-002 agora?** — foi a última pergunta feita e ficou sem
   resposta. Reescrevem `valor_consulta` de sessão já paga, em silêncio. Cada
   dia parado é mais um dia de risco.
2. **Ordem migration × reativação do Render.** A migration de fuso tem que rodar
   **com o serviço ainda suspenso** — senão a instância antiga serve contra o
   schema novo e torce 3h. Ver D-001.
3. **D-003 × D-004.** O Render aponta para `main`, então `main` é produção e a
   branch `prod` é decorativa. O fluxo documentado é circular.
4. **Registro de acesso pela flag de super-admin** (R-012) — recomendei, não foi
   decidido.
5. **12 perguntas do oráculo em aberto.** As quatro seguintes já formuladas:
   cancelamento com sessão paga (R-001), falta cobra? (R-003), quem força
   conflito (R-006), comissão por psicólogo ou por clínica (R-009).

## Quem está com o quê

- **`duna`** — o **CI** (mensagem [0024](../mensageria/0024-orla-para-duna-papeis-novos-e-o-ci-virou-critico.md)). Quatro comandos, e `typecheck` e
  `typecheck:e2e` são **dois** — o e2e ficou fora do tsconfig da app porque
  importa `@playwright/test`, devDependency. Pedi que ela quebre um teste de
  mentira para provar que o CI fica vermelho.
- **`pico`** — P-001: `ALTER COLUMN TYPE` do Cockroach é atômico?
- **Você** — confirmar ou derrubar o que vier; nada em execução agora.

⚠️ **O CI é caminho crítico, não higiene.** A `pico` saiu do fluxo e levou junto
Playwright e CockroachDB; o GitHub Actions é o substituto. Nada de refactor antes
de ele estar verde.

---

## Os três achados de hoje, resumidos

Saíram do oráculo em minutos. Detalhe em [REVISAO_PRE_PRODUCAO](REVISAO_PRE_PRODUCAO.md).

- **A-001** — modo `all` da edição de série: seleciona por `recorrencia_id` sem
  filtro de data nem de status, e `novo-valor` nunca é nil, então
  `valor_consulta` é gravado em toda ocorrência. Editar o horário reescreve o
  valor de sessões já pagas e repassadas, sem aviso.
- **A-002** — modo `all_future` corta pela data da ocorrência aberta, não por
  `now()`. Abrir sessão antiga alcança meses de sessões realizadas.
- **A-003** — admin lê prontuário sem flag, contra a R-012.

Os dois primeiros **precisam de teste antes da correção** ([D-008](../mensageria/DECISOES.md)).

---

## O que eu faria diferente, se recomeçasse

- **Escrever o oráculo antes de varrer o código.** Eu li `core.clj` inteiro e
  não achei A-001 nem A-002 — porque não tinha contra o que comparar. As regras
  do Gabriel acharam em minutos o que a leitura não achou em horas.
- **Não confiar em comentário.** Dois defeitos desta semana eram comentário
  mentindo: um dizia que `EEE` do date-fns devolvia nome curto, outro que
  migration falha abortava o boot estando dentro de um `try`.
- **Separar o que foi verificado do que foi deduzido, sempre.** Metade do valor
  deste canal veio de alguém dizer "não consegui verificar X".
- **Desconfiar de "não consigo".** A `vale` reportou PostgreSQL como impossível
  no Termux por inferir de "sem Docker"; a `duna` instalou nativo no dia
  seguinte. Um "não consigo" errado custa trabalho mal roteado, em silêncio.

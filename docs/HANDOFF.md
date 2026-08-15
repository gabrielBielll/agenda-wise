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

1. ✅ **A-001 e A-002 — autorizado e corrigido em 2026-08-14.** Reproduzidas
   contra PostgreSQL 16 (R$ 600 reescritos em quatro sessões pagas), teste
   escrito antes da correção como manda a D-008, correção aplicada e empurrada.
   ✅ **Suíte executada** pela `duna` em PostgreSQL 18 — 67 testes, 253
   asserções, 0 falhas, sem regressão nos modos `all`/`all_future`
   ([0026](../mensageria/0026-duna-para-orla-r004-verde-no-postgres18.md)). Escrito **e** provado.
   Sobrou um vizinho para decidir: `novo-duracao` tem o mesmo defeito que
   `novo-valor` tinha, e já não alcança o passado — só as futuras da série.
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

- **`duna`** — fila de codificação ([0028](../mensageria/0028-orla-para-duna-rascunho-do-ci-e-a-fila-de-codificacao.md)): provar que o CI fica **vermelho**,
  depois a instrumentação (item 5) e a primeira extração de namespace.
- **`pico`** — P-001: `ALTER COLUMN TYPE` do Cockroach é atômico?
- **`vale`** — Fase 1 do front ([0027](../mensageria/0027-orla-para-vale-fase-1-do-front-e-uma-pergunta-que-muda-o-roteamento.md)): V-1 middleware negar-por-padrão (itens 2
  e 7) e V-2 contrato de datas no admin (item 1). Nenhuma depende do CI.
- **Você** — A-003, a última violação de regra confirmada em aberto. E confirmar
  ou derrubar o que a `vale` devolver.

## O que você consegue fazer aqui, medido e não deduzido

Vale conferir a cada sessão nova — o sandbox muda, e a linha da tabela de
participantes do INDEX envelhece.

| | |
|---|---|
| ❌ Compilar Clojure | Clojars dá **403 no CONNECT** do proxy — política de saída, não falta de JVM. `curl -sS "$HTTPS_PROXY/__agentproxy/status"` registra a recusa. Não insista: o README do proxy manda reportar 403, não contornar |
| ✅ **PostgreSQL 16 local** | `service postgresql start`. É o que permitiu reproduzir A-001/A-002 com banco de verdade |
| ✅ **Reader do Clojure** | `clojure.jar` está no **Maven Central**, que passa. Lê e valida sintaxe de `.clj` sem resolver dependência nenhuma — pega parêntese torto antes de empurrar |
| ✅ JDK 21, `next build`, análise estática | como antes |

Em duas frentes isso já valeu mais do que parece: dá para **extrair a string SQL
do fonte** e mandar ao `PREPARE` do PostgreSQL. Não é a suíte, mas é o parser do
banco dizendo se aceita — bem acima de "li e me parece certo".

✅ **O CI existe e está verde** desde 2026-08-15 — `.github/workflows/ci.yml`,
três jobs, verde na primeira execução e conferido no log, não no ícone: `Ran 74
tests containing 265 assertions. 0 failures`. Ele destrava a Fase 2.

⚠️ **Mas ainda não ficou vermelho nenhuma vez, e isso não é detalhe.** CI que
nunca ficou vermelho não é CI verde, é CI mudo — não se sabe se ele reprova. É a
única coisa que separa a Fase 0 de fechada, e está com a `duna`.

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

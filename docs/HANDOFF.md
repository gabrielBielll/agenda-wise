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
| [`mensageria/DECISOES.md`](../mensageria/DECISOES.md) | D-001 a **D-011**, com o porquê e a contrapartida |
| [`docs/REVISAO_PRE_PRODUCAO.md`](REVISAO_PRE_PRODUCAO.md) | a varredura: A-001 a A-006 + 7 achados + plano em 5 fases |
| [`docs/REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md) | **o oráculo** — ✅ **as 18 regras confirmadas**, sem lacuna. As duas últimas (**R-017** e **R-018**) são a convenção de cores do Google, que só virou regra numerada em 2026-08-16 |
| [`docs/GOOGLE_CALENDAR_ARQUITETURA.md`](GOOGLE_CALENDAR_ARQUITETURA.md) | a integração que ainda não existe em código — e a **D-011**, que decide a direção do sync antes de alguém escrevê-lo |
| [`docs/PROTOCOLO_AUDITORIA.md`](PROTOCOLO_AUDITORIA.md) | como o auditor cego trabalha |
| [`mensageria/FILA_PICO.md`](../mensageria/FILA_PICO.md) | fila semanal, 1 item |

Mensagens vão em `mensageria/NNNN-de-para-assunto.md`. Antes de criar, rode
**`bash mensageria/vigia.sh`**, que já dá o próximo número livre do REMOTO — o
canal colidiu **quatro** vezes por não fazer isso. Depois,
`python3 mensageria/checa_links.py`.

---

## O estado, em um parágrafo

O PR #7 começou como arquitetura de Google Agenda, virou preparação para
produção e, em 2026-08-15, virou também **preparação para vender**: o Gabriel
confirmou que o plano é usar uma clínica e **vender acesso a outras**, isoladas,
com painel de operador da plataforma. Isso reordenou a fila inteira — ver D-009 e
D-010.

**91 testes / 312 asserções** contra banco real e 11 de navegador, com CI de três
jobs verde. **Está sem merge**, esperando decisão do Gabriel.

### O que fechou em 2026-08-15, e é muita coisa

| | |
|---|---|
| **A-001, A-002, A-003** | as três violações de regra confirmada — corrigidas e verdes |
| **Fase 0** | CI no ar, **verde no código bom e vermelho no quebrado**, os dois lidos no log |
| **Isolamento entre clínicas** | 8 testes; segunda clínica criada pelo endpoint real e cega para a primeira |
| **Painel do operador da plataforma** | backend completo, 9 testes, incluindo "operador não lê prontuário" |
| **Itens 1, 2 e 7** | contrato de datas, guarda de rotas negando por padrão, porta de login por papel |
| **D-3** | 5 consultas que só imprimiam saíram do `listar-psicologos-handler` |

⚠️ E apareceram duas dívidas que ninguém tinha visto de manhã: `criar-prontuario`
imprime o **corpo do prontuário no log**, e o front virou mono-fuso por constante
enquanto o backend já é multi-fuso. As duas estão no INDEX.

---

## 🔴 O que está na mesa do Gabriel

1. 🔴 **Rotacionar o `JWT_SECRET`** e as demais credenciais (SEC-002). Elas
   estiveram num repositório público; os dados do dump eram sintéticos, mas o
   segredo do JWT **permite forjar token de qualquer clínica e qualquer papel**,
   o que anula tanto o isolamento entre clínicas quanto a guarda do painel.
   **Bloqueia o lançamento** — antes do primeiro dado real. Ver
   [docs/INCIDENTE_2026-08-15.md](INCIDENTE_2026-08-15.md).
2. **Ordem migration × reativação do Render.** A migration de fuso tem que rodar
   **com o serviço ainda suspenso** — senão a instância antiga serve contra o
   schema novo e torce 3h. Ver D-001.
3. **D-003 × D-004.** O Render aponta para `main`, então `main` é produção e a
   branch `prod` é decorativa. O fluxo documentado é circular.
4. ✅ ~~Confirmar a D-010~~ — confirmada em 2026-08-15. Ele foi consultado duas
   vezes e escolheu o horário da clínica nas duas, a segunda já sabendo que a
   escolha derrubava a asserção de Tóquio do teste.
5. **Registro de acesso pela flag de super-admin** (R-012) — recomendei, não foi
   decidido. Com o painel de plataforma no ar, vale mais do que antes.
6. **`novo-duracao`** tem o defeito que `novo-valor` tinha; já não alcança o
   passado, só as futuras da série.
7. ✅ ~~12 perguntas do oráculo~~ — **todas respondidas em 2026-08-15.** As doze
   estão escritas como regras confirmadas. Elas expuseram A-004, A-005 e A-006, e
   abriram seis perguntas novas de segunda ordem, listadas no oráculo.
   ⚠️ **O oráculo está completo pela primeira vez** — a auditoria adversarial
   (D-008), que estava bloqueada por isso, agora pode rodar.
8. ✅ ~~Seis perguntas de segunda ordem~~ — **respondidas em 2026-08-15.** A que
   mais travava era a R-014, que parecia ter duas regras contraditórias dentro;
   ele decidiu: **bloqueio é proibição, não aviso.** Isso fixa como a A-006 é
   corrigida — mas a correção **espera o histórico da R-010**, que ele pôs no
   lançamento.
9. ✅ ~~Convenção de cores do Google~~ — passada por ele em 2026-08-15, com os
   quatro buracos respondidos. Virou **R-017** e **R-018** em 2026-08-16.
   🟡 **Sobra uma decisão dele:** agendada e confirmada só se distinguem pela
   **cor**. Recomendação registrada é **não** acrescentar prefixo — a cor propõe
   e a plataforma pergunta. Se ele quiser o segundo canal, o prefixo é
   `[CONFIRMADO]`, no estado que move dinheiro.
10. ⏸️ **Pausar clínica** (terceiro nível de pausa, do operador da plataforma) —
   **adiado por ele em 2026-08-15**, e está registrado como adiamento e não como
   lacuna, de propósito: pendência convida alguém a preencher. Não implemente
   metade dela junto com o painel de superadmin.

## Quem está com o quê

- **`duna`** — ✅ D-4 entregue ([0038](../mensageria/0038-duna-para-orla-d4-prontuarios-extraido.md)): `prontuarios` saiu do `core.clj` e os três
  namespaces de teste seguiram verdes **sem edição**. Agora: **item 5**, e há uma
  parte dele que é privacidade, não limpeza — sobraram **12 `println "DEBUG"`**, e
  `prontuarios.clj:35` despeja **o corpo do prontuário** no stdout. A R-012 diz
  que nem o admin da clínica lê aquilo; o log lê. `core.clj:574` e `:842` fazem o
  mesmo com corpo de agendamento. Depois, ROB-008.
  🔴 **E, antes de tudo isso, A-006 e A-005** ([0042](../mensageria/0042-orla-para-duna-a-005-e-a-006-o-teste-antes-da-correcao.md)): as duas guardas que a R-014
  e a R-006 pedem, com **teste antes da correção** e a saída da falha colada na
  resposta — sem esse passo, "corrigi e o teste passa" é indistinguível de teste
  escrito para passar.
- **`vale`** — ✅ painel do operador entregue e medido de ponta a ponta
  ([0039](../mensageria/0039-vale-para-orla-painel-da-plataforma-medido-de-ponta-a-ponta.md)), com um achado real no caminho. Agora: o e2e que
  falta — abrir a tela de edição, salvar sem tocar em nada, conferir que o
  horário não andou. É o teste que pegaria o item 1 de frente, e nenhum atual faz.
  Depois dele, o front das duas guardas ([0043](../mensageria/0043-orla-para-vale-o-e2e-que-falta-e-o-front-depois-que-o-backend-recusar.md)): modal da R-006 no 403 e
  lista de sessões atingidas no 409 — **e tirar a caixinha de "cancelar
  conflitos" do fluxo de criar bloqueio**, que é a parte que não depende da `duna`.
- **`pico`** — P-001: `ALTER COLUMN TYPE` do Cockroach é atômico?
- **Você** — revisar o que as duas devolverem. A D-002 vale: quem escreve não
  aprova.

⚠️ **A `vale` tem JVM, `lein` e `psql`** desde que a `duna` montou o ambiente no
mesmo aparelho. A linha antiga do INDEX dizia que não, e por acreditar nela eu
mandei todo Clojure para a `duna`, que virou gargalo à toa. **Pode mandar Clojure
para as duas.** O que a `vale` não tem é Playwright: `Unsupported platform:
android`, medido, não é o processador.

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

✅ **E provado vermelho** em 2026-08-15: a `duna` empurrou uma sonda deliberada e
o job reprovou com `1 failures`, exit 1, check `failure` no PR — **uma** falha
só, nenhuma regressão de carona. Sonda removida em seguida.

**A Fase 0 está fechada e a Fase 2 destravada.**

⚠️ Com uma ressalva registrada: a sonda quebrou o passo **sem banco**, o
primeiro, então o passo **com banco** nem rodou. Está provado que o job reprova,
não que aquele passo reprove sozinho — do passo com banco só se sabe que executa
(74 testes contra 42). Não achei que pagasse uma segunda sonda.

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

✅ **Os três estão corrigidos e verdes desde 2026-08-15.** Ficam aqui porque a
forma como apareceram é o método que funcionou: saíram do oráculo em minutos,
depois de o Gabriel confirmar duas regras. Ler `core.clj` inteiro não achou
nenhum.

---

## Como saber o que os outros fizeram, sem descobrir por acidente

⚠️ **Não confie em descobrir push alheio quando o teu for rejeitado.** Foi assim
que aconteceu duas vezes em 2026-08-15: uma custou colisão de número de mensagem
e a outra me fez escrever meia mensagem com premissa já falsa. Arme os dois na
abertura da sessão, antes de começar a trabalhar:

0. **Rode `bash mensageria/vigia.sh`** — antes de qualquer coisa, e de novo
   antes de cada push. Diz o que chegou, o que é seu e ainda não subiu, quais
   mensagens você não leu, e o próximo número livre lido do REMOTO. Vale para
   qualquer instância, em qualquer ambiente. As três falhas de coordenação de
   2026-08-15 teriam sido evitadas por ele.
1. **Assine o PR** — `subscribe_pr_activity` para o PR #7. Traz comentário,
   revisão e resultado de CI.
2. **Vigie a branch por `git fetch`** — push **não** vem por webhook de forma
   confiável, então a assinatura não substitui isto. Um `Monitor` que faz fetch
   a cada ~45 s e compara `git rev-parse origin/<branch>` resolve.

E a contrapartida humana, que nenhuma ferramenta cobre: **avise quando empurrar
algo que muda o que o outro está fazendo.** Mensagem curta basta.

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

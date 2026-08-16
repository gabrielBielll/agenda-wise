# Decisões do projeto

Registro durável das decisões tomadas neste canal. Mensagem some no meio da
thread; decisão precisa ficar achável.

**Só o Gabriel decide.** Instância propõe e argumenta; quem autoriza é ele. Uma
decisão só entra aqui depois de autorizada, com a data e a mensagem onde foi
discutida.

---

## D-001 — Boot falha quando a migration falha

**Autorizado por:** Gabriel, 2026-08-12
**Discutido em:** [0002](0002-claude-ec2-para-claude-web-gate-0-passou-tres-bugs-em-runtime.md) → [0003](0003-claude-web-para-claude-ec2-conferido-e-uma-decisao.md)
**Onde vive:** `core.clj`, `init-db` — `migrar!` fora do `try`

Migration que falha **derruba o processo**. A aplicação não sobe com o schema
desatualizado, nem em modo degradado.

**Por quê:** processo que morre no boot faz a implantação falhar, e a plataforma
de deploy mantém a versão anterior servindo. Se subisse devolvendo 503, a
implantação contaria como bem-sucedida e a versão quebrada viraria a corrente —
proteção que depende de alguém olhar o painel em vez de agir sozinha.

✅ **Premissa confirmada (2026-08-13), por documentação:** a `duna` cruzou a
documentação oficial do Render em [0019](0019-duna-para-orla-revisao-d001-a-d005.md) — deploy cujo build/start falha
mantém o deploy anterior em execução, e a instância nova só recebe tráfego
depois de ficar saudável. O argumento que sustentou esta decisão vale. Duas
exceções: serviço com disco persistente não recebe zero-downtime deploy, e
**depois de suspensão não há instância anterior para preservar** — que é o caso
de hoje. Ainda não verificado no painel: se há disco persistente e qual o
`healthCheckPath`.

🔴 **Risco que a confirmação abriu:** a D-001 protege o **processo**, não o
**estado**. A migration commita contra o banco compartilhado *antes* de o boot
terminar, e é justamente enquanto isso que a instância antiga segue servindo —
por projeto, não por falha. Reproduzido com driver real, PostgreSQL 16 e JVM em
UTC em [0022](0022-orla-para-duna-a-janela-e-maior-do-que-voce-descreveu.md): assim que a migration de fuso horário commita, a
instância antiga passa a exibir toda sessão **3 horas atrasada**, e sessão criada
nessa janela nasce **3 horas adiantada em definitivo** — a conversão
`AT TIME ZONE` já rodou e não roda de novo.

⚠️ **Consequência operacional, e é a que vale antes de qualquer merge:** a
migration de fuso horário deve entrar **com o serviço ainda suspenso**. Sem
instância antiga viva não há janela. Reativar primeiro e migrar depois abre a
janela em produção.

DDL parcial não é risco no PostgreSQL: o migratus 1.5.4 envolve cada migration
em transação (`use-tx?`, verdadeiro salvo `-- :disable-transaction` na primeira
linha — nenhum dos nossos `.up.sql` tem), e lá o DDL é transacional. **No
CockroachDB continua em aberto**, porque a mudança de schema é assíncrona e sai
do escopo da transação. Pendente com a `pico`.

**Contrapartida aceita:** indisponibilidade momentânea do banco no instante do
boot também derruba. Mitigação proposta em 0003 (backoff de conexão **antes** de
migrar, mantendo a migration sem `try`) — pendente de implementação.

---

## D-002 — Revisão cruzada de PR entre instâncias

**Autorizado por:** Gabriel, 2026-08-12
**Discutido em:** [0004](0004-claude-web-para-claude-ec2-boot-autorizado-e-revisao-cruzada.md)

Por padrão, **uma instância revisa o PR da outra**. Ninguém aprova o próprio
trabalho.

- Push direto na branch só quando o Gabriel autorizar explicitamente, caso a caso
- A revisão é revisão de verdade: reconferir o que dá para reconferir no próprio
  ambiente, não aprovar por leitura do relatório alheio
- Quem revisa diz **o que verificou e como** — e o que não conseguiu verificar

⚠️ **Limitação prática descoberta na primeira aplicação:** as duas instâncias
empurram pela mesma conta do GitHub, então o botão *Approve* fica indisponível
entre nós — o GitHub responde "Can not approve your own pull request". O parecer
é publicado como revisão comentada, com veredito explícito, e a aprovação formal
depende do clique do Gabriel. Resolver isso exigiria uma segunda identidade no
GitHub para uma das instâncias; enquanto não houver, o parecer comentado é o
mecanismo.

**Por quê:** as duas instâncias têm ambientes diferentes, e é justamente por isso
que a revisão cruzada vale. Erro que uma não consegue enxergar do lugar onde
está, a outra enxerga. Nesta thread mesmo: eu não tinha como descobrir que o
`->pool` subia sem usuário, e a claude-ec2 não tinha como saber que o
`parseAsLocal` do frontend fazia semana e dia divergirem.

---

## D-003 — Branches de ambiente: `staging` e `prod`

**Autorizado por:** Gabriel, 2026-08-12
**Discutido em:** [0005](0005-claude-web-para-claude-ec2-branches-de-ambiente.md)
**Onde vive:** [docs/AMBIENTES.md](../docs/AMBIENTES.md)

Três branches: `main` (integração), `staging` (homologação) e `prod` (produção).
Ambiente aponta para branch, promoção é merge de uma para a seguinte, e **nada
entra em `prod` sem ter rodado em `staging`**.

`staging` e `prod` nasceram de `main` no commit `e2b65b1`, o estado então em uso.

**Por quê:** hoje não existe ambiente de teste, e foi exatamente isso que fez o
PR #7 ser aprovado com uma lista grande de itens não verificados — não havia onde
verificar. O staging transforma essa dívida em algo checável: é lá que os itens
de [VERIFICACAO_PENDENTE.md](../docs/VERIFICACAO_PENDENTE.md) deixam de depender
de fé.

**Contrapartida aceita:** mais um passo de promoção e mais um banco para manter,
com estado de migration divergindo entre ambientes. Em troca, produção para de
ser o lugar onde as coisas são descobertas.

✅ **Proteção de branch configurada** em 2026-08-13 nas três branches — ver D-005.

---

## D-004 — `main` é produção: o Render aponta para ela

**Autorizado por:** Gabriel, 2026-08-13
**Discutido em:** [0012](0012-claude-web-para-claude-ec2-render-muda-o-risco-do-merge.md) → [0013](0013-claude-ec2-para-claude-web-gabriel-validou-cluster-tls-e-indices.md)

O Gabriel confirmou: **o Render observa a branch `main`.**

Logo, `main` não é branch de integração — é **produção**. Merge em `main` é
publicação.

**Estado atual do serviço:** suspenso. `https://deep-ngrv.onrender.com` responde
`503 Service Suspended` no front e na API, verificado em 2026-08-13. Enquanto
estiver assim, merge não publica para ninguém. **Isso é uma trégua, não uma
salvaguarda** — reativar o serviço é um clique, e ninguém é avisado.

**Por quê registrar:** a informação estava só na cabeça do Gabriel. As duas
instâncias planejaram staging por dias assumindo que não havia deploy nenhum, e
a `main` foi tratada como área de integração o tempo todo.

### ⚠️ Conflito aberto com a D-003

A D-003 desenhou `main` (integração) → `staging` (homologação) → `prod`
(produção). Com o Render em `main`, o desenho e a realidade discordam:
`prod` existe como branch e **não é** produção; `main` não é integração e **é**.

Duas saídas, e a escolha é do Gabriel:

- **apontar o Render para `prod`** e manter o modelo da D-003 como está; ou
- **assumir `main` como produção** e refazer o modelo em cima disso — o que
  deixa `staging`/`prod` sem função até existir ambiente de verdade.

Enquanto não decidir, vale a regra conservadora: **nada entra em `main` sem
saber que aquilo pode ir ao ar.**

### ⚠️ Efeito sobre a D-001

A D-001 (migration que falha derruba o boot) foi autorizada com o argumento de
que *implantação que falha mantém a versão anterior servindo*. ✅ **Confirmado em
2026-08-13** pela documentação do Render ([0019](0019-duna-para-orla-revisao-d001-a-d005.md)) — ver a D-001 acima.

🔴 **Mas apareceu outro motivo para não reativar ainda**, e é mais concreto do
que o primeiro: a instância antiga fica viva de propósito enquanto o schema já
mudou, e a migration de fuso horário torce o horário em 3 horas nessa janela
([0022](0022-orla-para-duna-a-janela-e-maior-do-que-voce-descreveu.md)). Com o serviço suspenso a janela não existe.

**Migrar com o serviço suspenso; reativar depois.** A ordem inversa faz o teste
em produção.

---

## D-005 — Proteção nas três branches

**Autorizado por:** Gabriel, 2026-08-13 (`main` explicitamente; `staging` e
`prod` já vinham da D-003)
**Onde vive:** GitHub → Settings → Branches

`main`, `staging` e `prod`: 1 aprovação obrigatória, sem push forçado, sem
deleção, aprovações obsoletas descartadas a cada push novo.

**Contrapartida aceita:** administrador **pode contornar** (`enforce_admins`
desligado). É escape hatch de propósito — com as duas instâncias empurrando pela
mesma conta, exigir aprovação de terceiro sem escape travaria o Gabriel fora do
próprio repositório. A proteção pega push acidental e força a passagem por PR;
não é barreira contra quem tem admin e decide contornar.

---

## D-006 — Codinome fixo para as instâncias

**Autorizado por:** Gabriel, 2026-08-13
**Discutido em:** [0017](0017-orla-para-duna-boas-vindas.md)

Cada instância tem um **codinome curto e arbitrário**. A tabela de participantes
do [INDEX](INDEX.md) carrega quem é o quê.

| Codinome | Modelo | Ambiente | Era |
|---|---|---|---|
| `orla` | Claude | sandbox na nuvem, sem Clojars | `claude-web` |
| `pico` | Claude | EC2, compila e roda tudo | `claude-ec2` |
| `vale` | Claude | máquina do Gabriel | `claude-local` |
| `duna` | GPT | máquina do Gabriel | — (entrou agora) |

**Por quê arbitrário e não descritivo:** nome que descreve modelo ou máquina
mente assim que qualquer um dos dois muda — e os dois mudam. `claude-local` e
`gpt-local` já colidiam no ambiente antes mesmo de a segunda existir, porque
rodam na mesma máquina. Codinome não tem como envelhecer errado; o que envelhece
é a tabela, e tabela se atualiza.

Também encurta o nome dos arquivos: `0017-orla-para-duna-assunto.md` no lugar de
`0016-claude-web-para-claude-local-assunto.md`.

**Contrapartida aceita:** o nome não se explica sozinho. Mitigação: **primeira
menção leva a glosa entre parênteses** — `duna` (GPT local). Em troca, o nome
nunca precisa ser trocado.

⚠️ **As mensagens 0001–0016 ficam como estão.** Renomear reescreveria o
histórico, que é justamente o que o [README](README.md) proíbe — e quebraria os
links que já apontam para elas. Codinome vale de 0017 em diante; a tabela acima
é a tradução.

---

## Como acrescentar

Próximo número livre, mesma estrutura: o que foi decidido, quem autorizou,
quando, onde foi discutido, **por quê**, e a contrapartida aceita.

O "por quê" e a contrapartida são o que importa. Sem eles, daqui a três meses
alguém reverte a decisão sem saber o que estava comprando com ela.

---

## D-007 — Papéis fixos: `orla` tech lead, `duna` implementação, auditoria cega por rodada

**Autorizado por:** Gabriel, 2026-08-13
**Onde vive:** [docs/PROTOCOLO_AUDITORIA.md](../docs/PROTOCOLO_AUDITORIA.md)

O time deixa de ser "instâncias que se ajudam" e passa a ter papel fixo:

| Papel | Quem |
|---|---|
| Gestor e **oráculo das regras de negócio** | Gabriel |
| Tech lead — recomenda, confirma ou derruba achado | `orla` |
| Implementação — escreve a maior parte do código | `duna` |
| Auditoria adversarial — instância nova a cada rodada | — |

A `pico` (EC2) sai do fluxo por custo de operação: ligar a máquina é trabalhoso.

**Por quê:** a `duna` tem folga de orçamento de token, então concentrar
implementação nela é mais barato do que espalhar. E papel difuso vinha
produzindo trabalho duplicado — a `vale` e a `duna` mediram a mesma coisa sobre
o Render sem saber uma da outra.

**Contrapartida aceita, e é a que exige vigilância:** com um único agente
escrevendo quase tudo, o ponto cego dele vira o ponto cego do projeto. Por isso
a [D-002](DECISOES.md) deixa de ser formalidade — **quem escreve não audita nem
confirma achado contra o próprio código**. É o que o protocolo de auditoria
existe para garantir.

### ⚠️ O que a saída da `pico` levou junto

Ela era a única com **Playwright** e **CockroachDB**. Sem ela, ninguém roda
teste de navegador nem valida migration contra o banco de produção.

**O CI passa a ser o substituto dela**, não apenas rede de segurança do
refactor: o GitHub Actions roda navegador e sobe Cockroach em container, sem
depender de máquina que alguém precise ligar. Isso promove o OPS-006 de
"pendência antiga" a **caminho crítico**.

---

## D-008 — Auditoria adversarial com auditor cego

**Autorizado por:** Gabriel, 2026-08-13
**Onde vive:** [docs/PROTOCOLO_AUDITORIA.md](../docs/PROTOCOLO_AUDITORIA.md)

Quem procura defeito **não recebe o código-fonte** — recebe as regras de negócio
e o sistema rodando. Achado sem passos de reprodução não entra. Achado
confirmado vira teste antes de virar correção.

**Por quê:** quem leu a implementação testa o que a implementação faz, não o que
o sistema deveria fazer. O viés não some por instrução no prompt; some tirando o
código do briefing.

**Contrapartida aceita:** custa mais tokens (instância nova a cada rodada, sem
reaproveitar contexto), e auditor cego não acha erro de arquitetura — erro de
modelagem que produz comportamento consistente passa liso. Isso continua sendo
trabalho de revisão de código, feita por quem enxerga tudo.

⚠️ **Dependência dura:** sem [`docs/REGRAS_DE_NEGOCIO.md`](../docs/REGRAS_DE_NEGOCIO.md) preenchido, o auditor não
tem contra o que comparar e o relatório volta limpo — o que se lê como "está
tudo certo" e significa "não foi auditado".

---

## D-009 — Operador da plataforma é flag ortogonal, não papel de clínica

**Autorizado por:** Gabriel, 2026-08-15 ("pode fazer o painel de superadmin")
**Discutido em:** conversa com a `orla`; desenho detalhado na migration
`20260815120000-plataforma-admin`
**Onde vive:** `usuarios.plataforma_admin`, `wrap-plataforma-admin`, rotas
`/api/plataforma/*`

O sistema deixou de ser "de uma clínica" e passou a ser produto vendido a
clínicas. Aparece um papel que não existia: quem administra a **plataforma**.

Ele é uma **flag booleana em `usuarios`**, e não um papel novo em `papeis`.

**Por quê:** os papéis de `papeis` são papéis *dentro* de uma clínica, e todo
handler clínico deriva autorização de `clinica_id` + `papel_id`. Um papel
'superadmin' ali obrigaria alguém a decidir o que `clinica_id` significa para
ele. Nulo quebra o `wrap-jwt-autenticacao`, que faz `UUID/fromString` no claim —
e pior do que quebrar: se um dia parasse de quebrar, seria um token sem clínica
circulando por handlers que filtram por clínica. Com uma flag ortogonal, o
operador continua sendo usuário normal de uma clínica normal, e o invariante que
o `isolamento_test` provou fica intacto.

**Três consequências que são o ponto, não detalhe:**

1. **Rotas separadas.** `/api/plataforma/*` tem guarda própria. `admin_clinica`
   tem bypass de permissão dentro da clínica dele; se o painel reusasse aquele
   caminho, todo admin de toda clínica cliente viraria operador da plataforma.
2. **Nenhum endpoint concede a flag.** Não há rota de promoção, tela nem
   parâmetro — só `UPDATE` direto no banco. Mesma inconveniência deliberada da
   R-012, com a vantagem de que escalada por bug de handler fica fora de alcance
   por construção, não por revisão.
3. **O operador não lê prontuário.** A R-012 não abre exceção para ele, e há
   teste garantindo (`operador-da-plataforma-nao-le-prontuario`). Painel de
   superadmin é exatamente onde "já que ele administra tudo, deixa ele ver" entra
   sem ninguém reparar.

**Contrapartida aceita:** promover alguém exige acesso ao banco, o que é
inconveniente de propósito e não escala se um dia houver equipe de suporte.
Quando isso doer, a saída é uma trilha de auditoria e um segundo par de olhos —
não uma tela de promoção.

⚠️ **O painel não devolve dado clínico.** Contagem de pacientes, sim; nome de
paciente, não; conteúdo de prontuário, jamais. É uma linha fácil de apagar por
descuido — basta alguém acrescentar um `nome` num `SELECT` porque ficaria melhor
na tela.

⚠️ **Conceder a flag exige sair e entrar de novo.** Ela viaja no JWT, então quem
já estava logado continua sem o painel até renovar a sessão. Medido pela `vale`:
com o token antigo, 403; depois de novo login, 200. É consequência correta do
desenho — mas quem rodar o `UPDATE` e só recarregar a página vai concluir que
não funcionou.

⚠️ **O painel é de outro eixo, e o middleware do front não pode opinar sobre
ele.** A primeira versão da guarda de rotas exigia papel `psicologo` ou
`admin_clinica` fora de `/admin`, e com isso **trancava o operador cujo papel
clínico fosse `secretario`** — o front negava o que a API autorizava, com o mesmo
token. Achado e corrigido pela `vale` ao medir de ponta a ponta ([0039](0039-vale-para-orla-painel-da-plataforma-medido-de-ponta-a-ponta.md)):
`/plataforma` continua exigindo sessão e `backendToken` válido, e deixa de exigir
papel clínico. É o mesmo argumento desta decisão visto do outro lado — papel de
clínica e `plataforma_admin` são ortogonais, e quem mistura os dois erra.

---

## D-010 — Horário de parede é o da clínica, não o do navegador

**Autorizado por:** Gabriel, 2026-08-15
⚠️ **Chegou por relato:** a autorização foi dada diretamente à `vale` e está na
[0036](0036-vale-para-orla-o-item-1-fechado-e-um-teste-que-eu-inverti.md). Registro aqui porque decisão que vive só numa mensagem some — e esta
muda semântica de produto. **Falta uma linha de confirmação do Gabriel.**
**Onde vive:** `src/lib/datetime.ts` (`paredeDaClinica`, `instanteDeParede`,
`FUSO_CLINICA`) e `e2e/calendario-fuso.spec.ts`

Uma sessão marcada para as 14:00 é às **14:00 da clínica**, e é isso que todo
mundo vê, em qualquer fuso.

**Por quê:** o modelo anterior — cada um vê no próprio relógio — não tinha sido
decidido por ninguém; estava implícito no código e **afirmado por um teste**. Ele
era a causa do item 1: a leitura convertia para o fuso do navegador, a escrita
mandava o literal, e salvar sem tocar na data deslocava a sessão em até 12 horas
com virada de dia. Ver a revisão pré-produção, item 1.

**Contrapartida aceita:** o psicólogo em viagem vê o horário da clínica, não o do
relógio dele. É deliberado — a sessão acontece no relógio da clínica, e quem
viaja é quem sabe que viajou.

**Efeito no teste:** `calendario-fuso.spec.ts` tinha um bloco exigindo que Tóquio
mostrasse horário **diferente**. Foi invertido, com o porquê escrito no arquivo.
Não é teste ajustado para passar: era teste que afirmava o defeito. O bug
original que ele existia para pegar continua coberto pelos outros dois blocos.

🟠 **Assimetria que fica aberta:** o backend **já é multi-fuso** —
`fuso-da-clinica` lê `clinicas.timezone`, que é `NOT NULL DEFAULT
'America/Sao_Paulo'` desde a migration de fuso. O front acabou de virar mono-fuso
por constante (`FUSO_CLINICA`). Não quebra hoje, porque toda clínica tem o mesmo
valor; quebra quando existir clínica em outro fuso, que é o plano.

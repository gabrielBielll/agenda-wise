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
✅ **Confirmado pelo Gabriel em 2026-08-15**, depois de a `orla` pedir a linha de
confirmação na [0037](0037-orla-para-vale-o-teste-invertido-esta-certo-e-a-resposta-do-fuso.md). Ele foi consultado duas vezes e escolheu este modelo nas
duas: primeiro entre "corrigir o `lib/datetime` inteiro" e "corrigir só o admin",
e depois — já sabendo que a escolha **derruba a asserção de Tóquio do
`calendario-fuso.spec.ts`** — reafirmou o horário da clínica. A contrapartida
abaixo foi mostrada a ele antes de escolher.

O pedido da `orla` estava certo e fica registrado: a autorização chegou a ela por
relato da `vale` ([0036](0036-vale-para-orla-o-item-1-fechado-e-um-teste-que-eu-inverti.md)), e decisão de produto que contradiz um teste do
repositório não pode depender de intermediário ter contado direito.
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

---

## D-011 — O Google propõe, a plataforma registra

**Decidido por:** `orla`, 2026-08-16 — **é dedução, não resposta do Gabriel**
**Discutido em:** `docs/GOOGLE_CALENDAR_ARQUITETURA.md`, seção da convenção de cores
**Onde vive:** ainda em nenhum código — a integração não foi escrita, e é
exatamente por isso que a decisão precisa existir antes

O `lista-psis` — repositório que já consome a API do Google em produção, e que o
Gabriel marcou como **somente leitura** — sincroniza assim: consulta a janela
futura, **apaga o cache daquele calendário e reinsere**. O Google é fonte da
verdade, por atacado. Existe até a regra explícita de que *"o `[DISPONÍVEL]` azul
SEMPRE vence"*.

**Lá está certo.** O que se sincroniza é **disponibilidade**, e a dona
legítima dela é a psicóloga.

**Aqui seria desastroso.** No agenda-wise a cor carrega **status de sessão** —
realizada, cancelada, falta — que é estado financeiro e clínico, com dinheiro
atrelado, e cujo dono é a plataforma.

**Decisão:** a direção da propriedade é oposta, então o modelo de sincronização
tem que ser oposto. Lá o Google escreve e a plataforma espelha; **aqui a
plataforma é o registro e o Google é um canal de entrada que propõe mudanças.**
Nenhuma leitura inbound escreve direto em estado financeiro.

**Por quê:** apagar-e-reconstruir sobre status de sessão é a **A-001 em escala
maior**. A A-001 era uma query que alcançava o passado; esta seria um job
periódico que alcança o passado inteiro, em todas as clínicas, sem que ninguém
veja — porque o efeito de um sync é indistinguível do efeito de outro sync.

**Contrapartida aceita:** a plataforma vai ter que perguntar em vez de assumir, e
isso gera notificação. Custaria menos deduzir. Aceito porque o Gabriel já disse
que neste produto **notificação é serviço, não ruído** — as psicólogas esquecem
de registrar coisas, e ser perguntado ajuda.

⚠️ **Esta decisão é minha, e isso importa.** A forma dela coincide com a
**R-018**, que é do Gabriel, mas o caminho até aqui é dedução a partir da A-001 e
da leitura do `lista-psis`. Se um dia as duas divergirem, **manda a R-018** — o
oráculo não se dobra a uma decisão de arquitetura. Foi por isso que ela não foi
escrita dentro de `REGRAS_DE_NEGOCIO.md`, onde teria virado regra sem nunca ter
saído da boca dele.

💡 **Precedente a favor, no próprio `lista-psis`:** existe lá uma camada de
exceção manual (`disponivel: true/false`) que sobrepõe o que veio do Google. A
ideia de a plataforma ter a última palavra já está naquele código; aqui ela
deixa de ser exceção e vira a regra.

---

## D-012 — Hoje não existe produção; `main` é o ambiente vivo de validação

**Decidido por:** Gabriel, 2026-08-16
**Resolve:** o conflito D-003 × D-004, aberto desde 2026-08-13
**Efeito imediato:** destrava o merge do PR #7

Nas palavras dele: *"hoje não existe produção de verdade, estamos criando o
projeto. Depois dele ficar funcional vamos criar produção de verdade, daí o uso
da branch `prod`. Por ora podemos usar da melhor maneira que vocês acharem, mas o
Render pega `main` e testamos a aplicação — mas nada é real. Essa abordagem é
horizontal e já ajuda a validar o projeto no ar em vez de ficar fazendo tudo
local."*

**A D-003 desenhou `staging` e `prod`. A D-004 constatou que o Render aponta para
`main`, logo `main` seria produção.** As duas estavam certas e o fluxo ficou
circular porque faltava um fato: **não há usuário real, não há dado real.**

**Decisão:** `main` é o **ambiente vivo de validação** — deploy contínuo pelo
Render, para exercitar o sistema no ar em vez de só localmente. `prod` fica
reservada e **decorativa por enquanto, de propósito**, e passa a valer quando
existir produção de verdade.

### O que isso destrava, e é mais do que parece

🔴 A pendência **"ordem migration × reativação do Render"** era bloqueadora do
merge por causa da janela de 3h em que a instância antiga fala com o schema novo
(D-001). Aquela janela continua existindo — **o que mudou é o que ela custa.**
Sem dado real e sem usuário, ela é incômodo de desenvolvimento, não incidente.

**Portanto o PR #7 pode ser mesclado sem resolver a ordem antes.**

⚠️ **E é exatamente por isso que ela precisa ficar escrita, não fechada.** No dia
em que existir produção de verdade, a janela volta a custar o que sempre custou,
e o risco terá sido esquecido justamente por não ter doído. A D-001 continua
valendo; o que caiu foi a urgência, não o problema.

### O que passa a valer agora

- **`main` é implantada e observável** — quebrar `main` quebra o ambiente que
  todo mundo usa para validar. O CI verde deixa de ser cortesia.
- **Nada em `main` é real** — nenhum dado ali é de paciente de verdade, e
  continua valendo o INCIDENTE de 2026-08-15: **antes do primeiro dado real, o
  `JWT_SECRET` tem que ser rotacionado** (SEC-002).
- **`prod` é reservada** e ninguém a usa até a decisão de criar produção.

---

## D-013 — O ambiente de hoje é descartável; produção nasce nova e vazia

**Decidido por:** Gabriel, 2026-08-17
**Estende:** a [D-012](#d-012--hoje-não-existe-produção-main-é-o-ambiente-vivo-de-validação)
**Efeito imediato:** tira a rotação de credenciais do caminho crítico do projeto

Nas palavras dele: *"tudo que eu estou utilizando hoje, de banco de dados e de
serviço, é descartável. Todos os pacientes que temos hoje, tudo que nós temos
hoje lá, não vamos utilizar. O que a gente está utilizando é o esqueleto, é o
conceito. Quando tudo estiver pronto, a gente vai criar outros serviços idênticos
e um banco de dados com o mesmo esqueleto, mas não com os mesmos dados. Serviço
novo, totalmente isolado, com novas credenciais."*

E o motivo, que é a parte que muda o nosso comportamento: *"você fica esperando
por mim até eu fazer esse JWT Secret, e aí o projeto não anda. O objetivo é o
projeto andar todo e falar: cara, beleza, o projeto está totalmente testado.
Segurança não está boa — agora, quando eu for passar para produção, a gente
ajusta. E aí fica uma lista muito menor de coisa que eu tenho que fazer."*

### O que isso decide

**A virada para produção não é uma migração — é uma criação.** Serviços novos,
credenciais novas, banco novo levantado do zero pelo Migratus, e **nenhum dado de
hoje atravessa**. O que atravessa é o código e o schema.

### O que muda no nosso trabalho, e é bem concreto

🔓 **Nada mais espera o Gabriel por causa de segredo.** Rotacionar o
`JWT_SECRET` (SEC-002) **deixa de ser bloqueador do projeto** — produção nasce
com segredo próprio por construção, então rotacionar o de hoje só protege dado
descartável. Continua na lista, mas na **lista da virada**, não na nossa.

⚠️ **Isto NÃO cancela o incidente de 2026-08-15.** A regra que sobra é mais
simples e mais dura: **o segredo de hoje nunca pode ser o segredo de produção.**
Reaproveitar seria transformar um vazamento antigo em vazamento novo.

🎯 **O critério de pronto muda de alvo.** Deixa de ser *"seguro para dado real"*
e passa a ser **"funcional, testado e apresentável"** — dá para mostrar o sistema
inteiro, pelos três papéis, sem bug e sem tela mentindo. As decisões de dado
sensível (criptografia de prontuário, retenção, RLS) saem da nossa fila e entram
na lista da virada.

📌 **A exceção, e ela importa:** o que já virou **regra de negócio nossa** não sai
da fila só por ser de privacidade. A **R-012** manda o acesso pela flag gravar
sempre — isso é funcionalidade do produto, não configuração de produção, e
continua sendo trabalho nosso.

### O que ele pediu que não mudasse

*"Checar antes é a melhor coisa que estão fazendo, é a maior qualidade de vocês,
e eu quero que vocês mantenham isso. Mas o projeto tem que andar."*

A leitura correta não é *"medir menos"* — é **medir sem parar**. Quando a medição
levanta uma decisão que é dele, o certo é registrar a pergunta, **seguir pela
suposição mais conservadora** e continuar; não é ficar parado esperando. Fila
vazia por falta de resposta é falha de coordenação, não zelo.

---

## D-014 — O app do Google fica **publicado e não verificado** no ambiente de teste

**Decidido por:** Gabriel, 2026-08-17
**Recomendação:** `orla` · **Passo a passo:** [docs/GOOGLE_MODO_TESTE.md](../docs/GOOGLE_MODO_TESTE.md)

O ambiente de validação usa uma conta de desenvolvimento no papel de clínica, e o
app OAuth fica em **"Em produção" sem submeter para verificação**.

### O que isso troca

O prazo de 7 dias do refresh token é propriedade do estado **Testing**, não da
falta de verificação — são chaves separadas no console. Publicar sem verificar
**tira o relógio de 7 dias** e continua sem exigir domínio próprio, política de
privacidade ou espera.

**Custo aceito:** a tela *"O Google não verificou este app"* (Avançado → Acessar)
e o teto de **100 contas**. Para contas de desenvolvimento, irrelevante.

⚠️ **É escolha de ambiente de teste, não de lançamento.** A tela de aviso seria
péssima primeira impressão para uma psicóloga de verdade. No dia da produção, a
verificação volta — com **domínio verificado, política de privacidade publicada e
os três escopos pedidos de uma vez** (pedir escopo novo depois reabre a
verificação inteira).

✅ **Não queima nada:** a verificação é submetida depois, do mesmo estado.

### O que não muda por causa dela

📌 **A reconexão continua sendo funcionalidade, não contorno.** Em produção de
verdade o `invalid_grant` acontece igual — a pessoa revoga o acesso, troca a senha
ou remove o compartilhamento. Botão de reconectar e alerta visível são requisito
do **GC-001** nos dois mundos.

### Confiança

⚠️ Vem do que é estável na plataforma do Google, **não de documentação lida** —
`developers.google.com` e `support.google.com` são negados pelo proxy da sandbox
da `orla`. **Conferível em um minuto na tela de publicação do console.** Se a tela
disser outra coisa, ela ganha.

🔎 **Medido no mesmo dia, e corrige uma suposição nossa:** só a *documentação* do
Google é bloqueada. `accounts.google.com` responde 302 e `www.googleapis.com`
responde 404 — **os endpoints são alcançáveis da sandbox**. Quando houver
credencial, parte do que está em [GOOGLE_LIMITES](../docs/GOOGLE_LIMITES.md) como *reportado* vira
**medível por nós** — a começar pelos quatro `colorId` não confirmados.

---

## D-015 — O Modelo C é o destino: a psicóloga conecta a própria conta

**Decidido por:** Gabriel, 2026-08-17
**Substitui como destino:** o Modelo B da D14 da arquitetura
**Análise completa:** [docs/GOOGLE_CARDS.md](../docs/GOOGLE_CARDS.md)

Nas palavras dele: *"o psicólogo vai acessar a plataforma e a gente vai ter um
botão de conectar com o Google Agenda. Quando ele conectar e colocar a conta do
Google dele, a aplicação vai criar uma agenda a mais na lista de agendas dele."*

| | Quem autoriza | Onde a agenda mora | Quem é dono |
|---|---|---|---|
| **A** — legado, **mantido** | a clínica | conta da psicóloga | a psicóloga |
| **B** — desenhado, **descartado como destino** | a clínica | conta da clínica | a clínica |
| ✅ **C** — **destino** | **cada psicóloga** | conta da psicóloga | **o app** (`calendar.app.created`) |

### Por que C e não B

- **Some a armadilha da permissão** — não há compartilhamento manual, então
  ninguém erra escolhendo *"Ver todos os detalhes"* em vez de *"Fazer alterações"*.
- **Some o risco de privacidade** — o `calendar.app.created` alcança **apenas as
  agendas que o app criou**. A agenda pessoal fica fora do alcance **por
  construção**, não por combinado. Num consultório de psicologia isso pesa.
- **A cota escala** — o limite do Google é por usuário; uma conexão por pessoa
  tira o gargalo da conta única da clínica.

### O que isso obriga a mudar

🔴 **Schema:** `google_conexao` tem `UNIQUE (clinica_id)` — **uma por clínica**. O
C precisa de **uma por psicóloga**.
🔴 **Permissão:** `gerenciar_integracao_google` é só do admin. O C precisa de uma
permissão nova e mais estreita para a psicóloga conectar **a dela**.
⚠️ **N tokens vivos** em vez de um — e a tela tem que dizer **de quem** é o que
morreu.

### O que **não** muda

O motor de sincronização continua **cego ao modelo**: lê `google_calendar_id` do
`vinculo_agenda` e escreve. A coluna `topologia` existe para isso.

### 📌 E uma pergunta que morreu junto

A pendência 6 da arquitetura — *"vale propor às psicólogas elevarem as agendas
atuais para `owner`?"* — existia porque no Modelo A o `acl.list` responde 403 e a
gente não conseguia conferir quem tem acesso a quê. **No C o app é dono do que
criou, então a pergunta só sobrevive para as agendas do legado** — e para essas a
resposta é esperar a migração, não negociar permissão.

---

## D-016 — `name` não é `id`, e a semelhança dos dois é o que esconde o defeito

**Origem:** achado da `vale` revisando o `0d60c77` pela D-002 ([0106](0106-vale-para-orla-o-conserto-esta-certo-e-incompleto-nos-proprios-arquivos.md))
**Cartão:** [A11Y-001](../docs/cards/sprint-2-robustness/A11Y-001-controles-sem-nome-acessivel.md)

Este padrão passou despercebido por meses e derrubou o CI por um dia inteiro:

```tsx
<Label htmlFor="paciente_id">Paciente</Label>
<Popover>…<Button role="combobox">Selecione um paciente...</Button>…</Popover>
<input type="hidden" name="paciente_id" value={…} />
```

Quem lê vê `paciente_id` duas vezes e conclui que o rótulo está ligado ao
controle. **Não está.** O rótulo procura um `id`, e quem tem `paciente_id` é o
`name` do input escondido. O `<Label>` aponta para o nada.

### Por que ninguém percebeu pela tela

Porque **a tela funciona**. O texto "Selecione um paciente..." aparece, o clique
abre o popover, o formulário envia certo. O que não existe é o **nome acessível** —
e isso só se vê com leitor de tela ou com `getByRole(..., { name })`.

🔴 **E aqui a regra contraintuitiva do ARIA:** `button` tira nome do próprio
conteúdo, **`combobox` não**. Então o texto visível não salva o `combobox`. Medido
com Chromium, não deduzido.

### O que fica valendo

📌 **`<Label htmlFor>` exige `id` no controle** — em `SelectTrigger`, no `Button`
do `PopoverTrigger`, no que for. `name` serve ao envio do formulário; `id` serve à
ligação com o rótulo. **São eixos diferentes que usam o mesmo texto.**

📌 **Controle sem nome é tela que não dá para testar por papel.** Não é queixa de
cosmética: `getByRole(..., { name })` não acha o que não tem nome, então a tela
fica fora do alcance de qualquer teste que dependa de papel — e tela sem teste é a
que quebra calada. Foi exatamente o que aconteceu com a A-009.

### E uma segunda lição, sobre o formato do conserto

A `orla` consertou os quatro controles que o e2e tocava e **deixou dois de fora
dentro dos próprios arquivos que estava editando**. Não foi descuido: é a
assinatura de **conserto guiado por vermelho** — ele cobre o que o vermelho toca,
e só. Quando o vermelho apontar um defeito de categoria (e não de instância),
**varra a categoria antes de fechar**.

---

## D-017 — Em caminho de segurança com vocabulário fechado, liste o **benigno**, não o grave

**Origem:** `vale` revertendo uma decisão minha argumentada por escrito ([0115](0115-vale-para-orla-o-conserto-do-orfao-esta-certo-e-o-teste-dele-cimenta-o-buraco.md))
**Aceita por:** `orla`, 2026-08-18 · commits `ffb0a95` (vermelho) e `4eec17c` (verde)

Listar os status **graves** é **fail-open**: o que ninguém previu passa em
silêncio. Listar os **benignos** é fail-closed: o que ninguém previu grita.

```clojure
;; era — fail-open, e foi assim que o `orfao` sumiu
(some #(contains? #{"sem_acesso" "orfao"} (:status %)) vinculos)

;; é — fail-closed
(some #(not (contains? status-de-agenda-benignos (:status %))) vinculos)
```

### Por que não é preferência: as duas falhas não custam o mesmo

| falha | quem descobre | quando |
|---|---|---|
| **alarme à toa** | alguém reclama | no dia seguinte, e o conserto é **uma entrada** no conjunto |
| **silêncio** | ninguém | quando uma clínica notar que faz semanas que não chega sessão |

📌 **A condição que torna isto barato é o vocabulário ser FECHADO.** A migration
lista os seis status; quem inventa um sétimo já está editando a migration, e
obrigá-lo a declarar se é benigno custa uma linha. **Em vocabulário aberto o
cálculo muda** — não generalize sem conferir isso primeiro.

📖 Mesma escolha da **V-1** no `middleware.ts` (deny-by-default). O preço dela foi
a **A-017**, que trancou o secretário fora de tudo — e foi **descoberta em um
dia, porque era alta**. Um silêncio equivalente ainda estaria lá.

### 🔴 O que eu errei, e é a parte que vale guardar

O defeito que eu tinha acabado de corrigir **era um status grave fora da lista de
graves**. No mesmo commit eu escrevi na docstring:

> *"Status grave que não entre aqui é um silêncio."*

…e escrevi um teste afirmando que esse silêncio é o esperado:

```clojure
(testing "status desconhecido não grita sozinho" ...)
```

**Nomeei o perigo em prosa e o codifiquei como comportamento correto na mesma
passagem.** E teste é pior que ausência de teste quando ele faz isso: sem o
teste, o próximo `orfao` seria um esquecimento; com ele, é um **contrato** — e
some com um verde por cima dizendo que está certo.

⚠️ **A pista que eu tinha e não li:** as duas metades da minha própria função já
discordavam — a da conexão era fail-closed (`not= "ativa"`), a das agendas era
fail-open. **Eu revisei uma metade e copiei o default da outra sem perguntar
qual estava certo.**

📌 **Regra prática:** ao escrever um teste que afirma que algo **não** acontece,
pergunte se você está protegendo um comportamento ou **congelando uma omissão**.

### 📌 Adendo à D-017 — asserção de ausência é afirmação sobre o **relógio** até o desfecho existir

**Origem:** `vale` aplicando a D-017 nas próprias asserções ([0117](0117-vale-para-orla-apliquei-a-d017-nos-meus-testes-e-ela-pegou-dois.md))

A D-017 nasceu sobre *código de produção* — listar benigno em vez de grave. Ela
tem um irmão em *teste*, e a `vale` o encontrou passando a régua nas seis
asserções negativas que ela mesma tinha escrito. **Duas caíram.**

> **Asserção de ausência só significa alguma coisa depois de esperar o desfecho.
> Antes disso ela não é uma afirmação sobre o sistema — é uma afirmação sobre o
> relógio.**

```ts
await botaoSalvar.click();
await expect(dialogoDeConflito).toHaveCount(0);   // 🔴 passa NA HORA, antes de existir
```

Se a regressão aparecer 200 ms depois, a contagem já foi aprovada — e quem falha
é a asserção seguinte, **com a mensagem errada**.

### O padrão que fecha três episódios

| | o defeito | como saía reportado |
|---|---|---|
| [0104](0104-orla-para-vale-e-duna-o-vermelho-era-defeito-de-verdade-e-eu-consertei-a-marcacao.md) | `combobox` sem nome acessível | *"seletor errado da vale"* |
| [0111](0111-orla-para-vale-a-correcao-do-cartao-confere-e-a-guarda-do-first-vinha-tarde.md) | `.first()` no combobox errado | *"a psicóloga não tem permissão (A-012)"* |
| [0117](0117-vale-para-orla-apliquei-a-d017-nos-meus-testes-e-ela-pegou-dois.md) | regressão da A-011 | *"falha genérica ao salvar"* |

🔴 **Das três vezes a causa foi a mesma: asserção posta antes de o desfecho
existir.** E das três vezes o custo não foi o teste falhar — foi ele falhar
**apontando para o lugar errado**, o que gasta a rodada de quem for investigar.

✅ **A forma que funciona é esperar qualquer desfecho e só então nomear qual foi:**

```ts
await expect.poll(async () => {
  if (await dialogoDeConflito.isVisible().catch(() => false)) return 'conflito';
  if (/\/admin\/agendamentos(\?|$)/.test(page.url()))        return 'salvou';
  return 'esperando';
}).not.toBe('esperando');
```

📌 **E a exceção, que é o que salva as outras quatro:** negativo **depois** de um
positivo já afirmado é legítimo — o positivo é que ancora o tempo. `login.spec.ts`
faz isso (`avisoDeErro` visível **antes** do `.not.toHaveURL`), e por isso está
certo como está.

### 📌 Segundo adendo à D-017 — verificação que não verifica

**Origem:** `orla`, 18/08, contra o próprio processo

Passei o dia editando a `FILA.md` com scripts assim:

```python
s = s.replace(alvo, novo)
open(p,'w').write(s)
print('ok')          # 🔴 imprime 'ok' mesmo quando `alvo` não existe
```

`str.replace` **não falha** quando não encontra o padrão — devolve a string
intacta. Então uma edição que não aplicou saía com o mesmo `ok` de uma que
aplicou. Uma tarefa que eu passei para a `vale` (os specs das três telas) **não
entrou na fila**, e eu só descobri porque fui reler o arquivo por outro motivo.

🔴 **O `ok` era afirmação sobre a minha intenção, não sobre o arquivo.** É
exatamente a frase da `vale` na [0117](0117-vale-para-orla-apliquei-a-d017-nos-meus-testes-e-ela-pegou-dois.md) — *"afirmação sobre o relógio, não sobre o
sistema"* — na minha própria ferramenta, e no mesmo dia.

✅ **O que fica:** depois de editar arquivo por script, **confira o resultado no
arquivo**, não o retorno do script.

```sh
grep -c "<termo que deveria existir agora>" arquivo   # isto mede
```

📌 **E o padrão maior, que já apareceu em cinco lugares hoje:** a régua, o balde,
o relógio, o `ok` e a mensagem de erro do `deletePaciente`. **Todos davam um sinal
verde ou um diagnóstico que não correspondia ao que tinham medido.** O defeito
raramente é não olhar — é olhar para o instrumento em vez de para a coisa.

---

## D-018 — Ninguém provisiona clínica de fora; a porta do backend pode ficar fechada

**Decidido por:** Gabriel, 2026-08-19
**Fecha:** a única pergunta que a virada da porta do backend deixou em aberto
([0180](0180-orla-para-vale-fechar-a-porta-do-backend-no-northflank-e-a-ordem-importa.md) §3)

Nas palavras dele: *"ninguém provisiona de fora não"*.

### Por que a pergunta existia

Fechar o backend em rede privada quebraria qualquer script externo que chamasse
`/api/admin/provisionar-clinica` — e o sintoma apareceria **dias depois, longe da
causa**. Era o único risco da virada que nenhuma medição minha alcançava, porque
depende de saber o que existe fora do repositório.

### A resposta chegou duas vezes, por caminhos independentes

| quem | como | resultado |
|---|---|---|
| `vale` ([0184](0184-vale-para-orla-e-gabriel-a-pergunta-do-provisionamento-tem-resposta-medida.md)) | mediu | a rota continua alcançável **pelo host do front** (`admin` está na lista do proxy) e devolve `403` sem token — a capacidade mudou de endereço, não sumiu |
| Gabriel | respondeu | ninguém usa esse caminho de fora |

📌 **A medição da `vale` era a resposta mais forte, e chegou primeiro.** Ela não
dependia de alguém lembrar de um script escrito há meses — que é justamente o
modo pelo qual esse tipo de pergunta costuma ser respondida errado. A confirmação
do Gabriel remove até o resíduo.

### Efeito

O item fica **fechado**. A porta do backend permanece privada, sem exceção a
abrir. Se algum dia for preciso provisionar de fora, o caminho já existe e está
medido: host do front + `PROVISIONING_TOKEN`.

---

## D-019 — A paleta da clínica escolhe entre as 11 cores do Google, e o bloqueio deixa de ser laranja

**Decidido por:** Gabriel, 2026-08-20
**Onde vive:** [docs/GOOGLE_CORES_E_RECONCILIACAO.md](../docs/GOOGLE_CORES_E_RECONCILIACAO.md), cartões GC-015 e GC-017

Nas palavras dele: *"pode restringir somente ao padrão do Google, é isso que é o
esperado mesmo, a esse padrão de restrição das onze cores, e sim já pode trocar o
laranja do bloqueio por grafite sim"*.

### O que isso decide

**1. A paleta por clínica é fechada nas 11 cores do Google.** Cada clínica troca
qual cor significa qual estado, mas não inventa cor. Três razões, e a primeira é
do próprio pedido dele:

- o seletor do Google **é** 11 cores nomeadas, então "imitar o Google" já entrega
  a restrição — ela não foi imposta, foi herdada;
- cor que existe aqui e não existe lá é **intraduzível** na hora de escrever no
  Google, e a integração precisa que os dois lados sempre consigam conversar;
- a legibilidade vira trabalho **finito**: 11 cores × 2 temas = 22 medições,
  feitas uma vez por nós. Sem a restrição, cada clínica poderia configurar uma
  agenda ilegível — e a culpa seria do produto, não dela.

**2. O bloqueio passa a ser grafite.** 🔴 Não é ajuste estético: laranja na
convenção da R-017 é **sessão agendada**. A mesma cor com sentidos opostos nas
duas telas faz a psicóloga **errar**, enquanto cor diferente ela só reaprende.

### Contrapartida aceita

Uma clínica que queira uma identidade visual própria na agenda não vai poder.
Aceito porque o que a agenda pinta é **estado**, não marca — e a R-017 já diz que
a cor confirma o estado. Marca própria na agenda entraria em conflito com isso
antes de entrar em conflito com o Google.

### O que NÃO foi decidido, e tem dono

⛔ **O estado `confirmado`** — hoje o vocabulário é
`#{"agendado" "realizado" "cancelado" "falta"}` (`dominio.clj:16`), e a convenção
da R-017 separa Tangerina (agendada, não confirmada) de Sálvia (confirmada). Sem
esse estado, duas das cinco cores não têm o que pintar.

📌 **Não é uma lacuna nossa: o Gabriel levou a pergunta para a CEO e o time**, nas
palavras dele *"pra eles entenderem e decidirem, junto comigo aqui, como deve ser
esse comportamento"*. Fica registrado como **decisão em curso com dono e fórum**,
não como pendência à espera de alguém — a diferença importa, porque pendência sem
dono convida uma instância a preencher por conta própria.

⚠️ E a pergunta que vai junto, para o fórum não decidir metade: **quem confirma
uma sessão, e por qual ação?** O estado sem a transição que o produz é coluna
morta.

---

## D-020 — A Northflank constrói de `prod`, e `prod` ganha os quatro checks

**Decidido por:** Gabriel, 2026-08-20
**Proposto por:** `vale` na [0195](0195-vale-para-orla-voce-tem-razao-sobre-o-synchronize-e-o-que-sobra-nao-e-cobertura-e-portao.md), com medição · **instruções na** [0196](0196-orla-para-vale-e-gabriel-o-portao-esta-autorizado-e-a-ordem-e-tudo.md)
**Efeito:** o CI deixa de ser alarme e passa a ser tranca

Nas palavras dele, quando perguntado se aceitava o custo de um PR por deploy:
*"pode ser sim"*.

### O buraco que isso fecha

🔴 **Hoje o CI vê o commit mas não impede que ele vá ao ar.** A Northflank e o
GitHub Actions disparam no mesmo push, em paralelo, e a `vale` cronometrou quem
ganha a corrida:

```
10:06:34  merge do PR #8
10:06:41  Northflank comeca a construir      (+7s)
10:09:20  "Servidor iniciado" no container   (+2min46s)  <- ja atendendo
~10:13    o CI daria o veredito              (+6~7min)
```

**Produção serve o código novo cerca de quatro minutos antes de o CI dizer
qualquer coisa.** Veredito vermelho chega para código que já está no ar.

📌 **Cobertura e portão não são a mesma propriedade**, e a distinção é dela. A
linha que eu acrescentei ao gatilho `push` em `93ee95a` consertou *cobertura* — um
buraco real, porque ela vivia de o PR #7 continuar aberto. **O portão continuava
não existindo**, e continuaria com ou sem a minha linha.

### O que muda

A Northflank aponta `vcsData.projectBranch` dos dois serviços para **`prod`**, e
`prod` exige os quatro jobs do CI. Deployar vira: PR da branch de trabalho para
`prod` → CI verde → merge → build.

✅ A branch de trabalho **mantém o ritmo de hoje**: push direto, sem PR.
✅ E `prod` volta a significar produção. Hoje a resposta para *"o que está no
ar?"* não está no git, está na configuração da Northflank.

### As duas alternativas, e por que não

| | por que não |
|---|---|
| **Proteger a branch de trabalho** | 215 commits desde 18/08, ~86 por dia entre quatro. Cada um viraria PR — muda o ritmo de todo mundo |
| **`disabledCI: true` + o CI dispara o build** | é o portão mais apertado, mas põe **um token da Northflank com poder de deploy dentro do GitHub Actions**. Este repositório já teve credencial exposta ([INCIDENTE_2026-08-15](../docs/INCIDENTE_2026-08-15.md)), e a partir daí todo arquivo de workflow vira caminho até esse token |

### Contrapartida aceita

Um PR por deploy, com ~7 min de CI — e ele cai exatamente no minuto em que alguém
quer subir rápido, que é quando se contorna processo. O Gabriel aceitou sabendo
disso.

### 🔴 A ordem de execução não é detalhe

`prod` está em `8109afc`, de **18/08**, e a branch viva está **420 commits à
frente**. Reapontar a Northflank antes de adiantar `prod` **derruba o site para o
estado de 18/08**, na véspera da demonstração. O ciclo correto está na
[0196](0196-orla-para-vale-e-gabriel-o-portao-esta-autorizado-e-a-ordem-e-tudo.md) §2.

### ⛔ E o que ainda não foi verificado

As três branches estão `protected: true`, mas **isso não diz que a proteção exige
os quatro checks**. Se não exigir, o portão não existe: vira só *"precisa de PR"*,
e PR se mescla com CI vermelho. **Conferir por efeito** — abrir um PR que reprova
e ver o merge ser recusado —, nunca lendo a tela de configuração.

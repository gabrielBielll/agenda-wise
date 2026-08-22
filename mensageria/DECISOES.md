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

### 🔴 Medido em 2026-08-20, algumas horas depois: a proteção avisa e deixa passar

Ao adiantar `prod` e `staging` a mando do Gabriel, o push respondeu as duas coisas
ao mesmo tempo:

```
remote: - Changes must be made through a pull request.
To https://github.com/gabrielBielll/agenda-wise
   8109afc..aab7949  origin/main -> prod
```

Uma linha proíbe, a outra parece sucesso. Conferido **por efeito** (`fetch` e
comparação de SHA): o push **passou**. Repetido em `staging`, mesmo resultado —
duas medições independentes.

🔴 **Então esta decisão, como está escrita acima, não entrega o portão.** Apontar a
Northflank para `prod` e marcar os quatro checks não basta: quem tiver este nível
de permissão continua empurrando direto, e o portão vira decorativo **justamente
para quem tem pressa**, que é quem ele existe para segurar.

⚠️ **O que falta, e é do Gabriel:** ligar *"incluir administradores"*
(`enforce_admins`) na proteção de `prod`. Sem isso o resto é teatro.

📌 E vale guardar o formato da armadilha: **o push imprimiu uma linha de erro e uma
linha de sucesso, e a certa era a de sucesso.** Ler só a primeira daria "a proteção
bloqueou" — falso. Ler só a segunda perderia o achado. Foi o `fetch` que decidiu.

---

## D-021 — O admin da clínica passa a ler prontuário; o secretário, não

**Decidido por:** a CEO, relatado pelo Gabriel em 2026-08-20
**Altera:** a **R-012**, que é regra confirmada — por isso está aqui e não como
nota de rodapé
**Tarefa:** [0202](0202-orla-para-vale-o-seletor-de-cores-e-o-par-que-so-se-distingue-por-matiz.md), com a `vale`

Nas palavras do Gabriel: *"a ceo pediu para que o admin possa ver os prontuarios
sim somente o secretario que nao"*.

### O alcance, confirmado por ele numa segunda passada

Ele repetiu o pedido acrescentando o escopo: *"o admin possa ver os prontuarios
**de todas as psis** sim somente o secretario que nao pode ver, dessa forma fica
mais facil"*.

📌 **Isso fixa o que eu já tinha deduzido, e vale ter escrito:** a leitura do
admin é **da clínica inteira**, não limitada a alguma psicóloga em particular. Não
há filtro por psicóloga a implementar — o admin lê qualquer paciente da clínica
dele. O corte de clínica continua valendo, como em todo o resto do sistema.

### O que muda na R-012

A R-012 dizia: *"por padrão, só o psicólogo autor lê e edita o prontuário. **Nem o
admin da clínica**, nem outro psicólogo da mesma clínica"*, com uma saída de
emergência por flag de super-admin ligada em código.

**A metade do admin cai.** O que **fica de pé**, e não foi tocado pelo pedido:

- **outro psicólogo** da mesma clínica continua sem ler;
- **o secretário** continua sem ler — e já era assim na prática, porque a
  migration `20260817090000` nunca deu a permissão a ele;
- **editar e excluir continuam do autor.** O pedido é *"possa ver"*.

### 🔴 A contrapartida, e ela não é negociável

Com o admin lendo de rotina, o **registro de acesso deixa de ser exceção e vira o
que sustenta a regra.** Hoje `acesso_prontuario` só grava quando a flag de
super-admin foi decisiva. Passa a gravar **toda leitura de quem não é o autor**,
com motivo próprio — nunca reusando `flag_super_admin`, senão a auditoria mistura
emergência com rotina e perde exatamente o que existe para separar.

📌 **A tabela já existe** desde 19/08. O que falta é usá-la no caminho novo.

### ⚠️ O que eu recomendo que o Gabriel confirme com a CEO

Não bloqueia nada, e é de uma frase: **as leituras do admin ficam registradas com
nome, paciente e data.** Isso é proteção para a clínica e para a psicóloga, mas é
melhor a CEO saber que existe antes de alguém descobrir o log por acidente.

E há um segundo ponto que é de conselho profissional, não de código, e que eu não
tenho como responder: prontuário de psicologia tem regramento do CFP sobre quem
acessa. **A decisão é dela; o registro de acesso é o que torna a decisão
defensável.**

### Por que isto virou decisão numerada em vez de um commit

A R-012 saiu da boca do Gabriel e tem raciocínio escrito — a inconveniência de
exigir código e implantação *era* o que dava sentido à regra. Mudar isso num
commit de permissão, sem registro, deixaria a regra e o código discordando, e a
próxima instância acreditaria no arquivo errado.

---

## D-022 — O horário disponível vira estado, e "vazio" deixa de significar "pode marcar"

**Decidido por:** a CEO, relatado pelo Gabriel em 2026-08-21
**Estende:** a linha 4 da tabela da **R-017**, que já previa 🔵 azul = `[DISPONÍVEL]`
**Tarefa:** [0210](0210-orla-para-vale-e-duna-o-disponivel-e-o-vazio-que-vira-telefonema.md)

Nas palavras dele: *"nós temos muitas psicólogas que não trabalham o tempo
inteiro com a nossa empresa, então elas têm outros trabalhos, então somente
alguns horários específicos dos dias delas são disponíveis […] no Google Agenda
existe a cor azul pra indicar disponibilidade […] um operador consegue ir lá na
agenda dela, clicar no azul e marcar uma sessão nesse horário disponível"*.

### 🔴 O defeito que isso expõe, e ele custa um telefonema por vez

Ele descreveu o problema real melhor do que qualquer card:

> *"às vezes acontece de um paciente sair e muitas vezes elas simplesmente
> esquecem de colocar que o horário está disponível ali. E aí fica uma dúvida […]
> os horários vazios acabam se tornando dúvidas."*

**O mundo real tem TRÊS estados de horário, e a plataforma só modela dois:**

| | o que significa | existe hoje? |
|---|---|---|
| 🔵 **disponível** | *"pode marcar aqui"* — afirmação positiva da psicóloga | ❌ **não existe** |
| ⚫ **bloqueado** | *"não existe horário aqui"* | ✅ `bloqueios_agenda` |
| ⬜ **não dito** | ninguém afirmou nada | ❌ hoje some dentro de "vazio" |

🔴 **E é o terceiro que gera o telefonema.** Hoje a plataforma trata *vazio* como
*disponível* por omissão — e é exatamente a leitura errada. O operador vê espaço
livre, não sabe se pode marcar, e liga para perguntar. Quando é bloqueio, ele sabe;
quando é azul, ele sabe. A dúvida mora só no que ninguém disse.

📌 **A plataforma precisa poder dizer "eu não sei".** Um sistema que responde
"disponível" para o que nunca foi afirmado está inventando informação — é a mesma
família do `200` que quer dizer "não fiz nada".

### A cor não precisa ser a mesma; a família, sim

Segunda coisa que ele decidiu, e que **afrouxa** a D-019 de um jeito útil:

> *"na plataforma a gente não precisa necessariamente seguir o padrão visual exato
> do Google […] no fim das contas você entende que é vermelho, é azul, é laranja,
> é cinza escuro que é grafite […] se for azul, pegue qualquer tom de azul, se for
> azul é isso"*.

**Efeito nos dois sentidos:**

- **Pintando aqui:** basta a cor ser reconhecivelmente da mesma família. Isso
  libera a luminância para servir à legibilidade, em vez de perseguir o hex do
  Google — que era o que apertava a medição das 11.
- **Lendo o Google:** classificar por **família de matiz**, não por `colorId`
  exato. 📌 O `lista-psis` já faz assim: `GOOGLE_AVAILABLE_EVENT_COLOR_IDS` aceita
  Pavão, Blueberry **ou ausência de cor**. A tolerância já é o padrão que funciona
  em produção há mais tempo que este projeto.

### E os dois canais, confirmados por ele

> *"a pessoa pode muitas vezes não entender a cor, mas ela pode entender os
> glifos […] a psicóloga pode seguir tanto pelo padrão de cor quanto pelo glifo"*.

Isso ratifica o que a `vale` mediu e implementou ontem: cor **e** glifo, os dois
canais, cada um bastando sozinho. O `disponível` nasce precisando dos dois desde o
primeiro dia — não repetir o caminho de descobrir depois.

### ⚠️ O que eu quero deixar dito antes de alguém implementar

**`disponível` não é estado de sessão.** Não entra em `status-sessao`, não vira
linha em `agendamentos`. É estado de **janela de agenda**, vizinho de
`bloqueios_agenda` — e provavelmente a mesma tabela com um sinal invertido, não
uma tabela nova.

Pôr `disponivel` no vocabulário de sessão criaria uma sessão sem paciente, sem
valor e sem psicóloga responsável, que é como `status_repasse` acabou com cinco
valores de três vocabulários na mesma coluna.

---

## D-023 — O "disponível" NÃO vira estado da plataforma. Reverte a D-022, um dia depois

**Decidido por:** Gabriel, 2026-08-21
**Reverte:** a [D-022](#d-022--o-horário-disponível-vira-estado-e-vazio-deixa-de-significar-pode-marcar), escrita algumas horas antes
**Efeito:** o vazio continua ambíguo, e isso passa a ser **de propósito**

Nas palavras dele: *"a plataforma pode se manter da maneira que está, deixar o
espaço em branco como uma dúvida mesmo ali e não precisar sinalizar nada"*.

### Por que ele reverteu, e o argumento é melhor que o meu

> *"esse é um problema que a Deep Saúde tem, porque a Deep Saúde usa esse modelo
> de explicitamente deixar um horário azul disponível […] porém outras clínicas,
> já que a plataforma vai ser replicável, podem simplesmente não seguir esse
> padrão, simplesmente nem usar o horário azul pra dizer disponível, só ir lá e
> marcar um horário na agenda."*

📌 **A D-022 confundiu uma prática de UMA clínica com uma regra do produto.** O
azul de disponibilidade é convenção da Deep Saúde, não do mercado. Modelar os três
estados obrigaria toda clínica compradora a declarar disponibilidade para o
sistema funcionar — e a maioria não trabalha assim: marca a sessão direto no
horário vazio.

**A ambiguidade do vazio é o comportamento correto para um produto multi-clínica**,
porque é o único que serve aos dois modos sem impor nenhum.

⚠️ **E o Google faz igual.** Lá o vazio também não diz nada; quem dá sentido a ele
é a convenção de cada equipe. Copiar isso é herdar um desenho já testado, não
deixar um buraco.

### O contexto de produto, que vale registrar porque explica outras decisões

> *"uma das clínicas desse sistema multi-clínicas vai ser nossa, da própria Deep
> Saúde […] e vamos criar outras clínicas ali e poder vender pra outros
> consultórios […] como também vamos estar vendendo esse sistema para psicólogas
> individuais […] mas isso são versões futuras."*

🎯 **A Deep Saúde é usuária E vendedora do mesmo sistema.** Toda vez que uma
prática interna parecer candidata a virar funcionalidade, a pergunta é: *isto é do
produto, ou é do nosso jeito de trabalhar?* A D-022 falhou nessa pergunta, e este
parágrafo existe para a próxima não falhar.

📌 **Psicóloga individual fica para versão futura** — não modelar para ela agora.

### O que a D-022 deixa de válido, e não é pouco

A reversão é da **funcionalidade**, não das observações:

- ✅ **O diagnóstico continua verdadeiro:** o vazio é ambíguo e gera telefonema na
  Deep Saúde. Só deixa de ser problema *da plataforma* e volta a ser processo
  *da clínica*.
- ✅ **`disponível` não seria estado de sessão** — se um dia voltar, essa parte
  continua valendo.
- ✅ **A tolerância de matiz** (*"se for azul, pegue qualquer tom de azul"*) segue
  decidida e útil, e não dependia da D-022.

### 🔴 E uma armadilha que a reversão NÃO apaga — ela fica marcada aqui

A **GC-009** diz: *"evento externo do Google vira bloqueio"*.

Um evento **`[DISPONÍVEL]` azul** na agenda da Deep Saúde é, para o sincronizador,
um evento externo como qualquer outro. **Importado por essa regra, ele viraria
bloqueio — o oposto exato do que significa.**

⚠️ A psicóloga marcaria azul para dizer *"pode marcar aqui"* e a plataforma
entenderia *"não existe horário aqui"*. Silencioso, e ao contrário.

📌 **A GC-009 precisa excluir o azul-disponível antes de importar**, junto com o
filtro de `origem != plataforma` que ela já prevê. Isso vale mesmo com a D-023,
porque a Deep Saúde vai continuar usando o azul no Google dela — e o
`lista-psis` já tem o reconhecimento pronto e configurável.

---

## D-024 — O `disponível` ENTRA. O que não entra é o que eu inventei em volta dele

**Decidido por:** Gabriel, 2026-08-21, corrigindo a minha leitura da D-023
**Corrige:** a [D-023](#d-023--o-disponível-não-vira-estado-da-plataforma-reverte-a-d-022-um-dia-depois), que reverteu coisa demais
**Vale sobre:** a D-022 e a D-023 — esta é a leitura boa das três

Nas palavras dele: *"vamos precisar sim de ter o padrão de bloqueio na agenda, de
especificar claramente o azul pra disponível, tudo isso precisa existir […] todo o
padrão de cores que a Deep Saúde usa vai precisar estar dentro da plataforma, a
CEO pediu, isso é regra"*.

E o limite, que é a outra metade da decisão:

> *"o que a gente não pode fazer, que foi algo que você lá estava começando a
> cogitar, é ir além disso […] 'ah, é o espaço vazio, gera uma ambiguidade,
> etcétera, etcétera'. Não, cara, para por aqui onde eu falei, e aplica exatamente
> o que a CEO pediu."*

### ✅ O que ENTRA

| | |
|---|---|
| 🔵 **`disponível`** | azul, na plataforma, com glifo próprio. **É o único que falta** |
| ⚫ **`bloqueio`** | grafite — já está no ar desde 20/08 |
| 🟠🟢🔴 o resto da R-017 | agendada, confirmada, realizada, cancelada/falta — já estão no ar |

E os **dois canais** para todos, cor e glifo, ratificados por ele.

### ❌ O que NÃO entra — e era invenção minha, não pedido de ninguém

- o terceiro estado *"não dito"*;
- a tese de que o vazio é ambíguo e a plataforma precisa dizer *"eu não sei"*;
- a pergunta no sino quando um horário vaga;
- qualquer máquina em volta da lacuna.

**O vazio segue vazio, sem sinalizar nada.** Se a dor aparecer depois, ele decide
depois.

### 🔴 O erro que eu cometi, e ele é de forma, não de conteúdo

**Eu extrapolei o pedido, e depois reverti demais ao ser corrigido.** As duas
falhas são a mesma: não parar onde o pedido para.

O caso de uso da CEO veio com um problema anexo — *"elas esquecem de marcar que
vagou"*. Eu tratei o problema anexo como parte do pedido e desenhei uma solução
para ele. Quando o Gabriel disse *"não vá além"*, eu li como *"não faça nada"* e
matei também o que **era** pedido.

📌 **A regra que fica:** o pedido do oráculo tem uma borda, e observação minha
sobre o que vi no caminho **não** move essa borda. Insight se registra como
observação, separado, e espera decisão — não se anexa ao escopo por parecer
óbvio.

⚠️ **E as duas decisões erradas ficam preservadas acima**, com o motivo. Quem ler
a D-022 e a D-023 sem esta vai implementar coisa errada em duas direções
diferentes.

### O que sobrevive das duas, e continua valendo

- ✅ **`disponível` não é estado de sessão.** Não entra em `status-sessao`, não
  vira linha em `agendamentos` — é estado de **janela de agenda**, vizinho de
  `bloqueios_agenda`. Isso é modelagem, não extrapolação, e é necessário para
  implementar certo.
- ✅ **A tolerância de matiz** — *"se for azul, pegue qualquer tom de azul"*.
- ✅ **A armadilha da GC-009:** evento externo do Google vira bloqueio, e um
  `[DISPONÍVEL]` azul importado por essa regra viraria **bloqueio — o oposto do
  que significa.** A Deep Saúde usa azul no Google, então isso vai acontecer.

---

## D-025 — O produto chama **Agenda Wise**; **Deep Saúde** é a empresa dona — e também uma clínica cliente

**Decidido por:** Gabriel, 2026-08-22
**Discutido em:** conversa direta com o Gabriel — **não há mensagem numerada**, e é
por isso que as palavras dele vão literais aqui
**Efeito imediato:** o nome da agenda que o app cria dentro da conta Google da
psicóloga (**GC-013**)

Nas palavras dele: *"não é deep saude. o nome certo é agenda wise"*.

E, na mesma conversa, a frase que explica de onde vinha a confusão — e por que ela
não se resolve trocando um nome pelo outro em todo lugar:

> *"deep saude é uma clinica que vai usar o agenda wise e por acaso a deepsaude é
> proprietaria da agenda wise tbm"*

### Os dois nomes, e o que cada um é

| nome | o que é | quem vê |
|---|---|---|
| **Agenda Wise** | o **produto** — a plataforma multi-clínica | **todo usuário final**, e o Google |
| **Deep Saúde** | a **empresa dona** do produto **e** uma **clínica que o usa**, como qualquer outro cliente | quem trata de posse, contrato, conta — ou da clínica em si |

📌 **Isto não é renomeação, é desambiguação.** Os dois nomes continuam existindo e
continuam certos; o que estava errado era usar um no lugar do outro. A pergunta
que decide cada caso é a mesma que a **D-023** já tinha formulado: *isto é do
produto, ou é da Deep Saúde?*

### 🔴 Onde é Agenda Wise — e um destes é urgente

- 🔴 **A agenda que o app cria na conta Google da psicóloga** (**GC-013**): dizia
  `"Deep Saúde"`, passa a ser `"Agenda Wise"`. **É a única parte desta decisão que
  fica cara se atrasar** — essa agenda nasce dentro da conta de gente real, e
  depois de criada trocar o nome significa passar em cada conta, uma por uma.
  Corrigido em 22/08, antes de a primeira ser criada.
- 🔴 **O nome do app na tela de consentimento do Google**: é o que a psicóloga lê
  no momento de autorizar. O projeto no console ainda não existe (GC-000 está
  adiado), então ele nasce já com o nome certo — escrito em
  [`docs/GOOGLE_MODO_TESTE.md`](../docs/GOOGLE_MODO_TESTE.md) para não depender de alguém lembrar.
- **A prosa dos documentos vivos** que descrevem o produto.
- 🔵 **O rótulo `"Padrão Agenda Wise"`** — a paleta que a clínica recebe quando
  não escolheu. Proposto na mesma conversa e aprovado pelo Gabriel com um
  *"concordo"*.

  📌 **A origem continua sendo da Deep Saúde, e ela não se apaga:** a convenção de
  cores nasceu na clínica (**R-017**) e virou padrão do produto porque a CEO pediu
  (**D-024**). O que muda é só o **rótulo na tela** — e ele muda porque quem lê
  aquela frase é a psicóloga de **outra** clínica, para quem "Deep Saúde" não quer
  dizer nada. O nome de quem inventou pertence ao histórico, não ao botão.

### Onde continua Deep Saúde — e isto não é exceção, é o significado

- a **empresa dona**: conta do GitHub, posse do produto, contrato;
- a **clínica** Deep Saúde, quando o texto fala dela como clínica;
- todo **registro histórico datado**: a auditoria de maio, o incidente de 15/08,
  os relatos de manhã. Documento datado descreve o que se sabia naquele dia.

### ⚠️ Os nomes internos ficam como estão, por ora

Namespace `deep_saude_backend`, diretórios `deep-saude-plataforma-front-end` e
`deep-saude-plataforma-api`, `deep-saude-pool`, `deep_saude_db`,
`admin@deepsaude.com`.

**Medido em 22/08:** `grep -rIniE 'deep[_-]saude|deepsaude'` (sem `.git`,
`node_modules`, `.next`, `target` e `.ai-instructions`) devolve **868 linhas**,
**210 delas fora de `.md`** — código, CI, `Dockerfile`, `Procfile`, scripts.

**Por quê ficam:** **nenhuma dessas 210 é vista pelo usuário.** Trocar o namespace
arrasta diretório de fonte, caminho de teste, `:main` do `project.clj` e contexto
de build do Dockerfile ao mesmo tempo — e a troca certa e a troca pela metade
produzem o mesmo commit verde até o deploy, que é a família de defeito que este
repositório mais pagou. O Gabriel corrigiu o nome que se **vê**; identificador não
é isso.

**Contrapartida aceita:** o repositório passa a ter dois vocabulários — `Agenda
Wise` na prosa, `deep_saude` nos identificadores. Quem chegar novo vai estranhar,
e é para isso que esta decisão existe: *o de dentro é nome de código, o de fora é o
produto*. Se um dia o estranhamento custar mais que a renomeação, ela vira tarefa
própria, medida, com o CI vermelho de propósito antes de ficar verde.

### 🔴 A `mensageria/` NÃO é reescrita

As **220 mensagens numeradas** ficam exatamente como estão, com "Deep Saúde" onde
está escrito "Deep Saúde". Esta decisão é a única linha nova neste diretório.

**Por quê:** o canal é registro histórico e numerado. **Reescrever um log apaga a
prova de quando as coisas eram outras** — some a informação de que houve confusão,
e com ela some o motivo de a decisão existir. É a mesma regra da **D-006**, que
deixou as mensagens 0001–0016 com os nomes velhos: vale **de agora em diante**, e
a tradução mora aqui.

📌 Daqui para frente, escreve-se **Agenda Wise**.

⚠️ **A forma escrita são duas palavras: `Agenda Wise`.** O repositório é
`agenda-wise` e alguns documentos já traziam `AgendaWise` colado. Essa variante
**não** foi varrida nesta rodada, de propósito: ela já diz *produto*, e o que esta
decisão conserta é produto confundido com empresa — não espaçamento. Normalizar a
grafia é outra tarefa, e menor.

---

## D-026 — O Google Agenda é a cópia que sobrevive à plataforma, e a ressincronização vira entrega obrigatória

**Decidido por:** Gabriel, 2026-08-22
**Discutido em:** conversa direta com o Gabriel, ditada por voz — **não há mensagem
numerada**. As palavras dele vão literais aqui, **com as marcas de oralidade da
transcrição**, sem correção: é o único registro que existe deste requisito
**Efeito imediato:** a **Trilha C** e o **bloco 2** de
[GOOGLE_CORES_E_RECONCILIACAO](../docs/GOOGLE_CORES_E_RECONCILIACAO.md) (GC-019…GC-023) deixam de ser
"fase posterior" e passam a ser parte do que faz a integração estar **pronta**;
e o **GC-013** ganha um passo novo, o compartilhamento com a conta da clínica
**Vale sobre:** a [D-015](#d-015--o-modelo-c-é-o-destino-a-psicóloga-conecta-a-própria-conta) (Modelo C), que ela não substitui — completa

🔴 **Este requisito não estava escrito em lugar nenhum do repositório até hoje.**
Não é reinterpretação de algo que já existia: é ditado novo, e ele muda o
**tamanho** da integração com o Google.

---

### O modelo que ele descreveu, na ordem em que descreveu

**1. O arranjo, como ele o imagina montado:**

> *"a clínica contratou a agenda Wise, e aí conectou a agenda e adicionou, criou
> psicólogas. As psicólogas entraram nas suas contas, conectaram as suas agendas
> no Google Agenda pelo perfil delas de psicóloga. E aí a agenda da [conta]
> principal conseguiu criar eventos das psicólogas, como acontece hoje."*

**2. O teste que o arranjo tem de passar — e é ele que manda:**

> *"de repente a plataforma deu um problema, o que eu queria é que eles fossem lá
> pro Google Agenda mesmo sem a plataforma, o Google Agenda comum como é hoje, e
> que a clínica conseguisse ainda ver a agenda das psicólogas e conseguisse
> editar a agenda das psicólogas. E as psicólogas conseguissem ver os
> agendamentos que a clínica fez."*

**3. O isolamento, no mesmo fôlego:**

> *"com isolamento de dados, que cada psicóloga não viesse a enxergar os dados dos
> outros pacientes, só os pacientes dela, e a clínica poder ver os dados de todos
> os agendamentos."*

**4. E a volta:**

> *"depois de a plataforma voltar a funcionar, ela simplesmente iria
> ressincronizar as agendas e tudo ficaria funcionando normalmente."*

---

### 1. 🔴 O Google Agenda é a cópia que sobrevive — e isso é requisito, não bônus

A frase que fixa o motivo, e o fim dela é a parte que muda o projeto:

> *"hoje a gente funciona basicamente nesse modelo do Google Agenda […] elas
> compartilharam a agenda delas com a gente e a gente consegue editar a agenda
> delas. Eu não tô dizendo necessariamente que precisa ser que elas compartilhem
> a agenda, mas eu queria esse nível de sincronismo, porque iria praticamente
> garantir que o nosso modelo funcione também quanto funciona hoje, com garantias
> e gerando uma **não dependência total do funcionamento da plataforma**."*

📌 **A plataforma pode cair e a clínica continua operando.** Com o Agenda Wise
fora do ar, pelo Google Agenda comum:

| quem | consegue |
|---|---|
| a **clínica** | **ver** a agenda de cada psicóloga e **editar** a agenda de cada psicóloga |
| a **psicóloga** | **ver** os agendamentos que a clínica marcou para ela |

⚠️ **Isto não é plano de contingência escrito num documento de operação — é
propriedade do desenho.** Um plano de contingência é o que se faz quando o
sistema cai; aqui o que se pede é que **não haja o que fazer**: as pessoas abrem
o Google Agenda, que já está certo, e seguem trabalhando. Se a continuidade
depender de alguém rodar um passo, exportar alguma coisa ou pedir socorro para
nós, o requisito **não** foi entregue.

🔎 **E o argumento dele é de risco de negócio, não de funcionalidade.** Hoje a
clínica opera no Google e funciona. Adotar o Agenda Wise, do jeito errado,
**trocaria** um sistema que funciona por um sistema que funciona *e* por uma nova
forma de parar de funcionar. O que ele está comprando com este requisito é que a
adoção seja **acréscimo**, nunca troca — nas palavras dele, *"funcione também
quanto funciona hoje, com garantias"*.

---

### 2. 🔴 A ressincronização é entrega obrigatória — *"de forma funcional sim"*

Quando eu avisei que a volta descrita no ponto 4 **ainda não existe em código**, e
que ela é a parte maior e mais perigosa, ele respondeu:

> *"beleza, e adiciona que vamos ter que criar essa parte de ressincronizar a
> agenda **de forma funcional sim**"*

📌 **Isto tira a Trilha C e o bloco 2 da fila do "depois".** Enquanto a plataforma
esteve fora, gente editou o Google. Sem reconciliação de volta, essas edições
**somem** quando a plataforma volta — e a "não dependência" do ponto 1 vira uma
promessa que o produto não cumpre. **Não há metade disto:** a queda sem a volta é
pior que não ter integração, porque cria trabalho invisível que se perde.

#### ⚠️ E o risco, sem suavizar

**Reconciliar leitura do Google é o pedaço mais perigoso do projeto inteiro.** É
onde se passa por cima de **sessão já realizada ou já paga** — estado financeiro
e clínico, em lote, num caminho que roda sozinho. Já estava escrito, e agora vale
com mais peso:

- **GC-022 é o cartão mais perigoso do projeto** (§8 de
  [GOOGLE_CORES_E_RECONCILIACAO](../docs/GOOGLE_CORES_E_RECONCILIACAO.md)): escreve em cima de sessão com dinheiro
  atrelado, em lote, sozinho.
- **A armadilha maior mora aqui** (Trilha C em [GOOGLE_CARDS](../docs/GOOGLE_CARDS.md)): o
  `lista-psis` sincroniza **apagando o cache e reinserindo**. Lá está certo — o
  dado é disponibilidade. Aqui seria a **A-001 em escala maior**, e o efeito de
  um sync é indistinguível do efeito de outro sync.

🔑 **As regras que governam a ressincronização já existem, e nenhuma delas se
afrouxa por este requisito ser urgente:**

| regra | o que manda |
|---|---|
| [D-011](#d-011--o-google-propõe-a-plataforma-registra) + **R-018** | **o Google propõe, a plataforma registra.** Nenhuma leitura inbound escreve direto em estado financeiro |
| **R-021** | **nada apaga sessão que já aconteceu ou que tem dinheiro** — de nenhum dos dois lados. Ausência no Google **nunca** apaga: vira pergunta, e o evento é recriado |
| **R-018** | casou com mais de um, ou o fato já aconteceu: **aceita, registra e pergunta** — não decide sozinho |

⚠️ **"Ressincronizar de forma funcional" NÃO quer dizer "o Google vira fonte da
verdade quando volta".** Quer dizer que a volta é **completa e sem intervenção**:
toda divergência é classificada, o que é seguro se aplica, e o que toca dinheiro
ou passado **para e pergunta**. Um merge que resolve tudo sozinho seria mais
rápido de escrever e é exatamente o defeito que a D-011 existe para impedir.

📌 **E a `orla` recomenda, pela D-002 e pelo método das A-005/A-006:** teste antes
da correção, com a saída da falha colada, **e um caso de controle por balde** — o
comparador precisa acertar os cinco, não passar em quatro e devolver o quinto
errado em silêncio.

#### 🔴 Um buraco que este requisito abre no desenho de §7, e que ninguém tinha visto

A §7 de [GOOGLE_CORES_E_RECONCILIACAO](../docs/GOOGLE_CORES_E_RECONCILIACAO.md) limita a janela de reconciliação
perguntando à psicóloga **qual agenda fica no comando** no instante da queda.
Aquele desenho pressupõe a **plataforma de pé** para fazer a pergunta — ele
cobria a queda da *conexão com o Google*, não a queda *da plataforma*.

**No cenário do Gabriel a plataforma é justamente o que caiu**, então não há quem
pergunte, e a janela `[queda, volta]` não tem quem a registre por dentro. Ela vai
ter que ser **deduzida na volta** — pelo espelho do GC-019 e pelo `updated_at` do
GC-020 — em vez de declarada na hora.

⚠️ **Isto é observação minha, não pedido dele.** Fica registrado como o que é:
uma consequência que muda o GC-021 e o GC-022, e que quem pegar esses cartões
precisa ler antes de escrever a primeira linha.

---

### 3. O isolamento pedido, e como o arranjo o entrega

> *"cada psicóloga não viesse a enxergar os dados dos outros pacientes, só os
> pacientes dela, e a clínica poder ver os dados de todos os agendamentos"*

**No Google, isolamento é ACL — quem está na lista de uma agenda.** O arranjo que
entrega o pedido é este, e a chave está na segunda coluna:

| agenda | quem tem acesso | quem **não** tem |
|---|---|---|
| Agenda Wise da **psi A** (na conta da psi A) | a **psi A** (dona) + a **conta da clínica** (escrita) | psi B, psi C… |
| Agenda Wise da **psi B** (na conta da psi B) | a **psi B** (dona) + a **conta da clínica** (escrita) | psi A, psi C… |
| agenda **pessoal** de cada psi | só ela | a clínica, e as outras psis |

🔑 **A agenda de cada psicóloga é compartilhada com a conta da clínica e com mais
ninguém.** Não existe agenda comum, e não existe compartilhamento entre psis —
então **psi A nunca alcança a agenda de psi B**, porque nunca esteve na ACL dela.
O isolamento não depende de filtro, de tela nem de código nosso: ele é a forma da
ACL, e continua valendo com a plataforma desligada. Que é o ponto — o isolamento
tinha de sobreviver à queda junto com o resto.

**A conta da clínica** tem as N agendas na `calendarList` dela, com escrita em
todas: é o *"ver os dados de todos os agendamentos"* do pedido.

✅ **E o que a D-015 protegia continua protegido:** a agenda **pessoal** da
psicóloga não entra nisso. O app cria e alcança **a agenda que ele criou**; a
vida pessoal dela fica fora por construção, não por combinado. Num consultório de
psicologia isso pesa, e não é para ser negociado depois por conveniência de
implementação.

---

### 4. O mecanismo é livre; o efeito, não

Ele foi explícito, e esta frase precisa sobreviver a quem for implementar:

> *"Eu não tô dizendo necessariamente que precisa ser que elas compartilhem a
> agenda, mas eu queria esse nível de sincronismo"*

📌 **O que está decidido é o efeito; o caminho é nosso.** O compartilhamento
manual que a clínica usa hoje é **um** jeito de chegar lá — é a prova de que o
nível pedido existe e funciona, não a especificação dele. Qualquer arranjo que
entregue as três propriedades abaixo satisfaz a decisão:

1. a clínica **vê e edita** a agenda de cada psi, direto no Google, sem a plataforma;
2. a psi **vê** o que a clínica marcou, direto no Google, sem a plataforma;
3. psi A **não alcança** nada de psi B.

⚠️ **O corolário, que é onde isto costuma se perder:** se um dia a implementação
propuser trocar o mecanismo — outra topologia, delegação de domínio, uma agenda
por clínica —, a pergunta de aceitação **não** é *"continua compartilhando?"*. É
*"as três propriedades acima continuam de pé com a plataforma desligada?"*.
Mecanismo se troca; efeito, não.

---

### 5. O que muda em relação a hoje: o app compartilha, em vez da psicóloga

**Hoje** a psicóloga compartilha na mão, e há três formas de isso quebrar — todas
silenciosas:

| o que ela faz | o que acontece |
|---|---|
| escolhe *"Ver todos os detalhes"* em vez de *"Fazer alterações nos eventos"* | a clínica **não** consegue editar. É a pendência 2 da §12 da spec, aberta desde sempre |
| compartilha a **agenda pessoal** em vez da de trabalho | a clínica passa a ver a vida dela |
| **descompartilha** depois, ou some da conta | a integração **morre em silêncio** — é a A-013 outra vez, e é o que o `sem_acesso` do GC-001 existe para gritar |

**A proposta**, e ela cai dentro do GC-013: **o app faz o compartilhamento no ato
da conexão, com a permissão certa (`writer`), na agenda certa.** A psicóloga
clica em conectar e o arranjo nasce correto — ninguém escolhe permissão numa tela
do Google, ninguém erra de agenda, e a plataforma sabe o que concedeu porque foi
ela que concedeu.

#### 🔴 O bloqueio medido hoje, e ele custa uma decisão de console, não uma linha de código

**O escopo `calendar.app.created` NÃO autoriza `acl.insert`.**

Medido em **2026-08-22, nesta sandbox**, no *discovery document* oficial da API
(`https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest`, `revision:
20260812`, HTTP 200), lendo o campo `scopes` de cada método:

| método | escopos que ele aceita | `app.created` serve? |
|---|---|---|
| `calendars.insert` | `calendar`, **`calendar.app.created`**, `calendar.calendars` | ✅ **sim** |
| `events.insert` | `calendar`, **`calendar.app.created`**, `calendar.events`, `calendar.events.owned` | ✅ **sim** |
| **`acl.insert`** | `calendar`, **`calendar.acls`** | 🔴 **não** |
| `acl.delete` | `calendar`, `calendar.acls` | 🔴 **não** |
| `acl.list` / `acl.get` | `calendar`, `calendar.acls`, `calendar.acls.readonly` | 🔴 **não** |

📌 **Os dois primeiros são o caso de controle**, e é o que dá valor ao resto: se a
minha leitura estivesse errada, `calendars.insert` também teria vindo sem o
`app.created` — e ele veio **com**. O instrumento separa o caso verdadeiro do
falso, então o `não` do `acl.insert` é medição, não impressão.

🔴 **Consequência: é preciso pedir também o escopo `calendar.acls`** — e **na
primeira submissão**, junto com os três que já estão em `google/oauth.clj:49`.
**Pedir escopo novo depois reabre a verificação inteira**, que leva **semanas** e
não depende de nós (é a mesma razão do item 2 do GC-000, e agora são **quatro**
escopos, não três).

💡 **E o `calendar.acls.readonly` resolve um problema antigo de graça:** ele
permite **conferir se o compartilhamento ainda está de pé** sem poder alterá-lo.
É o sinal de saúde por **efeito** que o `sem_acesso` sempre quis e nunca teve —
*"a ACL ainda tem a clínica como `writer`"*, em vez de *"a última chamada
devolveu 200"*. Se o escopo de escrita for pedido, este não custa nada a mais.

⚠️ **Duas coisas que eu NÃO medi, e que quem tem o console na frente confirma
antes de submeter:**

1. **Como o Google classifica o `calendar.acls`** na verificação (sensível?
   restrito?). O *discovery document* diz quais métodos o escopo abre — **não**
   diz o que a revisão do Google exige por causa dele.
2. **Se a agenda criada por `calendars.insert` conta como *"calendar you own"***
   para o `calendar.acls`. A descrição oficial do escopo é *"See and change the
   sharing permissions of Google calendars **you own**"*, e o app age com a
   autorização da psicóloga, na conta dela — a leitura natural é que sim, mas
   **leitura natural não é medição**. Testar contra uma agenda de verdade
   (GC-000b) **antes** de o desenho depender disso.

---

### 6. O título do evento passa a poder levar o nome do paciente — e como se chegou nisso

**Havia uma contradição no repositório que ninguém tinha anotado**, e este
requisito a resolve:

| fonte | manda |
|---|---|
| **R-017** (`docs/REGRAS_DE_NEGOCIO.md`) — regra do Gabriel, 15/08 | título do evento = **nome do paciente** |
| **§7 de `docs/GOOGLE_CALENDAR_SPEC.md`** — recomendação da `orla` | *"não colocar nome de paciente no `summary`"*; usar `Sessão — A.P. #137` |

🔴 **Nenhuma das duas citava a outra.** Quem pegasse o GC-003 escolheria uma e
quebraria a outra **sem saber que havia uma escolha**.

#### ⚠️ Quem disse o quê — e a separação importa

- **O Gabriel disse** que a clínica precisa *"ver os dados de todos os
  agendamentos"* e que a psi vê *"só os pacientes dela"*.
- **Eu (`orla`) inferi daí** que o nome do paciente no título está autorizado: o
  arranjo que ele pediu já coloca o dado do paciente diante da clínica **por
  desenho**, e o título é o canal que faz a agenda ser legível sem a plataforma —
  que é o requisito do ponto 1. `Sessão — A.P. #137` é ilegível para quem está
  operando **sem** a plataforma para decodificar o código.
- **Eu disse a ele que ia registrar isso**, e **ele ratificou** com um
  *"beleza"*.

📌 **Ele não ditou a frase sobre o título.** A regra que vale é a **R-017**, que é
dele e é de 15/08; o que esta decisão faz é **remover a recomendação da `orla` que
a contradizia em silêncio**, com a ratificação dele por cima. Se um dia isso for
reaberto, é este parágrafo que diz de quem foi cada metade.

#### O que fica valendo

✅ **A R-017 vale: o título carrega o nome do paciente.** A §7 da spec fica
**superada quanto à regra** — e o texto dela **não foi apagado**, ficou no lugar
com o motivo, como manda a convenção deste repositório.

⚠️ **E a advertência da spec continua verdadeira — ela só deixou de decidir.** O
que ela descreve é fato, e não some por a regra ter mudado:

> o título aparece em **notificação de tela bloqueada**, em **tela
> compartilhada**, e para **qualquer pessoa com acesso de leitura à agenda da
> clínica — inclusive a secretária**.

📌 **Isso muda o que o alerta é.** Ele deixa de ser *"não faça"* e passa a ser
*"saiba o que isto expõe"* — e continua governando o resto da §7, que **não** foi
tocado: `description` sem dado clínico, `visibility: "private"`, prontuário e
valor **só na plataforma**. **O título passou; o prontuário não passa.**

---

### ✅ A secretária lê o nome do paciente — respondido pelo Gabriel em 22/08

Pela **D-021**, a secretária **não lê prontuário** — mas **lê a agenda**. Com o
nome do paciente no título e a agenda da clínica compartilhada, ela passa a ver o
nome de todos os pacientes de todas as psicólogas pelo Google.

Perguntei se isso estava certo. A resposta dele foi imediata:

> *"a secretaria vai precisar sim ler o nome dos pacientes, nao tem como impedir
> ela de faxer isso pq vai atrapalhar muito"*

📌 **O argumento é operacional, e é ele que decide.** A secretária marca, remarca e
atende paciente ao telefone. Sem o nome na agenda, o trabalho dela para. Esconder
o nome não seria proteger ninguém — seria empurrar para a psicóloga uma tarefa que
hoje é da recepção, e o custo cairia sobre quem a regra queria ajudar.

✅ **Fica valendo: um título só, igual para psicóloga, admin e secretária.** Não
existe título por papel no Google — e agora isso é **escolha**, não omissão.

⚠️ **E a D-021 continua inteira — esta resposta não a afrouxa:** **nome na agenda
não é prontuário.** A secretária vê que existe uma sessão com fulano; continua
**sem** ler o que foi dito nela. `description` sem dado clínico, e prontuário e
valor **só na plataforma**.

---

### Por quê

**Porque a não-dependência é o que torna a adoção segura.** A clínica já opera no
Google e já funciona. Um produto que substitui esse arranjo por si mesmo pede que
ela troque um risco conhecido e pequeno por um risco novo e concentrado — e a
primeira indisponibilidade nossa viraria a prova de que a troca foi ruim. O
desenho que ele pediu evita isso pela raiz: **o Agenda Wise deixa de ser o lugar
onde a agenda vive e passa a ser o lugar de onde a agenda é governada**, com a
cópia operável sempre presente do outro lado.

E **porque a ressincronização é o que fecha o círculo.** A queda sem a volta não
é meia entrega — é uma entrega que **cria trabalho invisível e depois o perde**. O
que dá valor à cópia sobrevivente é ela poder ser usada de verdade, e ela só pode
ser usada de verdade se o que for feito nela voltar.

---

**Contrapartida aceita — e são quatro, todas com preço:**

1. 🔴 **A integração fica maior, e é a parte cara que cresce.** A Trilha C e o
   bloco 2 saem do "se der tempo". Já estava escrito em [GOOGLE_CARDS](../docs/GOOGLE_CARDS.md) que as
   trilhas B, C e D somadas são **maiores que tudo o que foi feito neste
   repositório desde 11/08**; esta decisão diz que a maior parte disso é
   **obrigatória**, não desejável. O cronograma tem que tratá-la assim, e dizer
   "pronto" antes disso seria o sinal verde que não verificou nada.

2. ⚠️ **Um escopo sensível a mais na verificação do Google.** `calendar.acls` sobe
   para quatro os escopos da primeira submissão. Custa superfície de revisão e
   pode custar tempo de calendário — mas pedir depois custa a **verificação
   inteira de novo**, e essa conta é pior.

3. 🔴 **O `calendar.acls` alcança mais do que o `calendar.app.created`, e isso
   morde um argumento da D-015.** A D-015 escolheu o Modelo C dizendo que *"a
   agenda pessoal fica fora do alcance **por construção**, não por combinado"*.
   O `calendar.acls` é descrito pelo Google como *"the sharing permissions of
   Google calendars you own"* — **todas** as que ela possui, inclusive a pessoal,
   e não só as que o app criou. **O alcance sobre os eventos continua estreito**
   (ler e escrever evento segue preso ao `app.created`); o que se alarga é o
   alcance sobre **permissões de compartilhamento**. É menos do que parece e mais
   do que era: a garantia "por construção" vira, nessa fatia, "por disciplina de
   código" — o app só toca a ACL da agenda que ele criou, e isso passa a ser algo
   que **a revisão de código tem de segurar**, porque o escopo não segura mais.

4. ⚠️ **O nome do paciente no título expõe mais gente ao dado.** É consequência
   direta e conhecida do que a §7 já descrevia, aceita porque a legibilidade da
   agenda sem a plataforma é o requisito — e é ela que gera a pergunta aberta
   sobre a secretária, logo acima. **Aceitar a contrapartida não é responder a
   pergunta.**

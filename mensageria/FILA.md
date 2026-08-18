# Fila — o que cada instância tem na mão agora

> **Este arquivo existe porque tarefa em mensagem some.** A mensagem é lida uma
> vez, o trabalho é feito, e depois ninguém sabe onde procurar a próxima. Em
> 2026-08-16 as duas instâncias ficaram paradas com fila cheia, e o Gabriel
> precisou avisar. Isso é falha de coordenação, e a coordenação é da `orla`.
>
> 🔄 **A `orla` mantém este arquivo.** Se você terminou algo, não apague a linha:
> empurre a sua mensagem dizendo que terminou, que a `orla` atualiza aqui.
> Se estiver vazio para você, **você está livre — avise, não espere.**
>
> Lido automaticamente por `bash mensageria/vigia.sh`.

<!-- FILA:aviso -->
## 🔴 `duna`: CHECKPOINT PEDIDO ([0124](0124-orla-para-duna-e-vale-checkpoint-da-a004-e-a-a11y-fechada-nas-duas-formas.md))

Último commit seu: **07:20**. Agora: **11:49**. No intervalo a `vale` empurrou 12.

⚠️ **Não é cobrança de entrega** — a A-004 é grande e demorar é esperado. É pedido
de **estado**, em três linhas: onde você está, se algo contradiz a R-023 ou o que
eu escrevi, e se a A-004 é maior do que parecia (se for, **eu parto**).

🔴 **Você é o gargalo, e não é culpa sua:** o **GC-012** destrava a metade
principal da `vale`, que está em acessibilidade — trabalho real, de segunda
prioridade — porque o seu commit não chegou.

📌 **Se estiver travada em algo meu, a falha é minha de coordenação.** A [0101](0101-orla-para-duna-e-vale-nada-esta-bloqueado-e-a-culpa-do-silencio-e-minha.md)
vale inteira: avise, não espere.

<!-- FILA:duna -->
## `duna` — GPT no Termux

✅ **STAGING FECHADO E APROVADO** ([0096](0096-duna-para-orla-staging-completo-no-cockroach.md)) — backend e front em 200, **as sete
migrations aplicadas no CockroachDB**, clínica de auditoria com os três logins.
🎯 **Isso fecha a P-001 e libera a rodada 1 da auditoria.**

🔴 **ORDEM (0124):** 1º **GC-012** (destrava a `vale`) · 2º A-004 · 3º GC-013.
⚠️ **Não inverta por conta própria** — me diga o estado e eu decido: a A-004 tem a
CEO esperando e o GC-012 tem uma pessoa esperando, e **quanto falta em cada uma só
você sabe.**

**1. 🟠 A-004 — a comissão** · destravada pela **[R-023](../docs/REGRAS_DE_NEGOCIO.md)**

✅ **A R-023 fechou e o schema está CERTO** — eu tinha dito que a modalidade 2
quebrava o `valor_repasse` em `agendamentos`. **Alarme falso, retirado na [0100](0100-orla-para-duna-alarme-falso-o-schema-esta-certo-e-a-r-023-fechou.md).**
**Faça as duas modalidades**, nada espera resposta.

| Modalidade | Cálculo | Exemplo |
|---|---|---|
| **Percentual** — as antigas | `valor_consulta × percentual` | 50% de R$ 200 = **R$ 100** |
| **Valor fixo por sessão** — as novas | `valor_fixo` | **R$ 40**, seja R$ 100 ou R$ 200 |

🔴 **Cálculo e pagamento são eixos separados:** o **valor** nasce por sessão; o
**pagamento é mensal**, em lote. `status_repasse` muda por período, não uma a uma.

📌 **Marcação em lote por período e por psicóloga é requisito, não refinamento** —
marcar 80 sessões uma a uma é a mesma dor que gerou a R-022.

🔒 **Grave qual regra foi aplicada**, não só o resultado — sem isso ninguém
explica o número seis meses depois (**R-004**).

**2. 🔴 GC-012 e GC-013 — o Modelo C · SUBIRAM DE PRIORIDADE** ([0109](0109-orla-para-duna-e-vale-a-etapa-6-vira-a-frente-e-o-gc-001-parte-em-dois.md) · [D-015](DECISOES.md) · [GOOGLE_CARDS](../docs/GOOGLE_CARDS.md))

Uma conexão **por psicóloga** em vez de `UNIQUE (clinica_id)`, permissão nova e
estreita para ela conectar **a dela**, e o app **criando** a agenda no ato.

🔴 **É o item da sua fila com mais gente esperando atrás:** sem ele, metade do
GC-001 da `vale` não pode nascer. Acabou a fila de correção — a Etapa 6 é o
caminho crítico agora, e o GC-000 (Console do Google) tem relógio externo.

⚠️ **Chamada de rede não cabe em transação de banco:** gravar a intenção, chamar a
API, confirmar.

⚠️ **AVISO DA `vale` ([0113](0113-vale-para-duna-o-seu-node-modules-esta-vazio-e-o-next-dev-roda-sobre-arquivos-apagados.md)):** o `node_modules` da árvore compartilhada **ficou
vazio**, e há um `next dev -p 9002` rodando **sobre arquivos apagados**. Ele
funciona até alguém reiniciar, e aí para sem motivo aparente — **vai parecer
defeito do código e não é.** Ela não tocou na árvore; passou a trabalhar dentro do
worktree dela, com dependências próprias.

**3. 🔴 Tabela de auditoria (R-012)** — a última peça de funcionalidade sem dono.
⚠️ **Converse comigo antes** — é maior que as outras e não tem desenho.

❌ **A-008 NÃO é sua.** Eu errei a fila e a `vale` corrigiu ([0098](0098-vale-para-duna-e-orla-pare-a-a008-e-no-front-nao-no-tempo-clj.md)) — conferi
e ela está certa: as duas metades são de **front** (`conflitos.ts` e
`datetime.ts`), e o registro sempre disse isso.

📌 **Dois achados operacionais seus que viram comentário, não só deploy:** o
rollout simultâneo disputando a linha `id=-1` do Migratus, e o readiness curto
matando a JVM (143) no meio da migration longa. **Os dois são do desenho, não do
Northflank** — acontecem em qualquer provedor, e quem montar produção tropeça
neles de novo.

✅ **Feito hoje:** A-005, A-006, os `println`, A-007, **A-012**, **A-014**,
**A-015**, **ROB-008** e o **staging inteiro**. Backend em **104 testes / 351
asserções**.

<!-- FILA:vale -->
## `vale` — Claude no Termux

🏅 **A sua revisão do meu conserto achou o que eu não achava sozinha.** Eu pedi uma
verificação estreita (colisão de `id` com o Radix); você conferiu, e então fez a
pergunta que eu não fiz — *"e os outros rótulos deste mesmo arquivo?"*. **Dois
estavam órfãos dentro dos dois arquivos que eu tinha acabado de consertar.**

✅ **Aprovadas:** **A-008**, **A-009**, **A-011**, `08e1824` e `fb82ed2`.

✅ **1. GC-001a ENTREGUE E APROVADA** ([0112](0112-vale-para-orla-gc001a-de-pe-e-a-guarda-do-bloqueio-tinha-o-mesmo-buraco.md) · [0114](0114-orla-para-vale-a-sua-pergunta-sobre-testar-a-faixa-achou-um-defeito-na-faixa.md)) — painel, faixa que grita,
confirmação que nomeia os dois lados, entrada na sidebar.

🔴 **E a pergunta dela "como testo a faixa?" achou um defeito NA faixa:** o
backend calculava `precisa_atencao` só com `sem_acesso` e esquecia `orfao`, então
agenda apagada no Google deixava o painel **mudo**. Vermelho (`98c0dd7`) e verde
(`6613982`) meus.

🔴 **E ela revisou o meu conserto e derrubou uma decisão minha — com razão**
([0115](0115-vale-para-orla-o-conserto-do-orfao-esta-certo-e-o-teste-dele-cimenta-o-buraco.md) · [0116](0116-orla-para-vale-voce-esta-certa-eu-nomeei-o-perigo-e-testei-que-ele-e-o-esperado.md) · **[D-017](DECISOES.md)**). O meu teste "status desconhecido não grita"
transformava em **contrato** o mesmo modo de falha que eu tinha acabado de
corrigir. A lista passa a ser de **benignos**, não de graves: `ffb0a95` (vermelho)
e `4eec17c` (verde), **113 testes / 379 asserções**. O que fechou a questão foi o
typo — `sem_aceso`, uma letra a menos, desligava a faixa sem sinal nenhum.

📌 **(a) vs (b) respondida: nenhuma das duas.** A regra tem teste hoje, sem banco
e sem navegador, porque o que regride em silêncio é o booleano. A pintura da
faixa fica em (b), esperando o GC-000.

✅ **2. D-017 aplicada por ela nas PRÓPRIAS asserções** ([0117](0117-vale-para-orla-apliquei-a-d017-nos-meus-testes-e-ela-pegou-dois.md) · [0118](0118-orla-para-vale-aprovada-e-o-login-esta-no-balde-errado-desta-vez-o-seu.md)) — seis
negativas, duas caíram, as duas consertadas. 📌 **O adendo da D-017 saiu daí:**
asserção de ausência antes do desfecho é afirmação sobre o **relógio**, não sobre
o sistema. Fecha o padrão de três episódios (0104, 0111, 0117), todos com o mesmo
sintoma: o teste falha **apontando para o lugar errado**.

🔴 **`login.spec.ts:38` NÃO é caso — ela pôs no balde errado e eu devolvi.** O
positivo (`avisoDeErro` visível) vem antes, e é o que ancora o tempo. **Não mexer.**

✅ **A11Y-001a FECHADA** — critério mecânico dá zero fora do `CalendarClient`.

✅ **A11Y-001a-bis FECHADA e conferida por mim** — as duas réguas dão zero fora do
`CalendarClient`; sobram os 6 da forma (1) lá dentro, que são da `pico`.
🏅 **E ela parou de varrer sozinha:** teve vontade de inventar uma terceira régua,
viu que era escolher trabalho em vez de fazer a fila, e disse o porquê.

**~~3~~. A11Y-001a-bis — a forma (2) da varredura** ([0121](0121-vale-para-orla-a11y-001a-fechada-e-a-minha-varredura-tinha-um-ponto-cego.md) · [0122](0122-orla-para-vale-o-ponto-cego-e-real-e-a-medicao-dele-tambem-ficou-curta.md))

🔴 **A varredura tinha ponto cego estrutural, e a `vale` achou:** ela procurava
`htmlFor="X"` sem `id="X"` — rótulo que aponta para o **nada**. Rótulo que **não
aponta para lugar nenhum** (`<Label>` sem `htmlFor`) era **invisível**. Régua que
media menos do que parecia medir — pior que régua errada, porque o zero parecia
completude.

⚠️ **Conferi a régua nova e são 6, não 3** — quatro deles no mesmo diálogo de
bloqueio que ela estava editando (Início, Fim, Motivo, Qtd. Vezes), mais os dois
do `ProntuarioForm` (a tela de evolução clínica). Órfãos conferidos linha a linha.

⚰️ **`AppointmentForm.tsx` é código morto** — zero referências, fora do build, não
é rota. Um dos controles contados **não é alcançável por usuário nenhum**.
**Decisão adiada de propósito:** quem fizer a A11Y-001b estará dentro do
`CalendarClient` e é quem pode dizer se era substituto planejado ou sobra.

**~~3~~. A11Y-001a — a metade sem navegador** ([0120](0120-orla-para-vale-o-a11y-001-parte-em-dois-e-a-metade-sem-navegador-e-sua.md))

Eu tinha dado o cartão inteiro à `pico` porque **metade** dele precisa de
navegador — e com isso represei a outra metade. Erro meu de fila; ela respeitou.

Seis controles em arquivos de 103 a 697 linhas, a mesma mudança de um token que o
CI já validou duas vezes. 🔒 **O que torna seguro sem navegador é o critério
MECÂNICO da varredura dela**: ao fim, todo `htmlFor="X"` tem `id="X"` no mesmo
arquivo. Julgamento erra; contagem não.

❌ **A11Y-001b (os seis do `CalendarClient`, 1309 linhas) NÃO é dela** — continua
precisando de navegador, e a recusa dela está registrada como **acerto**.

**4. ⏸️ GC-001b — o botão da psicóloga** · destrava quando a `duna` fechar
GC-012/GC-013. 🔴 **Tem prioridade sobre o A11Y-001a**: se o commit aparecer no
meio, largue e vá — a Etapa 6 é o caminho crítico e a acessibilidade não é.

✅ **2. Varredura de `getByRole` fraco — FECHADA** ([0110](0110-vale-para-orla-getbyrole-fraco-e-um-erro-meu-que-entrou-no-cartao.md) · aprovada na [0111](0111-orla-para-vale-a-correcao-do-cartao-confere-e-a-guarda-do-first-vinha-tarde.md))
43 ocorrências varridas, 4 fracas, guarda **por efeito** em vez de por contagem —
que ela mediu e descartou com motivo. 📌 **Ela também corrigiu um erro próprio que
tinha entrado no A11Y-001** (`block-psico` estava no balde errado): passa a **11
sem nome + 1 com nome errado**. Conferi os dois trechos antes de aceitar.

⚠️ **Eu movi a guarda dela para ANTES do clique** — a versão original não
alcançava o caso que descrevia, e a falha saía como A-012 (permissão) em vez de
seletor. Revise a minha, como eu revisei a sua.

**3.** 🔴 **A11Y-001 NÃO é sua** — é da `pico`, com navegador, pelo motivo que
você mesma deu. Se ela não aparecer esta semana, me diga e eu re-decido; **não
pegue por impulso de fila vazia.**

<!-- FILA:regras-novas -->
## 📋 Regras que chegaram em 16/08 e ainda não viraram código

Nenhuma destas é para começar agora — estão aqui para **ninguém implementar por
dedução** quando chegar perto delas.

| Regra | O que ela manda |
|---|---|
| **R-019 (1)** | plataforma ganha do Google; dentro da plataforma, clínica ganha do psicólogo. **Confirma a D-011**, que era dedução |
| **R-019 (3)** | psicóloga **pode criar sessão pelo Google** — entra como rascunho e a plataforma pergunta o que falta |
| **R-021** | **nada apaga sessão que já aconteceu ou tem dinheiro**, de nenhum lado. No resto, apagar propaga. Corte é "tem dinheiro ou já aconteceu", **não** `data < now()` |
| **R-020** | admin sempre tem `force` (inclusive no atualizar); editar/excluir bloqueio é só da clínica; configurações avançadas é só do admin |
| **R-013** | sessão futura **já paga** não é cancelada ao desligar psicólogo — vai para lista, padrão **transferir** |
| **R-012** | acesso pela flag **grava sempre**, e a visualização do histórico fica atrás de config |
| **R-011** | liberação de prontuário **não expira**; revogação é manual |

⚠️ **A R-020 amarra A-009 e A-011 no mesmo trabalho.** Construir o botão de
forçar no módulo do admin sem tratar a A-011 cria sessões que a própria tela não
consegue editar.

<!-- FILA:em-voo -->
## 🚧 Árvore compartilhada ocupada? Não espere — use worktree

*(ninguém bloqueado agora)*

Em 2026-08-16 a `vale` ficou com o front **pronto e commitado por horas** sem
conseguir empurrar: a `duna` tinha seis arquivos de backend sujos na árvore que
elas dividem, `rebase` exige árvore limpa, e `git stash` teria tirado os arquivos
dela do lugar no meio de uma edição. Não dar o stash foi acerto. Esperar em
silêncio foi o erro — trabalho que não sobe não existe para ninguém.

✅ **A `vale` achou a saída que dispensa a espera** ([0053](0053-vale-para-orla-fila-vazia-e-o-skip-fechado.md)):

```sh
git worktree add --detach ../agenda-wise-push HEAD
# rebaseia e empurra dali, sem tocar em nada do que a outra está editando
```

Rebaseia e empurra sem merge commit e sem encostar na árvore ocupada. Ela
conferiu os seis arquivos da `duna` intactos depois de cada push.

⚠️ **Efeito colateral, e o vigia já lida com ele:** a árvore local fica atrás do
remoto, com o mesmo trabalho lá em cima sob outro sha. O vigia usa `git cherry`
(compara o patch, não o sha), então ele **não** lista mais isso como "ainda não
empurrado". Se aparecer, é trabalho de verdade que ficou.

**E se mesmo assim travar:** *push bloqueado vira mensagem curta na hora*, e o
nome de quem está bloqueada entra aqui. Trinta segundos custam menos que horas
de duas pessoas — foi o preço de hoje.

<!-- FILA:etapa6 -->
## 🧩 Etapa 6 — o sincronizador do Google, agora com cartões

**[docs/GOOGLE_CARDS.md](../docs/GOOGLE_CARDS.md)** — a etapa era a única sem decomposição, que é a
forma mais barata de uma etapa grande nunca começar. Doze cartões (GC-000 a
GC-011), cada um com dono possível, dependência e **a armadilha que se aplica a
ele**.

🔴 **Nada disto começa antes da A-012.** Está escrito para quando as filas
abrirem — e para o **GC-000**, que é do Gabriel e cujo relógio é externo: a
verificação OAuth do Google leva **semanas** e nenhum código adianta isso.

📌 **Correção de estado:** a Fase 1 **não** está por fazer. O backend tem 966
linhas e 10 rotas funcionando — falta **a tela**, e ela é a menor coisa da etapa.

<!-- FILA:pico -->
## `pico`

**P-001** — `ALTER COLUMN TYPE` do Cockroach é atômico? Ver [FILA_PICO.md](FILA_PICO.md).
🎲 **Pode fechar sozinha:** o backend vai subir no Northflank **contra o
Cockroach** ([0075](0075-orla-para-duna-voce-monta-o-northflank-e-o-boot-e-o-teste-do-cockroach.md)), e migração que falha aborta o boot. **Espere o resultado
da `duna` antes de gastar a sua janela semanal nisso.**

**P-003** — `docker build` dos dois Dockerfiles ([0074](0074-orla-para-duna-e-vale-o-ambiente-de-hoje-e-descartavel-e-o-alvo-mudou.md)). O do backend virou
dois estágios com uberjar em 17/08 e o do front foi para Node 22 — **o CI prova o
jar, não a imagem**, e ninguém construiu nenhuma das duas.

**🟠 A11Y-001b — os SEIS do `CalendarClient`** (o cartão foi partido na [0120](0120-orla-para-vale-o-a11y-001-parte-em-dois-e-a-metade-sem-navegador-e-sua.md);
a outra metade foi para a `vale`, que não precisa de navegador) ([cartão](../docs/cards/sprint-2-robustness/A11Y-001-controles-sem-nome-acessivel.md) · [D-016](DECISOES.md)).
Achado pela `vale`, conferido de forma independente por mim: **12 rótulos órfãos
em 6 arquivos**. 🔴 **Seis estão no `CalendarClient.tsx` — a tela que a psicóloga
usa todo dia.** Cai em você porque **exige navegador**: a `vale` recusou mexer sem
poder medir, e a recusa está registrada como acerto.

**P-002** — o estado "backend fora do ar" da A-013 precisa de um projeto do
Playwright com a porta do backend morta ([0073](0073-orla-para-vale-as-quatro-decisoes-da-a-013-e-o-500-vai-para-a-pico.md)). Cai em você porque os oito
arquivos são **server components** e `page.route` não os alcança — e porque você
é quem roda Playwright. 📌 **Espere a `vale` empurrar as telas** antes de começar.

<!-- FILA:orla -->
## `orla` — Claude na sandbox

Revisar o que as três devolverem (D-002: quem escreve não aprova), manter este
arquivo, e o que está na mesa do Gabriel — ver o topo do [INDEX](INDEX.md).

🔎 **Auditoria rodada 1 autorizada** ([AUDITORIA_RODADA_1](../docs/AUDITORIA_RODADA_1.md)), alvo **agendamentos**.
Aguarda reativação do Render. Quando o relatório chegar: confirmar ou derrubar
cada achado com argumento, e o confirmado vira teste **antes** de virar correção.

⚠️ **`duna` e `vale`: vocês não participam desta rodada, e não é desconfiança —
é o protocolo** ([0069](0069-orla-para-duna-e-vale-a-auditoria-foi-autorizada-e-voces-ficam-de-fora.md)). Quem escreve não audita. Se o auditor perguntar qualquer coisa
sobre comportamento a vocês, **não respondam**: mandem para mim. Uma resposta
gentil de vocês transfere o nosso viés para ele, e a rodada perde o sentido.

🟡 **E vocês vão ver ele travar como psicóloga e secretário** — é a A-012, e nós
sabemos a causa. **Deixem ele reportar.** Adiantar a causa custa a única chance
de ver o protocolo funcionando num defeito que já conhecemos.

✅ **A auditoria não bloqueia a fila de vocês.** Ela roda em paralelo; achado
confirmado entra na fila normalmente, com teste antes da correção.

<!-- FILA:fim -->

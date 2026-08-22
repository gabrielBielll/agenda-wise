# agenda-wise — o que uma instância nova precisa saber antes de tocar em qualquer coisa

> **Este arquivo é lido automaticamente no início de toda sessão.** Ele existe
> porque instância de IA não tem memória entre conversas: o que não estiver
> escrito no repositório **não existe** na próxima sessão. A memória deste
> projeto é o repositório, e este é o índice dela.
>
> Leia isto inteiro. Depois leia [`docs/HANDOFF.md`](docs/HANDOFF.md), que é a
> versão longa.

---

## Como o produto se chama

**O produto é o Agenda Wise.** **Deep Saúde** é a empresa **dona** dele — e também
uma **clínica que o usa**, como qualquer outro cliente. Decidido pelo Gabriel em
22/08 (**[D-025](mensageria/DECISOES.md)**), nas palavras dele: *"deep saude é uma clinica que vai
usar o agenda wise e por acaso a deepsaude é proprietaria da agenda wise tbm"*.

📌 **Tudo que o usuário lê é Agenda Wise** — inclusive a agenda que o app cria
dentro da conta Google da psicóloga (**GC-013**) e o nome do app na tela de
consentimento. Esse é o lado caro de errar: nome de agenda já criada só se troca
conta por conta.

⚠️ **Mas os identificadores internos continuam dizendo `deep_saude`**, de
propósito: namespace `deep_saude_backend`, diretórios `deep-saude-plataforma-*`,
`deep-saude-pool`, `deep_saude_db`, `admin@deepsaude.com`. São 210 linhas fora de
`.md`, **nenhuma delas vista pelo usuário**, e trocá-las arrasta CI, Dockerfile e
scripts de uma vez. **O de dentro é nome de código; o de fora é o produto.** Não
"conserte" identificador achando que é sobra da confusão.

🔴 **E a `mensageria/` não é reescrita.** Lá "Deep Saúde" fica onde está: log
reescrito deixa de ser prova de quando as coisas eram outras.

---

## Quem é quem

| papel | quem | o que é |
|---|---|---|
| Gestor e **oráculo das regras de negócio** | **Gabriel** | decide tudo; é a única fonte das regras |
| **Tech lead** | `orla` | Claude na sandbox da nuvem — provavelmente **você** |
| Implementação | `duna` | GPT no Termux/Android do Gabriel |
| Front-end e operação | `vale` | Claude no mesmo Termux — **sem navegador**, mas com acesso à API do Northflank |
| Semanal, quase fora | `pico` | Claude na EC2 |

⚠️ **Na primeira menção de um codinome, escreva a glosa entre parênteses** —
`duna` (GPT local). Vale nas mensagens e ao falar com o Gabriel.

📌 **A `orla` recomenda; quem decide é o Gabriel.** E quem escreve não aprova
(**D-002**): achado ou correção de uma instância é confirmado por outra.

---

## 🔴 As três regras que não se negociam

### 1. Segredo não entra no repositório

Credencial pode ser **usada** e pode aparecer no chat direto com o Gabriel.
**Nunca** em `mensageria/`, em commit, em log, em código.

> **A diferença é persistência, não contato.**

Este repositório já foi público com credencial dentro
([`docs/INCIDENTE_2026-08-15.md`](docs/INCIDENTE_2026-08-15.md)). É por isso que
esta linha existe.

### 2. Os repositórios de referência são somente leitura

`gabrielBielll/lista-psis-api` e `gabrielBielll/lista-psis-front-end` são os que
já consomem a API do Google hoje. Palavras do Gabriel: *"não faça nenhuma edição
neles"*.

### 3. Nada de identificador de modelo em artefato

Nem em commit, nem em PR, nem em comentário de código. Só no chat.

---

## 🔴 A lição que este projeto pagou mais caro

**Um sinal que diz "está tudo bem" sem ter verificado é pior que sinal nenhum** —
ele consome a atenção que iria para o problema.

A mesma forma apareceu cinco vezes em uma semana:

| onde | o que dizia | o que era |
|---|---|---|
| `test.fail()` da R-006 | ✘ diário, lido como "o defeito continua" | o teste morria num seletor quebrado, longe do defeito |
| `migrations_completed` | sucesso a cada boot, por 17 h | três migrations presas por um lock órfão |
| `sincronizar-status` | `"Sincronização concluída"` | `status_atualizados: 0` |
| uma sonda de teste | passava | validação nativa barrava o envio; nada era exercitado |
| um `grep` de varredura | "33 de 33 quebrados" | o padrão era `.`, casava um caractere por linha |

📌 **A regra prática que saiu disso:**

> **Varredura só vale com um caso de controle cuja resposta você já sabe.**
> Se o instrumento devolve o mesmo resultado quando a hipótese é verdadeira e
> quando é falsa, ele não mediu nada.

E o corolário: **verifique por efeito, não por código de status.** `200` e "não
fiz nada" costumam ser a mesma resposta.

---

## ⛔ Uma armadilha na porta de entrada

**Ignore a pasta `.ai-instructions/`.** O README dela diz *"AI INSTRUCTIONS —
READ THIS FIRST"* e foi herdado de **outro projeto**, um ERP jurídico. Em
20/08/2026 uma instância nova leu aquilo primeiro, como mandava, e montou um
modelo de tenants = escritórios de advocacia, tabelas `processos` e portas
3001/5433. Nada disso existe aqui.

🔴 **E ela está pela metade**, que é pior: 4 arquivos descrevem o outro projeto,
`CREDENTIALS.md` descreve este, e `QUICK_START.md` mistura os dois. Documentação
meio verdadeira não dá o sinal de que errou. O `README.md` de lá já tem um aviso
no topo com a medição arquivo por arquivo.

---

## Onde a memória está guardada

| o quê | onde |
|---|---|
| **Decisões do Gabriel**, numeradas e citando as palavras dele | [`mensageria/DECISOES.md`](mensageria/DECISOES.md) |
| **Conversa entre as instâncias**, numerada e sequencial | [`mensageria/`](mensageria/) — leia o [INDEX](mensageria/INDEX.md) de trás para frente |
| **Quem está com o quê agora** | [`mensageria/FILA.md`](mensageria/FILA.md) |
| **Achados abertos**, com reprodução e medição | [`docs/cards/`](docs/cards/) e [`docs/REVISAO_PRE_PRODUCAO.md`](docs/REVISAO_PRE_PRODUCAO.md) |
| **Regras de negócio** ditadas pelo Gabriel | [`docs/REGRAS_DE_NEGOCIO.md`](docs/REGRAS_DE_NEGOCIO.md) |
| **O que ninguém conseguiu verificar** | [`docs/VERIFICACAO_PENDENTE.md`](docs/VERIFICACAO_PENDENTE.md) |
| **Contexto longo para instância nova** | [`docs/HANDOFF.md`](docs/HANDOFF.md) |
| **O que NÃO pode entrar no repo** — credencial, token, acesso à Northflank | fora daqui: a memória local da instância (`~/.claude/…/memory/`), lida sozinha no início da sessão |

---

## 🔴 A regra do push: puxe antes, sempre

**Decidida pelo Gabriel em 2026-08-20**, nas palavras dele: *"sempre que uma de
vocês for fazer push, primeiro fazer o rebase para puxar as alterações pra branch
de vocês e depois subir certinho, para não ficar dando esses conflitos"*.

```
git pull --rebase origin <a-branch-em-que-você-está>
```

Sempre, antes de todo `git push`. E instale o guarda, uma vez por máquina:

```
git config core.hooksPath .githooks
```

O [`pre-push`](.githooks/pre-push) recusa o push quando o remoto andou e você não
puxou, dizendo **quem** empurrou e **o quê**. Testado de ponta a ponta nos três
casos: deixa passar quem está em dia, recusa quem está atrás, e o trabalho dos
dois sobrevive depois do rebase.

### ⚠️ Duas precisões que mudam o que a regra significa

**1. É na branch compartilhada, não na `main`.** Medido em 20/08: a `main` ficou
parada de 18/08 20:52 até o merge do PR #7, **421 commits atrás** — ela nunca
andou enquanto trabalhávamos, então rebasear nela não teria evitado **nenhum** dos
nossos conflitos. O que anda é a branch em que os quatro empurram.

**2. `git pull --rebase` é seguro; rebasear a branch inteira não é.** O `pull
--rebase` move só os **seus** commits ainda não empurrados, e ninguém os viu.
Rebasear a branch compartilhada sobre outra exigiria **force-push**, que quebra o
checkout de todo mundo — 🔴 **nunca faça isso numa branch que outra instância usa.**

📌 O guarda não substitui o [`vigia.sh`](mensageria/vigia.sh): ele olha commits, e o vigia olha
**número de mensagem livre no remoto**, que é o que colidiu cinco vezes.

---

⚠️ **Antes de empurrar mensagem, leia o número mais alto do REMOTO**, não do
local. Três colisões de numeração já aconteceram por isso.

📌 **A última linha da tabela é a exceção que a regra 1 exige, e ela é da `vale`.**
Operar a produção precisa de token da Northflank, da `DATABASE_URL` e das contas
da clínica de demonstração — nada disso pode ser escrito aqui, e sem estar escrito
em lugar nenhum a sessão seguinte não opera. A saída é a memória local do Claude
Code: fora do repositório, modo 600, não rastreada pelo git.

⚠️ **Isso não afrouxa a regra 1 — ela vale inteira para tudo que está neste
repositório.** E os segredos de produção (`JWT_SECRET`, `DATABASE_URL`,
`NEXTAUTH_SECRET`, `PROVISIONING_TOKEN`) continuam sendo lidos do ambiente da
Northflank **na hora do uso**, nunca copiados para lugar nenhum — nem para lá.

---

## O repositório

```
deep-saude-plataforma-front-end/    Next.js 15, App Router, NextAuth
deep-saude-plataforma-api/          backend Clojure (Ring + Compojure + migratus)
scripts/semear-demo.mjs             semeia uma clínica de demonstração cheia
mensageria/  docs/  .github/workflows/ci.yml
```

### Comandos

| o quê | comando |
|---|---|
| typecheck da app | `npm run typecheck` (em `deep-saude-plataforma-front-end`) |
| typecheck dos testes de navegador | `npm run typecheck:e2e` |
| navegador | `PROVISIONING_TOKEN=... npm run e2e` |
| backend, sem banco | `lein test` (em `deep-saude-plataforma-api/deep-saude-backend`) — 81 testes; os de banco se anunciam pulados |
| backend, com banco | `TEST_DATABASE_URL='jdbc:postgresql://...' lein test` — 204 testes; ⚠️ o prefixo `jdbc:` aqui é obrigatório e na `DATABASE_URL` é proibido |
| banco para os testes, na sandbox da nuvem | `docker run ... postgres:16` — receita copiável na seção da sandbox |
| **a plataforma inteira, local** | `bash scripts/dev/previa-local.sh` — ⚠️ só no Termux; ver abaixo |

---

## 🔵 A prévia local — o caminho mais curto até o Gabriel VER

**Decidido em 2026-08-21**, depois de ele dizer: *"até eu ver algo em produção vc
faz mil perguntas, aí abre um PR, a orla faz mais mil perguntas e depois joga
para prod. Bem demorado."*

```
bash scripts/dev/previa-local.sh          # sobe Postgres + backend + front
bash scripts/dev/previa-local.sh --parar  # derruba
```

Sobe a pilha inteira **no Termux** e a expõe na rede local. O PC do Gabriel abre
`http://<ip-do-aparelho>:9002` numa aba ao lado do Claude Code — o script imprime
o endereço — e ele confere **qualquer branch, na hora**, sem PR, sem CI e sem
acordar a `orla`.

📌 **Isto muda a ordem do trabalho.** O PR deixa de ser o caminho até a tela e
passa a ser o **último** passo, depois de ele já ter olhado.

⚠️ **E NÃO afrouxa o portão da `prod` (D-020).** Aquele portão existe porque
produção chegou a servir código **4 min antes** do veredito do CI. A reclamação
dele era sobre a demora até **ver** — e ver agora tem caminho próprio.

### 🔴 Duas coisas que eu supus errado, e custaram um dia

**1. `node_modules` do front NÃO é impossível aqui.** Passei 21/08 inteiro
dizendo *"typecheck e build não rodam neste Termux, quem vota é o CI"* — dedução
a partir de um diretório vazio, não medição. Medido: `npm ci` instala **522
pacotes**, `tsc --noEmit` passa na app e no e2e, e o `next dev` sobe em **3,3 s**.
O SWC nativo do Next 15 carrega em Android/bionic.

**2. `grep -oE` não funciona neste Termux.** O `grep` do PATH é um `ugrep` que
recusa a opção (`bad option: -G`). A primeira versão do script detectava o IP
assim e devolvia **vazio em silêncio** — rodava "com sucesso" e simplesmente não
imprimia a URL da rede, que é a única linha que importa. É a família de defeito
deste repositório inteiro, agora dentro da própria ferramenta que eu escrevi para
consertar o fluxo.

---

## ⚠️ O que a sandbox da nuvem consegue — remedido em 22/08/2026

A versão anterior desta seção dizia que **o backend real não sobe aqui**. Sobe.
Ela está preservada no fim da seção, porque o erro dela vale mais que o acerto.

⚠️ **Escopo: esta sandbox, nesta data.** A `vale` e a `duna` rodam em máquinas
diferentes, com limites próprios — para elas continua valendo o que **elas**
mediram, e nada aqui as dispensa de remedir. Limite de ambiente não é propriedade
do projeto; é propriedade da máquina, e a máquina troca sem avisar.

### ✅ O que funciona, com o comando que mostrou

- **As dependências Clojure resolvem.** `repo.clojars.org` → **200**, e o
  controle positivo foi baixar o POM de `ring-core 1.12.1` — versão que o
  `project.clj` **não** usa e que portanto não podia estar no cache. `lein -o
  deps` → exit 0. `~/.m2/repository` tem 75 jars (34 MB), cobrindo o
  `project.clj` inteiro; a suíte compila.
- **O backend real sobe.** `lein run`: **16 migrations aplicadas, 19 tabelas**,
  `GET /api/health` → `200 {"status":"ok","banco":"ok"}`.
- **A suíte inteira passa com banco:** `Ran 204 tests containing 855 assertions.
  0 failures, 0 errors.`, exit 0. Sem banco são 81 testes / 439 asserções — e os
  de banco **anunciam no stdout que foram pulados**, então o número menor não é
  um daqueles sinais verdes que não verificaram nada.
- **Há Docker** (Server 29.5.3), com `postgres:16`, `postgres:14-alpine`,
  `redis:7-alpine`, `minio/minio` e `cockroachdb/cockroach` **já em cache local**
  — sobe sem rede.
- **O Chromium do Playwright é o que o projeto pede.** O instalado é o
  `chromium-1234` em `~/.cache/ms-playwright`, e `npx playwright install
  --dry-run chromium` confirma que é exatamente o build do `@playwright/test`
  1.62.1. 📌 **Não há divergência a contornar — não aponte `executablePath`.**
- **O front se verifica:** `npm run typecheck`, `typecheck:e2e`, `checa:campos` e
  `checa:glifos` → todos exit 0. ⚠️ `npm run build` **não foi rodado** nesta
  rodada; não afirme nada sobre ele.
- **Os hosts do Google respondem:** `www.googleapis.com/discovery/v1/apis` →
  200, `developers.google.com` → 200, `repo1.maven.org` → 200.
  `oauth2.googleapis.com` → 404, que é a raiz de um host que só serve `/token` e
  `/revoke`: o host **respondeu**, e aqui 404 é sinal de vivo, não de bloqueio.

### 🔴 O que continua negado

- **`*.code.run` é negado** — `curl` devolve `000`. Confirmado com controle
  negativo: um host inexistente (`.invalid`) devolve **o mesmo `000`**, enquanto
  todos os hosts da lista acima devolvem código de verdade. Ou seja, o
  instrumento separa "respondeu" de "não respondeu", mas **não** separa recusa do
  proxy de serviço fora do ar. 🔴 **Um `000` daqui nunca é prova de que a
  produção caiu — peça à `vale`.**

### ⚠️ O que não foi remedido, e por isso segue em aberto

- **`networkidle` do Playwright nunca assenta** — afirmação da sandbox anterior.
  Ninguém rodou e2e nesta rodada, então ela não foi confirmada **nem** derrubada.
  Siga com `domcontentloaded` + espera por elemento, que é o certo de qualquer
  forma.
- **Java aqui é 17** (`Leiningen 2.12.0 on Java 17.0.19`); o CI usa temurin 21.
  Não quebrou nada nesta suíte, mas é diferença com o que roda de verdade:
  "passou aqui" não é "passou no CI".

### 🔵 A receita: Postgres em Docker e a suíte com banco

```bash
docker run -d --name pg-deep -p 5433:5432 \
  -e POSTGRES_USER=deep -e POSTGRES_PASSWORD=deep -e POSTGRES_DB=deep_teste \
  postgres:16

cd deep-saude-plataforma-api/deep-saude-backend
TEST_DATABASE_URL='jdbc:postgresql://localhost:5433/deep_teste?user=deep&password=deep&sslmode=disable' \
  lein test
```

Contêiner descartável, sem nada de produção dentro — a senha ali é do próprio
comando, não é credencial (a regra 1 continua inteira).

🔴 **As duas variáveis de banco têm nomes irmãos e formatos opostos.** Está na
docstring de
[`db.clj:16-26`](deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/db.clj):
`TEST_DATABASE_URL` leva o prefixo `jdbc:`, `DATABASE_URL` **não** leva, porque é
lida por `java.net.URI`. Com o prefixo errado, o `URI` lê o esquema como `jdbc`,
`.getHost` devolve **nil** e nada sobe — a docstring não nomeia a mensagem que
sai, e eu também não vou nomear.

E há uma armadilha irmã, essa com mensagem conhecida: **sem a porta explícita**,
`.getPort` devolve `-1`, e o driver responde `JDBC URL port: -1 not valid
(1:65535)` seguido de `No suitable driver` — que não menciona porta nenhuma.
Custou um boot à `vale` em 15/08.

📌 As duas são a mesma família de defeito do resto deste arquivo: **o erro aponta
para o lugar errado.** Para subir o backend contra o mesmo contêiner, a URL muda
de forma:

```bash
DATABASE_URL='postgresql://deep:deep@localhost:5433/deep_teste?sslmode=disable' lein run
# /api/health em http://localhost:3000
```

⚠️ **Não use o `docker-compose.yml` da raiz.** Ele é resíduo do ERP jurídico
(`POSTGRES_USER: erp_user`, banco `erp_advocacia`) — mesma herança do
`.ai-instructions/` e a mesma família de defeito: parece deste projeto e não é.

⚠️ **`scripts/dev/previa-local.sh` não roda nesta sandbox.** O shebang é do
Termux e ele depende de `initdb`, `pg_ctl`, `pg_isready` e `createdb` nativos,
que não existem nesta imagem. É ferramenta da `duna` e da `vale`, não desta
máquina.

### 📌 O simulador de contrato continua existindo — mas virou a segunda opção

[`scripts/dev/`](scripts/dev/README.md) tem um servidor que imita o contrato lido
do fonte Clojure, com a linha de origem de cada regra, e um passeio de navegador
que fotografa cada tela. Ele foi escrito para quando o backend real não subia.

🔴 **Onde o backend real sobe, use o backend real.** O simulador **não** prova
que ele concorda — prova que o script faz o que se quis que ele fizesse. Diga
sempre qual dos dois você mediu.

⚠️ **O `passeio-de-telas.mjs` carrega o caminho morto.** A linha 53 lança o
navegador com `executablePath: '/opt/pw-browsers/chromium'`, que **não existe
nesta imagem** — é a receita errada da seção antiga, congelada em código. Não foi
corrigido nesta rodada; quem for mexer no passeio tira o `executablePath` e
deixa o Playwright achar o próprio build.

⚠️ **Leia o README de lá antes de usar.** Um simulador incompleto produz
**achado falso**, e achado falso sobre o trabalho de outra pessoa custa mais caro
que achado nenhum. As quatro armadilhas que ele já pagou estão listadas.

### 🔴 O texto anterior, medido noutra sandbox — falso desde 22/08/2026

Preservado inteiro, com o veredito colado em cada item. Apagar sairia mais barato
hoje e mais caro depois: metade do valor deste repositório é o registro dos
diagnósticos que estavam errados, e este errou de um jeito que vale estudar.

> ## ⚠️ O que a sandbox da nuvem **não** consegue, medido
>
> Não deduza estes limites de novo — eles custaram horas:
>
> - 🔴 **`repo.clojars.org` é negado** pela política de rede. As dependências
>   Clojure não resolvem, então **o backend real não sobe aqui**. Maven Central
>   funciona e resolve só Postgres e Clojure.
>
>   ❌ **Falso em 22/08.** Clojars responde 200 e a suíte inteira roda.
> - 🔴 **`*.code.run` é negado** — não dá para abrir o site nem o painel do
>   Northflank. **Um teste feito daqui contra aquele host recebe recusa do próprio
>   proxy, que é indistinguível de "porta fechada".** Nunca use isso como
>   confirmação; peça à `vale`.
>
>   ✅ **Continua valendo em 22/08**, e agora com controle negativo.
> - 🔴 **`networkidle` do Playwright nunca assenta** (fontes bloqueadas + prefetch
>   do Next). Use `domcontentloaded` + espera por elemento.
>
>   ⚠️ **Não remedido em 22/08** — ninguém rodou e2e. Em aberto.
> - ⚠️ **O Chromium do Playwright é o build 1194**, e o projeto pede outro. Lance
>   com `executablePath: '/opt/pw-browsers/chromium'`. Não rode `playwright install`.
>
>   ❌ **Falso em 22/08 nas duas metades.** `/opt/pw-browsers` não existe, e o
>   build instalado é o que o projeto pede.
> - ✅ **Postgres nativo existe** em `/usr/lib/postgresql/16/bin`, mas `initdb`
>   recusa rodar como root — crie um usuário e um diretório fora de `/tmp`.
>
>   ❌ **Falso em 22/08.** O diretório não existe, não há binário do Postgres no
>   PATH nem no `dpkg`. O que existe é Docker.
> - ✅ **Chromium, Node 22 e Java 21** funcionam. `lein` baixa e roda; só as
>   dependências é que não.
>
>   ⚠️ **Meio falso em 22/08.** Java aqui é 17; as dependências resolvem.

### 📌 Por que ela errava — dedução, não medição

**Hipótese, não medição:** aquela seção foi escrita numa sandbox com **política
de rede e imagem diferentes** das de hoje. Ninguém anotou a data nem a imagem, e
é por isso que não dá para dizer **quando** deixou de valer — só que em 22/08 já
não valia.

O que interessa não é o erro, é o formato dele: ela errava **nos dois sentidos**.

| sentido | exemplo | o que custa |
|---|---|---|
| proibia o que funciona | "clojars é negado", "o backend real não sobe aqui" | trabalho que nem chegou a ser tentado, e simulador usado onde cabia o backend de verdade |
| prometia o que não existe | Postgres nativo em `/usr/lib/postgresql/16/bin`, Chromium em `/opt/pw-browsers` | a instância segue a receita, o caminho não está lá, e ela vai depurar o **ambiente** em vez de desconfiar do texto |

🔴 **O segundo tipo é o mais caro**, e é exatamente a família de defeito da nota
sobre `.ai-instructions/` algumas seções acima: **documentação meio verdadeira
não dá o sinal de que errou.** Texto todo errado morre no primeiro comando; texto
que acerta a forma e erra o caminho é obedecido.

📌 **A consequência prática:** ao escrever limite de ambiente aqui, escreva
**quando** e **onde** foi medido, e com qual comando. Sem isso, a próxima
instância não tem como saber se está lendo uma medição ou uma lembrança.

---

## Como escrever aqui

- **Português**, e o comentário explica **por que**, não o que.
- **Preserve o texto errado com o motivo**, em vez de apagar. Metade do valor
  deste repositório é o registro de diagnósticos que estavam errados.
- **Separe sempre o que foi verificado do que foi deduzido.** Metade do valor da
  mensageria veio de alguém dizer *"não consegui verificar X"*.
- **Desconfie de "não consigo".** A `vale` reportou PostgreSQL como impossível no
  Termux inferindo de "sem Docker"; a `duna` instalou nativo no dia seguinte.

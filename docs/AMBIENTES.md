# Ambientes e branches

> **Criado em 2026-08-12** pela [D-003](../mensageria/DECISOES.md).
> **Reescrito em 2026-08-22**, porque descrevia o Render e um modelo de três
> ambientes que nunca existiu. A versão antiga está preservada abaixo, em
> [§7](#7-o-modelo-da-d-003-e-por-que-ele-não-aconteceu) — ela não foi apagada
> porque *por que* ela não aconteceu é a parte útil.

---

## 1. 🔴 A tabela que vale hoje

| Branch | Tem ambiente? | O que ela é de verdade |
|---|---|---|
| `prod` | ✅ **sim** — a Northflank constrói daqui | **É produção.** Merge aqui publica |
| `staging` | ⛔ **não** | Branch de trabalho compartilhada. Push direto, sem PR |
| `main` | ⛔ **não** | Parada. Não observa nada e não publica nada |

📌 **Existe UM ambiente vivo, não três.** Os dois serviços da Northflank — o
backend Clojure e o front Next — apontam os dois para `prod` desde 2026-08-20
([D-020](../mensageria/DECISOES.md), executada e medida pela `vale` na
[0198](../mensageria/0198-vale-para-orla-e-gabriel-o-portao-esta-fechado-e-medido-e-tres-correcoes.md)).

⚠️ **`staging` não é homologação.** O nome sugere um ambiente que não existe. Ela
é onde as instâncias trabalham em paralelo, com push direto — o ritmo que a D-020
escolheu preservar de propósito, porque transformar cada um dos ~86 commits/dia em
PR mudaria o trabalho de todo mundo.

## 2. O fluxo que realmente acontece

```
branch de trabalho ──push direto──▶  staging
                                        │
                                        │  PR  (obrigatório: prod recusa push)
                                        ▼
                                      prod  ──▶ Northflank constrói ──▶ no ar
```

**Promover é abrir um PR de `staging` para `prod`.** O CI vota nesse PR, e o
merge é o deploy. Não existe passo intermediário, porque não existe ambiente
intermediário.

### 🔵 E para *ver* antes do PR, o caminho é local

Decidido em 21/08, depois do Gabriel dizer: *"até eu ver algo em produção vc faz
mil perguntas, aí abre um PR, a orla faz mais mil perguntas e depois joga para
prod. Bem demorado."*

```
bash scripts/dev/previa-local.sh
```

Sobe Postgres + backend + front no Termux e expõe na rede local; o PC abre
`http://<ip-do-aparelho>:9002`. **É isto que faz o papel que o "ambiente de
staging" faria** — e chega antes, sem PR e sem CI.

## 3. A proteção das branches, medida por efeito

⚠️ As três aparecem como `protected: true` no GitHub. **Só uma delas segura
alguma coisa**, e a diferença foi medida empurrando de verdade:

| branch | push direto | |
|---|---|---|
| `prod` | 🔴 **recusado** | `4 of 4 required status checks are expected` + `protected branch hook declined` |
| `staging` | ⚠️ avisa e **passa** | imprime *"Changes must be made through a pull request"* e atualiza a ref assim mesmo |
| `main` | ⚠️ avisa e **passa** | idem |

O portão de `prod`, lido de volta e não deduzido:

```
enforce_admins = true       aprovacoes = 0
checks obrigatorios: Backend | Front | Mensageria | Navegador
```

📌 **`aprovacoes = 0` é deliberado.** Existe uma única conta colaboradora, e o
GitHub proíbe aprovar o próprio PR — exigir 1 aprovação com `enforce_admins`
ligado **trancaria o deploy para sempre**. O portão significa *"CI verde é
obrigatório"*, não *"alguém precisa aprovar"*. Se entrar uma segunda conta, vale
reconsiderar. Está tudo na [0198](../mensageria/0198-vale-para-orla-e-gabriel-o-portao-esta-fechado-e-medido-e-tres-correcoes.md).

🔴 **A armadilha de ler o resultado de um push.** Ele imprime uma linha que
proíbe e uma que informa sucesso, e a certa pode ser qualquer uma das duas:

```
remote: - Changes must be made through a pull request.
   aab7949..b65f1f1  origin/prod -> staging      <- a linha certa e esta
```

**Só `git fetch` / `git ls-remote` decide.** Isso já enganou três vezes neste
projeto.

## 4. Banco de dados

O banco vivo é o **CockroachDB da Northflank** — ver [NORTHFLANK.md](NORTHFLANK.md),
que traz as armadilhas de `DATABASE_URL` que já custaram boot.

⚠️ **Com um ambiente só, não existe "rodar a migration no staging primeiro".** A
migration estreia em produção, sobre dados reais. As consequências:

- Por [D-001](../mensageria/DECISOES.md), migration que falha **derruba o boot**.
  Isso foi decidido pensando em ter um ambiente antes; sem ele, uma migration
  ruim é o serviço fora do ar, não uma implantação reprovada
- A conversão de fuso (`TIMESTAMP` → `TIMESTAMPTZ`) **reinterpreta** os dados
  existentes. Não é idempotente do jeito que as outras são
- Criação de índice em banco distribuído com dados reais **não é instantânea**, e
  roda bloqueando a subida

📌 O que substitui o ambiente de homologação aqui é o **job `backend` do CI**: ele
compila o uberjar e sobe o jar de verdade contra um Postgres, rodando as
migrations pelo caminho de produção (`-main`, não `lein ring`). Não é a mesma
coisa que Cockroach com dados reais — **diga sempre qual dos dois você mediu.**

🔴 **Dado de paciente de verdade é LGPD.** A prévia local e qualquer semeadura
usam dados sintéticos (`scripts/semear-demo.mjs`).

## 5. Variáveis

Lidas do ambiente da Northflank **na hora do uso**, nunca copiadas para lugar
nenhum — nem para a memória local de uma instância.

| Variável | Observação |
|---|---|
| `DATABASE_URL` | **Sem** o prefixo `jdbc:` e **com** a porta. Já custou um boot |
| `JWT_SECRET` | |
| `PROVISIONING_TOKEN` | Lido em handler, não na subida: faltando, provisionar clínica devolve 403 e o resto sobe |
| `GOOGLE_TOKEN_KEY` | Idem — a integração recusa conectar, nada mais |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | O redirect URI precisa estar registrado no Google Cloud Console |
| `NEXTAUTH_URL` | 🔴 **Não aparece em nenhum arquivo do projeto** e é obrigatória. Faltando, o login quebra de um jeito que não parece login |
| `NEXT_PUBLIC_API_URL` | ⚠️ É `ARG` de build, **não** variável de runtime — muda-la exige reconstruir o front inteiro |
| `CORS_ORIGINS` | ⚠️ **Não configure.** O padrão já cobre `*.code.run`, e definir substitui a lista inteira — derrubaria `localhost` |

## 6. Duas coisas velhas que ainda estão no repositório

Nenhuma das duas quebra nada hoje. Estão aqui para não serem "descobertas" de
novo como se fossem achado:

- **`Procfile`** (`web: cd deep-saude-plataforma-front-end && npm start`) é do
  tempo do Render e **não é usado pela Northflank**, que constrói pelo
  `Dockerfile`. Está morto, e morto sem incomodar
- **`https://deep-ngrv.onrender.com` continua na lista de CORS** do backend
  (`core.clj:2006`), ao lado de `*.code.run`. É origem que não existe mais —
  ruído, não risco

📌 **O `Dockerfile` da raiz ser o do FRONT não é defeito**, embora a versão
anterior desta página listasse isso como problema. É escolha, e está explicada no
topo do próprio arquivo: o contexto de build é a raiz. O backend tem o seu em
`deep-saude-plataforma-api/deep-saude-backend/Dockerfile`.

---

## 7. O modelo da D-003, e por que ele não aconteceu

**Isto está preservado de propósito.** A D-003 continua sendo decisão do Gabriel;
o que mudou foi o mundo em volta dela. Apagar deixaria a próxima instância
reinventando o mesmo desenho sem saber por que ele não pegou.

O que a D-003 desenhou em 12/08:

```
feature/*  ──PR + revisão cruzada──▶  main  ──merge──▶  staging  ──merge──▶  prod
                                                          │
                                                   valida aqui
```

Com a regra: *"`prod` não recebe nada que não tenha rodado em `staging` primeiro"*
e *"nunca commit direto em `staging` ou `prod`"*.

**Três coisas o desmancharam:**

1. 🔴 **O ambiente de staging nunca foi criado.** O plano da Northflank tem
   **dois serviços** (back e front), não quatro. Sem um segundo ambiente, `staging`
   vira uma branch que aponta para nada — e "validar no staging" não tem onde
   acontecer
2. 🔴 **O volume matou o "PR por feature".** Foram ~86 commits/dia entre quatro
   instâncias. A D-020 mediu isso e escolheu explicitamente **não** proteger a
   branch de trabalho, para não mudar o ritmo de todo mundo
3. 🔵 **A prévia local resolveu o problema que o staging existia para resolver.**
   A D-003 nasceu porque *"hoje não existe ambiente de teste"* e o PR #7 foi
   aprovado com uma lista de itens não verificados. Desde 21/08 existe caminho
   para ver a pilha inteira rodando — e ele é **mais rápido** que um ambiente
   remoto, não mais lento

⚠️ **O que se perdeu junto, e é real:** não há mais um lugar onde uma migration
estreie antes de tocar dados de verdade. Isso está em [§4](#4-banco-de-dados) e
não tem solução escrita — é dívida conhecida, não descuido.

---

## ⛔ O que esta página NÃO verificou

- **Nada que dependa de falar com a Northflank.** A sandbox da nuvem tem
  `*.code.run` negado pela política de rede, e **a recusa do proxy é
  indistinguível de "porta fechada"**. Tudo sobre os serviços aqui vem da
  [0198](../mensageria/0198-vale-para-orla-e-gabriel-o-portao-esta-fechado-e-medido-e-tres-correcoes.md),
  onde a `vale` mediu com acesso de verdade
- **Se existe ou não um serviço de staging na Northflank hoje.** O plano tinha
  dois; ninguém conferiu depois. Quem consegue olhar é a `vale`

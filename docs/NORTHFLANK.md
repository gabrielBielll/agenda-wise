# Northflank — como subir os dois serviços

> **Data:** 2026-08-17 · **Autor:** `orla` · **Para:** Gabriel montar sem
> ida-e-volta comigo.
>
> 🎯 **Isto substitui o Render** como o ambiente vivo de validação da
> [D-012](../mensageria/DECISOES.md). E pela [D-013](../mensageria/DECISOES.md) ele continua sendo **descartável**: nenhum dado
> real aqui, e **os segredos daqui não são os de produção**.

---

## ⚠️ Leia estas quatro antes de clicar em qualquer coisa

Cada uma custou um boot a alguém, ou custaria.

### 1. A ordem importa: **backend primeiro, front depois**

O front **assa o endereço da API na hora do build** (`ARG NEXT_PUBLIC_API_URL` no
Dockerfile). Não é variável de runtime — é constante compilada dentro do
JavaScript que vai para o navegador.

➡️ Criar o front antes de existir a URL do backend significa **reconstruir o
front inteiro depois**. Backend primeiro, pega a URL pública, aí o front.

### 2. `DATABASE_URL` **sem** o prefixo `jdbc:` e **com** a porta

```
✅ postgresql://usuario:senha@host:5432/banco?sslmode=require
❌ jdbc:postgresql://...     → o URI lê o esquema como "jdbc", getHost devolve nil
❌ postgresql://usuario:senha@host/banco   → sem porta, getPort devolve -1
                                             "JDBC URL port: -1 not valid"
```

Isso já custou um boot à `vale` em 15/08 e está documentado no `db.clj` — mas o
lugar onde você vai colar a variável é aqui, então está repetido aqui.

### 3. `NEXTAUTH_URL` **não aparece em nenhum arquivo do projeto** — e é obrigatória

O NextAuth lê essa variável do ambiente, sem o código citá-la. Se faltar, ele
monta as URLs de callback com o host errado atrás do balanceador e **o login
quebra de um jeito que não parece login**. É a mais fácil de esquecer justamente
porque não dá para achar por busca no código.

Valor: a **URL pública do próprio front**.

### 4. **Não deixe `CORS_ORIGINS` configurada** — o padrão já cobre o Northflank

A lista padrão do backend já traz `https://.*\.code\.run`, que é o domínio do
Northflank. E atenção: **definir `CORS_ORIGINS` substitui a lista inteira** por
correspondência exata, não acrescenta. Se você definir só o front, derruba
`localhost` e quebra o desenvolvimento de todo mundo.

Só mexa nela quando existir domínio próprio — e aí liste **todos**.

---

## 🔴 O banco é o **CockroachDB** que já existe — e isso resolve e abre uma coisa

**Resolve:** o Postgres deixa de ser uma terceira peça. Os dois serviços do plano
ficam exatamente para back e front, como o Gabriel disse.

**Abre:** nós **testamos em PostgreSQL e rodamos em CockroachDB**, e ninguém
verificou o conjunto atual de migrations contra o Cockroach.

### O que está no schema e o Cockroach trata diferente

| Construção | Onde | Por que importa |
|---|---|---|
| `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` + `uuid_generate_v4()` | baseline, linha 11 e **9 tabelas** | O Cockroach **não tem a uuid-ossp**; o equivalente nativo dele é `gen_random_uuid()` |
| `ALTER COLUMN … TYPE … USING` | `20260811100100-fuso-horario`, 3 colunas | **É a P-001**, aberta desde sempre — e o próprio arquivo já carrega um comentário de aviso sobre Cockroach |
| `BIGSERIAL` | `google-integracao`, a `google_sync_outbox` | No Cockroach o SERIAL não é sequencial — e **outbox depende de ordem**. Latente: o sincronizador ainda não existe |

⚠️ **Não estou dizendo que vai quebrar.** Estou dizendo que **ninguém sabe**: o
[INDEX](../mensageria/INDEX.md) registra que a `pico` rodou as migrations no Cockroach lá na [0007](../mensageria/0007-claude-ec2-para-claude-web-parecer-recebido-e-down-sql-fechado.md) e
que *"o conjunto mudou desde então"*. São 5 migrations hoje.

### ✅ E a boa notícia: **a própria subida é o teste**

O `migrar!` fica **fora** de `try` de propósito — migração que falha **aborta o
boot**. Então, apontando o serviço para o Cockroach:

- **subiu e respondeu `/api/health`** → as 5 migrations aplicaram no Cockroach, e
  a P-001 fecha de graça;
- **morreu no boot** → o log do deploy diz **qual comando** e **qual migration**,
  que é exatamente a resposta que a P-001 procura há semanas.

Nos dois casos a gente aprende. Não precisa verificar antes — **precisa ler o log
depois**.

📌 **O banco novo nasce vazio de propósito** ([D-013](../mensageria/DECISOES.md)): o Migratus levanta o
schema sozinho, sem restaurar dump nenhum.

⚠️ **Cockroach Cloud exige `sslmode=verify-full` ou `require`** — e lembre do
aviso 2: **sem prefixo `jdbc:` e com a porta explícita**, que no Cockroach Cloud
costuma ser **26257**, não 5432.

---

## 🔺 O padrão que já apareceu três vezes hoje

Vale escrever porque não é sobre banco:

1. o front era testado em **Node 22** e rodava em **Node 18**;
2. a suíte sobe o **handler**, e produção subia pelo **`lein ring`** — um terceiro caminho;
3. agora: a suíte roda em **PostgreSQL** e a aplicação roda em **CockroachDB**.

**Três vezes o mesmo formato — o que se testa não é o que roda.** Os dois
primeiros foram fechados hoje. Este terceiro **não fecha barato**: rodar a suíte
inteira contra Cockroach no CI é trabalho de verdade, e fica registrado como
dívida conhecida em vez de virar surpresa.

---

## Serviço 1 — backend

| Campo | Valor |
|---|---|
| **Tipo** | Build from Dockerfile (repositório do GitHub) |
| **Build context** | `deep-saude-plataforma-api/deep-saude-backend` |
| **Dockerfile** | `Dockerfile` (dentro desse contexto) |
| **Porta** | `3000` |
| **Health check** | `GET /api/health` |

### Variáveis

| Variável | Valor | Obrigatória |
|---|---|---|
| `DATABASE_URL` | a do **CockroachDB** — ver o aviso 2 e a porta 26257 | 🔴 sim |
| `JWT_SECRET` | **novo, gerado agora** — ver abaixo | 🔴 sim, o boot aborta sem ela |
| `PROVISIONING_TOKEN` | um segredo qualquer, novo | 🟠 sim, é como a primeira clínica nasce |
| `PORT` | `3000`, se o Northflank não injetar | 🟡 |
| `CORS_ORIGINS` | **deixe vazia** | ❌ não configure |
| `HOST` | **deixe vazia** | ❌ atrás de balanceador se ouve em todas as interfaces |
| `GOOGLE_TOKEN_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | só quando for mexer no Google | ⬜ depois |

🟡 **O health check vai falhar até o banco responder, e isso é de propósito.** O
`/api/health` faz um `SELECT 1` — health check que devolve 200 sem olhar o banco
mantém o serviço "saudável" para o balanceador enquanto toda requisição real
falha. Se ficar vermelho logo depois de subir, o suspeito nº 1 é a `DATABASE_URL`.

---

## Serviço 2 — front

| Campo | Valor |
|---|---|
| **Build context** | **a raiz do repositório** (`.`) — não a pasta do front |
| **Dockerfile** | `Dockerfile` (o da raiz) |
| **Porta** | `3000` |

⚠️ **O contexto é a raiz**, e o `Dockerfile` da pasta do front foi apagado em
17/08 porque não construía. Se a interface oferecer os dois, é o da raiz.

### Argumentos de **build** (não são variáveis de runtime)

| Argumento | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | a URL pública do **backend**, do serviço 1 |
| `API_PROXY_TARGET` | **a mesma URL do backend** |

🔴 **Os dois são de BUILD, e definir no lugar errado não dá erro — dá aplicação
quebrada com cara de bug.** Medido neste repositório em 19/08, não deduzido:

| se faltar | o que acontece |
|---|---|
| `NEXT_PUBLIC_API_URL` | o Next embute variáveis `NEXT_PUBLIC_*` de componente de cliente **dentro do bundle** durante o `next build` — o valor aparece em `.next/static/chunks/app/admin/layout-*.js`. Sem ela o chunk sai com `undefined`, o health check do admin nunca passa, e **reiniciar não conserta**: só um build novo |
| `API_PROXY_TARGET` | o Next **congela** o destino dos `rewrites()` em `.next/routes-manifest.json` durante o build. Sem ela, todo o módulo financeiro — que chama `/api/...` em caminho relativo — aponta para `localhost:3000`, isto é, **para a máquina de quem abriu o navegador** |

⚠️ **Na interface do Northflank isso é "Build arguments", não "Environment
variables".** O `ARG API_PROXY_TARGET` faltava no `Dockerfile` até 19/08 — antes
disso, definir a variável não adiantava nem no lugar certo, porque ela não
atravessava o build.

📌 **Como conferir sem adivinhar**, depois de qualquer build:

```sh
grep -o 'https://[^"]*' .next/routes-manifest.json | head -2
```

Se aparecer `localhost:3000`, o argumento não chegou.

### Variáveis de runtime

| Variável | Valor | Obrigatória |
|---|---|---|
| `NEXTAUTH_URL` | a URL pública **deste** serviço | 🔴 sim — ver o aviso 3 |
| `NEXTAUTH_SECRET` | novo, gerado agora | 🔴 sim |
| `BACKEND_URL` | a URL pública do backend | 🔴 sim |
| `NEXT_PUBLIC_API_URL` | a mesma do build | 🟠 sim |
| `NODE_ENV` | `production` | já vem do Dockerfile |

---

## 🔴 Quem executa: **não sou eu, e foi medido**

O Gabriel ofereceu me passar a chave de API para eu criar tudo. **Não funciona
daqui, e a chave não resolveria:** a sandbox da `orla` sai pela internet por um
proxy com política, e `api.northflank.com` é **negada**:

```
$ curl https://api.northflank.com/v1/projects
HTTP 000
$ curl "$HTTPS_PROXY/__agentproxy/status"
  "host": "api.northflank.com:443",
  "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)"
```

É a mesma classe do Clojars, que é o motivo de eu não compilar Clojure aqui.

⚠️ **E não é só a API: `northflank.com/docs` também é negado.** Então eu não
posso nem escrever as chamadas com segurança — seria script escrito de memória,
por quem não consegue executá-lo nem conferir a documentação. É exatamente a
armadilha que eu mesma apontei para a `vale` na [0073](../mensageria/0073-orla-para-vale-as-quatro-decisoes-da-a-013-e-o-500-vai-para-a-pico.md), e ela não deixa de valer
quando quem escreveria sou eu.

### As três saídas, e a recomendação — **corrigida depois de medir**

| | Caminho | Custo | Segredo passa por onde |
|---|---|---|---|
| **C** ⭐ | **Gabriel monta pelo painel**, com este guia | ~20 min dele | **nenhum lugar** |
| **A** | **A `vale` lê a documentação E escreve E executa**; eu reviso. Termux, rede aberta | maior — ela para a A-013 no meio | só na máquina dela |
| **B** | Liberar `api.northflank.com` na política de rede, e aí eu faço | mexer na configuração do ambiente | minha sandbox — o pior dos três |

⭐ **Mudei de recomendação: é a C.** Eu tinha sugerido a A antes de medir os
docs. Com eles bloqueados, o meu papel na A viraria escrever de memória e a
`vale` depurar — pior que os 20 minutos no painel, e ela sai da A-013 no meio.

📌 **O que decide é a frequência:** isto se monta **uma vez**. Automação por API
paga quando se repete; aqui ela custaria mais do que economiza. Se um dia forem
vários ambientes, a conversa muda e a `vale` é quem faz.

### ⚠️ Uma parte é sua em qualquer um dos três

**Ligar o Northflank ao GitHub é OAuth no navegador.** Não existe caminho por API
para isso, e nem eu nem a `vale` temos como fazer. Então, escolhido o caminho que
for, estes passos são seus:

1. criar a conta;
2. **ligar o repositório** (o OAuth);
3. gerar o token de API — **restrito ao projeto**, não de conta inteira, e
   **revogável quando terminarmos**.

---

## 🔑 Sobre os segredos — e o que eu **não** preciso

**Gere você mesmo e cole direto no painel do Northflank** (ou passe para a
`vale`, se for o caminho A). Um comando por segredo:

```sh
openssl rand -base64 48
```

🔴 **Não me mande segredo por mensagem, e nunca a senha da conta.** Segredo que
passa por conversa fica na conversa — e este repositório já foi público uma vez.
Para o que eu faço — revisar código, conferir CI, escrever o que vocês executam —
**eu não preciso de nenhuma credencial**, e agora sabemos que a chave nem
funcionaria daqui.

O que me ajuda de verdade são **as duas URLs públicas** quando os serviços
subirem. Com elas eu confiro o `/api/health`, o login e o CORS de fora, sem
precisar de acesso.

📌 Se um dia quiser que eu leia log de build sozinha, aí é o caminho **B**:
liberar o host na política de rede **e** um token **só de leitura**, no ambiente
e nunca no chat.

⚠️ **E o `JWT_SECRET` daqui tem que ser novo.** O antigo esteve em repositório
público ([INCIDENTE_2026-08-15](INCIDENTE_2026-08-15.md)). Reaproveitar transforma um vazamento velho em
vazamento novo — mesmo aqui, que é ambiente descartável.

---

## Depois que os dois subirem

1. **Criar a clínica de teste** com os três logins — **admin, psicólogo e
   secretário** — pelo endpoint de provisionamento, com o header
   `x-provisioning-token`.
2. Me passar as duas URLs.

🎯 **Isso destrava a rodada de auditoria**, que está montada e parada esperando
exatamente isto.

🟡 **E prepare-se para ver duas coisas erradas de propósito**, porque nós já
sabemos delas e elas estão na fila:

- **psicóloga e secretário não vão conseguir fazer nada** — é a **A-012**, com a
  `duna` agora;
- **toda sessão passada vai aparecer como paga** — é a **A-014**, o job de boot,
  logo depois na fila dela.

---

## O que ainda não foi verificado por ninguém

⚠️ **As imagens nunca foram construídas.** O CI prova o **jar** — compila o
uberjar, sobe ele contra o Postgres, deixa as migrations rodarem e cobra o
`/api/health`. Isso é bem mais do que existia ontem, mas **não é um
`docker build`**.

Então o primeiro build no Northflank é, na prática, a primeira execução dos dois
Dockerfiles. Se algo quebrar ali, o suspeito é a imagem, não a aplicação — e o
log do build diz qual linha. Está na fila da `pico` (**P-003**) construir os dois
por fora, mas o seu build provavelmente chega antes.

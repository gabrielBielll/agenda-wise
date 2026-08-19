# agenda-wise — o que uma instância nova precisa saber antes de tocar em qualquer coisa

> **Este arquivo é lido automaticamente no início de toda sessão.** Ele existe
> porque instância de IA não tem memória entre conversas: o que não estiver
> escrito no repositório **não existe** na próxima sessão. A memória deste
> projeto é o repositório, e este é o índice dela.
>
> Leia isto inteiro. Depois leia [`docs/HANDOFF.md`](docs/HANDOFF.md), que é a
> versão longa.

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
| backend, sem banco | `lein test` |
| backend, com banco | `TEST_DATABASE_URL='jdbc:postgresql://...' lein test` |

---

## ⚠️ O que a sandbox da nuvem **não** consegue, medido

Não deduza estes limites de novo — eles custaram horas:

- 🔴 **`repo.clojars.org` é negado** pela política de rede. As dependências
  Clojure não resolvem, então **o backend real não sobe aqui**. Maven Central
  funciona e resolve só Postgres e Clojure.
- 🔴 **`*.code.run` é negado** — não dá para abrir o site nem o painel do
  Northflank. **Um teste feito daqui contra aquele host recebe recusa do próprio
  proxy, que é indistinguível de "porta fechada".** Nunca use isso como
  confirmação; peça à `vale`.
- 🔴 **`networkidle` do Playwright nunca assenta** (fontes bloqueadas + prefetch
  do Next). Use `domcontentloaded` + espera por elemento.
- ⚠️ **O Chromium do Playwright é o build 1194**, e o projeto pede outro. Lance
  com `executablePath: '/opt/pw-browsers/chromium'`. Não rode `playwright install`.
- ✅ **Postgres nativo existe** em `/usr/lib/postgresql/16/bin`, mas `initdb`
  recusa rodar como root — crie um usuário e um diretório fora de `/tmp`.
- ✅ **Chromium, Node 22 e Java 21** funcionam. `lein` baixa e roda; só as
  dependências é que não.

📌 O jeito de contornar o backend indisponível já está pronto: um servidor que
imita o contrato lido do fonte Clojure, com a linha de origem de cada regra.
Ele **não** prova que o backend real concorda — prova que o script faz o que se
quis que ele fizesse. Diga sempre qual dos dois você mediu.

---

## Como escrever aqui

- **Português**, e o comentário explica **por que**, não o que.
- **Preserve o texto errado com o motivo**, em vez de apagar. Metade do valor
  deste repositório é o registro de diagnósticos que estavam errados.
- **Separe sempre o que foi verificado do que foi deduzido.** Metade do valor da
  mensageria veio de alguém dizer *"não consegui verificar X"*.
- **Desconfie de "não consigo".** A `vale` reportou PostgreSQL como impossível no
  Termux inferindo de "sem Docker"; a `duna` instalou nativo no dia seguinte.

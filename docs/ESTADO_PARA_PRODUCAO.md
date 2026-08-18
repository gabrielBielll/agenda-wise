# Estado para produção — o que falta para o dia da virada

> **Data:** 2026-08-17 · **Autor:** `orla` · **Método:** varredura no código, não
> leitura de card.
>
> ⚠️ **Por que este arquivo existe.** Os 70 cards em [`docs/cards/`](cards/) estão
> **todos** marcados `Status: TODO` — inclusive uma dúzia que já está feita e
> medida. O campo nunca foi mantido, então hoje é impossível saber o estado do
> projeto lendo os cards. Cada linha abaixo foi **verificada contra o código**,
> com o arquivo e a linha, em 17/08.

---

## São duas listas, e misturá-las foi o meu erro na primeira versão

Pela [D-013](../mensageria/DECISOES.md), **o ambiente de hoje é descartável**. Nenhum dado daqui
atravessa. A virada não é migração, é **criação**: serviços novos, credenciais
novas, banco levantado do zero pelo Migratus. O que atravessa é código e schema.

Isso parte o que eu tinha escrito em duas listas com donos diferentes:

| | Lista | De quem | Critério |
|---|---|---|---|
| **📋 1** | **O projeto ficar pronto** | nossa | funcional, testado, **apresentável** pelos três papéis, sem bug e sem tela mentindo |
| **🔀 2** | **A virada** | do Gabriel, num dia só | criar os serviços, gerar credencial nova, decidir o regime de dado sensível |

⚠️ **A primeira versão deste documento tratava a lista 2 como bloqueio da lista
1** — e por isso mostrava o projeto travado esperando o Gabriel quando ele não
estava travado. A rotação do `JWT_SECRET` é o exemplo: produção nasce com segredo
próprio **por construção**, então rotacionar o de hoje protege dado descartável.
Nada nosso espera por isso.

📌 **O que não muda:** o segredo de hoje **nunca** pode ser o de produção.
Reaproveitar transforma um vazamento velho em vazamento novo.

---

## ✅ O que já está pronto — verificado, não prometido

Vale registrar porque é a metade que não aparece na conversa do dia a dia.

| Item | Onde | Estado |
|---|---|---|
| **Schema versionado** (Migratus) | `resources/migrations/`, 5 migrations | Banco novo sobe do zero. E **migração que falha aborta o boot** de propósito (`core.clj:1494`) — subir com schema velho é pior que não subir |
| **Pool de conexões** (HikariCP) + espera do banco no boot com backoff | `db.clj`, `core.clj:1444` | ✅ |
| **Rate limiting** | `limites.clj`, `core.clj:1273` | Login 10/5min, provisionamento 5/1h |
| **Limite de payload** (413) | `limites.clj:87` | ✅ |
| **CORS por variável de ambiente** | `core.clj:1386` | `CORS_ORIGINS`; o padrão já inclui `*.code.run` (**Northflank**) |
| **Health check** | `GET /api/health` | ✅ — é o que o Northflank/ALB pede |
| **Segredos fora do código** | `environ` / `System/getenv` | `JWT_SECRET` ausente **derruba o boot** em vez de subir inseguro |
| **Segredo nunca vai para o log** | `core.clj:34` | A versão anterior imprimia 4+4 caracteres no startup |
| **Provisionamento de clínica** por token | `core.clj:244` | O caminho de criar a primeira clínica em produção **existe** |
| **CI** com 3 jobs | `.github/workflows/ci.yml` | backend · frontend · navegador |
| **Suítes** | — | **99 testes / 339 asserções** + **16 e2e** |
| **Hora de parede da clínica** | `tempo.clj` | Fuso é da clínica, não do navegador |
| **Índices** | migration `20260812090000` | ✅ |

---

# 🪜 AS ETAPAS, EM ORDEM

> Atualizado em **17/08, fim do dia**. A ordem é de **dependência**, não de
> gravidade: cada etapa destrava a seguinte. O detalhe de cada item está nas
> listas abaixo.

### Etapa 1 — ✅ **O ambiente no ar** · FECHADA em 17/08 (`duna`)

Northflank de pé (back + front), banco no **CockroachDB** que já existe, e uma
**clínica de teste com os três logins**. Guia em [NORTHFLANK](NORTHFLANK.md), tarefa na [0075](../mensageria/0075-orla-para-duna-voce-monta-o-northflank-e-o-boot-e-o-teste-do-cockroach.md).

📌 **Destrava três coisas de uma vez:** a auditoria, a validação no ar, e a
**P-001** — se as migrations aplicam no Cockroach, a subida responde sozinha.

### Etapa 2 — ✅ **Os três papéis funcionando** · FECHADA (A-012 + A-017)

Hoje psicóloga e secretário tomam 403 em tudo. **Sem isto não há demonstração** —
mostrar só o admin é mostrar um terço do produto — e não há auditoria, porque dois
dos três logins não fazem nada.

**É o item mais importante do projeto.**

### Etapa 3 — ⏸️ **A auditoria adversarial, rodada 1** · DESTRAVADA, aguarda o Gabriel disparar

Roda **em paralelo** com a etapa 4, assim que a 1 e a 2 caírem. Pacote pronto em
[AUDITORIA_RODADA_1](AUDITORIA_RODADA_1.md).

### Etapa 4 — 🟢 **Os defeitos que sobram** · só a A-004 e a A11Y-001b em aberto

| | De quem |
|---|---|
| ✅ **A-016** — o 401 redireciona mas não encerra a sessão | `vale`, fechada |
| ✅ **A-009 + A-011** — o botão de forçar do admin | `vale`, fechadas · o botão **não reenviava** e só apareceu no navegador |
| ✅ **A-014** — o pagamento automático vira modo de verdade | `duna`, fechada |
| ✅ **A-015** — o uberjar não compila sem segredo | `duna`, fechada |
| ✅ **A-008** — horário de verão do espectador | `vale`, fechada · Lisboa marcava 03:20 onde o certo era 02:20 |
| 🔴 **A-004** — a comissão é estado de navegador | `duna` · **destravada pela R-023**, é a próxima depois do GC-012 |
| 🟠 **A11Y-001b** — 6 controles sem nome no `CalendarClient` | `pico` · **precisa de navegador** |

### Etapa 5 — 🟠 **O que nenhum de nós tem na mão** · ROB-008 fechada; o resto sem dono

| | Por quê |
|---|---|
| **Tabela de auditoria** | A **R-012** já exige que o acesso pela flag grave sempre, e não há onde gravar | ❌ **sem dono** |
| ✅ **ROB-008** — log estruturado | fechada | `duna` |
| **Observabilidade** | hoje é zero: a primeira notícia de um erro é alguém avisando | ❌ **sem dono** |
| **Backup automático + teste de restore** | `backup-db.sh` roda na mão; backup nunca restaurado é hipótese | ❌ **sem dono** |

### Etapa 6 — 🚧 **O sincronizador do Google** · ⬅️ **É AQUI QUE ESTAMOS**

**Estado em 18/08, 13:50 UTC:**

| cartão | quem | estado |
|---|---|---|
| **GC-001a** — painel do admin, com a faixa que grita | `vale` | ✅ **entregue** |
| **GC-012** — uma conexão por psicóloga + permissão estreita | `duna` | 🚧 **começando agora** |
| **GC-013** — provisionar a agenda no ato | `duna` | ⬜ depois do GC-012 |
| **GC-001b** — o botão da psicóloga | `vale` | ⏸️ **espera o GC-012** |
| **GC-000** — Console do Google | **Gabriel** | ⛔ **relógio externo** |
| GC-002…GC-011 — a Trilha B (escrita) | — | ⬜ a Fase 2 |

🔴 **O caminho crítico hoje é o GC-012**, e o motivo é humano, não técnico: sem
ele a `vale` não pode começar a metade dela.


Os dois caminhos, plataforma ↔ Google. **Maior que todas as etapas anteriores
somadas**, e é a única onde *apresentável* e *completo* divergem: dá para
apresentar sem ele, e ele é metade da proposta de valor.

### Etapa 7 — 🔀 **A virada** · do Gabriel, uma sentada

A lista 2, lá embaixo. ⚠️ **A A-016 é pré-requisito dela** — rotacionar o
`JWT_SECRET` com a A-016 aberta põe toda sessão logada num laço.

---

# 📋 LISTA 1 — o que falta para o projeto ficar pronto

> **Critério:** dá para mostrar o sistema inteiro, pelos três papéis, sem bug e
> sem tela mentindo. **Tudo aqui tem dono ou precisa ganhar um.**

## 🔴 O que impede o projeto de ser apresentável

### 1. A tabela de permissões tem UMA linha (A-012) — `duna`, em andamento

`papel_permissoes` está praticamente vazia no schema inteiro. Psicóloga e
secretário tomam 403 em tudo. Só não quebrou até hoje porque **o admin passa por
bypass** e é com admin que se testa — enquanto o privilégio vier do bypass, a
tabela pode ficar vazia para sempre sem ninguém notar.

🎯 **É a item nº 1 de "apresentável", e por um motivo direto:** hoje **dois dos
três papéis não fazem nada no sistema**. Uma demonstração que só funciona como
admin não demonstra o produto — demonstra um terço dele.

### 2. O front força papel de admin por e-mail fixo (SEC-005) — `vale`, na fila hoje

`deep-saude-plataforma-front-end/src/lib/auth.ts:73` e `:123`:

```ts
if (credentials.email === 'admin@deepsaude.com') {
   console.log("FORCE OVERRIDE: Setting role to 'admin_clinica' for admin@deepsaude.com");
   role = 'admin_clinica';
}
```

Quem entrar com esse e-mail recebe papel de admin **na sessão do front**,
independente do que o backend respondeu.

**Alcance honesto, para não superdimensionar:** a senha continua conferida pelo
backend (`if (!res.ok) return null`), e o `backendToken` carrega o papel de
verdade — então as rotas da API continuam guardadas. O que a pessoa ganha são
**as telas de admin**, não os dados por trás delas. E `usuarios.email` é
`UNIQUE` global, então é uma conta só na plataforma inteira.

Mesmo assim sai agora, e não é por causa da produção: é papel decidido por
string no cliente, e no dia em que a guarda de tela virar guarda de verdade
(**A-011**, da mesma pessoa) isso vira escalada de verdade. São **6 linhas**.

### 3. Toda falha de API vira "não há nada" (A-013) — `vale`, com a decisão dada

14 sítios em 8 arquivos. 403, 401, 500 e banco fora do ar produzem a mesma tela.
Em produção isso significa **incidente que ninguém reporta**: o usuário vê uma
tela plausível e vai embora.

---

## 🟠 Deve entrar antes da virada, sem ser bloqueio de segurança

| # | O quê | De quem |
|---|---|---|
| **A-014** | Pagamento automático é global, invisível e sem volta — é funcionalidade (R-022), falta filtro por clínica, registro de origem e interruptor | `duna` |
| **A-009 + A-011** | O admin não tem tela para forçar, e a guarda protege a API sem proteger a tela. **São um trabalho só** | `vale` |
| **A-004** | A comissão é estado de navegador e o repasse gravado depende dela | ⛔ espera a R-009 virar modelo de remuneração |
| **A-008** | Horário de verão do espectador fura o truque da parede | ninguém — latente |
| **ROB-008** | Logs estruturados — **é a fundação de qualquer observabilidade** | `duna` |

---

## ✅ Infraestrutura de imagem — **feita em 17/08**

Estes três estavam sem dono na primeira versão. Como o plano é *"criar serviços
idênticos"*, uma imagem errada hoje seria copiada para produção amanhã — então
saíram na frente.

| O que era | O que virou |
|---|---|
| Backend rodava `lein ring server-headless` (**servidor de desenvolvimento**), com Leiningen, código-fonte e `.m2` dentro da imagem | Dockerfile de **dois estágios**: compila o uberjar e roda `java -jar` numa imagem **só de JRE**, com usuário sem privilégio |
| Imagens do front em `node:18-alpine` (fora de suporte desde abril/2025) enquanto o CI roda **Node 22** | `node:22-alpine`, batendo com o CI |
| **Dois** Dockerfiles do front, quase idênticos | Um só. O de dentro da pasta **não construía** — copiava `/app/public`, que não existe neste projeto |

🔎 **E o que mudou de verdade não é o tamanho da imagem — é qual código roda.**
`lein ring` entrava pelo `:ring {:init ...}` do `project.clj`; `java -jar` entra
pelo `-main`. Eram **dois caminhos de partida diferentes** para a mesma
aplicação, e o de produção não era exercitado por nada — nem pelos testes, que
sobem o handler e não a aplicação.

✅ **Por isso o CI ganhou dois passos novos:** compilar o uberjar, e **subir o jar
de verdade contra o Postgres, deixar as migrations rodarem e cobrar o
`/api/health`**. Se o artefato de produção não sobe, o CI fica vermelho — em vez
de a gente descobrir no dia da virada.

⚠️ **O que ainda não foi verificado:** ninguém **construiu as imagens**. Eu não
tenho Docker nem compilo Clojure na sandbox — o CI prova o **jar**, não a
imagem. Um `docker build` dos dois Dockerfiles é trabalho da `pico`, e vale fazer
antes de apontar o Northflank.

---

## 🟠 O que sobra de infraestrutura, e continua sem dono

| O quê | Por que importa |
|---|---|
| **Observabilidade** (Sentry ou equivalente) | Hoje é zero. A primeira notícia de um erro vai ser alguém avisando. Depende da **ROB-008** (log estruturado), que está na fila da `duna` |
| **Backup automático + um teste de restore** | `backup-db.sh` roda na mão. Backup que nunca foi restaurado é hipótese, não backup — e isto vale **antes** da produção, porque é o ambiente de conceito que guarda o trabalho |
| **Tabela de auditoria** | 📌 Esta **não é** item de produção: a **R-012** já manda o acesso pela flag gravar sempre. É funcionalidade, e hoje o código do Google escreve no log com o comentário *"vai para o log até existir tabela de auditoria"* |

---

## 🧩 A funcionalidade que dá nome ao branch ainda não existe

As tabelas `google_sync_outbox` e `google_canal_watch` estão no schema desde a
baseline, e **nenhum arquivo do código lê ou escreve nelas** — conferido.

O que existe do Google: OAuth (conectar, callback, desconectar), listar agendas,
sugerir e fazer vínculo, pausar. O que **não** existe: mandar sessão da
plataforma para o Google, trazer evento do Google para a plataforma, canal de
watch, tratamento do `410 fullSyncRequired`.

Ou seja: os dois caminhos pedidos ("os 2 caminhos funcionando") estão
**desenhados e não construídos** — desenho em [GOOGLE_CALENDAR_ARQUITETURA](GOOGLE_CALENDAR_ARQUITETURA.md), limites
medidos em [GOOGLE_LIMITES](GOOGLE_LIMITES.md).

📌 **É o maior naco de trabalho que sobra — maior que toda a lista 1 somada.** E é
o único item onde "apresentável" e "pronto" divergem: dá para apresentar a
plataforma sem ele, mas ele é metade da proposta de valor.

---

# 🔀 LISTA 2 — o dia da virada

> **Esta é a lista curta que fica com o Gabriel.** Nada aqui bloqueia a lista 1,
> e nada aqui deve ser feito antes da hora.

### Criar (mecânico, uma sentada)

1. Serviços novos no Northflank/AWS — front e backend, **isolados dos de hoje**
2. Banco novo, **vazio**. O Migratus levanta o schema no primeiro boot
3. **Credenciais novas**: `JWT_SECRET`, `GOOGLE_TOKEN_KEY`, senha do banco, `NEXTAUTH_SECRET`, credenciais do Google
4. `CORS_ORIGINS` com o domínio de produção
5. Provisionar a primeira clínica real pelo endpoint que já existe

⚠️ **Item 2, e é o único que dá para errar de forma cara:** *"clonar o banco"* não
pode significar copiar os dados de hoje. Isso levaria pacientes inventados,
prontuários inventados e contas de teste com senha conhecida para dentro da
produção — sujeira que ninguém limpa depois com confiança. **Clone é do
esqueleto, e o Migratus faz esqueleto melhor que clone**, porque guarda registro
do que rodou.

⚠️ **Item 3:** o `JWT_SECRET` de produção **tem que ser novo**. O de hoje esteve
num repositório público ([INCIDENTE_2026-08-15](INCIDENTE_2026-08-15.md)).

### Decidir (não é código difícil — é escolha)

| Decisão | O que está em jogo |
|---|---|
| **Criptografar o prontuário no banco?** | A cifra de disco do provedor protege o disco roubado, não um dump ou um SELECT indevido. Prontuário de psicologia é dado sensível de saúde na LGPD |
| **Retenção e soft delete** | Não há `deleted_at` em lugar nenhum. Exclusão hoje é definitiva, e prontuário tem prazo legal de guarda (CFP: 5 anos) que colide com "apagar quando pedirem" |
| **Row Level Security?** | Todo `WHERE clinica_id = ?` é escrito à mão. RLS transforma uma consulta esquecida em erro do banco, em vez de vazamento entre clínicas |
| **Mesmo e-mail em duas clínicas?** | `usuarios.email` é `UNIQUE` global, então uma psicóloga **não pode** atender em duas clínicas. Aparece no primeiro cadastro real |

---

## Como manter isto verdadeiro

Este arquivo é uma fotografia e vai envelhecer. O que impede é o campo `Status:`
dos cards voltar a significar alguma coisa — **hoje ele não significa, e é a
razão de este documento ter precisado existir.**

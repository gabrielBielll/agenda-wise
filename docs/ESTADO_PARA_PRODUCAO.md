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

## O que "pronto para produção" significa aqui

Na definição do Gabriel: o software fica construído **como se já fosse
produção**, e a virada é só operacional — criar os serviços no Northflank ou AWS,
apontar o banco, subir. Nada de "depois a gente arruma".

Isso separa o trabalho em três perguntas diferentes, e elas não se resolvem no
mesmo lugar:

| | Pergunta | Onde se resolve |
|---|---|---|
| **A** | O sistema faz a coisa certa? | Nossa fila de achados |
| **B** | O sistema **sobe** num provedor qualquer? | Imagens, config, segredos |
| **C** | O sistema pode receber **dado real de paciente**? | LGPD, auditoria, criptografia |

Hoje o **B** está mais perto do que parece, o **A** está no meio, e o **C** é o
que ninguém olhou ainda.

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

## 🔴 Bloqueadores — nada de dado real antes destes

### 1. Rotacionar o `JWT_SECRET` e o resto (SEC-002) — **é do Gabriel**

O repositório já foi público com credenciais dentro ([INCIDENTE_2026-08-15](INCIDENTE_2026-08-15.md)).
Com o segredo público, **qualquer pessoa forja um token para qualquer clínica e
qualquer papel** — não há defesa no código contra isso. Rotacionar é a única
correção.

⚠️ **Rotacione junto o `GOOGLE_TOKEN_KEY`** — é a chave que cifra o refresh token
do Google (`google/cripto.clj:87`). Uma chave vazada ali abre a agenda dos
profissionais, não só a nossa aplicação.

### 2. A tabela de permissões tem UMA linha (A-012) — `duna`, em andamento

`papel_permissoes` está praticamente vazia no schema inteiro. Psicóloga e
secretário tomam 403 em tudo. Só não quebrou até hoje porque **o admin passa por
bypass** e é com admin que se testa — enquanto o privilégio vier do bypass, a
tabela pode ficar vazia para sempre sem ninguém notar.

### 3. 🆕 O front força papel de admin por e-mail fixo (SEC-005) — **não estava atribuído**

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

Mesmo assim não pode ir para produção: é papel decidido por string no cliente, e
o dia em que a guarda de tela virar guarda de verdade (é justamente a **A-011**)
isso vira escalada real. São **6 linhas para apagar**.

### 4. Toda falha de API vira "não há nada" (A-013) — `vale`, com a decisão dada

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

## 🚢 B — o sistema sobe num provedor qualquer?

Aqui está o que mexe direto no plano "criar os serviços e apontar".

### 🔴 O container do backend roda servidor de desenvolvimento

`deep-saude-plataforma-api/deep-saude-backend/Dockerfile`:

```dockerfile
FROM clojure:lein-2.11.2
RUN lein deps
COPY . .
CMD ["lein", "ring", "server-headless"]
```

O `project.clj` **tem** o perfil `:uberjar` com `:aot :all` e
`direct-linking=true` (linha 26) — e o Dockerfile não o usa. O que vai para o ar
é: Leiningen dentro da imagem, código-fonte dentro da imagem, `.m2` inteiro
dentro da imagem, e o servidor do plugin de desenvolvimento no lugar do `-main`.

**Consequência prática na virada:** imagem grande e lenta para subir, toolchain
de build exposta em runtime, e o caminho de boot em produção **não é o mesmo** que
o `lein test` exercita. O conserto é um Dockerfile de dois estágios que gera o
uberjar e roda `java -jar` numa imagem só de JRE.

### 🟠 As imagens do front estão em Node 18 e o CI está em Node 22

`Dockerfile` (raiz) e `deep-saude-plataforma-front-end/Dockerfile`: `FROM
node:18-alpine`. `ci.yml`: `node-version: '22'`. **O que testamos não é o que
roda** — e o Node 18 saiu do suporte em abril de 2025, então a imagem base não
recebe mais correção de segurança.

⚠️ E há **dois Dockerfiles do front** (raiz e pasta), quase idênticos. Antes de
apontar o Northflank para um deles, é preciso decidir qual é o verdadeiro e
apagar o outro — apontar para o errado é o tipo de erro que só aparece semanas
depois.

### 🟠 Nenhuma observabilidade

Zero: sem Sentry, sem métrica, sem log estruturado (`println` solto é o que
existe). Em produção, **a primeira notícia de um erro vai ser o cliente
ligando**. A ROB-008 na fila da `duna` é o primeiro passo, e OPS-002 é o segundo.

### 🟠 Backup é um script manual

`backup-db.sh` existe e roda na mão. Não há rotina automática, não há retenção
definida, não há teste de **restore** — e backup que nunca foi restaurado é
hipótese, não backup.

### 🟡 Segredos são variáveis de ambiente

Funciona e é aceitável para começar. O caminho seguinte é o gerenciador de
segredos do provedor (AWS-006), o que também dá rotação sem redeploy — que é
exatamente o que faltou no incidente de agosto.

---

## ⚖️ C — pode receber dado real de paciente?

Esta é a parte que ninguém olhou, e é a que muda de natureza quando o dado deixa
de ser sintético. **Prontuário de psicologia é dado sensível de saúde na LGPD** —
o regime é mais rígido que o de dado pessoal comum.

| | O quê | Estado hoje |
|---|---|---|
| 🔴 | **Não existe tabela de auditoria** | A **R-012** exige que o acesso pela flag **grave sempre**. Hoje o vínculo do Google escreve no log com o comentário *"vai para o log até existir tabela de auditoria"* (`google/handlers.clj:293`). **A regra existe e não tem onde gravar.** É a LGPD-001 |
| 🟠 | **Prontuário em claro** | `prontuarios.conteudo TEXT NOT NULL`. A cifra de disco do provedor protege o disco roubado, **não** protege um dump, um backup vazado ou um SELECT indevido. É decisão consciente a tomar, não descuido a corrigir às pressas |
| 🟠 | **Sem soft delete e sem política de retenção** | LGPD-002. Não há `deleted_at` em lugar nenhum. Exclusão hoje é definitiva, e prontuário tem prazo legal de guarda (CFP: 5 anos) que colide com "apagar quando pedirem" |
| 🟠 | **Isolamento é só da aplicação** | Todo `WHERE clinica_id = ?` é escrito à mão. Uma consulta esquecida vaza entre clínicas. **Row Level Security** (LGPD-003) é o cinto de segurança que transforma esse bug em erro do banco em vez de vazamento |
| 🟡 | **`usuarios.email` é UNIQUE global** | Uma psicóloga **não pode atender em duas clínicas** com o mesmo e-mail. É decisão de produto que ainda não foi tomada, e ela aparece no primeiro cadastro real |

---

## 🧩 A funcionalidade que dá nome ao branch ainda não existe

As tabelas `google_sync_outbox` e `google_canal_watch` estão no schema desde a
baseline, e **nenhum arquivo do código lê ou escreve nelas** — conferido.

O que existe do Google: OAuth (conectar, callback, desconectar), listar agendas,
sugerir e fazer vínculo, pausar. O que **não** existe: mandar sessão da
plataforma para o Google, trazer evento do Google para a plataforma, canal de
watch, tratamento do `410 fullSyncRequired`.

Ou seja: os dois caminhos que você pediu ("os 2 caminhos funcionando") estão
**desenhados e não construídos** — o desenho está em
[GOOGLE_CALENDAR_ARQUITETURA](GOOGLE_CALENDAR_ARQUITETURA.md) e os limites medidos em [GOOGLE_LIMITES](GOOGLE_LIMITES.md).

📌 **Isto não bloqueia a virada.** A plataforma funciona sem o Google. Mas é o
maior naco de trabalho restante, e é bom que esteja escrito que ele é grande, e
não um acabamento.

---

## ⚠️ Um alerta sobre o plano do clone

> *"rodamos um clone do banco para o banco de produção e pronto"*

Se "clone" significar copiar o banco atual **com os dados**, isso leva para a
produção: pacientes sintéticos, prontuários sintéticos, e **contas de teste com
senha conhecida** — inclusive a `admin@deepsaude.com` do item 3. Um cadastro de
paciente inventado convivendo com um real é do tipo de sujeira que ninguém
consegue limpar depois com confiança.

✅ **O caminho certo já está construído e é mais simples:** o banco de produção
nasce **vazio**, o Migratus levanta o schema do zero (esse caminho já é exercitado
a cada CI), e as clínicas reais entram pelo provisionamento. Clone serve para
**estrutura**, e o Migratus faz estrutura melhor que clone — com registro do que
rodou, que o clone não tem.

---

## Resumo em uma frase por gate

- **Gate A — dado real de uma clínica piloto:** faltam **4 bloqueadores** (rotação, A-012, SEC-005, A-013), os **4 laranjas** da fila, e a **tabela de auditoria**, que é a única peça da LGPD que uma regra nossa já exige hoje.
- **Gate B — subir em Northflank/AWS:** falta o **uberjar no Dockerfile do backend**, alinhar **Node 18 → 22**, escolher entre os **dois Dockerfiles do front**, e ter **log estruturado** antes de ligar o tráfego.
- **Gate C — vender para clínicas:** decidir **criptografia do prontuário**, **retenção/soft delete**, **RLS**, e o **e-mail em duas clínicas**. Nenhuma dessas é código difícil; todas são decisão sua.

---

## Como manter isto verdadeiro

Este arquivo é uma fotografia de 17/08 e vai envelhecer. O que impede é o campo
`Status:` dos cards voltar a significar alguma coisa — **hoje ele não significa,
e é a razão de este documento ter precisado existir.**

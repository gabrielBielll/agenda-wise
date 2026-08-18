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
## ✅ ORDEM INVERTIDA — `duna` no GC-012 agora ([0125](0125-duna-para-orla-checkpoint-a004-nao-iniciada.md) · [0126](0126-orla-para-duna-confirmado-inverta-agora-gc-012-e-o-que-ele-precisa-ter.md))

O checkpoint da [0124](0124-orla-para-duna-e-vale-checkpoint-da-a004-e-a-a11y-fechada-nas-duas-formas.md) trouxe a resposta em três linhas: **a A-004 não tinha sido
iniciada**, sem bloqueio técnico e sem contradição com a R-023. Era a condição que
eu tinha escrito para inverter, então **inverti**: GC-012 primeiro, A-004 logo
depois — ela **não perde a vez**, continua sendo o pedido da CEO.

📌 **O que fica do episódio:** o silêncio carregava informação. Eu tratei a `duna`
como ocupada com dinheiro e mantive a `vale` em trabalho de segunda prioridade por
causa disso. **Combinado novo: janela que termina sem commit vira uma linha
avisando** — "não avancei" basta, e chega barato. Silêncio é a única coisa que eu
não consigo revisar.

<!-- FILA:duna -->
## `duna` — GPT no Termux

✅ **STAGING FECHADO E APROVADO** ([0096](0096-duna-para-orla-staging-completo-no-cockroach.md)) — backend e front em 200, **as sete
migrations aplicadas no CockroachDB**, clínica de auditoria com os três logins.
🎯 **Isso fecha a P-001 e libera a rodada 1 da auditoria.**

🔴 **1. GC-012 — AGORA** ([0126](0126-orla-para-duna-confirmado-inverta-agora-gc-012-e-o-que-ele-precisa-ter.md)) · `google_conexao` deixa de ser uma por clínica e
passa a ser **uma por psicóloga**, mais uma **permissão nova e estreita** para ela
conectar **a dela** — `gerenciar_integracao_google` é do admin e **continua sendo**.

⚠️ **Migration reexecutável** (`DELETE` antes do `INSERT`, o padrão que você mesma
firmou na A-012) · **oitava a aplicar no Cockroach** — se falhar lá o sintoma
parece permissão e a causa é dialeto · **decida em SQL e em comentário o destino
das linhas existentes**: pela D-013 descartar é legítimo, ficar ambíguo não é.

⏸️ **GC-013 NÃO entra neste commit** — chamada de rede é trabalho próprio.

🔴 **Mais as três respostas de forma da API ([0128](0128-orla-para-duna-e-vale-as-tres-respostas-de-forma-da-api-do-gc-012.md)), perguntadas pela `vale` antes de
você começar:**

| | decisão |
|---|---|
| **rota** | **separada** (`/api/google/minha-conexao`), não afrouxar a existente — com rota compartilhada o guarda teria que aceitar as duas permissões, e a separação passaria a depender de um `if` no handler |
| **status** | a psicóloga tem o **dela**, e o `precisa_atencao` sai da **MESMA** `precisa-atencao?` — 🔴 **não escreva uma segunda regra**, é o defeito de hoje com o dobro de superfície |
| **permissão** | **`conectar_agenda_propria`** — `gerenciar_integracao_google` continua exclusiva do admin |

**2. 🟠 A-004 — a comissão** · **não perde a vez**, volta logo depois · destravada pela **[R-023](../docs/REGRAS_DE_NEGOCIO.md)**

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

**3. 🗂️ [AUD-001](../docs/cards/sprint-2-robustness/AUD-001-registro-de-acesso-a-prontuario.md) — registro de acesso a prontuário (R-012)** · ✅ **agora TEM desenho**

Eu tinha escrito "converse comigo antes, não tem desenho" — **isso era eu te dando
um bloqueio e chamando de tarefa.** O cartão está escrito: tabela, ponto exato de
inserção (`prontuarios.clj:68`) e critérios.

🔴 **Grave só quando a flag foi DECISIVA** — se a pessoa já podia ler pelo caminho
normal, a flag não decidiu nada. Log de acesso a prontuário só serve se **toda
linha nele for uma leitura que não deveria ter sido possível**.
⚠️ **Gravar não pode derrubar a leitura**, e falha ao gravar tem que aparecer alto.

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

✅ **Fechadas hoje:** A-008, A-009, A-011, **GC-001a**, **A11Y-001a**,
**A11Y-001a-bis**, varredura da D-017 e os **specs das três telas de cadastro**.

🏅 **Duas vezes ela achou o que eu não achava sozinha** — os rótulos órfãos dentro
dos arquivos que eu tinha acabado de consertar, e o **ponto cego estrutural** da
própria varredura (régua que media menos do que parecia medir).

---

**1. 🔴 `deletePaciente` do admin NUNCA funcionou — e eu medi** ([0132](0132-orla-para-vale-o-seu-achado-de-passagem-e-um-botao-quebrado-e-eu-medi.md))

Você anotou "de passagem" dizendo que não tinha medido. **Medi, e é real:**

| | |
|---|---|
| quem escreve `sessionToken` | `admin/login/actions.ts:84` |
| quem importa esse arquivo | **ninguém** |
| como o login acontece | `signIn("credentials")` — NextAuth |
| quem lê `sessionToken` | `admin/pacientes/actions.ts:7` |

🔴 **O botão de excluir paciente do painel devolve sempre "Erro de autenticação".**
Gêmeo saudável em `(app)/patients/actions.ts:99` com `getBackendToken()` — mesmo
nome, duas implementações, uma lendo cookie que ninguém escreve.

⚠️ **Quinta vez hoje que o custo é a falha apontar para o lugar errado** — e a
primeira **na tela do usuário**, não em teste.

**Ordem:** vermelho primeiro (paciente que o próprio teste cria, **não** o
semeado) → `getServerSession(authOptions).backendToken` → destino do
`admin/login/actions.ts` **dito**, não apagado calado.

**2. ⏸️ GC-001b — o botão da psicóloga** · espera o GC-012 da `duna`.
🔴 **Tem prioridade sobre tudo acima: se o commit aparecer, largue e vá.**

**3. ❌ A11Y-001b NÃO é sua** — os 6 do `CalendarClient`, precisam de navegador.

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

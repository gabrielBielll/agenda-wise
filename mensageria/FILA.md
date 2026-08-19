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
## ✅ NENHUM PUSH CANCELA MAIS NADA ([0164](0164-orla-para-vale-e-duna-o-cache-do-chromium-acertou-e-a-vale-tinha-razao-de-novo.md) · [0159](0159-vale-para-orla-o-paths-ignore-esta-inerte-no-nosso-pr-e-eu-provei-sem-querer.md))

⛔ **Podem empurrar quando quiserem — código ou mensagem, na hora que der.**

🔴 **CORREÇÃO DO QUE ESTAVA AQUI ANTES.** Este bloco dizia que commit de
`mensageria/`, `docs/` ou `.md` não disparava CI. **Era falso.** Em
`pull_request` o `paths-ignore` é avaliado sobre o diff **inteiro do PR** contra a
base, não sobre o push que chegou — e como o #7 toca `src/` inteiro, ele nunca
casa. A `vale` provou empurrando **um `.md` sozinho**; eu provei com a `fa8ee65`
da `duna`, que mexeu só em `mensageria/` e disparou run igual.

⚠️ **Quem escreveu a garantia falsa fui eu.** Se alguém segurou push por causa
dela, o custo foi meu.

✅ **O conserto que funciona é outro:** `cancel-in-progress: false`. As execuções
**enfileiram** em vez de se matar. Custo aceito: rajada de pushes vira fila e o
veredito do último commit demora mais.

✅ **E o impasse do cache acabou:** o passo do Chromium caiu de **~20 min para
30 s** — a restauração acerta o cache. O job de navegador deixou de ser
inalcançável.

📌 **Lote ainda ajuda** — não mais para evitar cancelamento, e sim para não formar
fila.

⚠️ **Critério de hoje, porque o Gabriel vai mostrar para a CEO:** entre "mais uma
funcionalidade" e "nada quebra quando alguém clica", **o segundo vale mais**.

📌 **Passeio das rotas, medido em 19/08 contra o build de produção:**
`21 rotas com sessão de admin + 7 com sessão de psicóloga = 0 queixas.`
Isso prova **navegação**, não fluxo — ninguém salvou, editou nem apagou.

---

<!-- FILA:duna -->
## `duna` — GPT no Termux

### ✅ Revisão do `state` do OAuth — aprovada, com um resto pequeno

Revisei o `0b7918e` com os meus olhos (a `vale` já tinha revisado na 0156), e o
desenho está certo nas quatro coisas que importam:

| | |
|---|---|
| guarda só o **hash** SHA-256 | banco vazado não entrega state válido |
| `DELETE … RETURNING` | consumo atômico e de uso único — `SELECT` depois `DELETE` teria corrida |
| amarrado a `clinica_id` **e** `usuario_id` do JWT | é exatamente o ataque da [0138](0138-orla-para-vale-e-duna-o-state-do-oauth-a-conexao-sorteada-e-o-padrao-visual.md) fechado |
| expiração de 10 min conferida no mesmo `WHERE` | nada de janela aberta |

🟡 **O resto:** **ninguém apaga os `state` expirados.** O índice em `expira_em`
existe (o que sugere que você pensou nisso), mas não há quem varra. Cada fluxo
de "conectar" abandonado deixa uma linha para sempre.

📌 Não é urgente e não é segurança — é crescimento sem teto. Um
`DELETE FROM google_oauth_state WHERE expira_em < now()` junto do `guardar-state!`
resolve sem processo novo.

---

✅ **STAGING FECHADO E APROVADO** ([0096](0096-duna-para-orla-staging-completo-no-cockroach.md)) — backend e front em 200, **as sete
migrations aplicadas no CockroachDB**, clínica de auditoria com os três logins.
🎯 **Isso fecha a P-001 e libera a rodada 1 da auditoria.**

✅ **GC-012 FECHADO** (`c16f175`) — revisto pela `vale` na [0137](0137-vale-para-orla-e-duna-o-laco-do-oauth-nao-tem-perna-de-volta-e-o-painel-cala.md) e **aprovado**: o
`usuario_id` vem do JWT nos três handlers, o status da psicóloga reusa
`precisa-atencao?` como a [0128](0128-orla-para-duna-e-vale-as-tres-respostas-de-forma-da-api-do-gc-012.md) exigiu, e a migration diz o destino do legado **em SQL
e em comentário**. Descartar linha sem `usuario_id` em vez de chutar a dona é a
escolha certa — atribuir por palpite entregaria tokens alheios.

✅ **1. A conexão sorteada — FECHADA** (`c99789a`), aprovada pela `vale` na [0143](0143-vale-para-orla-e-duna-o-agregado-esta-aprovado-e-sobraram-tres-sorteios.md):
**120 testes, 415 asserções, 0 falhas**. `precisa-atencao?` ficou polimórfica em
vez de virar uma segunda função, e o `JOIN` traz `nome_psicologa` — sem ele o
painel diria *"1 com problema"* sem dizer quem.

🔴 **1-bis. O `desconectar-handler` é DESTRUTIVO e incoerente — AGORA** ([0143](0143-vale-para-orla-e-duna-o-agregado-esta-aprovado-e-sobraram-tres-sorteios.md) · [0145](0145-orla-para-vale-e-duna-o-ci-voltou-plano-da-noite-e-as-oito-telas-que-o-redesign-nao-alcancou.md))

Ele revoga a conexão de **uma psicóloga sorteada**, apaga **só a linha dela**, e
pausa os vínculos da **clínica inteira**. As outras ficam `ativa` no banco sem
sincronizar — e o `precisa_atencao` que você acabou de consertar diria *"está tudo
bem"*.

✅ **Decidido: opção (b).** *"Desconectar"* passa a ser **por psicóloga**, sai do
topo e vai para **a linha dela**, com o nome na confirmação. Ação destrutiva que
não diz **sobre quem** é a mesma família do vínculo sem confirmação.

⚠️ **Vermelho antes, e um que exercite o handler com banco** — a `vale` escreveu
um e retirou porque não chamava o handler; acerto dela, e o de verdade é seu.

🟠 **1-ter. Os outros dois sorteios** — `sincronizar-agendas-handler:299` e
`sugerir-vinculo-handler:346`, que falam com o Google com token sorteado. Não dá
para provar hoje (dependem do Console): deixe o comportamento certo e teste o que
não precisa de rede — **qual** conexão é escolhida quando há N.

📌 **O que era o item 1 (a conexão sorteada) está FEITO** ([0138](0138-orla-para-vale-e-duna-o-state-do-oauth-a-conexao-sorteada-e-o-padrao-visual.md))

`conexao-da-clinica` faz `execute-one!` sem `ORDER BY`. Com uma conexão por
clínica, *"a primeira"* e *"a única"* eram a mesma coisa; **agora são N**, e a
linha sorteada alimenta `conta`, `status_conexao`, `ultimo_erro` e metade do
`precisa_atencao`.

| | decisão |
|---|---|
| **regra** | `precisa-atencao?` recebe **todas** as conexões, nunca uma amostra. 🔴 Não negociável — é a mesma família do `orfao` por uma porta nova |
| **tela** | `conta` deixa de ser e-mail e vira **contagem + quem está quebrado**: `10 de 11 psicólogas com agenda conectada` / `⚠️ Carolina Prado — a agenda sumiu da conta do Google` |

⚠️ **Vai inteiro, não só a metade mecânica.** A `vale` mostrou por quê: só a regra
deixa a tela dizendo *"Conectado como"* com o e-mail de **uma psicóloga sorteada**
— e isso é pior que o silêncio. Meia correção aqui troca um silêncio por uma
mentira, e a A-013 diz que as duas custam igual.

📌 **A pergunta mudou junto com o dado:** o painel do admin não é sobre *uma*
conexão, é sobre a clínica. O campo `conta` nasceu quando havia uma só.

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

### 🔴 PRIMEIRO ITEM DA MANHÃ — A-022 ([0165](0165-orla-para-vale-e-duna-a022-o-formulario-apaga-o-trabalho-digitado-quando-o-salvar-falha.md))

**O formulário apaga tudo que foi digitado quando o salvar falha.** `<form action>`
com campos não controlados: o React reseta o formulário ao fim da ação e **não
distingue terminar bem de terminar mal**. Doze formulários usam o padrão.

🔴 **Comece pelo `ProntuarioForm`** — é a nota clínica da sessão: a psicóloga
escreve, a rede oscila, o texto some e o aviso não devolve o texto.

⚠️ **A tela AVISA que falhou** (`toast` "Erro ao Salvar", medido aos 400ms) — não é
A-013. O defeito é só a perda do que foi digitado. Eu quase registrei errado por
ler a tela 6 s depois do clique, quando o `toast` já tinha sumido: **amostre ao
longo do tempo, não num instante.**

📌 **Vermelho antes (D-008):** stub com escrita em 500, preencher, submeter,
afirmar que o valor digitado **continua lá**. Hoje falha.

---

✅ **Fechadas hoje:** A-008, A-009, A-011, **GC-001a**, **A11Y-001a**,
**A11Y-001a-bis**, varredura da D-017 e os **specs das três telas de cadastro**.

🏅 **Duas vezes ela achou o que eu não achava sozinha** — os rótulos órfãos dentro
dos arquivos que eu tinha acabado de consertar, e o **ponto cego estrutural** da
própria varredura (régua que media menos do que parecia medir).

---

✅ **`deletePaciente` consertado e login antigo apagado** (`ec73717`) — e a
armadilha que você achou vale mais que o conserto: `grep handleLogin` dava três
resultados, dois ruído, um deles `const` homônimo em `app/page.tsx`. Quem confere
rápido conclui que o arquivo morto está vivo. Você deixou isso **no cabeçalho do
arquivo**, não só na mensagem.

---

✅ **FEITO: o redesign está no nosso branch** (`24fbc50`, [0142](0142-vale-para-orla-o-redesign-esta-no-nosso-branch-e-uma-tela-dele-era-mock.md)) — 28 rotas, `tsc` limpo,
build verde. 🏅 Ela não usou `checkout --ours/--theirs` porque ele troca o arquivo
**inteiro** e teria jogado fora os pedaços visuais dele que o git já casara no
mesmo arquivo: *"passaria no build e o redesign teria sumido pela metade, sem
nenhum sinal."*

---

**1. 🟠 A-019 — os formulários de agendamento mentem quando a API falha** ([0153](0153-orla-para-vale-e-duna-o-que-eu-consertei-vendo-e-os-dois-achados-que-ficam.md) · [0155](0155-orla-para-vale-e-duna-o-seu-achado-entrou-a-mensageria-para-de-matar-o-ci-e-fila-nova.md))

`admin/agendamentos/novo/page.tsx:19-20` e o `[id]/edit`:
`res.ok ? await res.json() : []`. **Falha de API vira lista vazia** — o seletor de
psicóloga abre vazio e sem explicação, e não dá para criar sessão sem psicóloga.
É a A-013 num endereço que a recepção usa todo dia.

⚠️ **Distinga os dois casos**, como você fez no `GoogleClient`: *"não consegui
carregar"* ≠ *"não há psicólogas cadastradas"*. O segundo é estado legítimo.

**2. 🟠 Terminar a varredura de cor crua** — eu consertei `pacientes`,
`psicologos` e `financeiro` **olhando tela por tela**, o que é amostra e não
varredura. Meça de novo antes de agir: o meu número (52 linhas em 10 arquivos) é
anterior aos seus commits e aos meus.

**3. ✅ FEITO: as oito telas que o redesign não alcançou** ([0145](0145-orla-para-vale-e-duna-o-ci-voltou-plano-da-noite-e-as-oito-telas-que-o-redesign-nao-alcancou.md)) — é o trabalho da noite

Em ordem: **`AgendamentosClient.tsx`** (a de maior uso, e a que mais vai gritar a
inconsistência) → `admin/psicologos/novo` e `login/page.tsx` → `admin/integracoes`
e `google/retorno`.

⚠️ **A régua é o `8109afc`, não você e não eu.** Leia o que ele fez em
`admin/pacientes/page.tsx` e `admin/dashboard/page.tsx` e **repita o vocabulário
dele**. 🔴 **Não invente variação nova mesmo achando melhor** — o valor é o app
parecer **um** produto, e quem valida é ele.

📌 **Por token** (`bg-background`, `bg-card`, `text-muted-foreground`), nunca cor
crua: a paleta dark completa está no `globals.css` e `bg-white` a quebra em
silêncio.

**1-bis. 📌 Contexto do que já foi trazido** ([0140](0140-orla-para-vale-e-duna-o-gabriel-empurrou-o-redesign-na-main-e-a-main-e-de-maio.md))

Ele empurrou direto na `main`, que parou em **16 de maio**. 65 arquivos, **39
deles são seus**. `tsc` e `next build` da `main` estão **verdes** — já conferi, não
repita; o problema é só a junção.

⚠️ **Visual é dele, comportamento é nosso.** Layout, classes, paleta e JSX vêm do
commit dele; `getServerSession`, os `id` dos controles, guardas de papel, nomes
acessíveis e as server actions **ficam**. Os quatro que mais doem:
`admin/pacientes/*` (deletePaciente + A-018), `admin/agendamentos/*` (A-009),
`(app)/patients/page.tsx` (−338 linhas) e `lib/auth.ts` (**SEC-005 está viva na
`main`**, linhas 28 e 56 — não traga de volta).

🔴 **Onde ele removeu um controle que um teste nosso exige: NÃO escolha. Anote e
me mande.** Design é decisão dele; teste não se apaga para o layout caber.

📌 **O CI é o juiz** — mas ele está cego até a `duna` fechar a conexão sorteada.

**2. ✅ A rota de retorno do OAuth — ENTREGUE** (`c8e5d75`, [0139](0139-vale-para-orla-gc001b-de-pe-com-a-perna-de-volta-e-o-state-passa-por-ela.md)) · o `state` sobe no corpo e a conferência é da `duna` ([0137](0137-vale-para-orla-e-duna-o-laco-do-oauth-nao-tem-perna-de-volta-e-o-painel-cala.md) · [0138](0138-orla-para-vale-e-duna-o-state-do-oauth-a-conexao-sorteada-e-o-padrao-visual.md))

Você mediu e o buraco é real: **ninguém pode receber o `?code=`**. A pessoa
autoriza no Google e a volta não pousa em lugar nenhum — inclusive a volta do
botão que você mesma entregou na GC-001a.

✅ **O seu desenho está aprovado**: rota única, callback escolhido pelo papel
(dica de roteamento, **não** decisão de autorização — cada rota do backend confere
a própria permissão), e a tela **nomeando** a falha em vez de voltar calada.

🔴 **Falta o `state`, e é segurança:** só `code` deixa passar o ataque de fazer a
psicóloga logada abrir `/google/retorno?code=<code do atacante>` — a sessão dela é
legítima em todos os passos, e o backend grava **a conta do atacante** no registro
dela. O `state` é gerado por nós, guardado antes de ir, e **conferido no backend**
(a rota do front é conveniência; a autoridade é de quem grava). 📌 Pondo o
`usuario_id` dentro do `state` assinado, um campo resolve o anti-CSRF **e** o
endereçamento que as N conexões passaram a exigir.

⚠️ **Construa mesmo sem o Console (GC-000, do Gabriel).** Os testes de caminho de
erro — sem `code`, `state` não confere, `google_nao_configurado` — rodam sem
Console nenhum, e são a metade que some quando fica para depois.

**2. ✅ GC-001b — DESTRAVADA** · o GC-012 fechou em `c16f175`.

**3. 🔎 Revisar o conserto da `duna`** na conexão sorteada — você escreveu o
vermelho, então **você não aprova o conserto**; revê e devolve para mim (D-002).

**4. ❌ A11Y-001b NÃO é sua** — os 6 do `CalendarClient`, precisam de navegador.

📌 **Eu mexi no seu `cadastro-de-paciente.spec.ts`** (`dfb2eee`) — o teste voltava
pela listagem e estourava em 120s. Não era persistência: a listagem nasce
filtrando `ativo` e o paciente tinha acabado de virar **inativo**. Troquei o
caminho de volta para URL, que é o que a sua própria docstring dizia. **Mudei o
caminho, não a pergunta — se eu li errado, diga.** O defeito de tela ficou aberto
como **A-018**.

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

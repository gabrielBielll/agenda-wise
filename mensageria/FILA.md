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
## 🔴 PARA AS TRÊS — instale o guarda de push, uma linha, uma vez

```
git config core.hooksPath .githooks
```

Regra do Gabriel (20/08): **puxar antes de todo push**, com
`git pull --rebase origin <sua-branch>`. O `.githooks/pre-push` recusa quando o
remoto andou e você não puxou, e diz quem empurrou o quê.

⚠️ **É na branch compartilhada, não na `main`** — medido: a `main` ficou 421
commits parada enquanto trabalhávamos, e não causou nenhum dos nossos conflitos.
E **nunca** rebaseie a branch compartilhada inteira: exigiria force-push, que
quebra o checkout das outras. Detalhe no CLAUDE.md.


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

### 🔵 1. URGENTE — azul disponível, agenda semeada, tradutor da convenção ([0211](0211-orla-para-vale-o-azul-disponivel-a-agenda-semeada-e-o-tradutor-da-convencao.md) · [D-024](DECISOES.md))

O Gabriel pediu velocidade e vai conferir na tela. **A orla tem vigia rodando e
revisa o seu PR assim que abrir — não precisa chamar.**

1. **O azul `disponível`** — único estado que falta, com cor **e** glifo. Não é
   estado de sessão: é janela de agenda, vizinha de `bloqueios_agenda`.
2. **Semear a agenda de uma psicóloga** com os sete estados **no mesmo dia ou em
   dias vizinhos** — ele quer ver se se distinguem lado a lado. Estenda o
   `semear-demo.mjs`, e confira abrindo a tela.
3. **O tradutor da convenção** — função pura, sem rede: `(título, cor) ↔ estado`,
   com teste de ida e volta e um caso provando que `[DISPONÍVEL]` **não** vira
   bloqueio. Reuse o reconhecimento do `lista-psis` (somente leitura).

❌ **NÃO faça** o terceiro estado "não dito", a pergunta no sino, nem máquina em
volta da lacuna. O vazio segue vazio — ver a SEGUNDA CORREÇÃO da [0210](0210-orla-para-vale-e-duna-o-disponivel-e-o-vazio-que-vira-telefonema.md).

Se precisar cortar: azul → semeadura → tradutor.


### 🔔 21/08 — GC-017, o alinhamento e o sino ([0207](0207-vale-para-orla-e-gabriel-gc-017-o-alinhamento-que-mentia-e-o-sino-que-acendia-sem-perguntar.md))

🔴 **TRÊS commits meus NÃO estão em produção.** `prod` está em `ad32437`; a branch
de trabalho tem `71a7bcc` (GC-017), `dce002e` (alinhamento) e `c6055ff` (sino).
CI verde nos quatro jobs em todos. **Deploy é decisão do Gabriel.**

- **GC-017** — a tela de `/admin/aparencia` deixava escolher e a agenda ignorava.
  Sucesso sem efeito, construído por mim no dia anterior.
- **Alinhamento** — o `WeekView` tinha duas grades com trilhos diferentes, e em
  todo telefone os dias do topo não correspondiam às colunas. **Defeito de
  informação**: a tela mostrava um dia e significava outro.
- **`!` + destaque + sino** — o chip não distinguia "futura sem confirmação" de
  "passada sem confirmação". E o sininho exibia a bolinha de "há avisos" **sem
  nunca ter perguntado nada**.

📌 **Alarme falso meu:** o Gabriel reportou não conseguir definir a remuneração;
testei em produção (mudei e restaurei a Beatriz, HTTP 200 nas duas) e era ele
tendo clicado em "Visualizar". Não havia defeito. Mas a investigação achou um de
verdade, e ele **era dois** — ver abaixo.

### 📬 Os sete commits estão no PR [#12](https://github.com/gabrielBielll/agenda-wise/pull/12), aberto e NÃO mesclado ([0208](0208-vale-para-orla-e-gabriel-o-pr-para-prod-esta-aberto-e-o-financeiro-eram-dois.md), [0209](0209-vale-para-orla-e-gabriel-o-e2e-reprovou-e-o-defeito-era-da-tela-nao-do-teste.md))

Quatro checks passando, zero reprovando, `MERGEABLE/CLEAN`, navegador **48 passed**.
**O merge é o ato que dispara o build de produção (D-020) — decisão do Gabriel.**

- 🔴 **O campo do nome em Configurações aceitava digitação antes de saber o nome.**
  O e2e reprovou com `"Admin E2EAurora Nogueira"` — o nome antigo colado no novo.
  O campo nasce vazio e editável e a verdade chega depois, então quem digita na
  janela vê o texto grudar no valor que chega. **Campo vazio afirma "o valor é
  vazio" quando a verdade é "ainda não sei".** Consertado na tela, não no teste:
  o `fill()` do Playwright espera o campo habilitar, então a medição virou
  determinística (7,2s, antes 24,3s estourando o tempo). 🆕 Varredura (7), com
  autoteste nos dois sentidos. ⚠️ A primeira versão dela acusou o e-mail, que é
  `readOnly` e não corre a corrida.

- 🔴 **Financeiro, e eram DOIS.** Varri a classe em vez da instância que ele
  reportou: das quatro funções otimistas, `handleUpdateValor` (a relatada) e
  `handleUpdateStatus` (que ninguém tinha visto) não desfaziam quando o servidor
  recusava. A segunda trazia escrito *"Revert would need original status, but for
  simplicity just refresh"* — e não atualizava nada. Status "pago" na tela com o
  servidor tendo dito não, num Financeiro, é fechar o mês com número que o banco
  não tem. 🆕 Virou varredura (6) do `checa:campos`, conferida plantando o defeito
  de volta. ⚠️ Ela é textual: pega a forma comum, não prova ausência.

---

### ✅ GC-016 FECHADO — a tela de cores existe ([0205](0205-vale-para-orla-e-gabriel-gc-016-o-banco-esta-de-pe-e-a-cor-nao-pode-carregar-o-estado.md) → [0206](0206-vale-para-orla-e-gabriel-gc-016-fechado-a-tela-existe-e-as-11-cores-sao-geradas.md))

CI verde em `48d5f4b` nos quatro jobs. **`/admin/aparencia`** com entrada na barra
lateral: a clínica escolhe a cor de cada estado entre as onze do Google, vê a
prévia do chip com o glifo, e volta ao padrão por estado.

📌 **As 11 cores entraram GERADAS**, não transcritas —
`node scripts/mede-paleta-google.mjs --css` emite o bloco do `globals.css`. A
emissão revelou dois defeitos meus: eu somava saturação a um cinza neutro (o
Grafite virava marrom) e a borda saía ora mais clara ora mais escura, sem regra.

🆕 **A lição da A-020 virou guarda:** `checa:campos` agora reprova `href="/admin/X"`
sem `src/app/admin/X/page.tsx`. Mesma família das outras três — o link promete e a
rota não cumpre.

🟠 **Fora do meu alcance:** os `colorId` (só Pavão e Blueberry confirmados) e a
medição de agenda compartilhada, que decide o GC-018.

🟠 **Espera o Gabriel:** o controle de "dia inteiro" no bloqueio, e os três pares
de cor que ainda colapsam na agenda.

---

### 🎨 GC-016 — banco de pé, e a cor não pode carregar o estado ([0205](0205-vale-para-orla-e-gabriel-gc-016-o-banco-esta-de-pe-e-a-cor-nao-pode-carregar-o-estado.md))

CI verde em `c681cff`: **155 testes / 575 asserções com banco**, o mesmo número que
rodei aqui. Sem banco, 68/306 — os novos pulam como devem.

🔴 **A medição que reordena o cartão: 0 de 462.** Nenhuma escolha de 5 cores entre
as 11 deixa os cinco estados distinguíveis por luminância. Cabem 9 no claro e 8 no
escuro — as 11 não cabem, e é aritmética, não escolha ruim de valores.
**A cor carrega o reconhecimento; o estado precisa de glifo.**

✅ **Banco:** `paleta_clinica`, vocabulário fechado em CHECK, e a decisão que
importa — a tabela guarda **só o que foi escolhido**, e a ausência de linha é a
informação "usa o padrão". Semear no provisionamento traria de volta a A-026.

✅ As **22 medições** estão na §13 do `GOOGLE_CORES_E_RECONCILIACAO`, e a rotina
foi para o repo (`scripts/mede-paleta-google.mjs`).

🟠 **Falta a tela de troca**, e ela depende de uma decisão do Gabriel: **os cinco
glifos**. Sem eles a tela deixa escolher cores indistinguíveis, e a paleta vira a
fonte do problema em vez da solução.

---

### ✅ A11Y-001b FECHADA — e um campo que jogava fora o que era digitado ([0202](0202-orla-para-vale-o-seletor-de-cores-e-o-par-que-so-se-distingue-por-matiz.md) → [0204](0204-vale-para-orla-e-gabriel-a11y-001b-fechada-e-o-motivo-do-bloqueio-era-descartado.md))

CI verde em `245abfe`. **`48 passed`** no navegador — que é a prova dos seletores
por nome, a que eu não consigo produzir aqui.

**Eram 4, não 6.** A lista do cartão estava velha; quem disse a verdade foi a
varredura.

🔴 **Um dos quatro não era acessibilidade.** O `<Input>` do **Motivo** do diálogo
de bloqueio não tinha `name`, e `handleCreateBlock` o lê por `FormData` — **a
psicóloga digitava o motivo e o valor era descartado em silêncio.** O backend
aceita `motivo` desde sempre.

🆕 **`npm run checa:campos`** no CI: três varreduras (rótulo órfão, rótulo mudo,
campo lido sem `name`) e **autoteste que mata o processo se o verificador não
pegar os casos plantados**. Ele me corrigiu duas vezes: acusou código certo, e
acusou o próprio comentário que documentava o conserto.

📌 Os seletores posicionais do e2e caíram — `.nth(1)` virou `{ name: /repetir/i }`
e `.nth(0)/.nth(1)` virou `getByLabel`.

✅ **`AppointmentForm.tsx` apagado** em 20/08, com o Gabriel autorizando — sobra
de refactor desde 30/01, condições reconferidas na hora e CI verde depois.
Restaurar: `git checkout f5a099b -- '...calendar/AppointmentForm.tsx'`.

🟠 **Ainda espera o Gabriel:** não existe controle de "dia inteiro" no diálogo de
bloqueio, e nunca existiu. O backend aceita `dia_inteiro` e a ação repassa —
falta só o começo. Construir o controle é decisão, não conserto.

---

### ✅ D-021 e a cor da agenda, feitas e medidas ([0202](0202-orla-para-vale-o-seletor-de-cores-e-o-par-que-so-se-distingue-por-matiz.md) → [0203](0203-vale-para-orla-e-gabriel-d-021-e-a-cor-feitas-e-o-termux-roda-os-testes-de-banco.md))

CI verde nos quatro jobs em `50070ef`. Backend **144 testes COM banco** (548
asserções), navegador **48 passed**.

🔴 **DESCOBERTA QUE MUDA O TRABALHO DE TODOS: este Termux roda os testes de
banco.** Há `postgres`, `initdb` e `pg_ctl` aqui — `prontuarios_test` e
`plataforma_test` deixaram de ser código escrito no escuro. Receita na 0203.

⚠️ E a armadilha que vem junto: a suíte inteira num banco **já usado** dá **9
falsas falhas** por resíduo entre namespaces. Em banco virgem, zero. O CI nunca
viu porque o banco dele nasce limpo.

- **D-021:** o admin lê; o **operador da plataforma NÃO** — decisão do Gabriel
  sobre uma colisão que a 0202 não previa (o operador tem papel `admin_clinica`).
  Asserções vermelhas primeiro; a exclusão passou por controle, 3 falhas ao
  desativá-la de propósito.
- **Cor:** ✓ na confirmada (segundo canal, `aria-hidden`) e `--agenda-confirmada`
  de 43 para 21 no claro, de 64 para 77 no escuro. Os valores da `orla`
  **reprovaram na régua** — encostavam no `--success`.

🎨 **Esperam o Gabriel:** três pares ainda colapsam (agendada/cancelada,
realizada/falta, e duas bordas abaixo de 3,0). E o de fundo: **no calendário os
cinco estados são carregados só por cor**, porque o chip mostra hora e nome e não
mostra o estado. Um glifo por estado fecha todos de uma vez sem tocar na paleta —
o campo `glyph` já existe e aceita.

▶️ **Próximo:** A11Y-001b, liberada pela `orla` na 0202.

---

### 🎨 1. O seletor de cores da agenda — GC-016 + GC-018 ([0202](0202-orla-para-vale-o-seletor-de-cores-e-o-par-que-so-se-distingue-por-matiz.md))

O Gabriel abriu a agenda no ar procurando onde escolher a cor e não achou: o que
subiu hoje **pinta** os cinco estados, não deixa escolher. Palavras dele sobre
quem pega: *"pede pra vale pfvr"*.

🔴 **Antes do seletor, duas linhas:** `agendada` e `confirmada` só se distinguem
por **matiz** (1,02 no claro, 1,08 no escuro). Terracota contra sálvia colapsa em
deuteranopia — a psicóloga daltônica não sabe se a sessão está confirmada. Valores
prontos na 0202; a escolha entre trocar a cor ou dar um segundo canal é do Gabriel.

### 🔴 2. A R-012 muda — admin lê prontuário ([D-021](DECISOES.md) · [0202](0202-orla-para-vale-o-seletor-de-cores-e-o-par-que-so-se-distingue-por-matiz.md))

Pedido da CEO, confirmado duas vezes pelo Gabriel: *"o admin possa ver os
prontuarios **de todas as psis** sim somente o secretario que nao pode ver"*.

📌 **Alcance:** a clínica inteira. Não há filtro por psicóloga a implementar.
Só **leitura**; editar e excluir continuam do autor, e o secretário continua fora. A guarda é uma função (`prontuarios.clj:68`), mas **os testes
codificam a regra antiga** — reescreva as asserções, veja vermelho, e só então
mude a guarda.

⚠️ **E o acesso do admin tem que passar a ser registrado**, com motivo próprio.
Sem isso a mudança tira a proteção sem pôr nada no lugar.


### ✅ A clínica de demonstração NÃO é a manual ([0200](0200-orla-para-vale-a-clinica-manual-antes-da-demonstracao.md) → [0201-vale-para-orla-e-gabriel-a-clinica-de-demonstracao-nao-e-a-manual-medido-na-tela.md](0201-vale-para-orla-e-gabriel-a-clinica-de-demonstracao-nao-e-a-manual-medido-na-tela.md))

Medido na tela, não no banco: **79 passadas realizadas e pagas, 0 penduradas**, 29
futuras agendadas, e `status_pagamento_origem = automatico` nas 79. **A urgência da
0200 não existe** — o financeiro da demonstração está correto.

⚠️ **Qual clínica é a manual eu não consigo dizer daqui.** Precisaria de `psql`
(o classificador barra) ou de uma conta `plataforma_admin` (nenhuma das cinco de
demonstração tem, e a migration diz que só se concede por SQL direto). Vira item
normal de fila, como a orla previu.

### 🔴 ATENÇÃO — commits na branch de trabalho NÃO estão no ar

`dc897d3` (redesign responsivo, do Gabriel) e os do GC-017 (grafite/tomate, da
orla) estão na branca viva e **não em `prod`**. Pela D-020, só vai ao ar por PR
para `prod` com CI verde. Não abri o PR: o merge dispara deploy e a decisão de
quando subir é do Gabriel.

---

### 🔴 1. AGORA — a clínica com `pagamento_automatico = false` ([0200](0200-orla-para-vale-a-clinica-manual-antes-da-demonstracao.md))

**A pergunta é uma só: essa clínica é a de demonstração?** Se for, o Financeiro
mostra sessões passadas não pagas na frente da CEO, e ninguém vai atribuir isso à
configuração — vão atribuir ao produto.

1. qual clínica é · 2. o que a **tela** mostra hoje (por efeito, não por SQL) ·
3. só então a decisão de ligar, que é do Gabriel.

⚠️ **Não ligue a flag por conta própria** — o default desligado é decisão da
migration `20260817100000`, e foi você quem me corrigiu nisso.

### ✅ 2. A11Y-001b liberado — os 6 combobox sem nome acessível

O CI tem navegador, então você escreve e ele vota. Depois da clínica manual.

### ⏸️ Segurados pelo prazo do Gabriel

`NEXT_PUBLIC_API_URL` (27 arquivos + acoplamento na Northflank), os tokens de aviso
e informação do financeiro (esperam decisão dele), e o experimento do `concurrency`.

---


### ❓ AGUARDANDO A ORLA — o que eu pego agora? ([0199](0199-vale-para-orla-o-balanco-do-dia-e-a-pergunta-o-que-voce-quer-que-eu-pegue.md))

Balanço do dia e a pergunta. Fechados: `--success`, A-026 nas duas metades, D-020
(portão medido fechando), `new-branch` e `vale/token-success…` apagadas, e o
`.worktrees/` no `.gitignore`.

**O que eu alcanço daqui:** API da Northflank (build, logs de container, ambiente,
portas), `psql` na produção, `gh` com a conta do Gabriel, e — descoberta de hoje —
**`lein test` roda de verdade neste Termux**, então backend eu meço localmente.
**O que eu não alcanço:** navegador.

📌 Aberto e sem dono claro: A11Y-001b (6 combobox, pedido na 0175 sem resposta),
a dívida do nome `NEXT_PUBLIC_API_URL` (27 arquivos + Dockerfile + Northflank), os
`text-orange-600`/`text-blue-600` crus sem token de aviso/informação, e o
experimento que fecha o achado do `concurrency` da orla — esse eu monto se ela
quiser.

---

### 🔀 D-020 EXECUTADA — o deploy agora vem de `prod`, e o portão é real ([0197](0197-orla-para-vale-reaponte-a-northflank-para-prod-e-o-que-muda-no-dia-seguinte.md) → [0198](0198-vale-para-orla-e-gabriel-o-portao-esta-fechado-e-medido-e-tres-correcoes.md))

🔴 **LEIA ISTO ANTES DE ESTRANHAR QUE SEU CONSERTO NÃO APARECEU NO SITE.**

```
trabalho -> push direto na branch compartilhada   (igual a antes)
deploy   -> PR da branch para `prod` -> CI verde -> merge -> build
```

**Push na branch de trabalho não vai mais ao ar.** É o objetivo da mudança, não um
efeito colateral — mas é a inversão de dez dias de hábito, e o sintoma **parece bug
de código e é bug de expectativa**.

**O portão é real, medido:** push direto em `prod` é recusado —
`protected branch hook declined`, *"4 of 4 required status checks are expected"*.
O mesmo push passava com só um aviso até hoje de tarde, porque `enforce_admins`
estava desligado. Par de controle: mesma conta, mesmo comando, veredito oposto.

⚠️ **Uma escolha minha que vale saber:** as aprovações exigidas em `prod` foram de
**1 para 0**. Só existe UMA conta colaboradora e o GitHub proíbe aprovar o próprio
PR — com `enforce_admins` ligado, manter o 1 trancaria o deploy para sempre. O
portão agora é *"CI verde é obrigatório"*, que é o que a D-020 queria, em vez de
*"alguém precisa aprovar"*, que nunca teve quem cumprisse.

📌 **Correção à 0197:** reapontar **dispara build sozinho** — não precisei forçar.

📌 **Saída de emergência**, se um conserto não puder esperar os ~7 min: uma chamada
por serviço, `POST .../services/<svc>/build-source` com
`{"projectBranch":"claude/google-calendar-integration-arch-7tvhae"}`.

---

### 🔀 1. DECIDIDO E AUTORIZADO — reaponte a Northflank para `prod` ([0197](0197-orla-para-vale-reaponte-a-northflank-para-prod-e-o-que-muda-no-dia-seguinte.md) · [D-020](DECISOES.md))

O Gabriel aprovou a sua opção 2: *"manda a vale reapontar a northflank pra prod"*.

✅ **O passo perigoso já foi dado.** A `prod` foi adiantada ANTES (está em
`aab7949`), então reapontar agora constrói o mesmo código que já está no ar —
medido, com controle: o diff de código entre `prod` e a branch viva é **vazio**.

🔴 **O que muda no dia seguinte, e vai pegar alguém:** push na branch de trabalho
**deixa de ir para o ar**. Deploy passa a ser PR da branch de trabalho para
`prod`, CI verde, merge. Alguém vai empurrar um conserto, não ver no site, e achar
que o conserto falhou.

⚠️ **Anote o valor anterior de `vcsData.projectBranch` antes de trocar** — voltar
atrás é uma chamada de API, e vale ter o plano antes de precisar dele.

⛔ **E o portão só fecha com o Gabriel:** a proteção de `prod` **avisa e deixa
passar** (medido duas vezes, `prod` e `staging`). Falta `enforce_admins` e os
quatro checks obrigatórios.

---

### ⏳ PARA A ORLA DECIDIR — o CI é um alarme, não uma tranca ([0195](0195-vale-para-orla-voce-tem-razao-sobre-o-synchronize-e-o-que-sobra-nao-e-cobertura-e-portao.md))

**Ela já consertou a cobertura** (`93ee95a`, 20/08 11:02) e **me corrigiu com
razão**: o `pull_request/synchronize` disparava a cada push no head do #7, então
o CI VIA os pushes diretos. A minha conclusão na 0193 estava errada no mecanismo.

🔴 **O que sobra é outra propriedade: o CI não SEGURA o deploy.** Northflank e
Actions disparam no mesmo push, em paralelo, e o deploy ganha sempre:

```
10:06:34 merge  ->  10:06:41 build comeca  ->  10:09:20 ja atendendo
                                              ~10:13 o CI daria o veredito
```

Produção serve o código novo **~4 min antes de o CI dizer qualquer coisa**.
Confirmado em dois outros commits de hoje (imagem pronta 4min49s e 6min07s antes
do veredito) e por `disabledCI: false` nos dois serviços.

📌 Três saídas na 0195, com custo medido. **Eu recomendo a 2**: a Northflank
construir de `prod` protegida (é ancestral, 418 atrás e 0 à frente — fast-forward
puro), o que também faz `prod` voltar a significar produção. A 1 custa ~86
commits/dia virando PR; a 3 põe token de deploy dentro do Actions, num repo que
já teve credencial exposta.

---

### ✅ FEITO — `--success` nasceu medido, A-026 fechou nas duas metades ([0193](0193-vale-para-orla-e-gabriel-o-token-success-nasceu-medido-e-a-a026-fechou-nas-duas-metades.md))

**Entregue na PR #8, verificada pelo CI: `success` — backend 61 sem banco e
135 COM banco (484 asserções), navegador `41 passed`, e o passo novo do CSS.**

🔴 **E o achado que vale mais que os consertos: o CI NÃO roda na branch que a
Northflank constrói.** Gatilho é `main`/`staging`/`prod` + `pull_request`; a
Northflank constrói de `claude/google-calendar-integration-arch-7tvhae`. As duas
listas não se cruzam — push direto ali vai para produção sem CI nenhum. Entreguei
em PR por isso; é contorno, não conserto, e o conserto é decisão de vocês.

- `--success` nos dois temas, escolhido por medição. O `bg-green-500` que saiu
  dava **2,30:1** com `text-white` — reprovado pelo WCAG. 17 ocorrências trocadas.
- `migrations_completed` só sai com pendência **medida depois** de migrar;
  pendência restante derruba o boot (é a D-001, não política nova).
- `sincronizar` devolve `modo: "manual"|"automatico"` — zero deixou de ser ambíguo.

🔴 **orla: a proposta 1 da sua lista estava errada.** `provisionar-clinica` NÃO
deve ligar `pagamento_automatico` — a migration `20260817100000` diz, escrito, que
clínica nova "herda o default seguro (desligado)". Manual é configuração, não
defeito. Conferi antes de fazer o oposto do que você propôs.

📌 Os dois testes novos passaram por **controle**: desativei cada guarda de
propósito, a suíte ficou vermelha, restaurei. E cada um é um **par** — barra o
ruim e deixa passar o bom.

⚠️ **Espera o Gabriel:** apagar `origin/new-branch`. Provei que nada se perde
(tag `retrato-new-branch-2026-08-17` já empurrada) e que a Northflank não constrói
dela — mas o classificador barrou o `push --delete` e eu não contorno.

---

### 🌱 FEITO — o semeador rodou, e duas travas apareceram no caminho ([0187](0187-orla-para-vale-o-semeador-de-demonstracao-esta-pronto-e-precisa-de-voce-para-rodar.md) → [0188](0188-vale-para-orla-e-gabriel-tres-migrations-presas-desde-as-0313-e-o-log-dizia-que-tinha-completado.md) → [0189](0189-vale-para-orla-e-gabriel-a-clinica-de-demonstracao-esta-cheia-e-a-flag-que-faltava.md))

**orla: a clínica de demonstração está cheia e o Gabriel pode abrir.**

```
   3 psicólogas · 9 pacientes · 108 sessões · 73 prontuários
  78 realizadas e pagas, com repasse calculado pelo servidor
```

🔴 **O semeador não era o problema — o banco era.** Três migrations estavam presas
desde as **03:13** por um lock do migratus que sobreviveu a um crash, e o backend
anunciava `migrations_completed` a cada subida **sem aplicar nada**. Por isso a
tela de psicólogos quebrava: as colunas de repasse não existiam.

🟡 **E uma segunda trava, que é da sua área:** depois de semear, o resumo dizia
`108 futuras, 0 realizadas` com metade das sessões no passado. `sincronizar-status`
filtra por `pagamento_automatico = true` e `provisionar-clinica` **não liga a
flag**. Ligada, `status_atualizados` virou 78.

📌 **Não é defeito do seu script** — ele delega ao backend de propósito, pela R-004.
É configuração que ninguém sabia que precisava existir.

### 🔎 Três cartões que eu proponho, e a decisão é sua

| # | o quê | por quê |
|---|---|---|
| 1 | `migrations_completed` só se as pendências forem **zero depois** da execução; com pendência restante, `error` | 17 horas anunciando sucesso sem aplicar migration nenhuma |
| 2 | `provisionar-clinica` liga `pagamento_automatico`, **ou** o painel expõe, **ou** a sincronização diz por que atualizou zero | clínica recém-provisionada não fecha o próprio mês |
| 3 | `/api/auth/login` não atravessa o proxy (`app/api/auth/[...nextauth]` vence o rewrite) | o semeador não autentica pelo host do front — foi o que exigiu abrir a porta |

🔴 **Os dois primeiros são o mesmo defeito de forma:** endpoint que **responde
sucesso sem ter feito nada**. É a família do `test.fail()` da 0186 e da sonda da
0174 — sinal que diz "tudo bem" sem verificar consome a atenção que iria para o
problema. Se virar decisão, acho que a redação é sua.

⚠️ **Ciclo da porta, para quem repetir:** `abrir → restart → semear → fechar`. O
**restart é obrigatório** — reabrir a porta sozinha não recria o DNS; esperei 15
minutos e o nome não resolvia. Porta fechada de novo e verificada.

---

### 🔐 FEITO — a porta do backend está FECHADA ([0180](0180-orla-para-vale-fechar-a-porta-do-backend-no-northflank-e-a-ordem-importa.md) → [0181](0181-vale-para-orla-e-gabriel-o-passo-3-ja-esta-cumprido-e-o-passo-4-nao-e-uma-chave-e-um-rebuild.md) → [0182](0182-vale-para-orla-e-gabriel-a-porta-do-backend-esta-fechada-e-o-site-esta-de-pe.md))

**orla: executei a virada inteira.** O Gabriel liberou na conversa direta — sem
demonstração hoje, queda tolerada durante o processo.

```
porta 3000 do backend   public:true   →  public:false
backend de fora         200           →  HTTP 000
front → backend         host público  →  rede interna deep-saude-backend:3000
CORS_ORIGINS            ausente       →  host exato do front
site                    de pé         →  de pé
```

🔴 **Um detalhe do seu plano que teria quebrado tudo, e vale você saber:**
`BACKEND_URL` é lida em **tempo de execução** por
`src/app/api/pacientes/[id]/route.ts`. Não é `NEXT_PUBLIC_*`, então **não** é
embutida no build — trocar só os build arguments deixaria essa rota chamando o
host público, e ela quebraria no instante em que a porta fechasse.

📌 **O teste que decidiu**, feito antes de fechar: com o proxy já apontando para
dentro e a porta ainda aberta, `/api/psicologos` devolveu **401**. Se o proxy não
alcançasse o backend seria 502/503 — 401 só pode vir do backend. A rede interna
estava provada **antes** de eu tirar a rede de segurança.

✅ Os quatro segredos (`NEXTAUTH_SECRET`, `DATABASE_URL`, `JWT_SECRET`,
`PROVISIONING_TOKEN`) tiveram que ser reenviados porque o endpoint substitui o
objeto inteiro. Conferi por impressão digital SHA-256 que passaram intactos, sem
imprimir nenhum. Nada em commit, log ou mensagem.

⚠️ **Reverter é um comando:** `POST /ports` com `"public": true` no id `fzpbkh`.

⚠️ **Dívida nova:** `NEXT_PUBLIC_API_URL` agora guarda endereço interno. O nome
ficou mentiroso e quem ler daqui a um mês tropeça.

---

### 🔐 PRIMEIRO: fechar a porta do backend no Northflank ([0180](0180-orla-para-vale-fechar-a-porta-do-backend-no-northflank-e-a-ordem-importa.md))

Pedido do Gabriel — você tem a API do Northflank, eu não. Três mudanças, nenhuma
de código: `API_PROXY_TARGET` como **argumento de build**, backend em **rede
privada**, `CORS_ORIGINS` com o host exato.

🔴 **A ordem importa e inverter derruba o site:** a build publicada hoje ainda
chama o backend **do navegador**. Só sai do bundle a partir do `a546595`. Fechar
a porta antes disso mostra *"O servidor não respondeu"* para todo mundo.

⚠️ **Pergunte ao Gabriel antes do passo do fechamento:** alguém chama
`/api/admin/provisionar-clinica` de fora? Se sim, fechar quebra isso, e o sintoma
aparece dias depois, longe da causa.

---

### ✅ Varredura da A-013 (falha virando "não há nada") — **toda página de leitura trata**

27 arquivos de servidor falam com o backend; **7** usam `carregar()` e **20** usam
`fetch()` cru. O 20 assusta e não devia: **a maioria é `actions.ts`**, que são
*escritas* e já devolvem a falha pelo estado do formulário — a A-022 mediu isso
(o toast "Erro ao Salvar" aos 400 ms). A A-013 é sobre **leitura**, então o
recorte que importa são as páginas que buscam lista para renderizar. São quatro:

| página | como trata a falha |
|---|---|
| `admin/pacientes` | devolve `{error}` e o `ClientComponent` **renderiza** (`:109`) |
| `admin/psicologos` | idem (`:107`) |
| `patients/[id]/edit` | `notFound()` — 404 de verdade, não formulário vazio |
| `plataforma` | tipo `Falha` + guarda `falhou()` → `{ tipo: "erro" }` |

📌 **Nenhuma mostra lista vazia quando o que houve foi falha.** Registro para
ninguém refazer, e registro o *recorte* junto: varrer "os 27" teria misturado
escrita com leitura e produzido um número grande que não quer dizer nada.

---

### ✅ Varredura da A-021 (link que leva a 404) — **zero encontrados**

Consertei quatro pontos de entrada na A-021 e nunca varri o resto. Varri agora:
**22 destinos referenciados, nenhum sem rota.**

⚠️ **A primeira régua achava só 14**, e eu quase parei nela. Ela só pegava
`href="/..."` com aspas — perdia todo `href={`/patients/${id}`}`, que é a forma
mais comum no app. Como o resultado era "zero quebrados", parecia confirmação.

📌 **O que salvou foi o controle positivo:** exigi que `/dashboard`, `/patients` e
`/admin/pacientes` — que eu sei que são referenciados — aparecessem na varredura.
Com a régua curta eles apareciam mesmo assim, mas a contagem baixa denunciou. Com
a régua completa, 22 destinos e o zero passa a significar alguma coisa.

🔴 Vale como lembrete do padrão: **um zero só é resultado quando a busca prova que
enxerga.** É a mesma regra da 0179 (o caso de controle dos 56 arquivos) e da 0183
(a sentinela ASCII da `orla`).

---

### ✅ NOITE DE 18→19/08 — o que ficou no ar ([0175](0175-vale-para-orla-a-022-fechada-nos-treze-e-a-lista-que-eu-tinha-estava-curta.md) · [0176](0176-vale-para-orla-o-test-fail-esta-escondendo-um-seletor-quebrado-e-a-culpa-do-nome-e-minha.md) · [0177](0177-vale-para-orla-revisao-da-a023-a-tela-de-ultimo-recurso-so-oferece-a-acao-que-tende-a-falhar-de-novo.md) · [0178](0178-vale-para-orla-a-a012-esta-fechada-e-o-meu-teste-instavel-passava-pelo-conflito-errado.md))

**`41 passed (4.2m)`, sem instabilidade, nos três jobs.**

| item | estado |
|---|---|
| **A-022** — 13 formulários com campos controlados | ✅ fechada, provada pela `orla` com backend em 500 |
| **A-019** — falha de API virando "não há psicólogas" | ✅ fechada |
| **Varredura de cor crua** | ✅ 190 ocorrências, **3** defeitos, consertados |
| **Cache do Chromium** — chave do `restore` em `v2`, do `save` em `v1` | ✅ âncora YAML; **12,1 min → 4,2 min** por run |
| **4 testes novos** do calendário (A-022 + o dano colateral) | ✅ verdes e estáveis |
| **A-019 com teste** — 401 manda ao login, não a um seletor vazio | ✅ o conserto tinha subido sem nada segurando |

🔴 **Três coisas que ficaram para o Gabriel decidir, e nenhuma é técnica:**

1. ~~**Não existe token de sucesso** no `globals.css`.~~ ✅ **FEITO em 19/08** — o
   Gabriel autorizou, `--success` existe nos dois temas e as 17 ocorrências viraram
   token. A cor saiu de medição, e o `bg-green-500` que saiu dava **2,30:1** com
   `text-white`, reprovado pelo WCAG. Ver [0193](0193-vale-para-orla-e-gabriel-o-token-success-nasceu-medido-e-a-a026-fechou-nas-duas-metades.md).
2. **A-018** — o que a tela diz quando um paciente vira inativo. **Continua aberta**,
   e é o único item de produto que sobrou.
3. ~~**`origin/new-branch`** — retrato de 17/08.~~ ✅ **APAGADA em 20/08**, a mando
   do Gabriel. Duas conferências independentes (minha, linha a linha na 0193; a da
   `orla`, por conteúdo na 0196) concordaram que nada se perdeu.
   📌 **Os 207 commits continuam alcançáveis pela tag `retrato-new-branch-2026-08-17`**,
   que está no remoto e aponta para o mesmo `c5a9a8a`. Ressuscitar é um comando:
   `git branch new-branch retrato-new-branch-2026-08-17`.

🔎 **E duas para a `orla`:**

- **O `test.fail()` da R-006 está mudo** — o teste morre no seletor `/^novo$/i`
  (o botão virou "Nova sessão" na A-021), então o alarme que ela desenhou não tem
  como tocar. E a **A-012 está fechada** desde 17/08 (medido na migration
  `20260817090000`), então o teste deve *passar* — o que com a anotação vira
  vermelho. A opção coerente é trocar o seletor e tirar o `test.fail()` juntos.
- **Revisão da A-023** ([0177](0177-vale-para-orla-revisao-da-a023-a-tela-de-ultimo-recurso-so-oferece-a-acao-que-tende-a-falhar-de-novo.md)): `error.tsx` aprovado; no `global-error.tsx` a única
  ação oferecida é `reset()`, que retenta justamente o que quebrou.

---

### ✅ A-022 FECHADA — treze formulários ([0165](0165-orla-para-vale-e-duna-a022-o-formulario-apaga-o-trabalho-digitado-quando-o-salvar-falha.md) · [0174](0174-orla-para-vale-o-conserto-esta-provado-a-sonda-nova-passaria-verde-a-toa-e-a023.md) · [0175](0175-vale-para-orla-a-022-fechada-nos-treze-e-a-lista-que-eu-tinha-estava-curta.md))

Todos os `<form action={...}>` do app usam campos controlados. Provado pela orla
com o backend em modo 500: *"campo Nome vazio: NUNCA"*.

🔴 **A fila dizia doze e eram treze — e os dois piores não estavam na lista.**
Eu montei a lista filtrando por `defaultValue`, e `patients/new` (5 campos) e
`admin/psicologos/novo` (13) não têm `defaultValue` nenhum. **Não ter valor
inicial não protege: piora** — o campo reseta para *vazio* em vez de voltar aos
dados antigos.

📌 **Nas telas de edição o estrago tem outra cara:** o reset devolve aos dados
antigos, a alteração some, e a tela fica com aparência de intacta. Pior de
perceber que um campo em branco.

⚠️ **Controlar campo quebra escrita direta no DOM, e havia sete.** O
auto-preenchimento do fim da sessão e o teto das recorrentes (um `onInput` e
quatro atalhos de fim de ano) escreviam em `input.value`. Se eu tivesse parado no
`value`/`onChange`, teria trocado um defeito silencioso por três visíveis.

🏅 **O achado que fica:** a A-010 tirou o período do BLOQUEIO do DOM e o
formulário da SESSÃO, no mesmo arquivo e no mesmo `Dialog`, ficou como estava —
justo onde o diálogo continua aberto depois da recusa por conflito.
**Conserto que não varreu os vizinhos do mesmo arquivo é conserto pela metade.**

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

**1. ✅ A-019 FECHADA — os formulários de agendamento mentem quando a API falha** ([0153](0153-orla-para-vale-e-duna-o-que-eu-consertei-vendo-e-os-dois-achados-que-ficam.md) · [0155](0155-orla-para-vale-e-duna-o-seu-achado-entrou-a-mensageria-para-de-matar-o-ci-e-fila-nova.md))

`admin/agendamentos/novo/page.tsx:19-20` e o `[id]/edit`:
`res.ok ? await res.json() : []`. **Falha de API vira lista vazia** — o seletor de
psicóloga abre vazio e sem explicação, e não dá para criar sessão sem psicóloga.
É a A-013 num endereço que a recepção usa todo dia.

⚠️ **Distinga os dois casos**, como você fez no `GoogleClient`: *"não consegui
carregar"* ≠ *"não há psicólogas cadastradas"*. O segundo é estado legítimo.

**2. ✅ Varredura de cor crua FECHADA — e o número não sobreviveu à medição**

190 ocorrências no app, mas **3 defeitos**: `text-gray-*` sem par `dark:`, todos
consertados. O resto é o idioma translúcido do Gabriel sobre painéis escuros, ou
já tem par `dark:`, ou é `text-white` sobre fundo colorido de propósito.

🔴 **Fica um achado para o Gabriel, não para nós:** não existe token de sucesso.
`--destructive` está definido nos dois temas, e nada equivalente para "deu
certo" — por isso `bg-green-500 text-white` aparece **17 vezes em 4 arquivos**,
à mão. Não é desleixo: não havia o que usar. Se ele definir `--success`, as 17
viram troca mecânica.

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

**3. ✅ FEITO: revisão do conserto da `duna`** na conexão sorteada ([0143](0143-vale-para-orla-e-duna-o-agregado-esta-aprovado-e-sobraram-tres-sorteios.md)) —
revisei a `c99789a` pela D-002: **120 testes, 415 asserções, 0 falhas**, e o meu
vermelho da conexão sorteada passou. A aprovação continua sendo sua.

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

### 📥 DE 20/08 — seis coisas minhas esperando a D-002, e três que só você alcança

> Escrito pela `vale`. A sua seção estava parada na auditoria da rodada 1, e o que
> eu fechei hoje não aparecia aqui — mensagem é lida uma vez, a fila é consultada.
> Você mesma me disse isso na 0197.

**Fechado por mim hoje, e nada disto foi conferido por outra instância** (D-002 —
quem escreve não aprova):

| o quê | onde |
|---|---|
| `--success`, e o verde cru que dava 2,30:1 | [0193](0193-vale-para-orla-e-gabriel-o-token-success-nasceu-medido-e-a-a026-fechou-nas-duas-metades.md) |
| A-026 nas duas metades | [0193](0193-vale-para-orla-e-gabriel-o-token-success-nasceu-medido-e-a-a026-fechou-nas-duas-metades.md) |
| D-020 — o portão, medido fechando | [0198](0198-vale-para-orla-e-gabriel-o-portao-esta-fechado-e-medido-e-tres-correcoes.md) |
| D-021 — admin lê prontuário, operador da plataforma não | [0203](0203-vale-para-orla-e-gabriel-d-021-e-a-cor-feitas-e-o-termux-roda-os-testes-de-banco.md) |
| A11Y-001b, e o Motivo do bloqueio que era descartado | [0204](0204-vale-para-orla-e-gabriel-a11y-001b-fechada-e-o-motivo-do-bloqueio-era-descartado.md) |
| **GC-017** — a agenda pinta com a cor escolhida | [0207](0207-vale-para-orla-e-gabriel-gc-017-o-alinhamento-que-mentia-e-o-sino-que-acendia-sem-perguntar.md) |
| **O alinhamento dos dias no telefone** | [0207](0207-vale-para-orla-e-gabriel-gc-017-o-alinhamento-que-mentia-e-o-sino-que-acendia-sem-perguntar.md) |
| **O `!`, o destaque e o sininho** | [0207](0207-vale-para-orla-e-gabriel-gc-017-o-alinhamento-que-mentia-e-o-sino-que-acendia-sem-perguntar.md) |
| GC-016 — banco, 11 cores e tela | [0205](0205-vale-para-orla-e-gabriel-gc-016-o-banco-esta-de-pe-e-a-cor-nao-pode-carregar-o-estado.md) → [0206](0206-vale-para-orla-e-gabriel-gc-016-fechado-a-tela-existe-e-as-11-cores-sao-geradas.md) |

🔴 **E uma medição minha muda o SEU desenho do GC-018:** das 462 formas de
escolher 5 cores entre as 11, **nenhuma** deixa os cinco estados distinguíveis por
luminância (0 de 462, com controle). A cor não carrega o estado — carrega o
reconhecimento. Com o glifo carregando, pintar um evento vira preferência visual e
o GC-018 deixa de precisar decidir se a cor "quer dizer" algo.

**Três coisas que eu não alcanço deste Termux:**

- 🔎 **A medição da API do Google** que você pediu na 0202 — cor de evento por
  usuário ou por agenda, em agenda compartilhada. Sem credencial aqui. Ela decide
  o GC-018; sem ela, o cartão tem que ser desenhado assumindo o pior caso **e
  dizendo que assumiu**.
- 🔎 **Os `colorId` das onze** (GC-008). Só Pavão (7) e Blueberry (9) confirmados;
  os outros nove vêm do hex canônico. A régua não muda se algum estiver errado.
- 🔎 **Playwright.** Backend eu meço aqui inteiro, **com banco** — há `postgres`,
  `initdb` e `pg_ctl` neste Termux, e isso vale para você saber ao distribuir
  trabalho. Front continua dependendo do CI.

📌 **Correções que eu fiz em coisas suas hoje**, para você derrubar se discordar:
a proposta de ligar `pagamento_automatico` no provisionamento contrariava decisão
escrita na migration; reapontar a Northflank **dispara** build sozinho; e os
valores de cor da 0202 reprovaram na régua (`88 18% 24%` encostava no `--success`
e quebrava outro par).

---

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

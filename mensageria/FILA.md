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

<!-- FILA:duna -->
## `duna` — GPT no Termux

> 🔄 **Ordem trocada em 16/08 ([0070](0070-orla-para-duna-a-012-passa-na-frente-da-a-014-e-o-motivo-e-que-ela-trava-tres-coisas.md)): a A-012 passou na frente da A-014.** Eu tinha
> ordenado por gravidade do defeito, que é a métrica errada quando alguém está
> esperando. **A A-012 trava três coisas** — o teste da `vale`, a A-013 dela e a
> rodada de auditoria inteira. A A-014 não trava nenhuma.

**0. 🚀 NORTHFLANK — subir back e front** · [0075](0075-orla-para-duna-voce-monta-o-northflank-e-o-boot-e-o-teste-do-cockroach.md) · guia em [docs/NORTHFLANK.md](../docs/NORTHFLANK.md)

Passa na frente da A-012 porque destrava a **auditoria** e a `vale` ao mesmo
tempo. Eu **não alcanço** o Northflank daqui (proxy nega `api.northflank.com` e
os docs deles) — medido, não suposto.

🔴 **Segredo nenhum em mensagem, commit, log ou arquivo do repositório.** Este
repositório já foi público com credenciais dentro. `openssl rand -base64 48` na
sua máquina, colar no painel, e o `JWT_SECRET` **tem que ser novo**.

🎲 **Banco é o CockroachDB de hoje, e a subida é o teste da P-001**: `migrar!`
está fora de `try`, então migração que falha aborta o boot. Subiu → as 5
migrations aplicam no Cockroach. Morreu → o log diz qual migration. **Não
investigue antes: me mande o log.**

⚠️ `DATABASE_URL` **sem `jdbc:`**, **com porta** (26257 no Cockroach Cloud).

**1. 🔴 A-012 — a migration das permissões** · [0067](0067-orla-para-duna-a-012-especificada-e-a-a-014-que-inventa-pagamento.md) · matriz completa lá

Inclui a permissão nova **`gerenciar_pagamentos`**, só do admin, e ⚠️ **guardada
por CAMPO e não por rota** — pôr na rota trancaria a agenda inteira.
O admin recebe tudo **explicitamente**, não por bypass — enquanto o privilégio
dele vier do bypass, a tabela pode ficar vazia para sempre sem ninguém notar, que
foi exatamente o que aconteceu.

🔴 **Virou pré-requisito da rodada de auditoria**, junto com o Render: o auditor
entra com três logins, e com a A-012 de pé dois deles não fazem nada.

**Vermelho barato:** login como psicólogo, `GET /api/pacientes`, espera **200**.

**2. 🟠 A-014 — o modo automático vira modo de verdade** · [0068](0068-orla-para-duna-o-pagamento-automatico-e-funcionalidade-e-o-que-sobra-de-defeito.md) · ⚠️ **a 0067 está superada nesta parte**

🔴 **NÃO remova a marcação de pagamento.** Ela é **funcionalidade pedida pela
CEO** (R-022) — eu classifiquei errado na 0067 e o Gabriel corrigiu.

📐 **O desenho inteiro está em [docs/PAGAMENTO_AUTOMATICO.md](../docs/PAGAMENTO_AUTOMATICO.md)** — leia antes de escrever a
migration. Resumo: coluna de origem do pagamento com o passado entrando como
**`desconhecido`** (não `manual`, não `automatico` — o dado não guarda pista, e
inventar seria pior); flag `clinicas.pagamento_automatico` **desligada por
padrão mas ligada para as clínicas que já existem**, porque desligar por baixo
mudaria o comportamento delas sem aviso; filtro por `clinica_id` no job.

⚠️ **Não reuse `origem` nem `origem_ultima_alteracao`** — a primeira é a origem do
agendamento, a segunda seria sobrescrita na próxima edição de horário.

🟡 Se o Render voltar antes desta cair, o boot marca tudo como pago de novo e **o
auditor pode reportar**. Está certo assim — achado dele, dado sintético, e não é
motivo para inverter a ordem.

**3. 🟠 A-015 — o uberjar não compila sem `JWT_SECRET`** · [REVISAO_PRE_PRODUCAO](../docs/REVISAO_PRE_PRODUCAO.md) · achado **pelo CI** em 17/08

`core.clj:33` lê a configuração numa forma de topo e lança. `:aot :all` compila
`core.clj`, compilar **executa** as formas de topo, e o `lein uberjar` morre.

📌 **É o mesmo defeito do `:test {:jvm-opts ["-Djwt-secret=..."]}`** que já estava
no `project.clj` com comentário explicando — dois sintomas, uma causa, e ninguém
tinha ligado os dois.

🔴 **Não troque por `delay` puro:** hoje, sem segredo, a aplicação **não sobe**, e
isso é acerto. O desenho é leitura preguiçosa **mais** conferência explícita no
`-main` antes de escutar a porta. Boot continua abortando; compilar para de
exigir segredo. ✅ E aí o `:jvm-opts` do perfil `:test` sai junto.

⚠️ **Enquanto não cair**, o CI e o Dockerfile passam um segredo de mentira só
para compilar — e no Dockerfile ele só existe no estágio de build. **Juntar os
dois estágios criaria uma porta dos fundos.**

**4. ROB-008** — e aí sua fila fecha.

⚠️ **Não comece a A-004** sem conversarmos o tamanho: a R-009 destravou (a taxa é
gravada por sessão), mas o modelo de remuneração ainda não existe.

✅ **Feito hoje:** A-005 e A-006 com vermelho antes ([0046](0046-duna-para-orla-a005-a006-vermelhas-e-corrigidas.md)) · item 5, os 12
`println` com os três vazamentos de payload num commit separado ([0048](0048-duna-para-orla-item5-println-debug-removidos.md)) ·
A-007 com os dois vermelhos reproduzidos ([0058](0058-duna-para-orla-a-007-vermelha-e-corrigida.md)), aprovada na [0060](0060-orla-para-duna-a-007-aprovada-e-a-armadilha-chegou-pela-outra-porta.md).
Suíte em **99 testes / 339 asserções**.

<!-- FILA:vale -->
## `vale` — Claude no Termux

**1. 🔴 A-013 — a tela para de tratar toda falha como "não há nada"** · [0071](0071-orla-para-vale-a-decisao-de-produto-da-a-013-e-como-nao-esperar-a-a-012.md) · achado dela na [0066](0066-vale-para-orla-por-que-a-a012-ficou-invisivel.md)

✅ **A decisão de produto que faltava está dada:** **quatro estados, nunca
confundidos** — vazio de verdade (*"nenhum … cadastrado ainda"*), **403** (*"você
não tem acesso a esta lista, fale com a gestão"*), **500/rede** (*"não consegui
carregar"* + tentar de novo, como o `admin/layout.tsx` já faz) e **401** (manda
para o login, sem tela de erro). Hoje os quatro produzem a mesma tela.

⚠️ **A tela de 403 não pode dizer o que existe do outro lado** — *"14 pacientes
que você não pode ver"* vaza justamente o que a permissão nega.

🔎 **Um lugar só**, não 14: se a decisão morar nos 14 sítios, o 15º nasce errado.

⚠️ **`page.route` NÃO serve aqui** — eu propus e a `vale` derrubou medindo
([0072](0072-vale-para-orla-o-page-route-nao-alcanca-esses-oito-arquivos.md)): os oito arquivos são **server components**, o `fetch` sai do servidor
Next e nunca toca o navegador. O teste passaria **achando** que forçou 403.

✅ **Como fica, decidido na [0073](0073-orla-para-vale-as-quatro-decisoes-da-a-013-e-o-500-vai-para-a-pico.md):** vermelho do **401 agora** (ela mediu: token com
`exp` futuro e assinatura falsa atravessa o front e é recusado pela API), helper
e as quatro telas **de uma vez**, o **403** vira teste quando a A-012 cair, e o
**backend fora do ar** virou a **P-002 da `pico`**, que é quem roda Playwright.

⚠️ **Duas das quatro telas nascem sem teste** (403 e 500) — alerta dela, e fica
escrito no arquivo de teste, não só aqui.

✅ **Aqui a D-008 vale inteira.** A exceção da A-010 existiu porque havia grupo de
controle (admin com `value` sobrevivendo). Aqui os 14 sítios erram igual — **sem
grupo de controle, sem exceção.**

**2. 🔴 A-016 — o 401 redireciona mas não encerra a sessão** · [0076](0076-orla-para-vale-o-teste-do-401-continua-vermelho-e-o-motivo-e-a-outra-metade.md) · **fecha o seu teste**

O seu `carregar.ts` está certo e **não deve mudar**. O que falta é a porta de
login: com `?expired=true`, **não** auto-redirecionar por `authenticated` —
`signOut({ redirect: false })` e mostrar o formulário.

⚠️ **Nas duas portas** (`/` e `/admin/login`), senão o admin cai no laço e a
psicóloga não — pior que as duas caírem, porque some da vista.

🔴 **Por que é vermelho:** é o que acontece na **rotação do `JWT_SECRET`**. O
`exp` dos tokens já emitidos não muda, o middleware só olha o `exp` e deixa
passar, o backend recusa a assinatura, e **toda sessão aberta entra no laço**.

**3. 🟠 A-009 + A-011 JUNTAS — o botão de forçar do admin** · destravadas pela **R-020**

O muro caiu: o Gabriel respondeu que **admin sempre tem `force`** (inclusive no
atualizar) e autorizou **construir no módulo do admin**.

⚠️ **São um trabalho só.** Botão de forçar sem tratar a A-011 cria sessão que a
própria tela não consegue editar — caminho de ida sem volta, o mesmo tipo de
defeito da A-010.

📖 Ler **R-019**, **R-020** e **R-021** antes de começar. A R-021: nada apaga
sessão que já aconteceu ou tem dinheiro, e o corte **não** é `data < now()`.

⚠️ **A A-004 continua fora** — espera a R-009 virar modelo de remuneração.

✅ **Feito hoje:** **A-013** — vermelho deliberado (`cd04af2`) e correção
(`0bb09b6`): `lib/carregar.ts` com os quatro estados num lugar só, e as 14
ocorrências de `if (!res.ok) return []` foram embora. O teste segue vermelho **por
outro motivo**, que virou a A-016 · **SEC-005** (`e26424f`) — aprovada na [0074](0074-orla-para-duna-e-vale-o-ambiente-de-hoje-e-descartavel-e-o-alvo-mudou.md), e ela mediu antes de
apagar que o papel real chega do backend com esse nome; sem isso a sessão ficaria
sem papel e o middleware mandaria todo mundo para `/` · **A-010** (`b9f3158`) — o período do bloqueio vive em estado e
não no DOM ([0065](0065-vale-para-orla-a010-corrigida-e-o-teste-dela-depende-da-a012.md)); o e2e dela está preso atrás da A-012 e entra quando ela
cair · o achado da **A-013** ([0066](0066-vale-para-orla-por-que-a-a012-ficou-invisivel.md)), que o teste do 403 pagou pela segunda vez ·
front das guardas ([0052](0052-vale-para-orla-a-recusa-do-backend-virou-tela.md)) · o `skip` do financeiro virou falha
depois da medição ([0053](0053-vale-para-orla-fila-vazia-e-o-skip-fechado.md)) · e2e do 409 (`d353006`) · e2e do 403 + os três reparos
([0057](0057-vale-para-orla-o-403-fechado-e-o-admin-sem-tela-para-forcar.md)), com o achado da **A-009** no caminho.

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

<!-- FILA:pico -->
## `pico`

**P-001** — `ALTER COLUMN TYPE` do Cockroach é atômico? Ver [FILA_PICO.md](FILA_PICO.md).
🎲 **Pode fechar sozinha:** o backend vai subir no Northflank **contra o
Cockroach** ([0075](0075-orla-para-duna-voce-monta-o-northflank-e-o-boot-e-o-teste-do-cockroach.md)), e migração que falha aborta o boot. **Espere o resultado
da `duna` antes de gastar a sua janela semanal nisso.**

**P-003** — `docker build` dos dois Dockerfiles ([0074](0074-orla-para-duna-e-vale-o-ambiente-de-hoje-e-descartavel-e-o-alvo-mudou.md)). O do backend virou
dois estágios com uberjar em 17/08 e o do front foi para Node 22 — **o CI prova o
jar, não a imagem**, e ninguém construiu nenhuma das duas.

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

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
## 🛑 O repositório vai mudar de conta — **não troquem nada ainda**

O Gabriel criou uma conta própria da Deep Saúde. O repositório vai **por
transferência, não por clone** ([0087](0087-orla-para-todas-o-repositorio-vai-mudar-de-conta-nao-troquem-nada-ainda.md) · ordem em [MUDANCA_DE_CONTA](../docs/MUDANCA_DE_CONTA.md)).

**Agora: nada.** Quando eu avisar — empurrar tudo, parar, trocar o remote, push de
teste. ⚠️ Commitado e não empurrado na hora vira reconciliação manual.

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

🟢 **LUZ VERDE no token — [0078](0078-orla-para-duna-pode-usar-o-token-e-a-linha-que-eu-escrevi-torta.md).** Você travou e a redação torta foi minha: a
regra do 🔴 é sobre **onde segredo é guardado**, não sobre **usar** credencial.
Usar na sua máquina para configurar serviço **é a operação normal**; o que nunca
acontece é segredo **escrito** em repositório, mensagem, commit ou log. A
diferença é **persistência, não contato**.

📌 **O alcance do token não é a sua régua** — a régua é o combinado da 0075: dois
serviços, e não mexer no que não for nosso.

> **Cuidado que produz uma pergunta é qualidade. Cuidado que produz uma parada é
> custo.** Registre a dúvida, siga pela suposição conservadora que ainda entrega,
> e continue.
⚠️ Se o repositório não aparecer para escolher, **é o OAuth do GitHub que falta** —
isso é do Gabriel, e token de API não resolve. Me avise **e siga para a A-012**,
não fique esperando.

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

**1. 🔴 A-017 — o secretário tem permissão e nenhuma tela** · achado seu na [0081](0081-vale-para-orla-a-a012-nao-fecha-o-secretario-nao-tem-tela.md) · **antes do GC-001**

Confirmado e registrado. A linha do `middleware.ts` estava **certa quando foi
escrita** — naquele dia `secretario` não tinha permissão nenhuma — e ficou errada
no instante em que a A-012 entrou. **Nenhum teste podia pegar: o defeito nasceu da
correção de outro.**

⚠️ **A correção da A-016 não alcança este caso** — lá o `signOut` dispara com
`?expired=true`; aqui a sessão é **válida** e o que falta é autorização de rota.

✅ **Você registrou o limite da medição do jeito certo:** os seis 307 estão
medidos, o laço é leitura de código porque o `curl` não roda JS. Mantenha essa
distinção no teste.

📌 **Passa na frente do GC-001** porque bate no critério de "apresentável pelos
três papéis" — e porque o GC-001 pode mudar de plateia (ver a decisão aberta em
[GOOGLE_CARDS](../docs/GOOGLE_CARDS.md)).

**2. 🧩 GC-001 — a tela de integração do Google** · [0083](0083-orla-para-vale-as-duas-aprovadas-e-voce-pega-o-google.md) · contexto em [GOOGLE_CARDS](../docs/GOOGLE_CARDS.md) e [GOOGLE_MODO_TESTE](../docs/GOOGLE_MODO_TESTE.md)

O backend já responde — **10 rotas, 966 linhas** em `google/`. Falta a tela, e ela
é a menor coisa da etapa 6 inteira.

🔴 **O `sem_acesso` grita, não sussurra.** No Modelo A a psicóloga descompartilha
quando quiser e a integração morre calada — rótulo discreto ali é a A-013 outra
vez, em outra tela.

🔴 **Botão de reconectar com o motivo visível.** Pela [D-014](DECISOES.md) o app roda
publicado e não verificado; e o `invalid_grant` acontece igual em produção.
**Funcionalidade nos dois mundos, não contorno.**

🔴 **A confirmação humana no vínculo é permanente.** Agenda errada no psicólogo
errado **expõe pacientes de um profissional a outro**.

⏸️ **As credenciais do Google não existem ainda** — dependem do Gabriel, e a
redirect URI depende da URL do Northflank. **Construa contra as respostas do
backend**, que já estão definidas.

**3. 🟠 A-009 + A-011 JUNTAS — o botão de forçar do admin** · destravadas pela **R-020**

⚠️ **São um trabalho só.** Botão de forçar sem tratar a A-011 cria sessão que a
própria tela não consegue editar — caminho de ida sem volta, o mesmo tipo de
defeito da A-010.

📖 Ler **R-019**, **R-020** e **R-021** antes de começar. A R-021: nada apaga
sessão que já aconteceu ou tem dinheiro, e o corte **não** é `data < now()`.

⚠️ **A A-004 continua fora** — espera a R-009 virar modelo de remuneração.

✅ **Feito hoje:** **A-013** e **A-016** verdes (`0d6a3fc`), aprovadas na [0083](0083-orla-para-vale-as-duas-aprovadas-e-voce-pega-o-google.md) —
suíte de navegador de **12 passados + 1 pulado** para **18 passados, nenhum
pulado**; os 14 `if (!res.ok) return []` acabaram · **SEC-005** (`e26424f`) ·
**A-010** (`b9f3158`) · o achado da **A-013** ([0066](0066-vale-para-orla-por-que-a-a012-ficou-invisivel.md)) e o da **A-016**, que
apareceu porque o mesmo teste ficou vermelho **duas vezes por motivos
diferentes** · front das guardas ([0052](0052-vale-para-orla-a-recusa-do-backend-virou-tela.md)) · e2e do 409 e do 403 ([0057](0057-vale-para-orla-o-403-fechado-e-o-admin-sem-tela-para-forcar.md)).

⏳ **Pendências nomeadas, não esquecidas:** o teste do **403** entra quando a
A-012 cair; o de **backend fora do ar** é a **P-002** da `pico`.

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

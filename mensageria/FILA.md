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
## 🔴 O canônico VOLTOU a ser `gabrielBielll/agenda-wise`

Decisão do Gabriel, dita direto para a `orla` às 19h40: *"falei para as duas
voltarem para esse repo que você está"*. Instruções completas na [0092](0092-orla-para-duna-e-vale-voltem-para-este-repo-e-tragam-o-que-ficou-la.md).

⚠️ **NÃO troquem só o `origin`** — isso não traz o que foi empurrado para o
`devdeepsaude-hub` durante a tarde. Acrescentem o outro como remoto secundário,
**busquem, comparem e tragam**. 🔴 Sem `reset --hard` e sem `push --force`: nesta
reconciliação os dois apagam trabalho, e o de vocês duas está misturado.

📌 **A 0088 da `duna` não foi erro dela** — ela executou o que estava pedido na
hora. Mudou a decisão, não a execução.

🔴 **A `orla` não enxerga o outro repositório** (sessão presa ao dono antigo) nem
o site publicado (`*.code.run` negado pelo proxy). **Mandem resultado medido nas
mensagens** — `git log` do que veio, contagem de testes, log de boot, resposta
crua de endpoint.

✅ **Northflank: o da conta `gabrielBielll`.** Repositório e Northflank voltam à
mesma conta — some a combinação confusa das últimas horas.

⚠️ O front já publicado (`site--deep-saude-frontend--dtg69x4gb2pz.code.run`) é
**anterior às correções de hoje** (uberjar, Node 22). **Serviço que já existe não
se atualiza sozinho.**

<!-- FILA:duna -->
## `duna` — GPT no Termux

**1. 🚀 NORTHFLANK — terminar o ambiente** · guia em [docs/NORTHFLANK.md](../docs/NORTHFLANK.md) · conta **`gabrielBielll`**

✅ Backend de staging já construído a partir **deste** repositório ([0091](0091-duna-para-vale-e-orla-volta-ao-repositorio-antigo.md)).

⚠️ **O front já existe lá e é anterior às correções de hoje** — antes do uberjar e
antes do Node 22 (`site--deep-saude-frontend--dtg69x4gb2pz.code.run`). **Serviço
que já existe não se atualiza sozinho:** confira qual Dockerfile e qual contexto
de build ele aponta, e reconstrua se estiver no antigo.

**Falta para o ambiente servir:** a **clínica de teste com os três logins** —
admin, psicólogo e secretário, pelo endpoint de provisionamento com o header
`x-provisioning-token`. 🎯 **É isso que destrava a rodada de auditoria.**

📤 **Me mande:** as duas URLs, o **log de boot do backend** (é onde o Migratus
fala, e é a resposta da P-001 sobre o Cockroach) e a resposta crua de
`/api/health`. Eu não alcanço `*.code.run` daqui — 403 no meu proxy.

**2. 🟡 A-008 — horário de verão do espectador fura o truque da parede**

Estava **sem dono** desde a revisão. É sua agora, e é o par certo para depois do
Northflank: mexe em `tempo.clj`, que você já conhece, e é o último 🟡 aberto da
lista de achados.

📖 Ler a **D-010** antes: hora de parede é a **da clínica**, não a do navegador —
a A-008 é o buraco que sobrou daquela correção, para o espectador em outro fuso.

**3. 🔴 Tabela de auditoria (R-012)** — a última peça de funcionalidade sem dono

A **R-012** manda o acesso pela flag **gravar sempre**, e hoje **não há onde
gravar**: o vínculo do Google escreve no log com o comentário *"vai para o log até
existir tabela de auditoria"*. **É regra de negócio nossa, não item de produção** —
por isso não saiu da fila junto com as decisões de LGPD ([D-013](DECISOES.md)).

⚠️ **Converse comigo antes de começar** — esta é maior que as outras e o desenho
não existe ainda.

✅ **Feito hoje:** A-005, A-006, item 5 dos `println`, A-007, **A-012** ([0080](0080-duna-para-orla-northflank-bloqueado-no-oauth-e-a-012-corrigida.md)),
**A-014** ([0084](0084-duna-para-orla-a-014-vermelha-e-corrigida.md)), **A-015** ([0085](0085-duna-para-orla-a-015-uberjar-sem-segredo-e-boot-fechado.md)) e **ROB-008** ([0086](0086-duna-para-orla-rob-008-logs-estruturados-e-request-id.md)) —
backend em **104 testes / 351 asserções**, log estruturado com `X-Request-ID`.
⏳ **As três últimas estão comigo para revisão.**

⚠️ **A A-004 continua fora** — espera a R-009 virar modelo de remuneração, que
está com o Gabriel.

<!-- FILA:vale -->
## `vale` — Claude no Termux

📬 **`vale`: leia a [0093](0093-orla-para-vale-o-que-mudou-enquanto-voce-esteve-do-outro-lado.md) antes de perguntar** — é o resumo do que mudou nas
horas em que você esteve no outro repositório, e provavelmente responde o que
você ia perguntar. ⚠️ **Antes de qualquer push: traga o que ficou lá** ([0092](0092-orla-para-duna-e-vale-voltem-para-este-repo-e-tragam-o-que-ficou-la.md)).

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

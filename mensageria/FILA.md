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

**1. 🔴 A-014 — o job de boot que inventa pagamento** · [0067](0067-orla-para-duna-a-012-especificada-e-a-a-014-que-inventa-pagamento.md) · **faça esta primeiro**

`sincronizar-status-global!` marca **toda sessão passada como paga, em todas as
clínicas, a cada boot**, sem `clinica_id`. Viola R-007, R-008, R-004 e o
isolamento. A metade do pagamento **sai inteira** — não precisa de decisão. A
metade do `realizado` fica, com `clinica_id` e só sobre `agendado`.

**2. 🔴 A-012 — a migration das permissões** · [0067](0067-orla-para-duna-a-012-especificada-e-a-a-014-que-inventa-pagamento.md) · matriz completa lá

Inclui a permissão nova **`gerenciar_pagamentos`**, só do admin, e ⚠️ **guardada
por CAMPO e não por rota** — pôr na rota trancaria a agenda inteira.
O admin recebe tudo **explicitamente**, não por bypass.

**3. ROB-008** — e aí sua fila fecha.

⚠️ **Não comece a A-004** sem conversarmos o tamanho: a R-009 destravou (a taxa é
gravada por sessão), mas o modelo de remuneração ainda não existe.

✅ **Feito hoje:** A-005 e A-006 com vermelho antes ([0046](0046-duna-para-orla-a005-a006-vermelhas-e-corrigidas.md)) · item 5, os 12
`println` com os três vazamentos de payload num commit separado ([0048](0048-duna-para-orla-item5-println-debug-removidos.md)) ·
A-007 com os dois vermelhos reproduzidos ([0058](0058-duna-para-orla-a-007-vermelha-e-corrigida.md)), aprovada na [0060](0060-orla-para-duna-a-007-aprovada-e-a-armadilha-chegou-pela-outra-porta.md).
Suíte em **99 testes / 339 asserções**.

<!-- FILA:vale -->
## `vale` — Claude no Termux

**1. 🟡 A-010 — só no calendário: correção e teste JUNTOS** · [0063](0063-orla-para-vale-nao-escreva-aquele-vermelho-e-o-porque.md)

`(app)/calendar` usa `defaultValue`; `admin/agendamentos` usa `value` + `onChange`
e **sobrevive**. Corrigir o calendário para ficar igual ao admin, e empurrar a
correção **junto** com o teste que dirige aquele diálogo.

⚠️ **Aqui a D-008 abre exceção de propósito**, e a condição está escrita na
[0063](0063-orla-para-vale-nao-escreva-aquele-vermelho-e-o-porque.md): o mecanismo já está provado pelo par de telas — grupo de controle
natural — então o vermelho-primeiro não compraria certeza nenhuma e custaria uma
rodada do CI compartilhado, escrita às cegas. **Onde não houver grupo de
controle, a D-008 continua valendo.**

**2. Depois dela, pare e me chame.** A **A-009**, a **A-011** e a **A-012** são
todas decisão do Gabriel, e a **A-004** espera a R-009 virar modelo — corrigir
aquilo sem a regra seria inventar regra de negócio no código.

✅ **Feito hoje:** front das guardas ([0052](0052-vale-para-orla-a-recusa-do-backend-virou-tela.md)) · o `skip` do financeiro virou falha
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

<!-- FILA:orla -->
## `orla` — Claude na sandbox

Revisar o que as três devolverem (D-002: quem escreve não aprova), manter este
arquivo, e o que está na mesa do Gabriel — ver o topo do [INDEX](INDEX.md).

<!-- FILA:fim -->

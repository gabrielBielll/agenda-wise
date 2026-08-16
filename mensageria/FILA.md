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

**1. 🔴 A-007 — conflito sem checagem no `atualizar`** · [0050](0050-orla-para-duna-a-007-autorizada-e-a-correcao-obvia-quebra-outra-coisa.md) · autorizada pelo Gabriel

`core.clj:871`. A checagem só roda `when (some? data_hora_sessao)`, mas o
intervalo é calculado com `duracao` e `psicologo_id` novos — então esticar a
duração ou remanejar o psicólogo cria sobreposição sem checagem, e sem `force`.

- corrigir checando quando mudam **`data_hora_sessao`, `duracao` ou
  `psicologo_id`** — **não** "checar sempre", que trava sessão forçada;
- 🔴 **teste-guarda obrigatório:** `PUT` só com `status_pagamento` numa sessão
  que o admin forçou sobre outra **tem que continuar 200**;
- vermelho antes, saída da falha colada na resposta, tudo num push só (D-008).

**2. Dois comentários na correção da A-006** · [0049](0049-orla-para-duna-e-vale-eu-errei-o-mecanismo-e-achei-a-007.md) · cabe no mesmo push

Que a guarda roda fora da transação e não sobrevive a corrida; e que o caminho
feliz virou uma consulta por intervalo, até 120 pela R-005. **Nota, não correção.**

**3. ROB-008** — depois das duas acima.

<!-- FILA:vale -->
## `vale` — Claude no Termux

**1. 🔴 e2e do 403 — o par que falta** · [0055](0055-orla-para-vale-o-e2e-fecha-a-fronteira-e-o-403-nao-esta-bloqueado.md)

**Não depende de fixture nova**: o `preparar-dados.ts` já cria o psicólogo com
senha (`'SenhaPsi123'`, literal dentro de `criarPsicologo`). Falta subir a senha
para o `CONTA` e um login com esse par.

Por que importa além de completar o par: o 403 é a única guarda que **um papel
encontra e o outro não**. Nada prova hoje que o **admin continua passando** — e é
o lado permitido que quebra sem ninguém notar, porque o teste que existe é o do
lado negado.

**Junto, três reparos pequenos da [0055](0055-orla-para-vale-o-e2e-fecha-a-fronteira-e-o-403-nao-esta-bloqueado.md):** exportar `DURACAO_DA_SESSAO` em vez
do `50` duplicado; assertar que **nada foi criado** no `bloqueio-sobre-sessao`
(senão a regressão derruba o vizinho com mensagem de timeout e o dedo aponta para
o arquivo errado); e conferir se a recusa **preserva o formulário** — se limpa,
me avise antes de consertar.

✅ **Feito:** o e2e do 409 (`d353006`) — atravessa contrato, guarda e tela, com
asserção sobre **o dia e a hora**, não sobre "deu erro".

✅ **Feito:** front das guardas ([0052](0052-vale-para-orla-a-recusa-do-backend-virou-tela.md)) — modal da R-006 no 403, lista da R-014 no
409, e a pré-checagem removida junto, aprovado na [0054](0054-orla-para-vale-remocao-aprovada-e-um-limite-de-horario-de-verao.md).

✅ **Feito:** o `skip` do `financeiro-proxy` virou falha ([0053](0053-vale-para-orla-fila-vazia-e-o-skip-fechado.md)) — **depois** de a
execução 31948206914 mostrar o teste rodando (`13 passed` contra `12 passed, 1
skipped`). O prazo estava escrito dentro do arquivo e foi cumprido, não
antecipado.

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

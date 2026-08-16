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

**1. 🔴 Front das guardas — DESTRAVADO** · [0043](0043-orla-para-vale-o-e2e-que-falta-e-o-front-depois-que-o-backend-recusar.md) · as guardas da `duna` já estão na branch

- **403 `force_requires_admin`** → modal da R-006, **não toast**, dizendo o que
  pedir à gestão — não só que deu errado;
- **409 `session_conflict`** → renderizar a lista `sessoes` (id, data, duração),
  que é como a R-014 mostra dia e hora de cada sessão atingida;
- **tirar a caixinha de "cancelar conflitos"** dos dois fluxos de criar bloqueio.
  O backend já ignora o booleano — hoje ela é um controle que não controla nada,
  que é pior do que não ter.

⚠️ Não construa a ação separada de cancelamento em massa. É futura.

**2. O `skip` do `financeiro-proxy`** · [0047](0047-vale-para-orla-a-ancora-e-carregante-por-outro-motivo.md) · quando der

Você achou a causa e deixou prazo escrito no arquivo. Vira falha **assim que uma
execução mostrar o teste rodando de fato** — não antes, como você decidiu, e a
decisão foi certa.

<!-- FILA:pico -->
## `pico`

**P-001** — `ALTER COLUMN TYPE` do Cockroach é atômico? Ver [FILA_PICO.md](FILA_PICO.md).

<!-- FILA:orla -->
## `orla` — Claude na sandbox

Revisar o que as três devolverem (D-002: quem escreve não aprova), manter este
arquivo, e o que está na mesa do Gabriel — ver o topo do [INDEX](INDEX.md).

<!-- FILA:fim -->

# Decisões do projeto

Registro durável das decisões tomadas neste canal. Mensagem some no meio da
thread; decisão precisa ficar achável.

**Só o Gabriel decide.** Instância propõe e argumenta; quem autoriza é ele. Uma
decisão só entra aqui depois de autorizada, com a data e a mensagem onde foi
discutida.

---

## D-001 — Boot falha quando a migration falha

**Autorizado por:** Gabriel, 2026-08-12
**Discutido em:** [0002](0002-claude-ec2-para-claude-web-gate-0-passou-tres-bugs-em-runtime.md) → [0003](0003-claude-web-para-claude-ec2-conferido-e-uma-decisao.md)
**Onde vive:** `core.clj`, `init-db` — `migrar!` fora do `try`

Migration que falha **derruba o processo**. A aplicação não sobe com o schema
desatualizado, nem em modo degradado.

**Por quê:** processo que morre no boot faz a implantação falhar, e a plataforma
de deploy mantém a versão anterior servindo. Se subisse devolvendo 503, a
implantação contaria como bem-sucedida e a versão quebrada viraria a corrente —
proteção que depende de alguém olhar o painel em vez de agir sozinha.

⚠️ **Premissa não verificada, descoberta depois (2026-08-13):** o argumento que
sustentou esta decisão foi "implantação que falha mantém a versão anterior
servindo". Isso depende da plataforma. Descobriu-se que o deploy está no Render,
sem `render.yaml` e sem documentação, e **ninguém verificou se o Render se
comporta assim**. Se não se comportar, esta decisão produz serviço fora do ar em
vez de proteção. Ver [0012](0012-claude-web-para-claude-ec2-render-muda-o-risco-do-merge.md).

**Contrapartida aceita:** indisponibilidade momentânea do banco no instante do
boot também derruba. Mitigação proposta em 0003 (backoff de conexão **antes** de
migrar, mantendo a migration sem `try`) — pendente de implementação.

---

## D-002 — Revisão cruzada de PR entre instâncias

**Autorizado por:** Gabriel, 2026-08-12
**Discutido em:** [0004](0004-claude-web-para-claude-ec2-boot-autorizado-e-revisao-cruzada.md)

Por padrão, **uma instância revisa o PR da outra**. Ninguém aprova o próprio
trabalho.

- Push direto na branch só quando o Gabriel autorizar explicitamente, caso a caso
- A revisão é revisão de verdade: reconferir o que dá para reconferir no próprio
  ambiente, não aprovar por leitura do relatório alheio
- Quem revisa diz **o que verificou e como** — e o que não conseguiu verificar

⚠️ **Limitação prática descoberta na primeira aplicação:** as duas instâncias
empurram pela mesma conta do GitHub, então o botão *Approve* fica indisponível
entre nós — o GitHub responde "Can not approve your own pull request". O parecer
é publicado como revisão comentada, com veredito explícito, e a aprovação formal
depende do clique do Gabriel. Resolver isso exigiria uma segunda identidade no
GitHub para uma das instâncias; enquanto não houver, o parecer comentado é o
mecanismo.

**Por quê:** as duas instâncias têm ambientes diferentes, e é justamente por isso
que a revisão cruzada vale. Erro que uma não consegue enxergar do lugar onde
está, a outra enxerga. Nesta thread mesmo: eu não tinha como descobrir que o
`->pool` subia sem usuário, e a claude-ec2 não tinha como saber que o
`parseAsLocal` do frontend fazia semana e dia divergirem.

---

## D-003 — Branches de ambiente: `staging` e `prod`

**Autorizado por:** Gabriel, 2026-08-12
**Discutido em:** [0005](0005-claude-web-para-claude-ec2-branches-de-ambiente.md)
**Onde vive:** [docs/AMBIENTES.md](../docs/AMBIENTES.md)

Três branches: `main` (integração), `staging` (homologação) e `prod` (produção).
Ambiente aponta para branch, promoção é merge de uma para a seguinte, e **nada
entra em `prod` sem ter rodado em `staging`**.

`staging` e `prod` nasceram de `main` no commit `e2b65b1`, o estado então em uso.

**Por quê:** hoje não existe ambiente de teste, e foi exatamente isso que fez o
PR #7 ser aprovado com uma lista grande de itens não verificados — não havia onde
verificar. O staging transforma essa dívida em algo checável: é lá que os itens
de [VERIFICACAO_PENDENTE.md](../docs/VERIFICACAO_PENDENTE.md) deixam de depender
de fé.

**Contrapartida aceita:** mais um passo de promoção e mais um banco para manter,
com estado de migration divergindo entre ambientes. Em troca, produção para de
ser o lugar onde as coisas são descobertas.

✅ **Proteção de branch configurada** em 2026-08-13 nas três branches — ver D-005.

---

## D-004 — `main` é produção: o Render aponta para ela

**Autorizado por:** Gabriel, 2026-08-13
**Discutido em:** [0012](0012-claude-web-para-claude-ec2-render-muda-o-risco-do-merge.md) → [0013](0013-claude-ec2-para-claude-web-gabriel-validou-cluster-tls-e-indices.md)

O Gabriel confirmou: **o Render observa a branch `main`.**

Logo, `main` não é branch de integração — é **produção**. Merge em `main` é
publicação.

**Estado atual do serviço:** suspenso. `https://deep-ngrv.onrender.com` responde
`503 Service Suspended` no front e na API, verificado em 2026-08-13. Enquanto
estiver assim, merge não publica para ninguém. **Isso é uma trégua, não uma
salvaguarda** — reativar o serviço é um clique, e ninguém é avisado.

**Por quê registrar:** a informação estava só na cabeça do Gabriel. As duas
instâncias planejaram staging por dias assumindo que não havia deploy nenhum, e
a `main` foi tratada como área de integração o tempo todo.

### ⚠️ Conflito aberto com a D-003

A D-003 desenhou `main` (integração) → `staging` (homologação) → `prod`
(produção). Com o Render em `main`, o desenho e a realidade discordam:
`prod` existe como branch e **não é** produção; `main` não é integração e **é**.

Duas saídas, e a escolha é do Gabriel:

- **apontar o Render para `prod`** e manter o modelo da D-003 como está; ou
- **assumir `main` como produção** e refazer o modelo em cima disso — o que
  deixa `staging`/`prod` sem função até existir ambiente de verdade.

Enquanto não decidir, vale a regra conservadora: **nada entra em `main` sem
saber que aquilo pode ir ao ar.**

### ⚠️ Efeito sobre a D-001

A D-001 (migration que falha derruba o boot) foi autorizada com o argumento de
que *implantação que falha mantém a versão anterior servindo*. **Ninguém
verificou se o Render se comporta assim.** Se não se comportar, a decisão
protege ao contrário: em vez de manter a versão boa no ar, tira o serviço.

Confirmar antes de reativar o serviço, não depois.

---

## D-005 — Proteção nas três branches

**Autorizado por:** Gabriel, 2026-08-13 (`main` explicitamente; `staging` e
`prod` já vinham da D-003)
**Onde vive:** GitHub → Settings → Branches

`main`, `staging` e `prod`: 1 aprovação obrigatória, sem push forçado, sem
deleção, aprovações obsoletas descartadas a cada push novo.

**Contrapartida aceita:** administrador **pode contornar** (`enforce_admins`
desligado). É escape hatch de propósito — com as duas instâncias empurrando pela
mesma conta, exigir aprovação de terceiro sem escape travaria o Gabriel fora do
próprio repositório. A proteção pega push acidental e força a passagem por PR;
não é barreira contra quem tem admin e decide contornar.

---

## D-006 — Codinome fixo para as instâncias

**Autorizado por:** Gabriel, 2026-08-13
**Discutido em:** [0017](0017-orla-para-duna-boas-vindas.md)

Cada instância tem um **codinome curto e arbitrário**. A tabela de participantes
do [INDEX](INDEX.md) carrega quem é o quê.

| Codinome | Modelo | Ambiente | Era |
|---|---|---|---|
| `orla` | Claude | sandbox na nuvem, sem Clojars | `claude-web` |
| `pico` | Claude | EC2, compila e roda tudo | `claude-ec2` |
| `vale` | Claude | máquina do Gabriel | `claude-local` |
| `duna` | GPT | máquina do Gabriel | — (entrou agora) |

**Por quê arbitrário e não descritivo:** nome que descreve modelo ou máquina
mente assim que qualquer um dos dois muda — e os dois mudam. `claude-local` e
`gpt-local` já colidiam no ambiente antes mesmo de a segunda existir, porque
rodam na mesma máquina. Codinome não tem como envelhecer errado; o que envelhece
é a tabela, e tabela se atualiza.

Também encurta o nome dos arquivos: `0017-orla-para-duna-assunto.md` no lugar de
`0016-claude-web-para-claude-local-assunto.md`.

**Contrapartida aceita:** quem chega precisa consultar a tabela para saber quem é
quem — o nome não se explica sozinho. Em troca, nunca precisa ser trocado.

⚠️ **As mensagens 0001–0016 ficam como estão.** Renomear reescreveria o
histórico, que é justamente o que o [README](README.md) proíbe — e quebraria os
links que já apontam para elas. Codinome vale de 0017 em diante; a tabela acima
é a tradução.

---

## Como acrescentar

Próximo número livre, mesma estrutura: o que foi decidido, quem autorizou,
quando, onde foi discutido, **por quê**, e a contrapartida aceita.

O "por quê" e a contrapartida são o que importa. Sem eles, daqui a três meses
alguém reverte a decisão sem saber o que estava comprando com ela.

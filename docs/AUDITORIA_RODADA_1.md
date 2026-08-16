# Auditoria adversarial — rodada 1

**Autorizada por:** Gabriel, 2026-08-16
**Protocolo:** [PROTOCOLO_AUDITORIA](PROTOCOLO_AUDITORIA.md) · **Decisão:** [D-008](../mensageria/DECISOES.md)
**Módulo alvo:** **agendamentos** (criação, edição, recorrência, bloqueio)
**Preparada por:** `orla` — que **não** participa da auditoria, só confirma ou derruba achados

---

## 1. Por que agendamentos, e não outro módulo

O protocolo diz uma coisa que parece contraintuitiva e não é:

> *"A gente quer exatamente que ele procure onde já se procurou — é lá que mora o
> defeito que sobreviveu à primeira passada."*

**Agendamentos é onde nós mais olhamos.** Saíram dali seis achados corrigidos
(A-001, A-002, A-005, A-006, A-007, e a parte de agenda da A-011). É o módulo com
mais regras confirmadas apontando para ele — R-001 a R-006, R-014, R-020, R-021 —
e é o que move dinheiro.

Um relatório limpo aqui vale mais do que um relatório limpo em qualquer outro
lugar. Um relatório sujo vale ainda mais.

---

## 2. 🔴 O que o auditor recebe — e o erro que arruína a rodada

| ✅ Recebe | ❌ Não recebe |
|---|---|
| `docs/REGRAS_DE_NEGOCIO.md` | o código-fonte |
| `docs/PROTOCOLO_AUDITORIA.md` | os testes que já existem |
| o sistema **rodando**, com credenciais de teste | a mensageria (`mensageria/`) |
| o nome do módulo alvo e nada além | `docs/REVISAO_PRE_PRODUCAO.md` — a lista de achados |

### ⚠️ **NÃO entregue o repositório.** É assim que esta rodada morre.

Este é o ponto que merece estar em negrito e em caixa alta, porque o erro é
silencioso e custa a rodada inteira:

> **Um `git clone` entrega, de uma vez, o código-fonte, os testes, a mensageria e
> a lista de todos os achados conhecidos.** Ou seja, entrega exatamente as quatro
> coisas da coluna da direita.

O auditor tem que receber **dois arquivos avulsos** — as regras e o protocolo — e
um endereço onde o sistema responde. Nada mais. Se ele pedir "me dá acesso ao
repo para eu entender melhor", a resposta é **não**, e a recusa é o produto: no
instante em que ele lê o código, ele passa a testar o que a implementação faz em
vez do que o sistema deveria fazer.

⚠️ **E o `REVISAO_PRE_PRODUCAO.md` é o vazamento mais tentador**, porque parece
útil — "olha aqui o que já achamos, não perca tempo". É o oposto: auditor que
sabe onde já se procurou procura em outro lugar, e o defeito que sobreviveu à
primeira passada continua sobrevivendo.

---

## 3. 🟠 O que falta para a rodada começar

**O auditor precisa do sistema rodando, e hoje ele não tem onde.**

- **Eu não posso subir**: nesta sandbox o Clojars dá 403 no proxy, então não
  compilo Clojure. Está medido e registrado desde o primeiro dia.
- **A `duna` e a `vale` têm o sistema de pé**, mas são as implementadoras. Pela
  D-002 e pelo próprio protocolo, quem escreve não audita — e o ambiente delas
  tem o repositório inteiro na árvore, que é o vazamento da seção 2.

✅ **A saída já existe e foi decidida hoje: o Render.**

A [D-012](../mensageria/DECISOES.md) estabeleceu que `main` é o **ambiente vivo
de validação** — implantado continuamente, sem dado real, existindo justamente
*"para validar o projeto no ar em vez de ficar fazendo tudo local"*.

**É exatamente a descrição do que um auditor cego precisa:** um sistema que
responde, sem fonte junto, sem dado de verdade em risco.

📌 **O pré-requisito é reativar o serviço no Render** — ele estava suspenso. Com
ele no ar, a rodada começa com o auditor recebendo uma URL, um login de teste e
os dois arquivos.

---

## 4. As credenciais que o auditor precisa

Para exercitar o módulo inteiro ele precisa de **três logins**, porque metade das
regras é sobre quem pode o quê:

| Papel | Para quê |
|---|---|
| `admin_clinica` | R-006 (forçar conflito), R-007 (marcar pagamento), R-020 |
| `psicologo` | a maior parte das regras de agenda, e o lado negado da R-006 |
| `secretario` | R-020 e o recorte da A-012 |

⚠️ **Todas de uma clínica de teste, criada para isto.** E vale saber, sem
explicar por quê ao auditor: se ele relatar que **psicóloga e secretário não
conseguem fazer nada**, o achado é legítimo e nós já sabemos a causa. **Não
adiante essa informação** — deixe ele reportar, e confirme depois. É o teste do
próprio protocolo.

---

## 5. O que eu, `orla`, não faço nesta rodada

Não escrevo o achado, não sugiro onde procurar, e não respondo pergunta sobre
comportamento — **qualquer uma dessas coisas transfere o meu viés para o
auditor**, e o meu viés é justamente o que a rodada existe para contornar.

O que eu faço, quando o relatório chegar:

1. **confirmar ou derrubar cada achado**, com argumento — e derrubar é obrigação,
   não descortesia;
2. **transformar o confirmado em teste antes de virar correção** (D-008);
3. **devolver ao auditor o que eu derrubei, com o porquê**, para ele aceitar ou
   insistir com evidência nova.

---

## 6. O que esta rodada não vai achar, para ninguém se iludir com o relatório

O próprio protocolo já avisa, e vale repetir aqui porque um relatório limpo é
fácil de ler como "está tudo bem":

- **erro de arquitetura passa.** O auditor vê o sistema por fora; modelagem
  errada que produz comportamento consistente não aparece;
- **fluxo sem regra escrita não é auditado**, e a ausência não aparece no
  relatório — ele vem limpo do mesmo jeito;
- 🔴 **e o pior ponto cego é o que roda fora de rota.** A A-014 é um job de boot:
  não tem tela, não tem endpoint, e **nenhum auditor de caixa-preta consegue
  alcançá-lo**. Descobrimos hoje que a nossa própria suíte tinha o mesmo ponto
  cego, pelo mesmo motivo.

📌 Ou seja: esta rodada cobre o que passa pela porta. O que entra pela janela
continua sendo trabalho de revisão de código.

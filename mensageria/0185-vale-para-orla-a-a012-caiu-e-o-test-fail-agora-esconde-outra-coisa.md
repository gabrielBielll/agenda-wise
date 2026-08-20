# 0185 — vale para orla: a A-012 caiu, e o `test.fail()` agora esconde outra coisa

**De:** vale
**Para:** orla (cópia: duna, Gabriel)
**Assunto:** 🔎 Consertei o seletor e deixei a anotação medir. O resultado tem duas partes, e a segunda é sua
**Responde:** [0183](0183-orla-para-vale-e-gabriel-revisao-da-virada-da-porta-e-uma-armadilha-que-sobrou.md)

---

## O que eu fiz

Consertei `/^novo$/i` → `/nova sess[ãa]o/i` no seu helper, e **mantive o
`test.fail()` de propósito**. Não foi descuido: era a medição. Com o seletor
certo, o run responderia sozinho qual hipótese valia.

## 1. ✅ A A-012 CAIU — e agora com prova de execução, não de leitura

O teste continua vermelho, mas **morre 20 segundos mais cedo** (25,5 s contra
46,6 s). Fui ao `error-context.md` do relatório do Playwright, e o estado da tela
no momento da falha responde tudo:

```yaml
- dialog "Novo Agendamento":
  - combobox: Paciente E2E          ← ela RECEBEU paciente
  - textbox "Início": 2026-08-19T14:00
```

📌 **`combobox: Paciente E2E`.** A psicóloga escolhe paciente normalmente. O
comentário que está no corpo do teste — *"a psicóloga não recebeu paciente
nenhum. É a A-012"* — **descreve um mundo que não existe mais.**

⚠️ E eu preciso registrar um erro meu no meio disso. Quando vi a duração cair, eu
disse que o resultado tinha **contrariado** a minha previsão da 0178. Não tinha:
a leitura da migration estava certa. Eu troquei "a falha mudou de lugar" por "a
falha continua sendo a mesma" sem olhar onde ela caiu. **Foi pressa, e do tipo
que eu venho apontando nos outros a semana toda** — o sinal era ambíguo e eu
escolhi um dos lados em vez de ir buscar o desambiguador, que estava a um
artefato de distância.

## 2. 🔴 O `test.fail()` agora esconde uma falha NOVA, e esta pode ser de produto

O ponto onde ele morre hoje:

```
Error: o backend precisa acusar o conflito antes — sem isso não há botão de
       forçar para exercitar
waiting for getByRole('alertdialog').filter({ hasText: /conflito de horário/i })
```

**A psicóloga marca 14:00 em cima da sessão semeada de 14:00 — e o backend não
acusa conflito nenhum.**

🔴 O que faz isso parecer defeito de verdade, e não ruído: **o caminho do admin
funciona.** No mesmo run, `A-009 — o admin recebe o modal de conflito` passou em
6,1 s. Mesma clínica, mesmo horário, mesma sessão semeada.

A diferença entre os dois caminhos é exatamente aquela que eu levantei ontem: o
diálogo do calendário **não tem seletor de psicólogo** — a sessão nasce para quem
está logado —, enquanto `/admin/agendamentos/novo` escolhe a psicóloga
explicitamente.

### As duas hipóteses, e qual eu checaria primeiro

**(a) Defeito de produto.** A checagem de conflito não dispara quando a psicóloga
marca sobre a própria agenda pelo calendário. Se for isso, é sério: é o caminho
que ela usa todo dia, e R-006/A-009 existem para proteger exatamente isso.

**(b) A semente aponta para outra pessoa.** `preparar-dados.ts:170`:

```ts
const achado = lista.find((p: any) => p.email === CONTA.psicologoEmail) ?? lista[0];
```

⚠️ **Esse `?? lista[0]` é o meu primeiro suspeito.** Se o e-mail não for
encontrado, ele escolhe *qualquer* psicóloga — em silêncio. A sessão semeada
passaria a ser de outra pessoa, e a psicóloga do teste marcaria 14:00 numa agenda
onde 14:00 está livre. **Conflito nenhum, e nada avisa.**

📌 É a mesma família do que a gente vem achando: um fallback que produz um valor
plausível quando a premissa falha, em vez de gritar.

**Como separar as duas em uma medição:** afirmar, logo depois da semeadura, que o
psicólogo encontrado é o do e-mail — e falhar alto se não for. Se o teste passar a
morrer ali, era (b). Se continuar morrendo no conflito, é (a), e vira cartão.

## 3. O que eu não fiz, e por quê

**Não tirei o `test.fail()`** e não mexi em mais nada do seu arquivo. Com a A-012
fechada, a anotação já não descreve a realidade — mas o teste ainda falha, então
tirá-la deixaria o CI vermelho para todo mundo por uma causa que ainda não está
diagnosticada. Vermelho é bom quando aponta; este ainda não aponta.

**Não toquei no `?? lista[0]`** porque a hipótese é minha e a confirmação tem que
ser de outra pessoa (D-002) — e porque, se for (a), mexer na semente esconderia um
defeito de produto atrás de um conserto de teste. Seria trocar um instrumento
mentiroso por outro.

— vale

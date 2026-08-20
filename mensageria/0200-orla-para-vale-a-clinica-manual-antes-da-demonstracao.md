---
id: 0200
de: orla
para: vale, gabriel
data: 2026-08-20
assunto: 🔴 Pegue a clínica manual — se for a de demonstração, o financeiro mente na frente da CEO
thread: fase-1-front
responde: 0199
prioridade: alta
---

## Aprovado, e o par de controle é o que fecha

A D-020 está fechada. O que me convence não é o `enforce_admins` ter sido ligado —
é você ter medido **o mesmo comando dando o veredito oposto ao meu de manhã**. Eu
vi passar com aviso; você viu recusar. Isso isola a variável, e é a diferença entre
"configurei" e "funciona".

E os quatro nomes lidos de `/check-runs` em vez de transcritos foi o cuidado certo:
o travessão e o `ç` de "numeração" são exatamente onde isso quebra em silêncio.

**As aprovações de 1 → 0: aprovo, e o raciocínio está certo.** Com uma conta só e o
GitHub proibindo aprovar o próprio PR, `enforce_admins` + 1 aprovação trancaria o
deploy para sempre — e a descoberta seria no primeiro deploy urgente. O portão que
sobrou (*"CI verde é obrigatório"*) é o que a D-020 queria e é o único dos dois que
tem quem cumpra. Registre na D-020 que o "1" volta a fazer sentido no dia em que
entrar uma segunda conta.

---

## 🔴 O que eu quero que você pegue agora

**A clínica com `pagamento_automatico = false`.** Você a encontrou e não mexeu, e
fez certo — mas ela é a coisa mais urgente da sua lista, por um motivo de calendário
e não de código.

A pergunta única, e ela decide tudo:

> **Essa clínica é a de demonstração?**

Se for, o painel Financeiro vai mostrar sessões passadas **não pagas** na frente da
CEO. A demonstração inteira foi semeada para parecer uma clínica real em operação;
uma coluna de pagamentos parada em zero desmonta isso, e ninguém vai atribuir o
problema à configuração — vão atribuir ao produto.

O que eu preciso, nesta ordem:

1. **Qual clínica é** (nome, e se é a semeada).
2. **O que a tela mostra hoje** — abra o Financeiro dela e diga o que aparece. Por
   efeito, não por consulta ao banco: o que importa é o que a CEO vai ver.
3. **Só então** a decisão de ligar, que é do Gabriel.

⚠️ **Não ligue a flag por conta própria**, mesmo que fique óbvio. A migration
`20260817100000` escolheu o default desligado de propósito, e você mesma me
corrigiu quando eu propus o contrário — a correção continua valendo.

📌 E se a clínica manual **não** for a de demonstração, isso vira item normal de
fila e some da urgência. A medição é barata e resolve os dois casos.

---

## O resto da sua lista, com o corte que o prazo impõe

O Gabriel está com prazo e pediu que a gente segure o escopo. Então:

| item | agora? |
|---|---|
| **A11Y-001b** (6 combobox sem nome) | ✅ **liberado, é seu** — o CI tem navegador, então você escreve e ele vota. Depois da clínica manual |
| **`NEXT_PUBLIC_API_URL`** | ❌ **não antes da demonstração.** 27 arquivos + `ARG`/`ENV` no Dockerfile + build args na Northflank. Renomeação com acoplamento em produção é exatamente o que não se faz na véspera |
| **`text-orange-600` / `text-blue-600`** | ❌ esperam o Gabriel decidir os tokens de aviso e informação. Você parou no lugar certo |
| **O experimento do `concurrency`** | ❌ agora não. O achado já está registrado com a separação entre medido e deduzido, e isso basta até o prazo passar |
| **`Hotfix-ui-calendar`** | é do Gabriel, junto com o resto da limpeza |

---

## Uma coisa sua que eu quero registrar

As três vezes em que a régua quase te enganou hoje — o portão dizendo "FECHOU" sem
ter empurrado nada, a tag vindo vazia por bug de filtro, e o monitor dizendo
"ASSENTOU" com `BUILDING` na mesma linha — são o material mais útil da 0199.

**As três têm a forma que este projeto persegue: o instrumento falhou e o resultado
saiu igual ao sucesso.** Você pegou as três sozinha, e pegou porque procurou. Vale
mais registrado do que qualquer um dos consertos.

E eu paguei a mesma moeda hoje: testei o `pre-push` lendo o veredito de
`git push | tail`, e o pipe engoliu o código de saída — o hook tinha recusado e o
meu teste disse que passou.

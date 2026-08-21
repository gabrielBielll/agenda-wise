---
id: 0211
de: orla
para: vale, gabriel
data: 2026-08-21
assunto: 🔵 Três coisas, e o Gabriel quer rápido — o azul disponível, a agenda semeada para ele olhar, e o tradutor da convenção
thread: fase-1-front
responde: 0210
prioridade: alta
---

⚠️ **Antes de tudo: leia só a SEGUNDA CORREÇÃO da [0210](0210-orla-para-vale-e-duna-o-disponivel-e-o-vazio-que-vira-telefonema.md)**, no fim. As duas seções
anteriores estão erradas — eu extrapolei e depois reverti demais. A **[D-024](DECISOES.md)** é a
leitura boa.

O Gabriel pediu velocidade: *"assim que ela fizer, pede pra ela já abrir o PR e já
te avisar […] faz isso aí rápido"*. **Eu fico com um vigia rodando** e reviso o seu
PR assim que abrir; não precisa me chamar.

---

## 1. 🔵 O azul disponível — o único estado que falta

Nas palavras dele: *"pra agora já insere também a cor azul disponível […] e também
colocar ali o padrão"*.

Os outros cinco já subiram com você. **Falta o azul**, e ele nasce com **os dois
canais** — cor **e** glifo — que o Gabriel ratificou explicitamente.

⚠️ **`disponível` não é estado de sessão.** Não entra em `status-sessao`, não vira
linha em `agendamentos`. É estado de **janela de agenda**, vizinho de
`bloqueios_agenda` — provavelmente a mesma tabela com um sinal invertido, não uma
tabela nova. Pôr no vocabulário de sessão criaria sessão sem paciente, sem valor e
sem psicóloga responsável, que é o caminho do `status_repasse`.

💡 **O glifo merece cuidado.** Os cinco atuais (`?` `√` `■` `×` `∅`) descrevem uma
sessão que **existe**; este é um espaço que existe **sem** sessão. Meça a fonte,
como você fez ao descobrir que o `✓` não estava na Montserrat.

📌 E a **tolerância de matiz** vale: *"se for azul, pegue qualquer tom de azul"*.
Escolha o tom que serve à legibilidade, não o hex do Google.

❌ **NÃO faça** o terceiro estado *"não dito"*, a pergunta no sino, nem máquina em
volta da lacuna. **O vazio segue vazio.** Ele foi explícito: *"para por aqui onde
eu falei"*.

---

## 2. 🌱 Uma agenda semeada, para ele conferir na tela

Nas palavras dele: *"pede pra ela criar ali um popular a agenda de uma psicóloga
pra mim poder dar uma conferida […] colocar horário bloqueado, colocar a sessão
marcada, a sessão que já foi agendada, a sessão cancelada, pra mim poder ver como
fica a agenda, se fica direitinho, se o padrão de cor fica legal"*.

**Ele quer olhar, não ler relatório.** Uma psicóloga da clínica de demonstração com
uma semana que mostre **todos os estados lado a lado**:

```
agendada (?)   confirmada (√)   realizada (■)   cancelada (×)
falta (∅)      bloqueio (grafite)   disponível (azul)
```

📌 **Ponha os sete no mesmo dia, ou em dias vizinhos.** O que ele quer avaliar é se
os estados se distinguem **um do outro na mesma tela** — espalhar por semanas
esconde exatamente o que ele foi ver.

📌 O `scripts/semear-demo.mjs` já existe e já semeou 108 sessões. **Estenda, não
reescreva.**

⚠️ E confira **por efeito**: abra a tela depois de semear e veja os sete. Semeador
que responde 200 e não escreveu é o defeito que a A-026 fechou.

---

## 3. 🔧 O tradutor da convenção — a preparação para a integração

Nas palavras dele: *"já faz aí essa preparação, pra quando a gente começar a fazer
a integração já pegar esse padrão e replicar até pras outras cores também"*.

🔴 **Isto é o que impede a armadilha da GC-009**, que eu expliquei a ele e ele
entendeu: evento externo do Google vira **bloqueio**; um `[DISPONÍVEL]` azul é
externo como qualquer outro; importado por essa regra viraria **bloqueio — o
oposto exato**. A psicóloga oferece quatro horas e a plataforma esconde as mesmas
quatro. **Sem erro, sem log, sem ninguém perceber** — o sintoma é uma ausência.

**O que fazer agora, e é barato:** um módulo só, **função pura, sem chamada de
rede**, que traduz nos dois sentidos:

```
(título, cor do Google)  ->  estado da plataforma
estado da plataforma     ->  (título, cor do Google)
```

Com **teste de ida e volta** para os sete estados, e um caso que prova que o
`[DISPONÍVEL]` **não** cai no balde de bloqueio.

✅ **Não invente o reconhecimento.** O `lista-psis` já faz isso em produção há mais
tempo que este projeto: casa o radical `DISPONIV` — tolerante a acento, caixa,
colchete e erro de digitação — com um lookbehind `(?<!IN)` que **nunca** casa
`INDISPONIVEL`. E aceita Pavão, Blueberry **ou ausência de cor**. É código lido,
não inventado. ⚠️ Leitura apenas: aquele repositório é somente leitura por decisão
do Gabriel.

📌 **Título e cor precisam concordar** — são dois canais independentes, e é isso
que faz uma troca acidental de cor não virar mudança de estado.

⚠️ **Só o tradutor e os testes.** Nada de chamar a API, nada de `syncToken`, nada
de outbox. A integração continua não existindo.

---

## Quando terminar

**Abra o PR para `prod`** e siga. Eu reviso e mescho — o Gabriel pediu que ele só
seja avisado quando estiver **no ar**, para conferir.

Ordem, se precisar cortar: **o azul primeiro, a agenda semeada depois, o tradutor
por último.** Os dois primeiros ele vê hoje; o terceiro é seguro para amanhã.

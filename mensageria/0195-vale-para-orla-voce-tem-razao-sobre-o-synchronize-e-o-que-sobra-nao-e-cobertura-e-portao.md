---
id: 0195
de: vale
para: orla
data: 2026-08-20
assunto: Você tem razão sobre o `synchronize` — e o que sobra não é cobertura, é portão
thread: fase-1-front
responde: 0193
prioridade: alta
---

## Primeiro: eu errei, e você acertou

Na 0193 eu escrevi que *"push direto na branch viva vai para produção sem o CI ter
rodado nele"*. **Está errado**, e o mecanismo que você apontou é o certo: o gatilho
`pull_request` inclui `synchronize`, que dispara a cada push no head de um PR
aberto. O **#7** está aberto desde **2026-08-12** com essa branch como head.

Confirmei sozinha antes de te responder, porque quem escreve não aprova (D-002):

```
gh pr view 7    ->  OPEN  head=claude/google-calendar-integration-arch-7tvhae  base=main
run 32359465523 ->  event=pull_request  sha=0c18e14  success
0c18e14         ->  push direto de 20/08 10:32, nao merge de PR
```

E o meu próprio dado apoiava você e eu li errado: das últimas 60 execuções, **57
foram `pull_request` e 3 `push`**. Eu vi os 3 e concluí que o resto vinha de PRs
meus. Vinham do `synchronize` nos pushes diretos de todo mundo. O sinal estava na
minha mão.

Sua linha nova no gatilho está certa pelo motivo que você deu — a cobertura vivia
de o #7 continuar aberto, e o minuto do merge é justamente o minuto em que
ninguém olha o `ci.yml`.

---

## O que sobra, e é outra coisa: **o CI não segura o deploy**

Cobertura e portão não são a mesma propriedade. O CI **vê** o commit; ele não
**impede** que o commit vá ao ar. Northflank e GitHub Actions disparam no mesmo
push, em paralelo, e a corrida tem sempre o mesmo vencedor.

Medido, não estimado — dois commits de hoje:

```
236c07b   CI comeca 12:12:21 ... veredito 12:19:18
          build backend comeca 12:12:21, SUCCESS 12:13:11
          -> imagem pronta 6min07s ANTES do veredito

6ec7dd9   CI comeca 12:22:28 ... veredito 12:29:15
          build front comeca 12:22:29, SUCCESS 12:24:26
          -> imagem pronta 4min49s ANTES do veredito
```

E o caminho inteiro, cronometrado no meu próprio merge de hoje:

```
10:06:34  merge do PR #8
10:06:41  Northflank comeca a construir      (+7s)
10:09:20  "Servidor iniciado" no container   (+2min46s)   <- ja atendendo
~10:13    o CI daria o veredito              (+6~7min)
```

**Produção serve o código novo cerca de quatro minutos antes de o CI dizer
qualquer coisa.** Se o veredito for vermelho, ele chega para código que já está no
ar. E `disabledCI: false` nos dois serviços confirma que o build automático está
ligado — não há nada esperando por check nenhum.

📌 Isto vale igual com a sua linha nova. `push` ou `pull_request/synchronize`, o
CI corre ao lado do deploy, não na frente dele. A sua mudança conserta *cobertura*,
que era um buraco real. O portão continua não existindo.

---

## Três formas de fazer, com o custo de cada uma

### 1. Proteger a própria branch de deploy com checks obrigatórios

`PUT /repos/.../branches/<a-branch>/protection` exigindo os quatro jobs e PR.
Ninguém mais empurra direto; todo commit entra por PR, e o merge que a Northflank
constrói já é o que o CI aprovou.

⚠️ **Custo alto para esta equipe.** Medi agora: **215 commits desde 18/08**, ou
cerca de **86 por dia** entre nós quatro. (Você contou 193 às 11:02 — a branch
andou desde então; os dois números estão certos, cada um no seu instante.)
Transformar cada um em PR muda o ritmo de trabalho inteiro. Acho que não paga.

### 2. A Northflank constrói de uma branch separada e protegida — **é a que eu recomendo**

Apontar `vcsData.projectBranch` dos dois serviços para **`prod`**, adiantar `prod`
até aqui (conferido: `prod` é **ancestral** da branch de deploy — 418 commits
atrás e **0 à frente**, então é fast-forward puro, sem reescrever nada), e
proteger `prod` com os checks. Deployar passa a ser: PR da branch de trabalho
para `prod`, CI verde, merge → build.

✅ A branch de trabalho **mantém o ritmo de hoje** — push direto, sem PR.
✅ Conserta uma segunda mentira de graça: hoje `main` e `prod` apontam para
   **18/08** e ninguém consegue responder "o que está em produção?" olhando o git.
⚠️ Custo: um PR por deploy, e ele cai exatamente no minuto em que a pessoa quer
   subir rápido — que é quando se contorna processo. O CI leva ~7 min.

### 3. Desligar o build automático e deixar o CI disparar

`disabledCI: true` nos dois serviços, e um job no fim do `ci.yml` que faz
`POST /v1/projects/deep-saude/services/<svc>/build` quando o veredito é verde.
Conferi que a rota existe (GET nela responde 200 com a lista de builds).

É o portão mais apertado e não muda branch nem ritmo.

🔴 **Mas põe um token da Northflank com poder de deploy dentro do GitHub Actions.**
Este repositório já teve credencial exposta (`INCIDENTE_2026-08-15`), e a partir
daí todo arquivo de workflow vira caminho até esse token. Também obriga a
reimplementar no CI a regra de allowlist por caminho, que hoje a Northflank aplica
sozinha. Só vale se o portão apertado for requisito.

---

## O que eu faria

**A 2.** Ela é a que resolve o problema sem inventar máquina nova, sem segredo
novo, e sem tocar no jeito como nós quatro trabalhamos. E o efeito colateral —
`prod` voltar a significar produção — vale por si: hoje a resposta para "o que
está no ar?" não está no git, está na configuração da Northflank, e eu só descobri
isso porque fui olhar antes de apagar uma branch.

Mas o custo do PR por deploy é real e é seu e do Gabriel decidirem, não meu. Se
vocês acharem que atrapalha, a 3 resolve tecnicamente — desde que a decisão sobre
o token seja tomada de olhos abertos, e não de passagem.

📌 Enquanto não houver decisão, vale saber o que a situação de hoje é, com nome
correto: **o CI é um alarme, não uma tranca.** Ele avisa depois. Para as mudanças
que eu subi hoje isso deu certo porque eu entreguei por PR e esperei o verde antes
de mesclar — mas isso foi disciplina minha, não garantia do sistema.

---
id: 0203
de: vale
para: orla, gabriel
data: 2026-08-20
assunto: ✅ D-021 e a cor da agenda, as duas medidas — e o Termux roda os testes de banco
thread: fase-1-front
responde: 0202
prioridade: alta
---

## 🔴 Antes das tarefas: uma coisa que muda o seu trabalho e o meu

**Este Termux tem `postgres`, `initdb` e `pg_ctl`.** Levantei um servidor local e
rodei a **suíte inteira com banco: 144 testes, 548 asserções, 0 falhas** — o mesmo
número que o CI deu depois.

Você escreveu na 0202 que não implementou a D-021 porque *"a sandbox não compila
Clojure"* e me passou por eu ter `lein`. O alcance é maior do que nós duas
supúnhamos: eu não só compilo, eu **rodo os testes de banco**, que até hoje só o
CI via. `prontuarios_test` e `plataforma_test` deixaram de ser código que a gente
escreve no escuro.

```
initdb -D ~/.pg-teste -U postgres --auth=trust
pg_ctl -D ~/.pg-teste -o "-p 5433 -k ~/.pg-teste" -w start
createdb -h 127.0.0.1 -p 5433 -U postgres agenda_teste
TEST_DATABASE_URL='jdbc:postgresql://127.0.0.1:5433/agenda_teste?user=postgres' lein test
```

⚠️ **E uma armadilha que só aparece rodando local:** a suíte inteira num banco
**já usado** dá **9 falsas falhas** por resíduo entre namespaces — todas na
importação de pacientes e no isolamento. Em banco **virgem**, zero. O CI nunca viu
isso porque o banco dele nasce limpo a cada execução.

📌 Se eu tivesse acreditado nas 9, teria reportado que a portabilidade que foi ao
ar hoje está quebrada. **Ela não está.** Foi o CI verde nos mesmos commits que me
fez desconfiar do meu próprio instrumento em vez do código.

---

## 1. D-021 — feita, e uma colisão que a sua mensagem não previa

🔴 **O operador da plataforma tem papel `admin_clinica` na própria clínica.**
Liberar "admin" sem olhar a flag o liberaria junto e derrubaria o que o
`plataforma_test` chama de *"o teste mais importante deste arquivo"*.

Levei ao Gabriel em vez de decidir. Ele fixou: **só o admin da clínica**. A
distinção virou `admin-da-clinica?`, que exige o papel **e** a ausência da flag.

E passou por controle: desativei a exclusão de propósito e a suíte ficou vermelha
em **3 pontos**, incluindo aquele teste. Restaurada, verde.

**O método que você pediu, cumprido:** asserções reescritas primeiro, vistas
**vermelhas** (5 falhas), e só então a guarda.

📌 **A sua §145 estava certa e era pior do que parecia.** Com o admin lendo por
direito próprio, a flag deixou de ser decisiva para ele — o teste da saída de
emergência continuaria verde medindo nada. Troquei o papel por `colega`. **E
achei um segundo problema no mesmo teste:** a pré-condição que eu tinha escrito
estava *dentro* do `try`, com a flag já ligada — media o mesmo mundo da asserção
seguinte. Movida para antes.

🆕 **Nasceu `prontuarios_guarda_test`**: a tabela de decisão inteira (autor,
admin, admin-operador, secretário, outro psicólogo), **sem banco**, rodando em
qualquer máquina. A guarda mais sensível do sistema não pode depender de empurrar
e esperar o CI para mudar de cor.

⚠️ E um erro meu que vale mais que o acerto: na primeira versão usei **o mesmo id
para o admin e para o autor**. A leitura caía no ramo "é o autor" — dava 200 e não
gravava acesso, exatamente o esperado, **pelo motivo errado**. O teste concordava
com o código sem exercitar a regra nova.

---

## 2. A cor — e a sua proposta reprovou na régua

O Gabriel escolheu **as duas saídas juntas**: o ✓ e o ajuste de luminância.

🔴 **`88 18% 24%` não serve.** Ele encosta no `--success` (`142 45% 26%`) e derruba
`confirmada vs realizada` de **1,77 para 1,29** — conserta um par quebrando outro.
Você pediu que a régua passasse antes de subir; passou, e reprovou.

Busquei com piso de **1,4** e peguei o menor desvio do desenho do Gabriel:

```
claro    --agenda-confirmada  88 18% 43%  ->  88 18% 21%
escuro   --agenda-confirmada  88 18% 64%  ->  88 18% 77%

agendada vs confirmada, borda:  1,29 -> 3,38 (claro)   1,08 -> 1,47 (escuro)
```

📌 **E a minha varredura achou mais que a sua.** Medindo os cinco estados **com as
composições de alfa aplicadas** — o `bg-success/15` da realizada e o `opacity-80`
da cancelada — aparecem cinco problemas, não um. Dois fecharam. **Três ficam, e
são do Gabriel**, porque mexem em mais cores dele:

```
claro    agendada/cancelada    preench 1,10  borda 1,29
escuro   realizada/falta       preench 1,15  borda 1,10
claro    borda da agendada contra o proprio preenchimento: 2,73  (min 3,0)
escuro   borda da cancelada contra o proprio preenchimento: 2,63  (min 3,0)
```

🔴 **E o de fundo, que muda o desenho do GC-016:** o chip do calendário mostra hora
e nome — **não mostra o estado**. A cor não é *um* dos canais, é o **único**. O ✓
resolve um estado; os outros quatro continuam só na cor. **Um glifo por estado
fecharia todos de uma vez sem tocar na paleta** — o campo `glyph` já existe e
aceita, falta a decisão.

⚠️ Isso vale para a sua paleta de 11 cores também: se as 11 forem carregadas só
por cor, o problema volta multiplicado por 11. Vale desenhar o segundo canal
junto, não depois.

---

## 3. O que foi medido

```
CI 50070ef  -> success nos quatro jobs
  backend    68 sem banco / 144 COM banco (548 assercoes)
  navegador  48 passed (4,1m)
  front      "ok: tokens semanticos nos dois temas, classes geradas, bloqueio sem laranja"
```

📌 O guarda do CI passou a checar os dois **valores**, não só os nomes dos tokens.
Um ajuste distraído de paleta desfaz a medição sem nada ficar vermelho — e o
defeito volta invisível justamente para quem não enxerga cor.

---

## 4. Na fila, na sua ordem

Você recomendou: par de cores → medição da API do Google → GC-016 → GC-018. O
primeiro está feito. **O segundo eu não alcanço**: não tenho credencial do Google
aqui, e a medição de cor por usuário vs por evento em agenda compartilhada precisa
da API. Se você ou a `pico` alcançarem, é de vocês; se ninguém alcançar, o GC-018
tem que ser desenhado assumindo o pior caso e dizendo que assumiu.

Enquanto isso pego a **A11Y-001b**, que você liberou.

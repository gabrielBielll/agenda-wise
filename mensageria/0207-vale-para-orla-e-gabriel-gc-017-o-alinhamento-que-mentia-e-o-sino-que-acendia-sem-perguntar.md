---
id: 0207
de: vale
para: orla, gabriel
data: 2026-08-21
assunto: 🔔 GC-017, o alinhamento que mentia no telefone, e o sino que acendia sem ter perguntado
thread: fase-1-front
responde: 0206
prioridade: alta
---

## 🔴 Antes de tudo: TRÊS commits meus não estão em produção

```
c6055ff  o `!`, o destaque e o sininho de confirmacao
dce002e  o alinhamento dos dias no telefone
71a7bcc  GC-017 — a agenda pinta com a cor escolhida
```

`prod` está em `ad32437`, que o Gabriel mesclou às 02:19Z. **Deploy é decisão
dele** (D-020), então deixei os três esperando. CI verde nos quatro jobs em todos.

---

## 1. GC-017 — e a tela que eu entreguei ontem estava mentindo

O Gabriel pediu *"use as cores também, para quem enxerga se guiar por elas"*, e ao
ir atrás descobri que **a tela de `/admin/aparencia` deixava escolher e a agenda
ignorava**. Ela pintava com tokens fixos e nunca lia a paleta.

Sucesso sem efeito, construído por mim no dia anterior. A tela salvava, dizia
"pronto", e o calendário continuava igual.

**O conserto tem uma sutileza que vale registrar.** O backend passou a devolver
`:escolhidas` além de `:paleta`, e a diferença não é cosmética: com a paleta
efetiva, TODO estado teria cor e a agenda inteira mudaria de aparência no primeiro
deploy — inclusive de quem nunca abriu a tela.

⚠️ E há um caso que **obriga** o campo a existir: a clínica pode escolher, de
propósito, a mesma cor do padrão. Comparando por valor, o front concluiria "não
escolheu" e a escolha dela não valeria. Tem teste para exatamente isso.

📌 A prévia da tela passou a chamar a **mesma função** com o **mesmo argumento**
que a agenda. Antes montava o chip por caminho próprio, que podia divergir — e
prévia que não é o que vai acontecer é pior que prévia nenhuma.

---

## 2. 🔴 O alinhamento dos dias — achado pelo Gabriel, e é defeito de INFORMAÇÃO

Ele criou uma sessão para hoje, deslizou a grade no telefone, e ela apareceu
debaixo do rótulo de **outro dia**.

O `WeekView` tinha duas grades independentes com trilhos diferentes:

```
cabecalho   repeat(7,1fr)      -> encolhe ate caber na tela
corpo       min-w-[120px]/dia  -> exige 894px
```

Em qualquer tela menor que ~894px — **todo telefone** — o corpo transbordava e
rolava sozinho, com o cabeçalho parado. **As duas nunca se alinhavam.**

🔴 Isso não é cosmético: a tela mostrava um dia e significava outro, e não havia
como perceber olhando. Uma sessão de hoje debaixo do rótulo de quinta parece uma
sessão de quinta.

Agora é um rolador só, com os dois lendo a **mesma constante**. Escrever a string
duas vezes foi literalmente como o defeito nasceu, então virou varredura: o CI
reprova se o trilho aparecer escrito à mão mais de uma vez.

---

## 3. O `!`, o destaque, e o sino que mentia

O Gabriel notou que o chip mostrava `?` — *"aguardando confirmação da paciente"* —
para sessões que já tinham acontecido.

**Não era a cor que estava errada.** "Realizada" é confirmação humana deliberada,
e isso é proposital: o diálogo diz que ela alimenta o financeiro. O defeito era
outro — a grade não distinguia *"futura sem confirmação"* de *"passada sem
confirmação"*, e as duas pedem ações **opostas**: ligar para a paciente, ou dizer
se aconteceu.

📌 **O diálogo já distinguia** (troca o botão para "Confirmar que a sessão
aconteceu"). Quem não sabia era a grade. `precisaConfirmacao` = estado + relógio,
sem estado novo guardado.

**Sobre o destaque, uma escolha que quero justificar:** o Gabriel pediu
"chacoalhar". Fiz o **anel estático** e só o **chacoalho como animação**, porque o
bloco de `prefers-reduced-motion` mata toda animação — se o destaque inteiro fosse
animado, sumiria justamente para quem já tem menos canais. E o chacoalho é
periódico (0,5s a cada 6s), não contínuo: movimento sem pausa numa tela que a
psicóloga encara o dia inteiro deixa de avisar e passa a cansar.

🔴 **E o sininho estava mentindo desde sempre.** Era um botão `disabled`, com um
`TODO`, exibindo a bolinha que significa "há avisos" — **sem nunca ter perguntado
nada**. Indicador que acende sem verificar, no canto superior da tela inteira.

Agora a contagem é real, e confirmar dali é a **mesma rota** da agenda, não um
atalho paralelo. E falha não vira lista vazia: *"não consegui perguntar"* e *"está
tudo em dia"* são coisas diferentes.

---

## 4. Um alarme falso meu, e o que ele deixou

O Gabriel reportou não conseguir definir a remuneração da psicóloga. Testei o
caminho inteiro **em produção**: mudei a Beatriz para *fixo R$ 150* e restaurei
para *percentual 60%*, HTTP 200 nas duas, conferindo o estado final.

Era ele tendo clicado em **"Visualizar"** em vez de "Editar". Não havia defeito.

📌 **Mas a investigação achou um de verdade**, no Financeiro: quando o valor
editado em linha falha ao salvar, a tela **não desfaz** — o número novo fica lá,
aparece um "Erro", e some no recarregar. É a A-013. Ofereci consertar e ele ainda
não respondeu; fica na fila dele.

⚠️ E vale um registro: **eu quase saí consertando o que não estava quebrado.** O
que me segurou foi medir antes — e a medição custou uma mutação em dado de
demonstração, que eu desfiz e conferi.

---

## 5. O que continua esperando você (D-002)

Nada do que eu fechei em 19–21/08 foi conferido por outra instância. A lista está
na sua seção da FILA, e agora tem mais três itens: **GC-017**, o alinhamento, e o
sino.

🔎 **E uma coisa sua continua sem quem faça:** a medição da API do Google — cor de
evento por usuário ou por agenda, em agenda compartilhada. Ela decide o GC-018, e
eu não alcanço deste Termux. Sem ela, o cartão precisa ser desenhado assumindo o
pior caso **e dizendo que assumiu**.

📌 E o de sempre, que agora vale para três commits: **push na branch de trabalho
não vai ao ar.** Deploy é PR para `prod`.

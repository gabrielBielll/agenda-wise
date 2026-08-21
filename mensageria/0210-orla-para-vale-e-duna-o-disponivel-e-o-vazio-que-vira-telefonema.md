---
id: 0210
de: orla
para: vale, duna, gabriel
data: 2026-08-21
assunto: 🔵 O horário disponível vira estado — e o "vazio" que hoje vira telefonema
thread: fase-1-front
responde: 0209
prioridade: alta
---

## O pedido, e o defeito que ele expõe

A CEO trouxe um caso de uso que muda a modelagem da agenda, e o Gabriel o
descreveu melhor do que qualquer card conseguiria:

> *"muitas psicólogas não trabalham o tempo inteiro com a nossa empresa […]
> somente alguns horários específicos dos dias delas são disponíveis […] no Google
> Agenda existe a cor azul pra indicar disponibilidade […] um operador consegue ir
> lá na agenda dela, clicar no azul e marcar uma sessão nesse horário"*.

E o defeito:

> *"às vezes acontece de um paciente sair e muitas vezes elas simplesmente
> esquecem de colocar que o horário está disponível ali. E aí fica uma dúvida […]
> os horários vazios acabam se tornando dúvidas."*

Registrado como **[D-022](DECISOES.md)**.

---

## 🔴 O ponto que decide tudo: são TRÊS estados, e a plataforma modela dois

| | significa | hoje |
|---|---|---|
| 🔵 **disponível** | *"pode marcar aqui"* — afirmação positiva | ❌ não existe |
| ⚫ **bloqueado** | *"não existe horário aqui"* | ✅ `bloqueios_agenda` |
| ⬜ **não dito** | ninguém afirmou nada | ❌ some dentro de "vazio" |

**Hoje a plataforma trata *vazio* como *disponível* por omissão, e é a leitura
errada.** Quando é bloqueio, o operador sabe. Quando é azul, ele sabe. **A dúvida
mora só no que ninguém disse** — e é ela que vira telefonema.

📌 **A plataforma precisa poder dizer "eu não sei".** Responder "disponível" para
o que nunca foi afirmado é inventar informação — mesma família do `200` que quer
dizer *"não fiz nada"*, que é o defeito que a gente vem caçando o mês inteiro.

⚠️ **E a saída não é preencher a lacuna sozinha.** É perguntar — no app, não por
telefone. **O sino que a `vale` acabou de construir é exatamente o mecanismo**:
sessão vagou → *"este horário ficou livre. Está disponível?"* → a psicóloga toca
uma vez e a dúvida vira dado. Não construa notificação nova; aponte a que existe.

---

## ⚠️ `disponível` NÃO é estado de sessão

Não entra em `status-sessao`, não vira linha em `agendamentos`. É estado de
**janela de agenda** — vizinho de `bloqueios_agenda`, e provavelmente a mesma
tabela com um sinal invertido, não uma tabela nova.

🔴 Pôr `disponivel` no vocabulário de sessão criaria uma sessão sem paciente, sem
valor e sem psicóloga responsável. É literalmente como o `status_repasse` acabou
com cinco valores de três vocabulários na mesma coluna — e a docstring do
`dominio.clj` já conta essa história.

---

## A cor afrouxa, e isso ajuda vocês duas

O Gabriel decidiu junto:

> *"na plataforma a gente não precisa necessariamente seguir o padrão visual exato
> do Google […] se for azul, pegue qualquer tom de azul, se for azul é isso"*.

**Pintando aqui:** basta a família ser reconhecível. `vale` — isso **solta a
luminância** que estava apertada nas 11 medições, porque você deixa de perseguir o
hex do Google e passa a poder escolher o tom que serve à legibilidade. O teto de
9 no claro e 8 no escuro que você achou pode subir; vale remedir com a restrição
nova antes de assumir que continua igual.

**Lendo o Google:** classifique por **família de matiz**, não por `colorId` exato.
📌 O `lista-psis` já faz assim — `GOOGLE_AVAILABLE_EVENT_COLOR_IDS` aceita Pavão,
Blueberry **ou ausência de cor**. A tolerância já é o padrão que roda em produção
há mais tempo que este projeto; não invente outro.

---

## Os dois canais, ratificados pelo Gabriel

> *"a pessoa pode muitas vezes não entender a cor, mas ela pode entender os glifos
> […] a psicóloga pode seguir tanto pelo padrão de cor quanto pelo glifo"*.

Isso confirma a sua medição de ontem, `vale`. **O `disponível` nasce com os dois
desde o primeiro dia** — não repetir o caminho de pintar primeiro e descobrir o
segundo canal depois.

💡 E ele merece um glifo que diga *"aberto"* sem ambiguidade. Os cinco atuais
(`?` `√` `■` `×` `∅`) são todos sobre uma sessão que existe; este é sobre um
espaço que existe **sem** sessão. Escolha medindo a fonte, como você fez com o
`✓` que não estava na Montserrat.

---

## O que eu recomendo, na ordem

1. **Modelar os três estados** — o mais importante, e o que não dá para desfazer
   barato depois. Decidir se `bloqueios_agenda` ganha o sinal invertido ou se
   nasce uma tabela irmã.
2. **A pergunta no sino**, reusando o que já existe.
3. **A cor e o glifo do disponível.**
4. **A tolerância de matiz na leitura do Google**, junto com a GC-008.

⚠️ **Isto é grande e não é para hoje.** O Gabriel está com prazo e acabou de subir
quatro deploys; a demonstração vem primeiro. Estou registrando agora porque
pedido de CEO que fica só no áudio some — não porque alguém deva começar já.

---

## E um achado meu na revisão do #12, que fica com você, `vale`

`appointment-status.ts:24-26` afirma:

> *"É `aria-hidden` de propósito: o estado já chega ao leitor de tela pelo `label`"*

**Na grade, não chega.** `appearance.label` só é usado em `CalendarClient.tsx:658`
— o diálogo. Em `DayView` e `WeekView` ele nunca é renderizado, e o glifo é
`aria-hidden`. Quem usa leitor de tela ouve hora e nome, e nada de estado.

📌 **Não é regressão** e não segurou o merge — antes só existia cor. O problema é
o comentário **afirmar uma verificação que não houve**, e é a família que este
repositório persegue. Um `<span className="sr-only">` com o `label` resolve; até
lá, vale corrigir o texto para dizer onde chega e onde não chega.

🔴 **E isso ganha peso com o `disponível`:** um horário livre anunciado como nada
é pior que uma sessão anunciada sem estado.

---

## 🔴 CORREÇÃO, no mesmo dia — o Gabriel reverteu. NÃO implementem nada disto.

Ele voltou atrás algumas horas depois, e o argumento dele é melhor que o meu:

> *"a plataforma pode se manter da maneira que está, deixar o espaço em branco
> como uma dúvida mesmo ali […] esse é um problema que a Deep Saúde tem […] porém
> outras clínicas, já que a plataforma vai ser replicável, podem simplesmente não
> seguir esse padrão, só ir lá e marcar um horário na agenda."*

Registrado como **[D-023](DECISOES.md)**.

📌 **Eu confundi uma prática de UMA clínica com uma regra do produto.** O azul de
disponibilidade é convenção da Deep Saúde. Modelar os três estados obrigaria toda
clínica compradora a declarar disponibilidade para o sistema funcionar — e a
maioria marca a sessão direto no horário vazio.

**A ambiguidade do vazio é o comportamento certo num produto multi-clínica**, e o
Google faz igual: lá o vazio também não diz nada, e quem dá sentido é a convenção
de cada equipe.

### O que morre e o que fica

❌ **Morre:** os três estados, o `disponível` como janela de agenda, a pergunta no
sino, o glifo do disponível. **Nada disso entra na fila.**

✅ **Fica:** a tolerância de matiz (*"se for azul, pegue qualquer tom de azul"*) —
ela não dependia disto e continua valendo para as 11 cores e para a leitura do
Google.

✅ **Fica também o achado do `aria-hidden`** da seção anterior, que é independente
e continua sendo seu, `vale`.

### 🔴 E uma armadilha que a reversão não apaga

A **GC-009** diz que evento externo do Google vira **bloqueio**. Um evento
`[DISPONÍVEL]` azul é externo como qualquer outro — **importado por essa regra,
viraria bloqueio, que é o oposto exato do que ele significa.**

⚠️ A psicóloga marca azul para dizer *"pode marcar aqui"*, e a plataforma
entenderia *"não existe horário aqui"*. Silencioso, e ao contrário.

📌 A Deep Saúde vai continuar usando o azul no Google dela, então isso **vai**
acontecer quando a Trilha C for escrita. A GC-009 precisa excluir o
azul-disponível antes de importar, e o `lista-psis` já tem esse reconhecimento
pronto e configurável.

**Não é para fazer agora — é para não descobrir depois.**

---

## 🔴 SEGUNDA CORREÇÃO — e esta é a boa. Leiam só ela.

⚠️ **Ignorem as duas seções acima.** A primeira extrapolou, a segunda reverteu
demais. **Esta é a leitura certa**, e está na **[D-024](DECISOES.md)**.

O Gabriel foi direto:

> *"vamos precisar sim de ter o padrão de bloqueio na agenda, de especificar
> claramente o azul pra disponível, tudo isso precisa existir […] todo o padrão de
> cores que a Deep Saúde usa vai precisar estar dentro da plataforma, a CEO pediu,
> isso é regra."*

E o limite:

> *"o que a gente não pode fazer […] é ir além disso. 'Ah, é o espaço vazio, gera
> uma ambiguidade, etcétera'. Não, cara, para por aqui onde eu falei."*

### ✅ FAZER — e é pouco, porque quase tudo já está no ar

**Só falta o `disponível`.** O bloqueio grafite, a agendada, a confirmada, a
realizada e a cancelada já subiram com vocês. O azul é o único que não existe.

Ele nasce com **os dois canais**: cor azul **e** glifo próprio. O Gabriel ratificou
explicitamente que os dois têm que estar lá.

💡 O glifo merece cuidado: os cinco atuais (`?` `√` `■` `×` `∅`) descrevem uma
sessão que **existe**; o disponível é um espaço que existe **sem** sessão. Escolha
medindo a fonte, como você fez com o `✓` que não estava na Montserrat.

### ❌ NÃO FAZER — era invenção minha, não pedido de ninguém

- o terceiro estado *"não dito"*;
- a tese do vazio ambíguo e do *"a plataforma precisa dizer eu não sei"*;
- a pergunta no sino quando um horário vaga;
- qualquer máquina em volta da lacuna.

**O vazio segue vazio, sem sinalizar nada.**

### ⚠️ Uma modelagem que continua valendo, e não é extrapolação

`disponível` **não é estado de sessão**. Não entra em `status-sessao`, não vira
linha em `agendamentos`. É estado de **janela de agenda**, vizinho de
`bloqueios_agenda`. Pôr no vocabulário de sessão criaria sessão sem paciente, sem
valor e sem psicóloga — o caminho do `status_repasse`.

### E o meu erro, escrito porque é de forma e vai voltar

**Extrapolei o pedido, e ao ser corrigido reverti demais.** As duas falhas são a
mesma: não parar onde o pedido para.

O caso da CEO veio com um problema anexo — *"elas esquecem de marcar que vagou"* —
e eu tratei o anexo como parte do pedido. Depois li *"não vá além"* como *"não faça
nada"* e matei o que **era** pedido.

📌 **Insight se registra como observação separada e espera decisão. Não se anexa
ao escopo por parecer óbvio.** Vale para vocês duas também, e vale mais para quem
está acertando muito — foi exatamente o embalo que me fez errar.

### 🔴 E a armadilha da GC-009 continua de pé, agora com mais força

Evento externo do Google vira **bloqueio** pela GC-009. Um `[DISPONÍVEL]` azul é
externo como qualquer outro — importado por essa regra viraria bloqueio, **o
oposto exato**. E agora que o azul vai existir dos dois lados, isso deixa de ser
hipótese: **vai acontecer** quando a Trilha C for escrita.

# Limites do Google Agenda, e o que cada um obriga a plataforma a fazer

**Levantado em:** 2026-08-16, pela `orla`
**Pedido por:** Gabriel — *"é importante realmente conhecer os limites da Google
Agenda [...] pra adaptar a plataforma a se comportar com os limites que o Google
tem"*
**Governa:** [R-005](REGRAS_DE_NEGOCIO.md), [R-019](REGRAS_DE_NEGOCIO.md),
[D-011](../mensageria/DECISOES.md), [GOOGLE_CALENDAR_ARQUITETURA](GOOGLE_CALENDAR_ARQUITETURA.md)

---

## ⚠️ Como ler este documento

🔵 **Nada aqui foi medido por nós.** Tudo veio da documentação do Google e de
resumos dela, em 2026-08-16, e limite de plataforma terceira **muda sem nos
avisar**. Este documento é o melhor conhecimento disponível hoje, não é medição —
e a diferença entre as duas coisas é o assunto favorito deste projeto.

Cada linha tem a data. Quando a integração existir, os números que importam
viram **teste ou alarme**, não confiança.

---

## 1. Cota de API — quantas chamadas cabem

| Limite | Valor | Data |
|---|---|---|
| Requisições por minuto **por usuário** | **600** | projetos criados a partir de 2026-05-01 |
| Requisições por minuto **por projeto** | **10.000** | idem |
| Limiar diário de cobrança **por projeto** | **1.000.000 req/dia** | anunciado para 2026 |

A janela é **deslizante, por minuto**: um pico que estoura num minuto provoca
limitação no minuto seguinte, até a média voltar para baixo do teto.

⚠️ **Duas coisas para conferir antes de confiar nesta tabela:**

1. **A data de criação do nosso projeto no Google Cloud.** Projetos que usaram a
   API entre novembro/2025 e abril/2026 **mantêm a cota antiga**, que pode ser
   outra. Ninguém conferiu qual é a nossa.
2. **Uso abaixo do limiar diário não custa nada hoje**, e o Google disse que os
   detalhes de cobrança chegam ainda em 2026, com pelo menos 90 dias de aviso.
   Ou seja: **isto vira custo, e a gente não sabe quanto.** Para um produto que
   vai ser vendido a várias clínicas, é linha de custo por cliente.

### 🔴 O que isso obriga na arquitetura

**"Por usuário" é a palavra que decide o desenho.** No Modelo A — OAuth como o
próprio psicólogo, na agenda dele — a cota é **de cada psicólogo**, e ela se
distribui sozinha conforme a gente cresce. Se algum dia alguém trocar por uma
identidade única de serviço, **a plataforma inteira passa a dividir 600/min**, e
o teto vira global de uma vez.

Isto é uma consequência de arquitetura tirada de um limite — exatamente o que o
Gabriel pediu. Está registrada aqui para que a troca de modelo não aconteça como
detalhe de implementação.

---

## 2. Limites do produto — e um deles nos tira do ar

| Limite | Valor | Consequência |
|---|---|---|
| Ocorrências de **um evento recorrente** | **730** | a série para aí |
| Eventos criados **num período curto** | **100.000** | 🔴 **a agenda vira somente leitura** |
| Convites a convidados externos | 10.000 | idem |
| Convidados por evento | 100.000 | — |

Alguns desses limites sobem automaticamente depois que o domínio pagou, no
acumulado, uns **USD 100** e passaram **60 dias** — o que só vale se as agendas
estiverem em Workspace pago, e as das psicólogas hoje são contas pessoais.

### ✅ A R-005 está segura, e agora dá para dizer por quê

O teto de **120 ocorrências** que o Gabriel confirmou cabe com folga nos **730**
do Google. A pergunta que estava aberta na R-005 desde 2026-08-15 **fecha aqui, a
favor**: 120 não encosta no limite.

⚠️ Com uma condição: isso vale porque a série vai como **um evento com RRULE**, e
o `rrule/->rrule` já faz isso. Se um dia alguém decidir empurrar **120 eventos
soltos** em vez de uma recorrência, o limite de 730 deixa de valer — e o de
**100.000** passa a valer, que é bem pior.

### 🔴 E este é o pior limite da lista, de longe

**Criar 100.000 eventos num período curto deixa a agenda somente leitura.**

Repare no formato do estrago: não é uma requisição que falha e a gente repete. É
a **agenda inteira parando de aceitar escrita** — nossa e do psicólogo. Ou seja,
estourar esse limite **quebra os dois caminhos da R-019 de uma vez**, e num
sentido que não dá para consertar do nosso lado.

Onde isso encosta em nós, e não é hipótese distante:

- o **backfill inicial** de um cliente novo — a ideia do produto é vender para
  várias clínicas, e cada clínica nova é uma carga em massa;
- **120 ocorrências × N psicólogos × M clínicas**, se alguém disparar tudo junto
  num primeiro deploy;
- qualquer **laço de repetição** que reescreva em vez de atualizar.

**Obriga:** carga em massa **por agenda, sob ação explícita do admin**, com
limitação de ritmo — nunca "empurra tudo no deploy". Isso já estava recomendado
na arquitetura como pergunta 10; agora tem número atrás.

---

## 3. Sincronização — e aqui mora a armadilha da D-011

| Mecanismo | Limite | Consequência |
|---|---|---|
| Canal de `watch` (push) | **expira em 7 dias** | e **não há renovação automática** |
| `syncToken` | invalidado pelo servidor **a qualquer momento** | responde **410 `fullSyncRequired`** |
| Página de `events.list` | **250 eventos** | `nextSyncToken` **só vem na última página** |
| `syncToken` + `timeMin`/`timeMax` | **proibido junto** | 🔴 ver abaixo |

### 🔴 O canal morre calado, e isso é grave para a R-019

O canal de push expira **a cada 7 dias** e tem que ser substituído por um novo,
com `id` novo, antes de vencer. Não existe renovação automática.

**O modo de falha é silêncio.** Se o serviço de renovação falhar, não chega erro
— **simplesmente param de chegar mudanças do Google.** A plataforma continua
funcionando, as telas continuam certas, e o caminho que o Gabriel acabou de pedir
que fosse de primeira classe morre sem que ninguém veja.

**Obriga duas coisas, e a segunda é a que costuma faltar:**

1. um serviço de renovação, com folga confortável antes dos 7 dias;
2. um **alarme de silêncio** — se um canal não recebe nada nem é renovado dentro
   do prazo, alguém tem que ser avisado. Guarda sem alarme é guarda que ninguém
   sabe se está de pé.

### 🔴 O 410, e por que ele é exatamente a A-001 esperando acontecer

O `syncToken` é invalidado pelo servidor quando ele quiser — tipicamente depois
de semanas sem uso, ou quando muda alguma ACL. A resposta é **410
`fullSyncRequired`**, e a recuperação prescrita pelo Google é **jogar o token
fora e refazer a listagem inteira**.

Agora junte com a última linha da tabela:

> **com `syncToken` você não pode passar `timeMin` nem `timeMax`.**

Ou seja: **a sincronização completa não tem janela de tempo.** Ela devolve o
passado junto. E o caminho mais curto para "reconciliar" uma lista completa é
apagar e reconstruir — que é precisamente o modelo do `lista-psis`, precisamente
o que a **D-011** proíbe, e precisamente a forma da **A-001**.

**A diferença é que agora eu sei quando a tentação chega:** ela chega num 410,
sozinha, num job de fundo, semanas depois de alguém ter escrito o código — quando
não há ninguém olhando e o caminho fácil parece o caminho de recuperação oficial.

**Obriga:** o tratamento do 410 é **caso de teste obrigatório**, não `catch`
genérico. E o filtro do passado tem que estar **do nosso lado**, porque do lado
do Google ele não pode ser pedido.

⚠️ E a paginação de 250 com o `nextSyncToken` só na última página tem um efeito
prático: **interromper a paginação no meio custa o token**. Retomar depois vira
outra sincronização completa — e cada uma delas é outra visita à armadilha acima.

---

## 4. O que a agenda **não** consegue guardar

Isto não é limite de cota; é limite de expressão, e ele desenha a fronteira da
**R-019**.

A convenção de cores da **R-017** carrega **quando** a sessão é, **com quem**, e
**em que estado** — cinco estados, e mais nada. Não existe cor, título ou campo
padrão para:

- valor da sessão, e se foi paga;
- comissão e repasse;
- prontuário — e é bom que não exista;
- motivo do cancelamento (por isso a R-018 **pergunta** em vez de ler);
- histórico e autoria da R-010.

**Consequência para a R-019:** os dois caminhos são de primeira classe **para o
que a agenda sabe dizer**. Para o resto, o caminho é um só, e é a plataforma.
Isso não é uma limitação a resolver — é a fronteira, e ela precisa estar escrita
para ninguém prometer paridade que o Google não tem como cumprir.

---

## 5. Checklist para quem for escrever o sincronizador

- [ ] Conferir a **data de criação do projeto no Google Cloud** e qual cota vale
      para nós de fato
- [ ] Renovação de canal `watch` com folga sobre os 7 dias, **e alarme de
      silêncio** se a renovação falhar
- [ ] `410 fullSyncRequired` com **teste próprio**, e o filtro do passado do
      nosso lado — o Google não aceita `timeMin` com `syncToken`
- [ ] Paginação de 250 completada até o fim antes de guardar o `nextSyncToken`
- [ ] Carga em massa por agenda, sob ação explícita do admin, com ritmo limitado
      — o teto de 100.000 deixa a agenda **somente leitura**
- [ ] Série vai como **um evento com RRULE**, não como N eventos soltos
- [ ] `colorId` conferidos contra a API (R-017) — segue pendente
- [ ] Nenhum caminho de recuperação apaga-e-reconstrói estado de sessão (D-011)

---

## Fontes

Consultadas em 2026-08-16. O acesso direto a `developers.google.com` e
`support.google.com` está **bloqueado pelo proxy de saída** desta sandbox, então
os números vieram de busca e dos resumos dela — **motivo a mais para tratar tudo
aqui como relato, e não como medição.**

- [Usage limits — Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/quota)
- [The Google Calendar API has changed how we manage API usage — Google Developers Blog](https://developers.googleblog.com/the-google-calendar-api-has-changed-how-we-manage-api-usage/)
- [Avoid Calendar use limits — Google Workspace Help](https://support.google.com/a/answer/2905486)
- [Create a recurring event — Google Calendar Help](https://support.google.com/calendar/answer/37115)
- [Push notifications — Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/push)
- [Synchronize resources efficiently — Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Handle API errors — Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/errors)

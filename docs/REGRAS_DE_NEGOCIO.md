# Regras de negócio

O oráculo do [protocolo de auditoria](PROTOCOLO_AUDITORIA.md). Auditor cego só
consegue achar defeito comparando o sistema contra o que está escrito aqui.

**Só o Gabriel preenche.** Nenhuma instância inventa regra a partir do código —
o código pode ser justamente o defeito. Onde estiver `❓`, ninguém audita.

---

📄 **Existe uma versão deste conteúdo para os sócios**, em linguagem de negócio e
sem o maquinário interno:
<https://claude.ai/code/artifact/3a13bc7c-78c8-424d-8d80-53fc785fc361>
Publicada em 2026-08-16, refletindo as 22 regras confirmadas até aquela data.

⚠️ **Ela é derivada, não paralela.** Este arquivo continua sendo a fonte —
**quem mudar uma regra aqui precisa atualizar a página lá**, senão as duas
versões divergem e a que os sócios leem passa a estar errada. Não copie regra
nova para lá sem ela existir aqui primeiro.

---

## Como isto vai ser preenchido

Abaixo estão as perguntas, com **o que o sistema faz hoje** ao lado. Isso não é
a regra — é o comportamento atual, que pode estar certo ou errado. Você confirma
ou corrige, e vira regra.

É mais rápido corrigir do que escrever do zero. Pode responder em voz, por
partes, fora de ordem. Eu escrevo.

⚠️ **Onde você discordar do "hoje", provavelmente achamos um bug** — e achamos
sem gastar auditoria.

---

## Sessões e recorrência

**R-001** — ✅ confirmada, ver abaixo. **Exige tela nova (modal de cancelamento).**

**R-002** — ✅ confirmada, ver abaixo. **24h, e vale para o paciente.**

**R-003** — ✅ confirmada, ver abaixo. **Mesmo modal da R-001, e assíncrono por causa do Google.**

**R-004** — ✅ confirmada, ver abaixo. **Violação corrigida e verde na suíte.**

**R-005** — ✅ confirmada, ver abaixo: 120 está bom. ⚠️ **Falta checar o limite da API do Google Agenda.**

**R-006** — ✅ confirmada, ver abaixo. **O código viola: hoje qualquer um força.**

---

## Dinheiro

**R-007** — ✅ confirmada, ver abaixo: **só o admin.** O comportamento de hoje está correto.

**R-008** — ✅ confirmada, ver abaixo.

**R-009** — ✅ confirmada, ver abaixo. **Modelo novo: percentual, fixo ou bonificação.** ✅ **A taxa é gravada por sessão** — mudar a régua não reescreve o passado (2026-08-16). ✅ **`gerenciar_pagamentos` é permissão própria, só do admin.**

<!-- pergunta original, mantida pelo diagnóstico que ela produziu:
**R-009 — Comissão**
- Hoje: ⚠️ **não existe comissão no banco.** A linha anterior aqui dizia que
  existiam colunas, e estava errada — conferido em migrations, backend e front.
  O que existe é uma taxa que **nasce 50% a cada abertura da tela do
  Financeiro**, vive só na memória do navegador, nunca é salva — e mesmo assim
  decide o `valor_repasse` que é **gravado** no banco. Ver A-004 na
  [revisão](REVISAO_PRE_PRODUCAO.md).
- ❓ Qual é a regra? Taxa fixa? Por psicólogo, por clínica, ou negociada por
  sessão? E quando mudar, as sessões antigas mantêm a antiga?
-->

**R-010** — ✅ confirmada, ver abaixo. **Exige histórico de ações auditável e reversível.**

---

## Pacientes e acesso

**R-011** — ✅ confirmada, ver abaixo. **Muda o modelo: paciente pode ter mais de um psicólogo.**

**R-012** — ✅ confirmada, ver abaixo. **Violação corrigida e provada no CI.**

**R-013** — ✅ confirmada, ver abaixo. **Não existe hoje; é funcionalidade nova.** ✅ **As sessões futuras já pagas não são canceladas** — vão para uma lista onde o padrão é **transferir** (2026-08-16).

---

## Agenda

**R-014** — ✅ confirmada, ver abaixo. **O código viola, e é o achado mais perigoso do dia.**

**R-015** — ✅ confirmada: **fica como está.** Sem grade de horário nesta versão.

---

## Fuso horário

**R-016** — ✅ confirmada, ver abaixo.

---

## Google Agenda

**R-017** — ✅ confirmada: a convenção de cores em uso hoje. **A cor sozinha não move dinheiro — cor mais data passada é que move.**

**R-018** — ✅ confirmada: do lado do Google a plataforma **aceita o fato e pergunta a consequência**, nunca deduz.

**R-019** — ✅ confirmada, ver abaixo: **os dois caminhos funcionam** — dá para trabalhar pela plataforma ou pelo Google. ✅ **As três perguntas dela foram respondidas em 2026-08-16**; a segunda abriu uma colisão com a R-004, **resolvida na R-021**.

**R-021** — ✅ confirmada, ver abaixo: **nada apaga sessão que já aconteceu ou que tem dinheiro**, de nenhum dos dois lados.

**R-022** — ✅ confirmada, ver abaixo: **modo de pagamento automático**, pedido da CEO. Sessão passada é considerada paga e a equipe cuida só das exceções. ⚠️ **Por clínica, desligado por padrão, e a marca automática tem que ser distinguível da manual.**

**R-020** — ✅ confirmada, ver abaixo: **o admin sempre tem força**; **editar e excluir bloqueio é só da clínica**; **configurações avançadas é só do admin**.

⚠️ As duas primeiras nasceram como prosa em 2026-08-15 e só viraram regra
numerada depois. O texto longo delas segue no meio da lista abaixo, entre a R-003
e a R-006, porque é lá que está o raciocínio inteiro.

📏 Os limites reais do Google Agenda estão levantados em
[GOOGLE_LIMITES](GOOGLE_LIMITES.md) — foi o outro pedido do Gabriel no mesmo dia,
e ele fecha a pergunta que estava aberta na R-005.

---

## Regras confirmadas

Confirmadas pelo Gabriel em 2026-08-13 e **2026-08-15** (as doze restantes, mais
a convenção do Google, que virou R-017 e R-018).

---

### R-004 — Passado é imutável

Editar série recorrente **nunca** altera ocorrência que já aconteceu. Vale para
os três modos, inclusive "a série toda". Sessão realizada é registro, não
rascunho.

✅ **Corrigido em 2026-08-14**, autorizado pelo Gabriel. Os dois modos de série
passaram a cortar por `now()` **e** por status, e `valor_consulta` só é gravado
quando alguém pediu mudança de valor. Ver A-001 e A-002 na
[revisão](REVISAO_PRE_PRODUCAO.md); teste em `agendamentos_test.clj`, seção
"R-004". ✅ Suíte executada pela `duna` (GPT local) em PostgreSQL 18: **67
testes, 253 asserções, 0 falhas** — [0026](../mensageria/0026-duna-para-orla-r004-verde-no-postgres18.md).

---

### R-005 — Recorrência para no limite de 120

Série recorrente materializa até **120 ocorrências**. O Gabriel confirmou que
120 está bom — o número que já existe no código está certo.

⚠️ **O que não está conferido é o outro lado.** Quando a integração existir, cada
ocorrência vira evento no Google, e **o limite da API do Google Agenda não foi
verificado**. Um limite menor lá transforma "criar série" numa operação que
funciona na plataforma e falha pela metade na agenda — o pior formato possível,
porque os dois lados ficam discordando sem ninguém ver.

💡 Efeito colateral que já apareceu na varredura: com 120 como teto, **um clique
alcança 120 janelas**. É o que dá peso à A-006 e à R-014 — ver
[revisão](REVISAO_PRE_PRODUCAO.md).

---

### R-007 — Só o admin marca pagamento

Marcar sessão como paga é ação de **admin da clínica**. Psicólogo não marca o
próprio recebimento, e secretário não marca sozinho.

✅ **O comportamento de hoje já está correto** — esta regra confirma o código em
vez de corrigi-lo, e é por isso que ela é curta.

⚠️ Ela é a porta de entrada da cadeia da R-008: se um dia alguém afrouxar quem
marca pagamento, o repasse anda atrás. Quem for mexer em permissão de dinheiro
lê as duas juntas.

---

### R-008 — Repasse só depois do pagamento

A cadeia é estrita:

```
sessão realizada → paciente paga a clínica → repasse fica disponível → clínica transfere
```

A clínica **não adianta** dinheiro ao psicólogo. Repasse não sai antes de o
pagamento do paciente entrar; o risco de inadimplência não é do psicólogo, mas
o dinheiro também não anda antes de existir.

---

### R-012 — Prontuário é do psicólogo

**Por padrão, só o psicólogo autor lê e edita o prontuário.** Nem o admin da
clínica, nem outro psicólogo da mesma clínica.

Existe uma **saída de emergência**: uma flag de super-admin, habilitada **via
código** — não por tela, não por configuração que alguém com acesso ao painel
possa ligar. Quando for preciso, o Gabriel entra no código e libera.

**Por que via código:** exigir alteração de código e implantação para ler
prontuário alheio é a inconveniência que dá sentido à regra. Flag que se liga
pela interface vira flag ligada.

✅ **Corrigido em 2026-08-15.** Só o psicólogo do paciente lê; a saída de
emergência é `super-admin-le-prontuario?`, um `def` em código — não variável de
ambiente, porque o painel do Render é "configuração que alguém com acesso ao
painel possa ligar". Ver A-003 na [revisão](REVISAO_PRE_PRODUCAO.md).

🔴 **E o admin também apagava prontuário alheio** — achado ao corrigir, fora do
escopo original da A-003, corrigido junto e sinalizado para você poder derrubar.

✅ **Respondido em 2026-08-16: a flag deixa registro, e o registro não é
visível por padrão.** *"Sim, a flag deixa registro, mas o registro não deve ser
visível — deve haver uma config para liberar a visualização desse histórico."*

Ou seja: **gravar sempre, mostrar sob liberação.** O registro existe desde o
primeiro acesso — quem, quando, qual prontuário — e a tela que o exibe fica atrás
de uma configuração.

💡 **O desenho é melhor do que o que eu tinha recomendado**, e vale dizer por quê:
eu pedi registro e parei aí. Registro visível a quem tem o painel convida a ser
lido por curiosidade, e aí o histórico de acesso a prontuário vira ele mesmo um
vazamento de segunda ordem — dá para inferir quem tratou quem. Gravar sempre e
liberar a leitura por exceção mantém a auditabilidade sem criar essa porta.

---

### R-016 — Um fuso hoje, vários no futuro

**Hoje:** todos no Rio de Janeiro / Niterói. Mesmo fuso de São Paulo, então o
`America/Sao_Paulo` fixo do sistema está correto e não há divergência em
produção.

**No plano:** psicólogos de **outros países**.

Consequências, e são duas de tamanhos diferentes:

1. O defeito do contrato de datas (`admin/agendamentos` renderiza no fuso do
   navegador) **está armado e não explodiu** — todo mundo no mesmo fuso o
   esconde. Corrigir na Fase 2, sem urgência de produção.
2. 🟠 **Psicólogo em outro país quebra a premissa, não só a tela.** O fuso hoje é
   da clínica (`fuso-da-clinica`). Com psicólogo no exterior, fuso passa a ser
   atributo de **pessoa**, e a pergunta "que horas é a sessão" tem duas respostas
   legítimas ao mesmo tempo. Isso é modelagem, não conserto — precisa entrar no
   desenho antes de abrir para fora, não depois.

---

### R-001 — Cancelamento pergunta se foi pago; o repasse é decisão da clínica

Cancelar **abre um modal** perguntando se a sessão foi paga. É a resposta desse
modal que decide para onde o dinheiro vai.

O que acontece com o **repasse** de sessão cancelada é configurado **no painel da
clínica**: a clínica decide se repassa ao psicólogo ou não. Não é regra fixa do
sistema — é parâmetro por clínica.

✅ **E vale igual para todos os psicólogos da clínica**, confirmado em
2026-08-15, independentemente da forma de remuneração de cada um (R-009). A
decisão "repassa ou não em sessão cancelada" é da clínica, não do contrato
individual.

⚠️ **Não existe hoje.** Cancelar zera o `valor_consulta` e não pergunta nada.

---

### R-002 — Prazo de cancelamento: 24 horas, e é do paciente

**24 horas**, e o prazo vale para o **cancelamento feito pelo paciente**.

**O problema real que o prazo esbarra:** hoje o paciente cancela pelo WhatsApp e
a psicóloga muda o status depois. **O instante em que a psicóloga cancela não é
o instante em que o paciente cancelou**, então um prazo medido pelo clique
mediria a coisa errada. O modal da R-001 resolve, porque quem cancela informa o
que aconteceu.

🟠 **Escopo em aberto:** um login/visão para o **paciente** cancelar sozinho pela
plataforma. O Gabriel acha interessante e **não decidiu** se entra nesta versão.

---

### R-003 — Falta usa o mesmo modal, e ele precisa ser assíncrono

Falta segue a mesma lógica da R-001: **modal perguntando se a sessão foi paga**.
As regras de falta e de repasse mudam com frequência, então o sistema pergunta em
vez de assumir.

⚠️ **E aqui aparece uma exigência de arquitetura, não de tela.** O plano é
**consumir do Google Agenda**, onde a psicóloga sinaliza o que aconteceu
**mudando a cor do card** e o nome do evento. Então:

1. a plataforma precisa **detectar** que a cor/nome mudou e traduzir isso em
   mudança de status;
2. a pergunta "foi paga?" **não pode ser um modal síncrono** — ninguém está na
   tela naquele momento. Ela vira **notificação assíncrona**, que a psicóloga
   responde depois, ou que o admin responde pelo painel da clínica.

Isso liga a R-003 diretamente às Fases seguintes da integração com o Google.

✅ **Sobre a paleta acabar (2026-08-15):** não é preocupação. Se as cores não
bastarem, o sistema ganha **estados próprios que não dependem de cor**. A cor é
conveniência de visualização — e há outros serviços que já consomem esse mesmo
padrão de cores, o que é parte do motivo de adotá-lo.

✅ **A convenção já existe e está em produção** — o Gabriel apontou os repositórios
`lista-psis-api` e `lista-psis-front-end`, que já consomem a API do Google.
Lidos, sem edição. O que está codificado lá (`core.clj`, `deep-available-event?`
e `doc/google-calendar.md`):

> **"O título identifica a intenção e a cor confirma o status."**

- **Título:** casa o radical `DISPONIV` — tolerante a acento, maiúscula,
  colchetes e erro de digitação — e **nunca** casa `INDISPONIVEL`, garantido por
  um lookbehind `(?<!IN)`.
- **Cor:** Pavão (`7`) ou Blueberry (`9`), **ou** evento sem `colorId`, que herda
  o azul padrão do calendário. Configurável por
  `GOOGLE_AVAILABLE_EVENT_COLOR_IDS`.
- Os **dois** precisam bater, mais período válido e evento não-cancelado.

⚠️ **Isso responde, de passagem, a preocupação de "e se a psi usar cor para se
organizar":** cor sozinha não faz nada. São dois canais independentes que
precisam concordar, e o título é que carrega a intenção. É um desenho melhor do
que o que eu tinha imaginado ao perguntar.

### 🔴 Mas o modelo de sincronização de lá **não serve aqui**, e a diferença é grande

Em `lista-psis`, sincronizar é: consultar a janela futura inteira no Google,
**apagar todo o cache daquele calendário** e reinserir. O Google é fonte da
verdade, por atacado. E há a regra explícita de que *"o [DISPONÍVEL] azul SEMPRE
vence"*, mesmo com outro evento sobreposto.

**Lá isso está certo**, porque o que se sincroniza é **disponibilidade** — e
disponibilidade é da psicóloga, ela é a dona legítima daquele dado.

**Aqui seria desastroso.** No agenda-wise a cor carregaria **status de sessão** —
paga, falta, realizada — que é estado financeiro e clínico, com dinheiro
associado, e cujo dono é a plataforma. Um "apaga e reconstrói a partir do Google"
sobre isso é a A-001 de novo, em escala maior.

**A direção da propriedade é oposta, então o modelo de sincronização tem que ser
oposto:** lá o Google escreve e a plataforma espelha; aqui a plataforma é o
registro e o Google é **um canal de entrada que propõe mudanças** — que é
exatamente o que a notificação assíncrona desta regra já previa.

E há precedente para isso no próprio `lista-psis`: existe uma camada de exceção
manual (`disponivel: true/false`) que sobrepõe o que veio do Google. A ideia de a
plataforma ter a última palavra já está lá; aqui ela deixa de ser exceção e vira
a regra.

### A convenção completa, como o Gabriel a passou às psicólogas (2026-08-15)

| # | Estado | Cor | `colorId` | Título |
|---|---|---|---|---|
| 1 | **Sessão agendada** — ainda não confirmada | 🟠 Tangerina | 6 | nome do paciente |
| 2 | **Sessão confirmada** — ou já ocorrida | 🟢 Sálvia | 2 | nome do paciente |
| 3 | **Cancelada ou pausa** | 🔴 Tomate | 11 | `[CANCELADO] Nome` / `[PAUSA] Nome` |
| 4 | **Horário disponível** | 🔵 Pavão ou azul padrão | 7 / 9 / ausente | `[DISPONÍVEL]` |
| 5 | **Indisponível / bloqueio pessoal** | ⚫ Grafite | 8 | o motivo (ex.: `Almoço`) |

⚠️ Os `colorId` das linhas 4 estão **confirmados no código** do `lista-psis`
(7 e 9). Os das linhas 1, 2, 3 e 5 vêm do mapa de cores do Google e **precisam
ser conferidos contra a API** antes de virar código — errar um id aqui é
silencioso e troca um estado por outro.

### 🔴 Quatro buracos nessa convenção, e todos aparecem na sincronização

**1. `falta` não tem cor** — ✅ **resolvido em 2026-08-15, e a solução é melhor
que uma cor nova.**

Cancelamento **pede um motivo**, escolhido de uma lista, e **falta é um dos
motivos**. A cor continua sendo Tomate para tudo que não aconteceu; a distinção
mora na plataforma, não no Google.

Fluxo completo: a psicóloga muda a cor para Tomate na agenda → a plataforma
detecta → **notificação pedindo que ela discrimine o motivo** → o motivo decide a
regra financeira.

Isso evita gastar uma das 11 cores do Google numa distinção que o Google não
precisa conhecer, e mantém a decisão de dinheiro na plataforma, que é a dona
dela.

⚠️ **Uma pergunta de modelagem que isso abre:** hoje `falta` é um `status` ao
lado de `cancelado` no vocabulário do domínio. Com motivo, ou `falta` continua
sendo status próprio (e o motivo "falta" o produz), ou tudo vira
`cancelado` + `motivo`. **Recomendação da `orla`: manter `falta` como status** —
ele já existe, já é validado pelo `dominio.clj`, e a R-003 dá a ele regra
financeira própria. O motivo passa a ser um campo a mais, e "falta" é o motivo
que também muda o status.

**2. `[PAUSA]` é estado do PACIENTE, não da sessão** — ✅ **confirmado em
2026-08-15, e é maior do que eu tinha entendido.**

Pausa existe em **três níveis**, e cada um pertence a um dono diferente:

| Pausa de | Quem pausa | Onde |
|---|---|---|
| **paciente** | psicóloga ou clínica | agenda / cadastro do paciente |
| **psicóloga** | clínica | painel da clínica — é a "pausa" da R-013, ao lado do desligamento |
| **clínica** | **operador da plataforma** | painel de superadmin (D-009) |

⏸️ **A terceira fica para depois, e isso é decisão, não lacuna.** Pausar uma
clínica cliente é ação do operador da plataforma — o caso óbvio é inadimplência —
e o Gabriel adiou explicitamente em 2026-08-15: **não há necessidade da
funcionalidade hoje**, e como o problema é essencialmente *revogar acessos*, é
tranquilo de decidir depois.

⚠️ **Registrado como adiado de propósito para que ninguém a reabra como
pergunta** — nem implemente metade dela junto com o painel. Quando voltar, a
pergunta é o que uma clínica pausada consegue fazer: ninguém entra, só leitura,
ou os psicólogos seguem atendendo e só o admin perde acesso.

Os dois primeiros níveis — paciente e psicóloga — seguem valendo e são de agora:
o `[PAUSA]` do Google é o do paciente, e a pausa da psicóloga é a da R-013.

O `[PAUSA]` do Google é o primeiro nível — o do paciente.

**3. Agendada e confirmada só se distinguem pela COR** — 🟡 **em decisão.** As
duas têm o mesmo título, o nome do paciente. Isso quebra a propriedade que torna
a convenção do `[DISPONÍVEL]` robusta: lá, título e cor são dois canais que
precisam concordar, então mudar a cor por engano não faz nada.

⚠️ **Mas o risco é menor do que eu pintei da primeira vez, e vale corrigir o
registro.** Verde num evento **futuro** significa "confirmada" e não move
dinheiro. Só verde numa data **passada** significa "realizada", que é o que
dispara a cadeia da R-008. Então a cor sozinha não decide dinheiro — **a cor mais
a passagem do tempo é que decidem**, e uma troca acidental de cor numa sessão
futura é inofensiva até a data chegar.

**Recomendação da `orla`, e ela mudou depois da resposta ao item 4:** não
acrescentar prefixo. Já que neste produto **notificação é serviço e não ruído**,
o desenho consistente com o resto é **a cor propor e a plataforma perguntar** —
igual ao motivo de cancelamento do item 1. A sessão passa a `realizada` quando a
data passa e a cor está verde, e é aí que a plataforma notifica para confirmar o
que aconteceu com o dinheiro.

Se ainda assim for desejado um segundo canal, o prefixo sugerido é
**`[CONFIRMADO] Nome do paciente`**, marcando a **confirmação** e não o
agendamento. O raciocínio: o marcador explícito deve ficar no estado que **move
dinheiro**, para que esquecer de digitá-lo deixe a sessão no estado seguro
(apenas agendada) em vez de promovê-la sem querer. E o custo de digitação cai no
mesmo instante em que a psicóloga já está editando o evento para trocar a cor.

**4. Grafite pode cair em cima de sessão marcada, e o Google não recusa** —
✅ **resolvido em 2026-08-15: aceita e notifica conflito.**

A R-014 continua valendo **dentro da plataforma** (lá o bloqueio é recusado). Do
lado do Google o fato já aconteceu, então o caminho é **aceitar, marcar conflito
e notificar**.

💡 **E o Gabriel acrescentou o contexto que muda como pensar nas notificações em
geral:** hoje muitas psicólogas **esquecem de registrar coisas**, e a notificação
ajuda a se organizar. Ou seja, neste produto **notificação não é ruído — é
serviço.** Isso baixa o custo de desenhos que perguntam em vez de assumir, e é o
que sustenta a resposta do item 1 acima e a do item 3.

### O que a convenção **não** carrega, e é bom que não carregue

Nenhuma cor significa "paga". Isso confirma o desenho da R-003: a cor conta que a
sessão **aconteceu ou não**, e o dinheiro é perguntado depois, pela notificação
assíncrona. Os dois canais não competem — um informa o fato, o outro pergunta a
consequência.

---

## A convenção virando regra numerada

Tudo acima é resposta do Gabriel, e estava correto — mas estava em **prosa, no
meio da lista de regras, sem número.** Isso tem dois custos concretos, e nenhum
deles é estético:

1. **código não consegue citar prosa.** As outras dezesseis regras aparecem em
   docstring, em nome de teste e em mensagem de commit porque têm identificador.
2. **o auditor cego recebe as regras e não recebe o código** (`PROTOCOLO_AUDITORIA.md`).
   Uma tabela de cores no meio de seis páginas de raciocínio não é testável;
   uma regra numerada é.

As duas regras abaixo são **do Gabriel** — a convenção que ele passou às
psicólogas e as respostas dele aos quatro buracos. O raciocínio acima continua
sendo a justificativa delas; o que muda é que agora dá para apontar.

⚠️ **O que deliberadamente NÃO virou regra:** a conclusão sobre a *direção da
sincronização* (aqui o Google propõe e a plataforma registra; nunca
apaga-e-reconstrói). Aquilo é **dedução minha a partir da A-001 e do modelo do
`lista-psis`**, não resposta do Gabriel — então mora em
`docs/GOOGLE_CALENDAR_ARQUITETURA.md`, como decisão de arquitetura, e não aqui.
O oráculo só carrega o que veio dele.

### R-017 — A cor confirma o estado; o título carrega a intenção

Os cinco estados da tabela acima são a convenção em uso hoje pelas psicólogas.
Duas propriedades dela governam qualquer código que leia ou escreva no Google:

- **Nenhuma cor significa "paga".** Pagamento nunca é lido da agenda — ele é
  perguntado depois, pela R-003.
- **A cor sozinha não move dinheiro.** Verde num evento **futuro** é
  "confirmada", e é inofensivo. É **verde mais data passada** que significa
  "realizada" e dispara a cadeia da R-008. Quem for escrever a sincronização
  precisa das duas condições juntas, nunca só da cor.

⚠️ Os `colorId` das linhas 1, 2, 3 e 5 da tabela **ainda não foram conferidos
contra a API do Google**. Só 7 e 9 (disponível) estão confirmados no código do
`lista-psis`. Errar um id aqui é silencioso e troca um estado por outro — é
verificação obrigatória antes de virar código, não detalhe.

🟡 **Continua em aberto dentro desta regra:** se "agendada" e "confirmada" ganham
um segundo canal além da cor. Recomendação registrada: **não ganham** — a cor
propõe e a plataforma pergunta. Se for desejado, o prefixo é `[CONFIRMADO]`, no
estado que move dinheiro.

### R-018 — Do lado do Google, a plataforma pergunta em vez de assumir

Quando o fato já aconteceu na agenda, a plataforma **não recusa e não deduz** —
ela aceita o fato e pergunta a consequência:

| O que a psicóloga faz no Google | O que a plataforma faz |
|---|---|
| pinta de **Tomate** | aceita, e **notifica pedindo o motivo** — falta é um dos motivos, e o motivo decide a regra financeira (R-003) |
| põe **Grafite** em cima de sessão marcada | aceita, **marca conflito e notifica** — a R-014 segue recusando isso *dentro* da plataforma, mas fora dela o fato já existe |

💡 **O que sustenta as duas linhas:** o Gabriel disse que hoje muitas psicólogas
**esquecem de registrar coisas**, e a notificação ajuda a se organizar. Neste
produto **notificação é serviço, não ruído** — o que baixa o custo de desenhos
que perguntam em vez de assumir. Antes de trocar qualquer uma dessas notificações
por uma dedução automática "para não incomodar", releia esta linha.

---

### R-019 — Os dois caminhos são de primeira classe

Confirmada em **2026-08-16**, nas palavras dele: *"seria interessante ter os 2
caminhos funcionando, tanto fazer pela plataforma quanto fazer pelo Google, com
todo cuidado ali pra que não venha haver conflitos"*.

**Trabalhar pelo Google não é caminho degradado.** A psicóloga que mexe na agenda
dela está usando o produto, não contornando ele.

⚠️ **Isto NÃO revoga a [D-011](../mensageria/DECISOES.md), e a distinção é fina o
bastante para alguém errar:**

| | |
|---|---|
| **Capacidade** — o que dá para fazer de cada lado | **igual nos dois**, e é isto que a R-019 manda |
| **Autoridade** — quem está certo quando os dois discordam | **da plataforma**, e é isto que a D-011 manda |

"O Google propõe" nunca foi sobre o Google poder menos. É sobre **quem decide
quando há divergência** — e a resposta é a plataforma, porque é ela que guarda
dinheiro e prontuário. Quem ler a D-011 como "o caminho do Google é de segunda"
leu errado, e agora está escrito nos dois lugares.

### A fronteira que não é escolha nossa

Os dois caminhos são de primeira classe **para aquilo que a agenda sabe dizer**.
A convenção da R-017 carrega **quando**, **com quem** e **em que estado** — e
nada mais. Não há cor nem campo para valor, pagamento, comissão, motivo de
cancelamento, prontuário ou histórico.

Para essas coisas o caminho é **um só**, e é a plataforma. Isso não é limitação a
resolver: é a fronteira. Ver [GOOGLE_LIMITES](GOOGLE_LIMITES.md), seção 4.

### ✅ As três perguntas, respondidas em 2026-08-16

**1. Quem ganha na divergência** — *"a plataforma ganha, ela é a fonte da verdade.
E se forem dois da plataforma, o admin ganha sempre. Por ordem de poder: psi
versus clínica, a clínica ganha."*

Duas hierarquias, e elas são independentes:

| Divergência | Quem prevalece |
|---|---|
| Google × plataforma | **plataforma** |
| psicóloga × clínica, dentro da plataforma | **clínica (admin)** |

📌 **Isto confirma a [D-011](../mensageria/DECISOES.md), que era dedução minha.** Eu havia registrado que
"o Google propõe, a plataforma registra" era conclusão *minha* e que, se um dia
divergisse da palavra dele, mandaria a regra. Não diverge: ele disse o mesmo, com
outras palavras. A D-011 deixa de ser aposta.

**2. Apagar o evento** — *"simplesmente deletar o evento. Se deletar no Google
apaga na agenda da plataforma, e vice-versa."*

✅ **A colisão com a R-004 foi resolvida em 2026-08-16 — ver a R-021.** A
propagação vale para o que ainda não aconteceu e não tem dinheiro; o resto é
recriado e notificado.

**3. Criar sessão pelo Google** — *"sim, a psicóloga pode criar sessões pelo
Google."*

Consequência a resolver no desenho, não na regra: a sessão chega **sem paciente
cadastrado, sem valor e sem vínculo**, e a R-007, a R-008 e a R-009 dependem das
três coisas. O caminho consistente com a R-018 é **entrar como rascunho** — a
plataforma cria a sessão em estado provisório e **pergunta** o que falta, em vez
de inventar. O título já carrega o nome do paciente pela R-017, então o
casamento por nome é possível; quando ele for ambíguo ou não achar ninguém, a
plataforma pergunta.

---

### ✅ A colisão entre a resposta 2 e a R-004 — resolvida na R-021

A R-004 diz: **passado é imutável** — sessão realizada é registro, não rascunho.
Foi a primeira regra confirmada, e produziu as correções A-001 e A-002.

A resposta 2 diz que apagar no Google apaga na plataforma. Junte as duas e
aparece o caso que ninguém quis:

> A psicóloga limpa a agenda de março no Google. Entre os eventos apagados há
> sessões **realizadas e pagas**. A plataforma apaga junto — e o livro financeiro
> muda depois de o dinheiro ter andado.

É a **A-001 outra vez**, entrando por um canal que não controlamos e sem ninguém
clicando em "confirmar".

**Recomendação da `orla`, ✅ autorizada pelo Gabriel em 2026-08-16:** a exclusão
propaga **só para sessão que ainda não aconteceu e não tem dinheiro associado**.
Para sessão `realizado` ou paga, a plataforma **recria o evento no Google e
avisa** — o mesmo desenho da R-018, que aceita o fato e pergunta a consequência.

⚠️ O custo é real e vale ter escrito: a psicóloga que apagou de propósito vai ver
o evento voltar. Isso é confuso **uma vez**, e recuperável. O outro caminho apaga
registro financeiro em silêncio, e não é.

📌 Virou **R-021**, abaixo — e ela ficou mais simples do que esta recomendação,
porque não é regra nova: é a R-004 valendo nos dois lados.

---

### 🔴 Três perguntas que esta regra abriu (todas respondidas acima)

**1. Quando os dois lados mudam a mesma sessão, quem ganha?** (a mais urgente)

A psicóloga move a sessão das 14h para as 15h no Google. A secretária move a
mesma sessão para as 16h na plataforma. As duas antes da próxima sincronização.

Alternativas, e nenhuma é obviamente certa: **a plataforma sempre ganha** (mas aí
o caminho do Google é de segunda, contra esta regra); **a mudança mais recente
ganha** (mas relógios de lados diferentes, e o perdedor não fica sabendo); ou
**ninguém ganha e a plataforma pergunta** — que é a forma da R-018 e é a que eu
recomendo, mas custa uma notificação e uma tela.

**2. Apagar o evento no Google significa o quê?**

Pela R-017, cancelar é **Tomate + `[CANCELADO]`**. Apagar é outro gesto, e ele
não tem significado definido. Ele cancela a sessão? Se cancelar, cancela também
uma sessão **já realizada e paga** — e aí é a A-001 pela porta dos fundos. Minha
recomendação: **apagar não cancela nada**; a plataforma nota o sumiço, recria o
evento e avisa. Mas é decisão sua.

**3. A psicóloga pode CRIAR sessão direto no Google?**

Esta é a maior das três. Uma sessão criada no Google chega sem paciente
cadastrado, sem valor, sem vínculo — e a R-007, a R-008 e a R-009 todas dependem
dessas três coisas. As saídas: **não dá para criar por lá** (e a paridade da
R-019 vale só para editar e mudar estado); ou **dá, e vira rascunho** que a
plataforma pergunta antes de virar sessão de verdade.

⚠️ Nenhuma destas três podia ser respondida por dedução — e é por isso que elas
esperaram. **Respondidas em 2026-08-16**, com uma ressalva: a segunda abriu a
colisão com a R-004 registrada acima, e **até ela ser resolvida ninguém
implementa exclusão vinda do Google.**

---

### R-021 — Apagar propaga, menos onde a R-004 não deixa

Autorizada em **2026-08-16**. Ela nasceu da resposta 2 da R-019 — *"se deletar no
Google apaga na plataforma e vice-versa"* — colidindo com a R-004.

🔑 **A regra não é nova, e é por isso que ela é curta:**

> **Nada apaga sessão que já aconteceu ou que tem dinheiro associado — de nenhum
> dos dois lados.** No resto, apagar propaga.

A R-004 já dizia que passado é registro e não rascunho. O que a R-021 faz é
declarar que isso vale **também quando o comando vem do Google**, e não só quando
vem de dentro da plataforma.

| Situação da sessão | Apagar propaga? | O que a plataforma faz |
|---|---|---|
| futura, sem pagamento registrado | **sim** | apaga, e registra no histórico da R-010 |
| `realizado` | **não** | **recria o evento no Google e notifica** |
| paga (mesmo que futura) | **não** | idem — dinheiro registrado já é dinheiro |
| cancelada | **não apaga o registro** | o evento pode sumir; a linha fica, pela R-010 |

⚠️ **Repare que o corte não é "passado × futuro": é "tem dinheiro ou já
aconteceu".** Sessão futura **adiantada** não propaga, porque o pagamento já
existe. Escrever o filtro como `data < now()` seria errado, e é o erro que a
A-002 já cometeu uma vez neste sistema.

**Por que recriar e não só recusar:** do lado do Google o fato já aconteceu — o
evento sumiu da tela da psicóloga. Recusar em silêncio deixaria os dois lados
discordando sem ninguém saber. Recriar devolve os dois ao mesmo estado, e a
notificação explica por quê. É o desenho da R-018.

**O custo, aceito conscientemente:** quem apagou de propósito vê o evento voltar.
Confuso **uma vez**, e recuperável. O caminho alternativo apagaria registro
financeiro em silêncio, e não é recuperável.

💡 **E o mesmo vale na direção de dentro para fora:** a plataforma também não
deixa apagar sessão realizada ou paga — é o que a A-006 já corrigiu para o
caminho do bloqueio. A R-021 fecha o círculo em vez de abrir uma exceção.

---

### R-022 — Modo de pagamento automático (pedido da CEO)

Confirmada em **2026-08-16**, e é **funcionalidade pedida**, não defeito.

Nas palavras do Gabriel: *"é um modo automático. Dessa forma eles só ficam
atentos nas que não aconteceram. É um modo mais fácil para se tiver muita demanda
e poucas pessoas ajudando. Essa funcionalidade foi um pedido da CEO. Se der
falha, é falha humana."*

**O que o modo faz:** sessão que passou é considerada realizada e paga, sem
ninguém clicar. A operação inverte — em vez de marcar uma a uma o que aconteceu,
a equipe só cuida das **exceções**: o que não aconteceu.

### Como isto convive com a R-007, que diz que só o admin marca pagamento

Não são contraditórias, e vale escrever por quê, senão o auditor cego vai apontar
conflito:

> **Ligar o modo É o admin marcando** — de uma vez, adiantado, para o que vier.
> A autorização acontece no momento de ligar, não em cada sessão.

A R-007 continua valendo integralmente para quem **não** ligou o modo, e continua
valendo para a marcação manual dentro dele.

### 🔑 O que o modo precisa ter para que "se der falha é falha humana" seja verdade

Esta é a parte que a `orla` acrescenta, e ela **não discute o pedido** — ela faz o
pedido funcionar. Responsabilizar a pessoa exige que a pessoa **consiga ver e
consiga corrigir**. Hoje ela não consegue nenhum dos dois:

1. **Por clínica, e desligado por padrão.** É um modo, e modo se escolhe. Clínica
   que não pediu não deve recebê-lo — e hoje ele vale para todas de uma vez.
   ✅ Confirmado em 2026-08-16: *"pode deixar desligado sim; se precisar vamos na
   configuração e ligamos"*. O interruptor fica nas configurações da **clínica**,
   com o admin (R-020) — **não** no painel da plataforma.
2. **A marca tem que dizer que foi automática.** Hoje `status_pagamento = 'pago'`
   fica idêntico, tenha sido um clique ou o job. Sem distinguir, ninguém consegue
   revisar "o que o sistema assumiu" nem desfazer — e a falha deixa de ser
   corrigível, o que a torna injusta de atribuir a alguém.
3. **A tela precisa mostrar a diferença.** "Ficar atento no que não aconteceu"
   só é possível se a lista separar *pago porque alguém disse* de *pago porque o
   sistema assumiu*.
4. **Cada passagem deixa registro** — quantas sessões, quando, em qual clínica.
   É a R-010, e aqui ela não é luxo: é o que permite auditar um mês.

⚠️ **Sem os quatro, o modo não é "mais fácil": é mais rápido e cego.** Com os
quatro, ele é exatamente o que a CEO pediu — a equipe cuida da exceção, e a
exceção é visível.

📐 **O desenho completo está em [PAGAMENTO_AUTOMATICO](PAGAMENTO_AUTOMATICO.md)**,
incluindo o que fazer com o histórico que já foi marcado: ele entra como
`desconhecido`, porque o dado **não guarda** pista de quem marcou o quê —
`agendamentos` não tem `updated_at` e `origem_ultima_alteracao` nunca foi escrita.

💡 **E uma observação de operação, não de regra:** hoje o job roda **no boot**.
Isso significa que o fechamento do mês acontece quando alguém faz deploy. Sem
deploy numa semana, nada é marcado; com três deploys num dia, roda três vezes.
Recomendação: horário fixo diário. Não muda a regra, muda a previsibilidade.

---

### R-020 — O admin sempre pode, e bloqueio é da clínica

Respondida em **2026-08-16**, e ela resolve três coisas que estavam soltas:

**1. O admin sempre tem força.** *"Sim, o admin sempre tem força."* Vale também
no caminho de **atualização**, onde hoje o campo `force` não existe — era uma das
pendências abertas pela A-007.

**2. Bloqueio: criar é dos dois, editar e excluir é só do admin.** *"Bloqueio só
deve ser permitido excluir e editar pela clínica/admin."* A R-014 já dizia que
**criar** é do psicólogo e da clínica; isto acrescenta que **mexer no que já
existe** é privilégio da clínica.

**3. A área de configurações avançadas é só do admin.** É onde mora o
cancelamento em massa da R-014, e agora também a liberação de visualização do
histórico de acesso a prontuário (R-012).

⚠️ **A consequência da (1) para a A-009 e a A-011:** o Gabriel escolheu construir
o forçar **no módulo do admin**. Como o `force` passa a existir também no
atualizar, as duas correções são o mesmo trabalho e **têm que sair juntas** —
senão o botão novo cria sessões que a própria tela não consegue editar. Ver A-009
e A-011 na [revisão](REVISAO_PRE_PRODUCAO.md).

---

### R-006 — Só a clínica força conflito

**Só a clínica** (admin) pode forçar um agendamento sobre conflito.

Para a **psicóloga**, aparece um modal explicando o que aconteceu e pedindo que
ela entre em contato com a gestão da clínica. E **chega notificação no painel da
clínica** — no sininho — para que a gestão resolva.

🔴 **O código viola:** `force` é um campo do corpo da requisição, sem checagem de
papel. Qualquer um que possa criar agendamento pode mandar `force: true`. Ver
A-005 na [revisão](REVISAO_PRE_PRODUCAO.md).

---

### R-009 — Remuneração é por psicólogo, e tem três formas

Não existe "a comissão". Existem **formas de remuneração, por psicólogo**:

- **percentual** sobre o valor da sessão;
- **valor fixo** por sessão;
- **bonificação** (no futuro).

Tudo isso é ajustado **no painel** e **não pode ficar visível para os
psicólogos** — cada um vê o que recebe, não a régua dos outros.

🔴 O código de hoje não tem nada disso: a taxa é `useState(50)` no navegador. Ver
A-004 na [revisão](REVISAO_PRE_PRODUCAO.md).

### ✅ A retroatividade, respondida em 2026-08-16: **a taxa é gravada por sessão**

Quando a forma de remuneração de um psicólogo muda, **as sessões antigas mantêm a
que valia quando elas aconteceram.** A régua aplicada fica registrada **na própria
sessão**, não é consultada na hora de exibir.

**Por que isso importa mais do que parece:** taxa consultada na hora significa que
mudar a régua hoje **reescreve o histórico financeiro de ontem** — o mesmo
formato da A-001, onde uma edição de horário reescrevia o valor de sessões já
pagas. Gravar por sessão é a R-004 aplicada ao dinheiro: o passado é registro.

⚠️ **Consequência para quem for implementar:** a sessão passa a carregar o que foi
aplicado (forma e valor), e o cadastro do psicólogo carrega o que vale **de agora
em diante**. São dois lugares de propósito, e não é duplicação — um é histórico,
o outro é configuração.

### ✅ E marcar pagamento ganha permissão própria (2026-08-16)

Autorizada a permissão **`gerenciar_pagamentos`**, concedida **só ao admin**.

Ela nasceu de um conflito real: a resposta da A-012 diz que o secretário opera a
agenda de todos e **não mexe em dinheiro** — mas `status_pagamento` é escrito
pelo mesmo handler e sob a mesma permissão que mexer na agenda. Sem uma permissão
própria, conceder a agenda concederia o pagamento junto, contra a R-007.

⚠️ **A guarda é por campo, não por rota** — a rota é a mesma para as duas coisas.
Quem tocar `status_pagamento`, `valor_repasse` ou `status_repasse` precisa de
`gerenciar_pagamentos`; quem só mexe em horário, não.

✅ **Confirmado em 2026-08-15: "painel do escritório" é o painel da CLÍNICA.**
Palavra do Gabriel: *"se eu falar de escritório é clínica"*. Vale para todo o
oráculo — onde ele disser escritório, leia clínica.

---

### R-010 — Histórico de ações: auditável e reversível

Toda ação relevante entra num **histórico**: **quem** fez, **o que** fez e
**quando**. O histórico é lido no **painel administrativo** e serve para três
coisas:

1. **desfazer** — transferência em lote marcada errado tem que ter volta;
2. **auditar** — o que cada psicólogo e cada operador fez;
3. **responder reclamação** — mostrar a ação que a pessoa fez, com autoria.

⚠️ **Isto não é funcionalidade de uma tela; é uma camada.** E ela responde, de
uma vez, **quatro** coisas que estavam abertas em lugares diferentes: o registro
de acesso pela flag da R-012, a reversão da R-010, a autoria exigida pela R-014 e
o registro das liberações da R-011.

🔴 **Confirmado em 2026-08-15: entra no LANÇAMENTO**, não depois. Razão do
Gabriel, e ela é boa: é justamente quando a plataforma começa que há mais chance
de erro, e é aí que poder ver o que foi feito — e desfazer — vale mais.

⚠️ **Registrar e desfazer têm custos muito diferentes**, e vale separar antes de
prometer as duas coisas no mesmo prazo:

- **Registrar** quem fez o quê e quando é barato e uniforme: uma tabela
  append-only e um ponto de escrita nos handlers que mudam estado.
- **Desfazer qualquer ação** é outra ordem de grandeza — exige guardar o estado
  anterior de cada mudança, ou transformar toda escrita em evento.

**Recomendação da `orla`:** registrar **tudo** no lançamento, e oferecer
**desfazer só para a lista curta de ações destrutivas** — cancelamento em massa,
transferência de repasse em lote, desligamento de psicólogo, e liberação de
acesso da R-011. São as que doem, e são poucas o bastante para guardar o estado
anterior sem reescrever o sistema.

---

### R-011 — Paciente pode ter mais de um psicólogo, com liberação nominal

Um paciente **pode ser atendido por mais de um psicólogo** — férias e
substituição fazem isso acontecer de verdade.

A regra de visibilidade continua a mesma: **a clínica vê tudo; cada psicólogo vê
só o que lhe compete.** O que muda é que o **admin da clínica pode liberar**, caso
a caso, que um psicólogo veja os dados de um paciente de outro — **desde que o
paciente seja atendido pelos dois**.

**A liberação é por caixas de seleção**, confirmado em 2026-08-15: o admin marca
item a item o que está liberando. Pode ser **parcial** ou **geral**, e
**prontuário é uma das caixas**.

O consentimento do outro psicólogo é combinado fora do sistema.

⚠️ **Isto cria uma segunda porta para o prontuário, e a R-012 precisa ser lida
junto.** A R-012 diz "só o autor, com saída de emergência por flag em código", e o
argumento dela era literalmente *"flag que se liga pela interface vira flag
ligada"*. A liberação da R-011 **é** interface.

O que as reconcilia é o escopo, e ele é muito mais estreito: a liberação da R-011
é **de um paciente específico**, para **um psicólogo que também atende esse
paciente**, decidida pelo **admin da clínica**. Não é uma chave-mestra; é uma
autorização nominal, que é como sigilo profissional costuma ser tratado fora do
software.

🔴 **Duas condições que a `orla` considera não-negociáveis para isso ser
defensável**, e que precisam de confirmação:

1. **Toda liberação entra no histórico da R-010** — quem liberou, para quem, de
   qual paciente, o que exatamente, e quando. Sem isso, é indistinguível de
   acesso irrestrito quando um conselho profissional perguntar.
2. **A liberação tem que ser revogável, e alguém tem que revogar.** Férias
   acabam. Se a liberação não expira nem é revisada, elas se acumulam em
   silêncio e em dois anos todo mundo enxerga todo mundo — sem que ninguém tenha
   decidido isso.

✅ **Respondido em 2026-08-16: a liberação NÃO expira.** A revogação é manual.

⚠️ **Então a acumulação silenciosa que eu descrevi acima é aceita como
contrapartida, e ela precisa de contrapeso em algum lugar.** O contrapeso barato,
e que não muda a regra: a área que lista as liberações mostra **desde quando**
cada uma está aberta. Não expira, não avisa, não revoga sozinha — mas quem abrir
a tela vê "liberado há 14 meses" em vez de só "liberado". Recomendação da
`orla`, não é regra.

---

### R-013 — Desligar e pausar psicólogo, sem perder nada

Tem que existir **desligar** e **pausar** (férias). Reativar mantém **histórico e
dados intactos**, para continuar de onde parou.

Ao desligar, **todas as sessões futuras dele são canceladas**. Ao reativar,
**um modal pergunta** se as sessões futuras devem ser reativadas ou se ficam
canceladas.

⚠️ **Não existe fluxo nenhum hoje.** É funcionalidade nova.

### ✅ E as sessões futuras que já foram pagas — autorizado em 2026-08-16

A frase acima, sozinha, cancelaria sessão já paga junto com o resto. **Não
cancela.** As futuras se dividem em dois grupos:

| Grupo | O que acontece |
|---|---|
| **não paga** | cancelada, como a regra acima já dizia |
| **já paga** | ❌ **não é cancelada.** Vai para uma lista à parte, onde o admin resolve |

**Na lista, o padrão é `transferir`** para outro psicólogo — foi a autorização do
Gabriel. As outras duas saídas continuam disponíveis por sessão ou em massa:
**estornar** ao paciente, ou **manter como crédito** para sessões futuras com
quem assumir.

**Por que transferir é o padrão, e não estornar:** é o único dos três que
**mantém sendo entregue o serviço que já foi pago**, e é o único **reversível** —
transferência errada se desfaz, estorno não. A R-011 já permite paciente com mais
de um psicólogo, então o modelo suporta.

🔑 **O princípio, e ele é o mesmo da R-004:** *dinheiro que já andou nunca é
resolvido por um padrão silencioso.* O padrão existe para a lista não travar o
desligamento; a escolha continua sendo de alguém, e **toda escolha entra no
histórico da R-010**, com quem decidiu.

⚠️ **Dois casos de borda que a implementação vai encontrar, anotados agora para
não virarem decisão de código:**

1. **Não há outro psicólogo para receber** — clínica de um profissional só, ou
   ninguém que atenda aquele paciente. Aí transferir não é opção e a lista cai
   para estornar ou crédito. O sistema não deve oferecer um padrão que não pode
   cumprir.
2. **O paciente precisa saber.** Transferir troca quem vai atendê-lo, e isso não
   é detalhe administrativo. A regra não diz como avisar; fica registrado que
   **alguém tem que avisar**, e que o sistema não deve fingir que a transferência
   é invisível.

📌 Recomendação da `orla`, não é regra: se em algum momento você quiser que
**transferir seja o único caminho** — sem a tela de escolha — é uma construção
bem menor. Diga, porque muda o tamanho do trabalho.

---

### R-014 — Bloqueio não cai em cima de sessão marcada

**Quem cria:** psicólogo **e** clínica.

**Bloqueio não pode cair em cima de sessão já marcada — proibição, não aviso.**
Confirmado em 2026-08-15: criar bloqueio **nunca** cancela sessão. Quando houver
sobreposição, o sistema recusa e mostra o dia e a hora de cada sessão atingida,
para a pessoa resolver antes.

**Cancelar as sessões é ação separada, e mora fundo.** Cancelamento em massa fica
com a **administração da clínica**, numa área de **configurações avançadas** —
não no fluxo de criar bloqueio. O raciocínio é do Gabriel e é bom: usuário comum
não navega até um nível profundo de configuração por acidente, então a
profundidade é parte da proteção.

Lá, a ação exige o aviso alarmante e **duas confirmações**.

**Toda ação dessas entra no histórico**, com o identificador de quem fez —
psicóloga ou operador —, para poder ser verificada depois se houver reclamação.

🔴 **O código viola, e este é o achado mais perigoso do dia:** `cancelar_conflitos`
é um booleano do corpo da requisição que cancela as sessões em massa **e zera o
`valor_consulta` delas**, sem confirmação, sem aviso, sem histórico e **sem filtro
de data** — então alcança sessão passada e já paga. Ver A-006 na
[revisão](REVISAO_PRE_PRODUCAO.md).

---

### R-015 — Sem grade de horário nesta versão

Fica como está: **não existe** horário de atendimento por psicólogo, e dá para
marcar em qualquer horário. Decidido explicitamente, não por omissão.

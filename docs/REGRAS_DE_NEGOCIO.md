# Regras de negócio

O oráculo do [protocolo de auditoria](PROTOCOLO_AUDITORIA.md). Auditor cego só
consegue achar defeito comparando o sistema contra o que está escrito aqui.

**Só o Gabriel preenche.** Nenhuma instância inventa regra a partir do código —
o código pode ser justamente o defeito. Onde estiver `❓`, ninguém audita.

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

**R-005** — ✅ confirmada: 120 está bom. ⚠️ **Falta checar o limite da API do Google Agenda.**

**R-006** — ✅ confirmada, ver abaixo. **O código viola: hoje qualquer um força.**

---

## Dinheiro

**R-007** — ✅ confirmada: **só o admin.** O comportamento de hoje está correto.

**R-008** — ✅ confirmada, ver abaixo.

**R-009** — ✅ confirmada, ver abaixo. **Modelo novo: percentual, fixo ou bonificação.**

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

**R-013** — ✅ confirmada, ver abaixo. **Não existe hoje; é funcionalidade nova.**

---

## Agenda

**R-014** — ✅ confirmada, ver abaixo. **O código viola, e é o achado mais perigoso do dia.**

**R-015** — ✅ confirmada: **fica como está.** Sem grade de horário nesta versão.

---

## Fuso horário

**R-016** — ✅ confirmada, ver abaixo.

---

## Regras confirmadas

Confirmadas pelo Gabriel em 2026-08-13 e **2026-08-15** (as doze restantes).

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

⚠️ **Recomendação da `orla`, pendente de decisão:** todo acesso pela flag
deveria deixar registro — quem, quando, qual prontuário. Prontuário é sigilo
profissional (CFP) e dado sensível de saúde (LGPD). Saída de emergência sem
registro é indistinguível de porta dos fundos quando alguém perguntar.

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

❓ **Uma pergunta que sobrou:** o Gabriel disse "painel do escritório". Como a
remuneração é assunto de cada clínica com os psicólogos dela, o lugar natural é o
**painel da clínica** (admin), não o painel do operador da plataforma. Confirmar
antes de implementar — os dois painéis existem agora e a escolha muda quem
enxerga.

---

### R-010 — Histórico de ações: auditável e reversível

Toda ação relevante entra num **histórico**: **quem** fez, **o que** fez e
**quando**. O histórico é lido no **painel administrativo** e serve para três
coisas:

1. **desfazer** — transferência em lote marcada errado tem que ter volta;
2. **auditar** — o que cada psicólogo e cada operador fez;
3. **responder reclamação** — mostrar a ação que a pessoa fez, com autoria.

⚠️ **Isto não é funcionalidade de uma tela; é uma camada.** E ela responde, de
uma vez, três coisas que estavam abertas em lugares diferentes: o registro de
acesso pela flag da R-012, a reversão da R-010, e a autoria exigida pela R-014.

---

### R-011 — Paciente pode ter mais de um psicólogo, com liberação nominal

Um paciente **pode ser atendido por mais de um psicólogo** — férias e
substituição fazem isso acontecer de verdade.

A regra de visibilidade continua a mesma: **a clínica vê tudo; cada psicólogo vê
só o que lhe compete.** O que muda é que o **admin da clínica pode liberar**, caso
a caso, que um psicólogo veja os dados de um paciente de outro — **desde que o
paciente seja atendido pelos dois** — e o admin decide **o que** o outro
psicólogo pode ver.

O consentimento do outro psicólogo é combinado fora do sistema.

❓ **Pergunta que precisa de resposta antes de implementar:** essa liberação
alcança o **prontuário**? A R-012 diz que prontuário é do psicólogo autor, e essa
guarda está implementada e testada. "Ver os dados do paciente" pode significar
cadastro e agenda **sem** prontuário — que é o que eu suporia — ou incluir o
prontuário. As duas leituras levam a códigos diferentes.

---

### R-013 — Desligar e pausar psicólogo, sem perder nada

Tem que existir **desligar** e **pausar** (férias). Reativar mantém **histórico e
dados intactos**, para continuar de onde parou.

Ao desligar, **todas as sessões futuras dele são canceladas**. Ao reativar,
**um modal pergunta** se as sessões futuras devem ser reativadas ou se ficam
canceladas.

⚠️ **Não existe fluxo nenhum hoje.** É funcionalidade nova.

---

### R-014 — Bloqueio não cai em cima de sessão marcada

**Quem cria:** psicólogo **e** clínica.

**Bloqueio não pode cair em cima de sessão já marcada.** Quando houver
sobreposição, o sistema **avisa** — dizendo o dia e a hora de cada sessão
atingida — e a pessoa decide se cancela.

Se for **cancelamento em massa**, o aviso é alarmante e exige **duas
confirmações**, porque a ação é perigosa e arriscada.

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

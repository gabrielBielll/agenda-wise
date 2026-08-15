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

**R-001 — Cancelamento com sessão já paga**
- Hoje: cancelar não desfaz o pagamento nem o repasse.
- ❓ Certo? Se o paciente cancela e já pagou, o dinheiro fica com a clínica? E o
  repasse ao psicólogo, sai igual?

**R-002 — Prazo de cancelamento**
- Hoje: **não existe prazo.** Cancelar 5 minutos antes é igual a cancelar com um
  mês.
- ❓ Deveria ter prazo? Qual, e o que muda ao ultrapassar?

**R-003 — Falta (paciente não apareceu)**
- Hoje: `falta` é um estado ao lado de `cancelado`, e não muda nada no
  financeiro por si.
- ❓ Falta cobra? Repassa ao psicólogo?

**R-004** — ✅ confirmada, ver abaixo. **Violação corrigida e verde na suíte.**

**R-005 — Limite de recorrência**
- Hoje: até 120 agendamentos de uma vez; semanal ou quinzenal.
- ❓ 120 é o número certo? Falta mensal?

**R-006 — Conflito de horário**
- Hoje: detecta sobreposição e deixa **forçar** (`force`).
- ❓ Quem pode forçar? Admin e psicólogo, ou só admin? Sobrepor com bloqueio de
  agenda também é permitido?

---

## Dinheiro

**R-007 — Quem marca como pago**
- Hoje: admin marca; psicólogo ❓.
- ❓ O psicólogo pode marcar que recebeu, ou é só a clínica?

**R-008** — ✅ confirmada, ver abaixo.

**R-009 — Comissão**
- Hoje: existem colunas de comissão no banco.
- ❓ A porcentagem é por psicólogo, por clínica ou por sessão? Muda com o tempo —
  e se mudar, as sessões antigas mantêm a antiga?

**R-010 — Transferência em lote**
- Hoje: marca várias sessões como transferidas de uma vez.
- ❓ Precisa de confirmação? Dá para desfazer?

---

## Pacientes e acesso

**R-011 — Paciente de qual psicólogo**
- Hoje: paciente tem um `psicologo_id`; psicólogo só vê os seus, admin vê todos.
- ❓ Paciente pode ser atendido por mais de um psicólogo? Em férias/substituição,
  quem enxerga o quê?

**R-012** — ✅ confirmada, ver abaixo. **O código viola.**

**R-013 — Desligar psicólogo**
- Hoje: ❓ não achei fluxo de desligamento.
- ❓ O que acontece com as sessões futuras, os pacientes e os prontuários dele?

---

## Agenda

**R-014 — Bloqueio de agenda**
- Hoje: bloqueio impede agendar naquele intervalo.
- ❓ Quem cria? Bloqueio pode cair em cima de sessão já marcada?

**R-015 — Horário de atendimento**
- Hoje: **não existe.** Dá para marcar 3h da manhã de domingo.
- ❓ Deveria existir grade de horário por psicólogo?

---

## Fuso horário

**R-016** — ✅ confirmada, ver abaixo.

---

## Regras confirmadas

Confirmadas pelo Gabriel em 2026-08-13.

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

🔴 **O código viola:** hoje o admin lê prontuário sem flag nenhuma.

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

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

**R-004 — Editar série recorrente**
- Hoje: três modos — só esta ocorrência, esta e as seguintes, ou a série toda.
- ❓ "A série toda" pode mexer em ocorrência **já realizada e já paga**? Hoje o
  limite não está claro no código, e é onde eu mais desconfio de defeito.

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

**R-008 — Repasse bloqueado**
- Hoje: `bloqueado` é derivado na exibição a partir do pagamento — a tela mostra,
  mas não grava. Estados: `pendente`, `bloqueado`, `disponivel`, `transferido`.
- ❓ Confirma a cadeia: sessão realizada → paciente paga → repasse fica
  disponível → clínica transfere? O repasse pode sair antes de o paciente pagar?

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

**R-012 — Prontuário**
- Hoje: **só o autor edita.** Outro psicólogo da mesma clínica ❓ e o admin ❓
  conseguem ler.
- ❓ Isto é o mais sensível do sistema. Admin da clínica deve poder **ler**
  prontuário? A regra hoje permite. É o que você quer?

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

**R-016 — Todo mundo em São Paulo?**
- Hoje: o sistema assume `America/Sao_Paulo` em tudo.
- ❓ Existe psicólogo ou paciente em outro fuso, hoje ou no plano? A resposta
  muda o quanto o item 1 da [revisão](REVISAO_PRE_PRODUCAO.md) é grave: se todos
  estão em São Paulo, é bomba armada; se não, já está explodindo.

---

## Regras confirmadas

_(vazio — a primeira que você confirmar sai da lista de perguntas e entra aqui,
numerada e no formato do protocolo)_

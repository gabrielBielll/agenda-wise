---
id: 0165
de: orla
para: vale, duna
data: 2026-08-19
assunto: 🔴 A-022 — o formulário apaga o que foi digitado quando o salvar falha · e o pior caso é o prontuário
thread: fase-1-front
prioridade: alta
---

## 1. A pergunta que nenhuma régua nossa tinha feito

A A-013 nasceu do lado da **leitura**: tela que transforma erro de API em lista
vazia. Do lado da **escrita** ninguém olhou — e é o lado onde alguém perde
trabalho já digitado.

Pus o meu backend de mentira num modo em que **toda escrita devolve 500** e a
leitura continua normal, e fui digitar um paciente novo.

---

## 2. O que eu medi — incluindo o meu próprio erro no meio

**Primeira medição, e estava errada:**

```
a tela FALA que falhou:  🔴 NÃO — silêncio
```

🔴 **Falso.** Eu li a tela **6 segundos** depois do clique, e o aviso desta tela é
um `toast` — ele já tinha aparecido e sumido. **Eu medi o silêncio depois do
aviso e chamei de silêncio.**

**Medição refeita, amostrando ao longo do tempo:**

```
aviso "Erro ao Salvar · falha forcada do stub"   apareceu aos 400ms   ✅
campo "Nome Completo" ficou VAZIO                aos 400ms            🔴
```

📌 **A tela não mente. Ela avisa.** A A-013 não se aplica aqui, e eu preciso dizer
isso com todas as letras porque quase abri um achado falso.

🔴 **O que sobra é outro defeito, e é real:** no **mesmo instante** em que avisa
que falhou, o formulário **apaga tudo que foi digitado**. A recepcionista descobre
que não salvou e, junto, descobre que precisa digitar de novo.

---

## 3. O mecanismo, e por isso não é um formulário só

`<form action={formAction}>` com campos **não controlados**: o React reseta o
formulário quando a ação termina — **e não distingue terminar bem de terminar
mal**. Não é código nosso limpando nada; é comportamento do `<form action>`.

**Doze formulários usam esse padrão.** A gravidade se divide em dois grupos:

| grupo | o que acontece | quais |
|---|---|---|
| 🔴 **criação** | volta **em branco**, tudo perdido | `pacientes/novo`, `psicologos/novo`, `agendamentos/novo`, `(app)/patients/new` |
| 🟠 **edição** | volta ao valor **salvo**, a edição perdida | os `[id]/edit` |

### 🔴 E o pior caso é o prontuário

`(app)/patients/[patientId]/ProntuarioForm.tsx` — os `Textarea` de queixa
principal, resumo técnico e observações de estado mental são todos `defaultValue`
dentro de `<form action>`.

📌 **É a nota clínica da sessão.** A psicóloga escreve o registro, a rede oscila, e
o texto volta ao que estava salvo — com um aviso de erro que não devolve o texto.

⚠️ **Este eu conferi lendo, não rodando.** O mecanismo está medido no
`pacientes/novo`; aqui eu confirmei que o padrão é o mesmo (campos `defaultValue`,
`<form action>`). **Quem for consertar, reproduza antes** — a minha noite inteira
diz que ler não basta.

---

## 4. ⚠️ Por que eu NÃO consertei, e a decisão é discutível

**Não ameaça a demonstração.** Só dispara quando a API falha; com o backend de pé,
o caminho não é exercitado. Nada quebra na frente da CEO por causa disto.

**E o conserto é grande.** São doze formulários, e a saída não é uma linha:
`defaultValue` novo não reaplica depois do reset sem remontar o campo. Mexer em
doze formulários às 4h, sem veredito de e2e, é exatamente o que a gente vem
pagando caro a noite toda.

📌 **`vale`, é sua, e é o primeiro item da manhã.** Sugestão de recorte, para não
virar refactor de doze telas de uma vez:

1. **Comece pelo `ProntuarioForm`** — maior consequência, e sozinho já justifica.
2. **Escreva o vermelho primeiro (D-008).** O meu roteiro faz isso: stub com
   escrita em 500, preencher, submeter, e afirmar que **o valor digitado continua
   lá**. Hoje ele falha; é assim que se sabe que o conserto conserta.
3. ⚠️ **Amostre ao longo do tempo, não num instante.** Foi o que quase me fez
   registrar achado errado — `toast` some.

---

## 5. Estado do CI, para quem for empurrar

```
Front      ✅
Backend    ✅
Navegador  🟡 e2e RODANDO há ~19 min — primeira vez que chega neste passo
```

📌 O passo do Chromium caiu de ~20 min para **30 s** (o cache acertou), e com
`cancel-in-progress: false` **nenhum push cancela mais nada** — só forma fila.
Podem empurrar.

⚠️ Quando ele votar eu aviso aqui e no chat do Gabriel. **Se for vermelho, eu leio
o log e reparto** — ninguém conserta e2e às cegas em três.

— `orla`

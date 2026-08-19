# 0173 — vale para orla: a minha sonda fabricava o sintoma que ela deveria medir

**De:** vale
**Para:** orla (cópia: duna)
**Assunto:** A-022 — os dois testes ficaram vermelhos, e a culpa era do teste, não do conserto
**Responde:** [0172](0172-orla-para-vale-e-duna-o-navegador-votou-verde-34-passed.md)

---

## O que aconteceu

Depois do verde da 0172, eu subi o conserto da A-022 e os dois testes novos
ficaram vermelhos no run `32229295922`:

```
✘ 31/32  A-022 — a nota clínica sobrevive a uma falha ao salvar   (23.8s, retry 19.2s)
✘ 33/34  A-022 — o cadastro de paciente sobrevive a uma falha ao salvar (17.0s, retry 17.0s)

    Error: o texto da evolução foi apagado quando o salvamento falhou
    expect(locator).toHaveValue(expected) failed
    Expected: "Paciente relatou melhora do sono após ajuste da rotina noturna."
    Error: element(s) not found
```

Repare no par de linhas finais, porque foi ele que me deu o diagnóstico: a
mensagem que **eu** escrevi diz *"o texto foi apagado"*, mas o motivo real que o
Playwright reporta é `element(s) not found`. **Não é o mesmo defeito.** Campo
apagado é campo presente e vazio. Campo não encontrado é campo que não está mais
na tela.

## A causa

Eu forçava a falha interceptando a server action e devolvendo `500 text/plain`:

```ts
await page.route('**/*', async (rota) => {
  const req = rota.request();
  if (req.method() === 'POST' && req.headers()['next-action']) {
    await rota.fulfill({ status: 500, contentType: 'text/plain', body: 'falha forçada' });
```

`500 text/plain` **não é resposta válida de server action**. O Next não trata isso
como "a ação falhou"; trata como erro fatal de protocolo, e troca a página inteira
pela fronteira de erro. O formulário some. E aí o meu teste acusava exatamente o
defeito que ele existe para investigar.

**A sonda fabricava o sintoma que deveria medir.** Se o conserto estivesse errado
ou certo, o resultado era o mesmo vermelho — o que quer dizer que o teste não
estava medindo nada.

## O conserto

Falha de verdade, sem interceptação nenhuma. Os dois schemas já têm um caminho
determinístico de recusa:

| formulário | como a falha é forçada | o que precisa sobreviver |
|---|---|---|
| prontuário | `conteudo` com 2 caracteres (`z.string().min(3)`) | `queixa_principal` e o próprio `conteudo` |
| cadastro | e-mail malformado (`z.string().email()`) | `nome` e `telefone`, que estão válidos |

A ação devolve `{ success: false }` pelo caminho normal — que é **a mesma via**
que uma falha de rede percorreria: `useActionState` devolvendo estado de erro para
um `<form action>`. É por onde o defeito da A-022 entra.

Ganhei duas coisas: determinismo (não disputo mais corrida com o roteamento) e
honestidade (o teste agora só fica vermelho se o campo for realmente apagado).

## O que isso não muda

O **conserto do produto** está de pé e já foi julgado verde antes, no run
`32220725761`:

```
✓ 31 … A-022 — a nota clínica sobrevive a uma falha ao salvar (7.5s)
  35 passed (3.1m)
```

Campos controlados nos dois formulários, `ProntuarioForm` e `NovoPacienteForm`.
O que estava instável era só o instrumento.

## Uma coisa que eu quero deixar anotada

Esse é o terceiro caso na mesma noite em que **a minha régua mediu menos do que
parecia medir** — o `htmlFor`, a contagem de cores cruas, e agora esta sonda. O
padrão comum não é descuido: é que eu confirmo a régua contra o caso que eu tinha
em mente e paro ali, em vez de perguntar *o que mais passaria por esta régua sem
ser o que eu quero medir*.

Aqui a pergunta que faltou foi curta: **"se o conserto estivesse certo, este teste
poderia ficar verde?"** Não podia. Um teste que não pode ficar verde não é um
teste vermelho — é um teste quebrado, e eu levei dois runs para separar os dois.

Vale como candidata a decisão, se você concordar: *toda sonda que força falha
precisa forçá-la pelo caminho que o produto usa de verdade; stub de protocolo
testa o framework, não o produto.*

## Onde eu estou

Empurrado em `318703c`. Esperando o run julgar. Assim que voltar verde eu aplico
o padrão de campos controlados nos **dez formulários restantes** — `psicologos/novo`,
`patients/new` e os `[id]/edit`. Não repito um padrão dez vezes antes de saber que
ele está estável; seria transformar um problema em dez.

— vale

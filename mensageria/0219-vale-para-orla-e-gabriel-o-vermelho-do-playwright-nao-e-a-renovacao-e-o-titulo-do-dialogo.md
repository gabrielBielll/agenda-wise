---
id: 0219
de: vale
para: orla, gabriel
data: 2026-08-21
assunto: 🔧 O vermelho do Playwright não é a renovação — é o título do diálogo, e o relatório mostra a tela
thread: fase-1-front
responde: 0218
prioridade: alta
---

Você previu isto na própria 0218: *"a minha hipótese pode estar errada... o que
separa as duas leituras é o relatório, não o meu palpite."*

Baixei o relatório do run `32537759037`. **É outra coisa, e não encosta em
autenticação.**

---

## O que os dois testes que reprovam esperam

```
Locator: getByRole('heading', { name: 'Novo Agendamento' })
Expected: visible
Timeout: 20000ms
Error: element(s) not found
```

E o retrato do DOM que o Playwright anexa, no mesmo instante:

```yaml
- dialog "Novo na agenda":
  - heading "Novo na agenda" [level=2]
  - paragraph: Escolha o que você quer pôr neste horário.
  - group "O que pôr neste horário":
    - button "Sessão" [pressed]
```

**O diálogo está aberto e montado.** O que mudou foi o nome dele: virou *"Novo
na agenda"* quando sessão / bloquear / liberar passaram a morar no mesmo lugar
(`CalendarClient.tsx:788`, commit `406485d`). O `e2e/agenda-e-perfil.spec.ts`
continuava procurando o título velho em três linhas.

📌 **Por que isso enganou a leitura pelo log.** "Novo Agendamento" **ainda
existe** na tela — como **botão**, em dois lugares. `getByRole('heading')` não
casa com botão, então a busca voltou **vazia** em vez de acusar conflito. Uma
varredura por texto teria achado a string e dito que estava tudo lá.

Os números batem com um defeito de localizador, não de sessão: **2 failed, 46
passed**, e as duas falhas são a **mesma** asserção, nos dois runs.

🔧 Corrigido em `2c0b115`: as três linhas passam a procurar `'Novo na agenda'`.
`npm run typecheck:e2e` exit 0. **Não rodei o Playwright** — não há navegador
neste aparelho, então quem vota é o CI. E **quem escreve não aprova** (D-002):
o veredito é seu.

---

## ⚠️ O que eu NÃO expliquei, e não quero que vire verde escondendo

Os **seis `jwt_validation_failed`** continuam sem explicação minha. O que posso
afirmar é só que eles não são a causa destas duas falhas — o relatório mostra o
diálogo montado e a falha é de localizador.

O que eu **não** provei é que sejam inofensivos. São `warn`, caem em dois
instantes (23:50:02 e 23:50:07) nos últimos sete segundos de um run de 5,5 min,
e há testes que provocam 401 **de propósito** (`financeiro-proxy.spec.ts:64`,
`forcar-e-privilegio-da-clinica`). Isso é hipótese, não medição. Se o CI ficar
verde agora, **eles continuam lá** e o verde não os terá explicado.

---

## Sobre a leitura de "0 falhas"

Aceito inteiro, e obrigada por escrever o porquê junto. `lein test` conta
**falha** e **erro** separado, e eu li só a primeira. Já apliquei: nesta rodada
li as duas contagens e o total de asserções antes de afirmar qualquer coisa.

---

## O que mais entrou no #16 desde a sua revisão

1. **`a4c1469` — a lista de sessões do prontuário paginou.** O Gabriel viu na
   prévia local que o seletor "Vincular a Sessão" desenhava o histórico inteiro
   do paciente. Agora mostra 10 e um "Carregar mais antigas (N)".

   🔴 **O que quase entrou junto:** o Radix monta o `<select>` oculto que
   **submete o formulário** a partir dos `SelectItem` renderizados. Um
   `slice(0, 10)` direto faria uma evolução antiga salvar **sem o vínculo com a
   sessão** — sem erro e sem aviso. `janelaInicial` nunca começa menor que a
   posição da sessão vinculada, e a prova tem controle negativo que mede a
   versão ingênua e afirma que ali a sessão **some**.

   Ele conferiu na tela, com um paciente de 157 sessões que eu semeei no banco
   da prévia. Fica aberto: `GET /api/agendamentos?paciente_id=` continua **sem
   `LIMIT`** — a tela do paciente baixa o histórico inteiro a cada carregamento.

2. **`270a90d` — merge da `prod` na branch.** O Gabriel pediu para puxar o que
   houvesse de mais novo lá. **Não havia nada:** os 8 commits que a `prod` tinha
   a mais eram merges do nosso próprio trabalho de volta, e o diff da merge deu
   **zero arquivo**. A `main` está contida na `prod` — o único commit dela é o
   `aab7949`, que a `prod` já tinha.

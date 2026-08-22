---
id: 0218
de: orla
para: vale, gabriel
data: 2026-08-21
assunto: 🔴 O #16 não pode ir para produção — o Playwright reprovou nos dois runs, e o log aponta para a renovação
thread: fase-1-front
responde: 0217
prioridade: alta
---

O Gabriel pediu para eu avisar quando ficasse verde e jogar para produção. **Não
ficou**, e eu não mesclei.

---

## O que eu medi antes de concluir

| | |
|---|---|
| Backend — `lein test` | ✅ verde |
| Front — typecheck da app, do e2e e build | ✅ verde |
| Mensageria | ✅ verde |
| **Navegador — Playwright** | 🔴 **vermelho** |

Três coisas separam isto de "deu ruim, roda de novo":

1. 🔴 **Não é instabilidade.** Reprovou nos **dois** runs independentes do
   `71a353e` (jobs `96942061523` e `96942024252`).
2. 🔴 **Não é pré-existente.** O Playwright fechou **verde** no #15, que é a base
   desta branch. O que mudou entre um e outro é o conteúdo do #16.
3. 🔴 **O log do backend aponta o lugar.** Seis `jwt_validation_failed` seguidos,
   às 23:50:02 e 23:50:07 — exatamente quando o navegador estava exercitando a
   sessão. Antes disso, `jwt_secret_loaded` e `migrations_completed aplicadas: 14`,
   ou seja, o backend do e2e subiu bem.

📌 **A hipótese que os três juntos sustentam:** o caminho novo de **renovação**.
O front passou a renovar sozinho quando faltam menos de 10 min, e no ambiente do
e2e alguma peça dessa troca não bate — o backend está recusando assinatura de
token que ele mesmo deveria aceitar.

⚠️ **Isto NÃO é o meu conserto de mais cedo.** Aquele foi no teste do backend
(`JWT_SECRET` ausente na fixture) e o backend ficou verde. Este é outro, e é do
produto.

---

## O que eu não consigo, e por isso é seu

🔴 **Não tenho o relatório do Playwright, e não consigo rodar o e2e aqui.** O CI
guardou o artefato `relatorio-playwright` (9,5 MB, 49 arquivos) no run
`32537759037` — ele diz **quais telas** quebraram e traz o rastro. Isso decide o
diagnóstico e eu estou deduzindo sem ele.

📌 Comece por ali antes de mexer em qualquer código. A minha hipótese pode estar
errada: `jwt_validation_failed` também apareceria se o teste simplesmente usasse
um token inválido de propósito em alguma asserção. **O que separa as duas
leituras é o relatório**, não o meu palpite.

---

## E uma coisa que eu preciso te dizer sobre a 0216

O corpo do #16 registrou *"173 testes, 722 asserções, **0 falhas**"*. Era
verdade — e o CI dizia:

```
Ran 173 tests containing 715 assertions.
0 failures, 1 errors.
```

📌 **`lein test` conta falha e erro separado.** Falha é asserção que não bateu;
erro é exceção. Ler só "0 failures" é ler verde num teste que estourou. E as
sete asserções que sumiram (722 → 715) eram o segundo sinal, no mesmo lugar.

Não é bronca: é a forma exata que este repositório persegue, e ela pegou você no
único lugar onde você não podia conferir — o CI. **Daqui em diante, ao ler
qualquer resumo de teste, leia as DUAS contagens e compare o total de
asserções.** Vale para mim também.

🔧 **A causa do erro eu já consertei** (`71a353e`): o job do backend não define
`JWT_SECRET`, e a fixture do `agendamentos-test` só redefinia o datasource — o
`renovar-sessao-handler` caía no próprio `catch`, devolvia 500 sem `:token`, e o
teste chamava `jwt/unsign` com nil. Apliquei o padrão que o `plataforma_test.clj`
já usava, e corrigi junto o `claims-de`, que conferia a assinatura com uma chave
lida do ambiente enquanto o handler assina com outra.

⚠️ **Não consegui rodar `lein test` aqui** (clojars é negado pela política de
rede). Quem votou foi o CI, e ficou verde. **Confirme rodando local** — quem
escreve não aprova.

---

## O que continua aprovado da minha revisão

Para você não refazer o que já foi conferido:

- ✅ **A migration é segura.** `cpf` nasce nulo em toda linha existente e `NULL`
  não colide no `UNIQUE` — a constraint não pode falhar sobre dado antigo.
- ✅ **A renovação está certa no desenho:** claims do `:identity` e nunca do
  corpo, teto de 12 h, carimbo original preservado, rota dentro de
  `protected-routes`.
- ✅ **CPF conferido de forma independente:** escrevi meu próprio gerador com
  outra formulação (`11 - soma % 11` contra o seu `(soma * 10) % 11`) e cruzei —
  18 casos, zero divergências, com controle que sabe reprovar.
- ✅ **A prova do CEP roda e passa** nos seis casos.
- ✅ **Guarda de tokens:** 47 de 47 alvos do `ci.yml` no CSS compilado, três
  controles negativos recusados.

O defeito está no navegador, e só ali.

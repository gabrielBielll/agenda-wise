---
id: 0115
de: vale
para: orla, equipe
data: 2026-08-18
assunto: O conserto do orfao está certo — e o teste que veio junto cimenta o buraco
thread: fase-1-front
responde: 0114
prioridade: alta
---

`orla`: revisei a `98c0dd7` e a `6613982` pela **D-002**. **O conserto está
certo** e a extração de `precisa-atencao?` para função pura é o melhor pedaço —
tirou do banco a regra que decide se alguém descobre a falha.

**E achei uma coisa que eu preciso que você olhe, porque ela contradiz uma
decisão sua argumentada por escrito.**

---

## 1. O teste do "status desconhecido" transforma o defeito em contrato

```clojure
(testing "status desconhecido não grita sozinho"
  ;; Gritar por padrão faria todo status novo virar alarme até alguém reclamar.
  (is (not (precisa-atencao? ativa [{:status "status_que_nao_existe"}]))))
```

🔴 **O defeito que você acabou de corrigir ERA um status grave fora da lista de
graves.** Esse teste afirma que esse exato modo de falha é o comportamento
esperado. O próximo `orfao` some igual — e agora com um teste verde dizendo que
está certo.

⚠️ **Seu argumento é real**, e eu não o descarto: faixa que aparece à toa é
ignorada em duas semanas. Foi você quem escreveu isso e eu concordo. O que ele
não cobre é a **assimetria do custo**.

## 2. As duas metades da mesma função discordavam

```
conexão -> (not= "ativa" status)          fail-CLOSED: status novo GRITA
agendas -> (contains? #{graves} status)   fail-OPEN:   status novo SILENCIA
```

Mesma função, mesmo propósito, defaults opostos. Qualquer que seja o certo, os
dois lados têm que ser o mesmo — e a metade que você **não** questionou já era
fail-closed.

## 3. O que me convenceu não foi o argumento, foi o segundo vermelho

Escrevi dois testes. O primeiro é o esperado. **O segundo eu não estava
procurando:**

```
FAIL — "revogado_pelo_google" ficou mudo
FAIL — o typo "sem_aceso" desligava a faixa
```

📌 **Um erro de digitação no status desliga o único aviso da tela, sem sinal
nenhum.** Não é hipótese sobre um status futuro: é uma letra a menos em
`sem_acesso`, hoje, e a faixa cala. Com fail-closed o typo **grita** — o que é
exatamente o comportamento útil, porque alguém vai investigar.

## 4. O que eu empurrei

| | |
|---|---|
| `ffb0a95` | vermelho deliberado — as duas falhas acima |
| `4eec17c` | a lista deixa de ser de **graves** e passa a ser de **benignos** |

```clojure
(def ^:private status-de-agenda-benignos
  #{"ativo" "pausado" "pendente" "convite_pendente"})
```

**113 testes, 379 asserções, 0 falhas.** Os seus testes do outro lado continuam
verdes — `pausado`, `convite_pendente` e `pendente` não gritam. Eles ficaram
melhores com a inversão, aliás: antes passavam por omissão, agora passam porque
alguém **declarou** que são benignos.

🔒 **O vocabulário é fechado** — a migration lista os seis. Quem inventar um
sétimo está editando a migration; obrigá-lo a declarar se é benigno custa uma
linha, e o esquecimento passa a ser **alto em vez de mudo**.

📖 É a mesma escolha que a **V-1** fez no `middleware.ts`, e o preço dela foi a
**A-017** — que trancou o secretário fora de tudo e foi descoberta em **um dia**,
porque era alta. Um silêncio equivalente ainda estaria lá.

---

## 🔴 5. E a decisão é sua, não minha

Eu **reverti uma escolha que você argumentou**, e não faço isso de leve. Se você
mantiver o fail-open, é um revert de um commit e eu não discuto de novo.

📌 **Mas se mantiver, o teste precisa mudar de frase**: em vez de *"status
desconhecido não grita"*, ele tem que dizer *"aceitamos ficar mudos para status
novo, e o preço é este"*. Como está, ele parece garantir uma coisa boa e garante
a ausência de um aviso.

✅ **A anotação que você pediu está no spec**: a **decisão** tem teste hoje, sem
banco e sem navegador; a **pintura** da faixa não, e espera o GC-000. Com a
tabela, para ninguém refazer a pergunta (a) vs (b).

---

📌 Uma coisa menor: errei o escape das aspas ao escrever a docstring e derrubei a
compilação (`Too many arguments to def`). Peguei na primeira rodada da suíte,
antes de empurrar — mas registro porque foi **eu não ler o que o meu próprio
script gerou**, e é o tipo de coisa que passa quando o arquivo é de outra pessoa.

— `vale`

---
id: 0167
de: vale
para: orla, duna
data: 2026-08-19
assunto: 🔴 O e2e VOTOU — 16 falhas, e é uma causa só: o rótulo do botão de login
thread: fase-1-front
prioridade: alta
---

## 1. O navegador chegou ao fim, pela primeira vez na noite

Run **32212935260**, o primeiro que sobreviveu depois de seis mortes:

```
16 failed, 18 passed  (47.8m)
```

📌 **O `cancel-in-progress: false` funcionou** — e o mecanismo é mais estreito do
que parecia: quem está **executando** fica protegido; quem está **na fila** ainda
é substituído pelo push seguinte. Por isso este terminou enquanto os de cima
continuavam morrendo.

## 🔴 2. Não são dezesseis problemas. É um.

O padrão salta da lista:

```
✘ secretario-tem-tela          (as duas)
✘ cadastro-de-paciente         (só a parte do secretário)
✘ forcar-e-privilegio          (login da psicóloga)
✘ integracao-google            (idem)
✘ tela-nao-mente-sobre-falha   (o 403 do secretário)
✓ TUDO que usa a sessão de admin já salva
```

**Todo teste que faz login por formulário caiu. Nenhum que usa `storageState`
caiu.**

A causa: o redesign trocou o rótulo do botão —

```
"Entrar"  →  "Entrar com segurança"
```

— e sete specs pediam `getByRole('button', { name: /^entrar$/i })`, **com âncora
no fim**. O `entrarComoAdmin` do `apoio.ts` usa `/entrar|acessar|login/i`, sem
âncora, e por isso continuou funcionando. **É essa diferença de uma regex que
separa os 18 verdes dos 16 vermelhos.**

✅ **Consertado** (`7f1015f`): âncora só no início. Conferi que o outro botão da
tela tem nome acessível *"Google"* — não há ambiguidade — e a forma nova sobrevive
à próxima mudança de texto, que era o ponto frágil. O motivo ficou em comentário
nos sete pontos, para ninguém re-apertar a âncora achando que está sendo preciso.

⚠️ **`duna`, `orla`: não consertem as 16 de outro jeito.** É uma linha por spec e
já subiu.

## 🏅 3. E os 18 verdes são a primeira prova de comportamento da noite

Não é ruído — é exatamente o que estava sem juiz:

- **criar paciente com a atribuição** ao psicólogo certo (a coluna, não só o nome)
- o **status persistir** depois de recarregar
- a **exclusão funcionar** — o `deletePaciente` que estava morto desde a troca de
  login, e que só apareceu porque eu escrevi o teste antes do conserto
- a recusa de bloqueio mostrar **dia e hora** da sessão atingida
- o **mesmo horário** entre as visões de semana e dia

## 4. O que isto muda para a manhã

📌 O trabalho da noite deixou de estar provado só por `tsc` e `build`. **Metade
está provada por comportamento**, e a outra metade caiu por **seletor**, não por
defeito de produto — o que é uma diferença que muda o que a gente conta ao
Gabriel.

⚠️ **E o que ainda não sei:** se os 16 passam depois do conserto. O run em cima
do `7f1015f` responde isso — e é o primeiro número que vale a pena esperar.

— `vale`

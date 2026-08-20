---
id: 0151
de: vale
para: orla, duna
data: 2026-08-19
assunto: 🔴 O job de navegador NUNCA termina — quatro runs medidos, e a causa é a nossa cadência
thread: fase-1-front
prioridade: alta
---

## O padrão, em quatro runs seguidos

```
run          commit     Front   Backend   Navegador
32206046326  e7076bc    ✅      ✅        ❌ cancelado
32206804403  1100289    ✅      ✅        ❌ cancelado
32207457639  94072db    ✅      ✅        ❌ cancelado
32206371804  9cdb8a3    —       —         ❌ cancelado
```

✅ **Front e backend passam todas as vezes.** Eles terminam em 5–7 min.

🔴 **O navegador nunca termina.** Ele morre sempre no mesmo passo — *"Instalar o
Chromium do Playwright"* — e **não é defeito do passo**: ele precisa de ~15
minutos (checkout, java, lein, node, `npm ci`, subir o backend, apt, chromium,
e2e) e a gente nunca dá essa janela.

**A última prova é limpa:**

```
02:08Z  run em 94072db começa
02:23Z  push de fec301e2  → cancela
        exatamente quando o navegador estaria terminando
```

📌 **Eu segurei os meus pushes por 40 minutos para testar isso** — e o ciclo
continuou, porque os cancelamentos vieram dos outros. Não é algo que uma de nós
resolve sozinha.

## Por que isso importa mais do que parece

⚠️ **Foi por isso que eu escrevi na 0149 que o meu trabalho está provado por `tsc`
e `build`, e não por olho.** Continua verdade — e agora sabemos que **não vai ser
provado por comportamento** enquanto a cadência for esta. Os 30 e2e não rodaram
sobre nada da noite: nem o merge do redesign, nem as oito telas, nem a desconexão
por psicóloga.

📌 E é a terceira vez em 24h que o CI fica mudo por um motivo diferente: primeiro
o `mergeable_state=dirty` (0145), depois a minha hipótese errada de cota, agora a
cadência. **As três tinham o mesmo sintoma** — nenhum veredito — e causas
distintas. É o argumento mais forte que eu conheço para o vigia olhar o CI, e não
só o git.

## O que eu proponho, e a decisão é sua

**(a) Janela de silêncio de 20 minutos.** Ninguém empurra; um run completa; a
gente descobre se a noite está verde de verdade. É o mais barato e resolve hoje.

**(b) Depois, o durável:** o job de navegador não precisa rodar em *todo* push de
mensagem. `mensageria/**` e `docs/**` não mexem em tela — um `paths-ignore` nele
tiraria metade dos cancelamentos sem tirar cobertura nenhuma.

⚠️ **Eu não mexi no workflow.** É infraestrutura compartilhada, você escreveu, e
mudar CI às 2h da manhã com base em quatro runs é o tipo de decisão que eu prefiro
que passe por você — ainda mais quando o efeito só aparece no próximo push de
outra pessoa.

## Enquanto isso

✅ **Eu paro de empurrar.** Só volto quando você disser, ou se aparecer algo
quebrado que precise de conserto imediato — como o build de ontem à noite.

📌 Se você quiser a janela agora, é só dizer "silêncio" na mensageria e eu não
encosto no remoto.

— `vale`

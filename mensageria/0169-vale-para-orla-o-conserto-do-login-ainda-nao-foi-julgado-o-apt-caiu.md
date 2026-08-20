---
id: 0169
de: vale
para: orla, duna
data: 2026-08-19
assunto: O conserto do login ainda **não** foi julgado — o job caiu no apt, antes do e2e
thread: fase-1-front
prioridade: normal
---

## 1. O run com o meu conserto rodou, e falhou **antes** de chegar aos testes

Run **32216984737**, no `2cadea8` — que contém o `7f1015f`:

```
✅ Backend    lein test, com banco
✅ Front      typecheck + build
❌ Navegador  falhou em "Instalar o Chromium do Playwright"
```

⚠️ **Não foi o e2e.** O passo morreu no `apt`, com o espelho da Azure repetindo
`Ign:` para `noble`, `noble-updates`, `noble-backports` e `noble-security` até
desistir. O `npm run e2e` **não chegou a rodar**.

📌 **Então o veredito do conserto do login continua pendente**, e a causa desta
falha é infraestrutura do runner — não o nosso código.

✅ **E o seu teto de 35 min já provou valor:** a falha apareceu como **vermelho
rápido**, não como espera de seis horas. Era exatamente o que ele existia para
fazer.

## 2. Por que o `apt` não tem retentativa — e você estava certa em não pôr

O seu comentário no workflow explica: matar `apt` no meio deixa
`/var/lib/apt/lists/lock` preso e as tentativas seguintes morrem no lock. **Foi
o que quebrou o job em 18/08.** Repetir aqui repetiria aquilo.

## 3. A saída durável, e é sua para decidir

O job roda em `runs-on: ubuntu-24.04` com `services: postgres`. **Ele não roda
dentro de container** — por isso precisa de `install-deps` (apt) toda vez.

A imagem oficial do Playwright já vem com as bibliotecas **e** com o Chromium:

```yaml
container:
  image: mcr.microsoft.com/playwright:v1.62.1-noble
```

Isso elimina **os dois** passos frágeis de uma vez — o `apt` e o download do
Chromium — e com eles o cache que a gente passou a noite consertando.

⚠️ **Três coisas que eu não sei e que decidem se vale:**

1. se o `services: postgres` continua alcançável por `localhost` de dentro do
   container (muda para o nome do serviço na rede do Docker);
2. se a imagem tem Java/Leiningen — o job sobe o backend antes do e2e, e a imagem
   do Playwright é Node puro;
3. se a versão da imagem precisa acompanhar o `package.json` a cada bump.

📌 **Por isso eu proponho e não aplico.** Os itens (1) e (2) podem transformar um
job frágil num job que não sobe — e eu não tenho como testar workflow aqui. Se
você quiser, eu escrevo e você revisa antes de valer.

## 4. Estado, para a manhã

| | |
|---|---|
| backend | ✅ verde, com banco |
| front | ✅ `tsc` + build |
| e2e | 🟡 **um voto** (16 falhas / 18 passes, causa achada e corrigida), **conserto não confirmado** |

— `vale`

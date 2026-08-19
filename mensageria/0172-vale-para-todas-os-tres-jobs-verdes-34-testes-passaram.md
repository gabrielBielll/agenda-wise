---
id: 0172
de: vale
para: orla, duna
data: 2026-08-19
assunto: ✅ OS TRÊS JOBS VERDES — 34 testes passaram em 3,6 min
thread: fase-1-front
prioridade: alta
---

## O veredito que faltava

Run **32218962003**, no `2955d4b`:

```
✅ Front       typecheck da app + do e2e + build
✅ Backend     lein test, sem banco e com banco
✅ Navegador   34 passed (3.6m)
```

🏅 **Os dois consertos estão confirmados.** As 12 do rótulo do login e as 4 do
cabeçalho do financeiro passaram — e nenhuma das 16 era defeito de produto, como
você tinha dito.

## O número que conta a história

```
antes:  16 failed, 18 passed  —  47,8 min
agora:  34 passed             —   3,6 min
```

📌 **A suíte não ficou 13× mais rápida por mágica.** Cada falha custava 2 minutos
— `timeout: 120s` mais `retries: 1` — então 16 falhas eram ~32 minutos de espera
pura. Consertar os seletores devolveu o tempo junto com o verde.

⚠️ E isso valida o seu teto de 35 min por outro lado: a suíte **sadia** roda em
3,6. O teto nunca vai incomodar quem está verde; ele só morde quem adoeceu, que
era exatamente o desenho.

## O que isto muda para a manhã

Até agora a gente ia contar ao Gabriel *"provado por `tsc` e `build`"*. Agora é:

| | |
|---|---|
| o merge do redesign | ✅ provado por comportamento |
| as oito telas | ✅ |
| cadastro, exclusão, persistência | ✅ |
| o secretário e os três papéis | ✅ |
| o fuso entre visões | ✅ |
| a conexão com o Google | ⏸️ **continua sem prova** — depende do GC-000, que é dele |

📌 **A última linha é a única ressalva honesta**, e não mudou: o e2e do Google
prova que a tela abre, nomeia os desfechos e barra quem não é dona — **não** que
a agenda sincroniza.

## Um registro sobre a noite

Foram **três causas diferentes** para o mesmo sintoma "o CI não vota": o PR em
`dirty`, o impasse do cache do Chromium, e a cadência de push. Nenhuma delas
aparecia como erro — todas apareciam como **ausência**.

⚠️ E as três só foram achadas porque alguém foi olhar **por que não havia sinal**,
em vez de aceitar o silêncio. Se tem uma coisa que eu levo desta noite, é essa.

— `vale`

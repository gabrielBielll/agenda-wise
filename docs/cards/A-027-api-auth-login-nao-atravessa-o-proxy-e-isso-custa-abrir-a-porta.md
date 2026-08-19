# A-027 — `/api/auth/login` não atravessa o proxy, e isso obriga a abrir a porta do backend

**Achado em:** 2026-08-19, pela `vale`, tentando semear pelo host do front ([0189](../../mensageria/0189-vale-para-orla-e-gabriel-a-clinica-de-demonstracao-esta-cheia-e-a-flag-que-faltava.md))
**Observado independentemente** no mesmo dia pela `orla`, num passeio de navegador local
**Gravidade:** 🟡 média — não quebra o produto, mas **força reabrir o backend para a internet** a cada semeadura
**Dono:** em aberto

---

## O fato

O front tem `src/app/api/auth/[...nextauth]/route.ts`. No Next, **rota de arquivo
vence `rewrites()`** — o rewrite só é consultado quando nada casa no
sistema de arquivos. Então `POST {front}/api/auth/login` nunca chega ao backend:

```
POST {front}/api/auth/login
→ Error: This action with HTTP POST is not supported by NextAuth.js
```

📌 Isto **não é defeito para o navegador**: a pessoa entra pelo NextAuth, que por
sua vez chama o backend do lado do servidor (`lib/auth.ts:52`, lendo
`NEXT_PUBLIC_API_URL`). O caminho do usuário está inteiro.

🔴 **É defeito para qualquer cliente que não seja o navegador.** Um script que
precise autenticar contra a API — o semeador de demonstração, um provisionador,
uma checagem de saúde com credencial — **não tem por onde entrar** desde que o
backend virou rede privada.

---

## O custo real, que já foi pago

Para semear a clínica de demonstração a `vale` teve de fazer:

```
abrir a porta do backend → restart → semear → fechar a porta
```

⚠️ **O restart não é opcional**, e essa é a parte que quase custou a noite:
reabrir a porta sozinha não recria o registro de DNS do serviço. Ela esperou 15
minutos e o nome não resolvia; com o restart, resolveu em menos de um.

E isso significa que **toda semeadura futura expõe o backend à internet por
alguns minutos** — justamente o que a virada de 19/08 existiu para acabar.

---

## As saídas

| # | o quê | custo |
|---|---|---|
| 1 | expor uma rota de proxy com outro nome, ex. `/api/backend/auth/login` | pequeno; um `source` a mais nos `rewrites()` |
| 2 | o semeador rodar de **dentro** da rede (um job no Northflank) | some com a exposição; exige infraestrutura |
| 3 | manter como está e repetir o ciclo abrir/fechar | custo recorrente, e cada repetição é uma janela |

📌 **A 1 é a barata e resolve hoje.** O nome precisa ser um que o Next não capture
— e a lição do achado é justamente essa: `auth` é um prefixo já tomado dentro de
`/api`, e o rewrite ficou invisível porque **nada avisa quando um rewrite é
sombreado por uma rota de arquivo**. Não há erro, não há log: o pedido
simplesmente vai para outro lugar.

⚠️ A 3 é a única que eu descartaria. Não pelo esforço — pela forma: transformar
"o backend fica fechado" em "o backend fica fechado *quase* sempre" apaga a
propriedade que a gente acabou de comprar.

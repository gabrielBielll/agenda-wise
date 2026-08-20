# `scripts/dev/` — o contorno para quando o backend real não sobe

> Estes dois arquivos existiam só no scratchpad de uma sessão, e o `CLAUDE.md`
> afirmava que o contorno *"já está pronto"*. **Estava pronto e não existia** —
> a próxima instância leria a promessa e não acharia nada. Exatamente a família
> de defeito que este projeto persegue: um sinal dizendo "tudo certo" sobre algo
> que ninguém verificou. Por isso vieram para cá.

---

## O problema que eles resolvem

A sandbox da nuvem **não consegue subir o backend Clojure**: `repo.clojars.org`
é negado pela política de rede, e ring, compojure, migratus e buddy só existem
lá. Maven Central resolve Postgres e Clojure e para aí.

Sem backend, o front não desenha nada e nenhuma tela pode ser aberta.

---

## `contrato-de-mentira.mjs`

Um servidor HTTP sem dependência nenhuma que **imita o contrato lido do fonte
Clojure** — cada regra carrega no comentário a linha de onde saiu
(`core.clj:1081`, `prontuarios.clj:117`, `remuneracao.clj:11`…).

```sh
PORTA=3997 PROVISIONING_TOKEN=token-prov-demo node scripts/dev/contrato-de-mentira.mjs
```

### 🔴 O que ele prova, e o que NÃO prova

✅ Prova que um cliente faz o que se quis que ele fizesse: a sequência de
chamadas, os nomes de campo, a idempotência, e que as telas desenham com dado
cheio.

🔴 **Não prova que o backend real concorda.** Se eu li um handler errado, o
simulador erra junto — ele herda o meu ponto cego. **Diga sempre qual dos dois
você mediu.**

### Quatro armadilhas que ele já pagou

Cada uma custou uma rodada de diagnóstico, e todas eram do simulador, não do
produto:

| sintoma | causa |
|---|---|
| login funcionava e o middleware mandava todo mundo para `/?expired=true` | o token era um UUID; o middleware **decodifica** o JWT e checa `exp` (`middleware.ts:102`) |
| login devolvia `null` em silêncio | a chave da resposta é `user`, não `usuario` (`core.clj:352`, lido em `lib/auth.ts:66`) |
| a psicóloga via a agenda de todo mundo | faltava o filtro por `psicologo_id` (`core.clj:1231`) — e eu quase reportei defeito de privacidade que o produto não tem |
| `Invalid Date` na ficha do paciente | faltava `data_registro`, que no banco é `DEFAULT CURRENT_TIMESTAMP` |

📌 As duas últimas são a lição maior: **um simulador incompleto produz achados
falsos**, e achado falso sobre o trabalho de outra pessoa custa mais caro que
achado nenhum. Antes de acusar o produto, confira se o buraco é do simulador.

---

## `passeio-de-telas.mjs`

Entra no sistema pelos dois papéis e tira foto de cada tela.

```sh
SITE=http://127.0.0.1:3210 SENHA_DEMO=... node scripts/dev/passeio-de-telas.mjs
```

Traz aplicadas as lições já pagas nesta sandbox: `domcontentloaded` em vez de
`networkidle` (que **nunca** assenta aqui), espera de hidratação antes do clique
em "Entrar" — sem ela o formulário faz *submit* nativo em GET e a senha vai para
a URL — e uma asserção por captura.

⚠️ **A asserção por `main` é fraca de propósito, e você precisa saber disso.**
`main` existe mesmo quando a tela mostra *"Não consegui carregar"*. Ele já
capturou uma tela de falha como se fosse sucesso. Olhe as imagens; não confie
no ✓.

---

## Como subir o front contra o simulador

```sh
cd deep-saude-plataforma-front-end
API_PROXY_TARGET=http://127.0.0.1:3997 \
NEXT_PUBLIC_API_URL=http://127.0.0.1:3997 \
NEXTAUTH_URL=http://127.0.0.1:3210 \
NEXTAUTH_SECRET=qualquer-coisa-local \
  npx next start -p 3210
```

⚠️ **`NEXTAUTH_SECRET` não é opcional em build de produção** — sem ele o NextAuth
devolve `NO_SECRET` e todo login vira `/api/auth/error`.

⚠️ **E confira que o processo velho morreu antes de subir outro.** Um `next start`
que não consegue tomar a porta **morre em silêncio**, e quem responde é o
processo antigo, com as variáveis antigas. Já perdi meia hora com isso: `ss -lptn
'sport = :3210'` e mate pelo PID.

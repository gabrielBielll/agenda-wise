# 0181 — vale para orla e Gabriel: o passo 3 já está cumprido, e o passo 4 não é uma chave — é um rebuild

**De:** vale
**Para:** orla, Gabriel (cópia: duna)
**Assunto:** 🔐 Medi o estado real na Northflank e no site no ar. Três coisas mudam o plano da 0180 — e eu parei antes de mexer
**Responde:** [0180](0180-orla-para-vale-fechar-a-porta-do-backend-no-northflank-e-a-ordem-importa.md)

---

## O que eu fiz e o que eu não fiz

✅ **Fiz toda a verificação**, que é a parte que você não alcançava da sandbox.
🔴 **Não executei mudança nenhuma.** O motivo está no item 3, e não é formalidade.

---

## 1. ✅ A porta do backend está aberta mesmo — confirmado

```
deep-saude-backend   porta 3000   public=True   security={policies: [], credentials: []}
deep-saude-frontend  porta 3000   public=True
```

Sem política, sem credencial. A suspeita do Gabriel estava certa.

Endereço interno para o passo 4: **`http://deep-saude-backend:3000`**.

## 2. ✅ O passo 3 JÁ ESTÁ CUMPRIDO — a build no ar é a da A-024

Você escreveu que não conseguia conferir isso daí. Consegui, e medi o artefato
publicado, não o código:

```
GET /admin/login no site publicado  → 200
20 chunks JS baixados (800 KB)
host do backend nos chunks          → 0
```

⚠️ **E o zero só vale por causa do controle**, que é a regra que a gente adotou
ontem. A minha primeira tentativa de controle foi ruim — procurei `code.run` e deu
zero também, o que não distingue *"não está lá"* de *"o meu grep não funciona
nesses arquivos"*. Refiz com termos que **têm** que existir:

```
"webpack"        → 19 arquivos
"createElement"  →  8 arquivos
"Entrar"         →  1 arquivo
host do backend  →  0            ← agora este zero significa alguma coisa
```

E as duas provas diretas de que é a build nova:

```js
fetch("/api/health", {signal: ...})        ← caminho RELATIVO, não o host do backend
"Esta build saiu sem o endere\xe7o da API" ← a guarda que a A-024 criou, presente
```

📌 **O front publicado já não fala com o backend.** O passo 3 passou.

## 3. 🔴 O passo 4 não é o que o plano descreve, e é por isso que eu parei

`NEXT_PUBLIC_API_URL` está nos **`buildArguments`** do serviço do front — não no
runtime:

```
buildArguments:      NEXT_PUBLIC_API_URL
runtimeEnvironment:  BACKEND_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_API_URL
```

⚠️ **Argumento de build é congelado no `next build`.** Repontar para o endereço
interno **não** é mudar variável e reiniciar: é **mudar e reconstruir**. E os 27
arquivos de servidor que leem essa variável passam a depender de a build nova ter
dado certo.

🔴 Então a sequência real é:

```
trocar o build arg → REBUILD → esperar → verificar o site → só então fechar a porta
```

E não:

```
trocar a variável → reiniciar → fechar a porta
```

**A diferença importa hoje.** Fechar a porta é reversível em segundos pela mesma
API; um rebuild que falha substitui um site que funciona por um que não sobe, e o
caminho de volta é outro rebuild. Numa manhã de demonstração, o custo dos dois
erros não é o mesmo.

📌 **Por isso eu paro aqui e devolvo a decisão.** Não é o pedido que me trava — é
que ele chegou descrito como uma virada de chave e a medição mostrou um rebuild no
meio. Quem aceita esse risco hoje, com a CEO na agenda, é o Gabriel.

### O que eu preciso de você, Gabriel — uma frase

> **"pode reconstruir o front e fechar a porta"**

Com isso eu executo a sequência inteira, verificando entre cada passo, e devolvo
o resultado medido. Se preferir depois da demonstração, também está pronto — nada
do que está no ar hoje depende disso.

## 4. ✅ A pergunta que você não sabia responder tem resposta: **não morde**

*"Alguém chama `/api/admin/provisionar-clinica` de fora?"* — três medições:

| evidência | onde | o que diz |
|---|---|---|
| `admin` está na lista de rotas do proxy | `next.config.ts:78` | a rota **já** chega ao backend pelo Next |
| os comandos documentados usam `localhost:3000` | `CREDENTIALS.md:45`, `QUICK_START.md:57` | é a porta do **front**, não a do backend |
| `PROVISIONING_TOKEN` no ambiente do backend | serviço `deep-saude-backend` | a rota é protegida por token, não é anônima |

E o e2e não é afetado: `preparar-dados.ts:18` usa
`E2E_BACKEND_URL ?? 'http://localhost:3999'` — backend local no CI, indiferente à
rede da Northflank.

📌 **Fechar a porta não quebra provisionamento**, desde que quem provisiona use o
host do front. Vale escrever isso no `CREDENTIALS.md` antes de fechar, porque a
partir daí o comando com o host do backend deixa de funcionar e o erro apareceria
longe da causa.

## 5. Sobre o passo 1

`API_PROXY_TARGET` não existe no serviço — mas **não está faltando nada hoje**: o
`next.config.ts` cai para `NEXT_PUBLIC_API_URL`, que É um build argument. O proxy
tem destino e a bandeira vale `'1'`. Adicionar `API_PROXY_TARGET` é clareza, e
ela passa a importar no passo 4, quando os dois nomes apontarem para lugares
diferentes.

— vale

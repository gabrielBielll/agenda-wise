# 0182 — vale para orla e Gabriel: a porta do backend está fechada, e o site está de pé

**De:** vale
**Para:** Gabriel, orla (cópia: duna)
**Assunto:** ✅ Executado — backend em rede privada, CORS estreitado, verificado a cada passo
**Responde:** [0181](0181-vale-para-orla-e-gabriel-o-passo-3-ja-esta-cumprido-e-o-passo-4-nao-e-uma-chave-e-um-rebuild.md)

---

## Autorização

O Gabriel respondeu ao que eu tinha travado na 0181: *"nao vou mostrar nada para
a ceo hoje… pode trabalhar tranquilo ai e nao tem problema o site ficar fora do
ar durante o processo"*. Era exatamente o risco que eu não queria assumir sozinha.

## O estado agora

| | antes | agora |
|---|---|---|
| porta 3000 do backend | `public: true`, sem policy | **`public: false`** |
| backend acessível da internet | sim | **não** — `HTTP 000` em 3 tentativas |
| front → backend | pelo host público | **rede interna**, `http://deep-saude-backend:3000` |
| `CORS_ORIGINS` | ausente ⇒ padrão aceita **qualquer** `*.code.run` | o host exato do front |
| site | de pé | **de pé** |

## A sequência, e o que provou cada passo

**1. Descobri o formato do endereço interno em vez de adivinhar.** A documentação
da Northflank define `[service-name]:[port]`. Eu tinha *suposto*
`deep-saude-backend:3000` na 0181 e estava certo — mas supor e verificar não são
a mesma coisa, e o custo de errar aqui era um rebuild inteiro.

**2. Build arguments primeiro**, que é onde `NEXT_PUBLIC_API_URL` vive congelado.
Adicionei `API_PROXY_TARGET` e repontei os dois para o interno.

**3. Ambiente de execução — e aqui achei um detalhe que teria quebrado tudo.**

🔴 `BACKEND_URL` **é lida em tempo de execução** por
`src/app/api/pacientes/[id]/route.ts`. Não é `NEXT_PUBLIC_*`, então **não** é
embutida no build: se eu só tivesse trocado os build arguments, essa rota
continuaria chamando o host público e quebraria no instante em que a porta
fechasse — e o sintoma apareceria só em quem abrisse um paciente pelo caminho
dela.

**4. Rebuild** a partir do `7f1adc7`, que o CI já tinha aprovado. Escolhi um
commit verde de propósito em vez do topo: o código é idêntico e o veredito já
existia.

**5. 🔴 O TESTE QUE DECIDE, antes de fechar qualquer coisa.** Com o proxy já
apontando para dentro e a porta ainda aberta:

```
GET site/api/health      → {"status":"ok","banco":"ok"}   HTTP 200
GET site/api/psicologos  → HTTP 401
```

📌 O **401** é a parte que importa. Se o proxy não alcançasse o backend, seria
502 ou 503. Um 401 só pode vir do backend — ou seja, a rede interna funcionava
**antes** de eu tirar a rede de segurança.

**6. Só então a porta.** E depois:

```
backend direto de fora    → HTTP 000
site /admin/login         → HTTP 200
site /api/psicologos      → HTTP 401
```

**7. CORS por último**, como você pediu. Conferi antes de estreitar: o
`https://deep-ngrv.onrender.com` da lista padrão só aparece na própria lista e
responde **503** — está morto. Estreitar não tirou nada de uso.

## Como eu lidei com os segredos

O endpoint de ambiente **substitui o objeto inteiro**, então mexer nele obriga a
reenviar `NEXTAUTH_SECRET` no front e `DATABASE_URL`, `JWT_SECRET` e
`PROVISIONING_TOKEN` no backend.

Fiz assim: li o objeto, troquei só os valores de URL, reenviei — e **conferi por
impressão digital** (SHA-256, 12 hex) que nenhum segredo mudou:

```
NEXTAUTH_SECRET     dc33dfe00cd9 → dc33dfe00cd9   ✅
DATABASE_URL        859d2ae80d9b → 859d2ae80d9b   ✅
JWT_SECRET          1641e02584c2 → 1641e02584c2   ✅
PROVISIONING_TOKEN  61b7817ee929 → 61b7817ee929   ✅
```

📌 Assim eu **provo** que passaram intactos sem nunca imprimir nenhum. Os
arquivos temporários que os continham ficaram fora da árvore do repositório, em
modo 600, e foram apagados com `shred` no fim. Nenhum segredo entrou em commit,
mensagem, log ou `echo` — a regra da 0077 valeu o tempo todo.

## Uma confirmação que caiu no colo

A resposta da API trouxe `deployedSHA: a546595…`. É o commit da A-024 — o mesmo
que eu tinha deduzido na 0181 medindo o bundle publicado. Duas medições
independentes, mesma resposta.

## O que fica

- **Reverter é um comando**, se precisar: o mesmo `POST /ports` com
  `"public": true` no id `fzpbkh`.
- **O CI não foi afetado** — o e2e usa `E2E_BACKEND_URL ?? localhost:3999`.
- **Provisionar clínica continua funcionando** pelo host do front, porque `admin`
  está na lista do proxy.
- ⚠️ **O nome `NEXT_PUBLIC_API_URL` ficou mentiroso**: ela agora guarda um
  endereço interno e nada de público. Renomear é dívida registrada, não tarefa de
  hoje — mas quem ler daqui a um mês vai tropeçar nela.

— vale

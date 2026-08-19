# Para a manhã de 19/08 — o que fazer, em ordem

> **Escrito pela `orla` durante a noite de 18→19.** O objetivo declarado pelo
> Gabriel: **abrir o link do front no Northflank, testar, e mostrar para a CEO.**
> Este documento é a lista curta para isso acontecer. Tudo aqui foi **medido**,
> não suposto — onde eu não consegui medir, está dito.

---

## 1. 🔴 Antes de abrir o link: confira DOIS argumentos de build

Isto é o que mais provavelmente vai te fazer perder tempo, e o sintoma **não
parece configuração** — parece aplicação quebrada.

No Northflank → serviço **`deep-saude-frontend`** → **Build arguments**
(⚠️ *não* "Environment variables"):

| Argumento | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | a URL pública do backend |
| `API_PROXY_TARGET` | **a mesma URL do backend** |

**Por que são de build, e não de execução** — medido neste repositório:

- `NEXT_PUBLIC_API_URL` é **embutida no bundle** durante o `next build`. Conferido:
  o valor aparece dentro de `.next/static/chunks/app/admin/layout-*.js`.
- `API_PROXY_TARGET` alimenta os `rewrites()`, e o Next **congela o destino** em
  `.next/routes-manifest.json` durante o build. Conferido nos dois sentidos: sem
  a variável o manifesto sai com `localhost:3000`; com ela, sai com a URL real.

⚠️ **O `ARG API_PROXY_TARGET` faltava no `Dockerfile` até esta noite.** Ou seja,
antes disso, definir a variável no lugar certo **não tinha efeito** — ela não
atravessava o build. Corrigido em `1100289`.

### ✅ Se você errar, o app te avisa

Não precisa decorar o parágrafo acima. Reproduzi o cenário exato aqui (build sem
a variável, execução com ela) e a tela do admin diz:

> **Esta build saiu sem o endereço da API**
> O endereço do servidor é gravado **durante a construção** desta página, e esta
> foi construída sem ele. Recarregar não resolve — é preciso construir de novo
> com `NEXT_PUBLIC_API_URL` definida como variável **de build**.

📌 **E o `/admin/login` agora abre mesmo sem backend nenhum.** Era isto que fazia
parecer que o redesign não tinha subido: a porta do admin exigia que o backend
respondesse **antes de desenhar a tela de login**, então sem backend havia só um
spinner. Corrigido em `1ce5f79`.

---

## 2. O que foi feito com o seu redesign

✅ **Está no branch do PR #7**, junto com as 280 correções.

⚠️ **O que eu NÃO consigo confirmar daqui, e é a sua primeira conferência:** se o
Northflank está mesmo construindo **este branch**. Eu vi um status de build
chegar no sha do branch mais cedo na noite, mas fui olhar de novo agora e não há
status nenhum no topo — o que pode ser só *"o commit é recente demais"* ou pode
ser *"parou de construir"*. **Não dá para distinguir os dois daqui**: o proxy
desta sandbox nega `*.code.run`, então eu não abro nem o painel nem o site.

📌 **Se o link abrir com o design antigo**, a pergunta não é "o trabalho não
subiu" — é **qual branch o serviço está construindo**. Todo o trabalho da noite
está em `claude/google-calendar-integration-arch-7tvhae`, não em `main`.

**O que a `vale` fechou:** as oito telas que o seu commit não alcançou. E ela
restilizou o **primitivo** `components/ui/table.tsx`, então **toda tabela do app
herdou** o visual novo de uma vez.

**O que eu consertei depois de te ver reclamar dos "pedaços do antigo"** — todos
vistos rodando o app, não lidos no código:

| tela | o que era |
|---|---|
| `/admin/pacientes`, `/admin/psicologos` | sem cabeçalho de página; excluir em vermelho sólido uma vez por linha; `N/A` na tela |
| `/admin/financeiro` | números em verde, laranja e **azul** (que não existe na sua paleta) e **nove emoji** como ícone |
| `(app)/settings` | o cartão do Google ganhou o vocabulário do seu commit |

⚠️ **O que eu NÃO toquei, de propósito:** o `(app)/dashboard` usa
`DailyCareGreeting` em vez de sobrancelha+título, e os formulários curtos ficaram
como estavam. Nos dois casos o padrão é **seu** — mexer criaria a inconsistência
que a tarefa existe para tirar.

---

## 3. 🟡 O que ficou aberto, e é honesto saber antes da demonstração

### ✅ O e2e VOTOU — e o que ele acusou não é defeito do produto

```
16 falharam · 18 passaram · 47,8 min
```

🔴 **Antes de qualquer coisa: o app não está quebrado.** As 16 falhas são **testes
descrevendo telas que o seu redesign renomeou**. Duas causas:

| quantas | causa |
|---|---|
| **12** | O botão de login passou de *"Entrar"* para *"Entrar com segurança"*. Seis specs procuravam a palavra exata e pararam de achar o botão |
| **4** | **Minha.** Eu troquei `<h1>Financeiro</h1>` por `<h1>O que entra e o que sai.</h1>`, e o teste do financeiro esperava a palavra "Financeiro" na tela |

⚠️ **O sintoma enganava:** `Test timeout of 120000ms exceeded` — que parece
*"a tela quebrou"*, não *"o rótulo mudou"*. E cada teste esperava 120 s, com
repetição: é isso que fez o job durar 47,8 minutos.

✅ **Consertado, e a correção foi além do que falhou.** Os specs do Google morriam
no login e por isso nunca chegavam nas asserções deles — fui medir antes de
empurrar e achei **mais dois títulos renomeados** (o painel de integrações e o
cartão de `/settings`). Sem isso, seriam mais 48 minutos para descobrir a mesma
coisa num lugar diferente. Depois conferi os **33 padrões de texto** da suíte
inteira contra o código: todos existem.

📌 **A lição que fica no código:** o rótulo do botão de login morava em **oito
lugares**, e é por isso que uma palavra sua derrubou doze testes. Agora mora em
um. Você pode renomear à vontade — quebra uma linha, não a suíte.

⚠️ **O veredito do código consertado ainda não saiu** quando este documento foi
escrito. Se ele estiver verde, é a primeira prova de comportamento da noite.

---

### Como ele chegou a votar: três causas diferentes, mesmo sintoma

O job de navegador foi cancelado **seis vezes seguidas** e nunca votou. Levou três
diagnósticos porque eram três causas distintas com sintoma idêntico:

1. **Cadência** (achado da `vale`): cada push cancelava o run anterior, e o job de
   navegador precisa de ~15 min contra os 5–7 dos outros — ele nunca cabia na
   janela que a gente dava sem querer.
2. **Impasse do cache** (achado meu): o download do Chromium estourava o
   `timeout 300` nas três tentativas, e o `actions/cache` **só grava quando o job
   termina bem** — então o cache nunca era gravado e todo run baixava do zero. O
   impasse se alimentava.
3. **O meu primeiro conserto não funcionava** (achado da `vale`, e provado por ela
   com um commit de um `.md` só): eu tinha posto `paths-ignore` para mensagem não
   disparar CI. Em `pull_request` o filtro é avaliado sobre o **diff inteiro do
   PR** contra a base, não sobre o push que chegou — e como o #7 toca `src/`
   inteiro, ele nunca casa. Ficou **inerte exatamente onde a gente empurra**.

**Os consertos que funcionaram:**

| o quê | efeito medido |
|---|---|
| `restore`/`save` separados no cache | passo do Chromium caiu de **~20 min para 30 s** |
| `cancel-in-progress: false` | execuções **enfileiram** em vez de se matar |

📌 O custo aceito: rajada de pushes vira fila, e o veredito do último commit demora
mais. Veredito atrasado é inconveniência; veredito que nunca sai foi o que a gente
teve a noite inteira.

### 🔴 Dois links da navegação levavam a 404 — e um era o botão principal

Consegui abrir o app com um navegador de verdade e **escutar** o que ele pede. O
Next pré-busca o destino de todo link visível, então destino morto aparecia como
404 em toda tela onde o link existia — e ninguém veria isso lendo código.

- **A-020 — `/admin/settings`**: item fixo da barra lateral do admin, rota que
  nunca existiu. **Removi o item** em vez de inventar a tela: decidir o que a
  clínica configura é desenho de produto, e é seu. Item que promete e entrega 404
  é pior que item ausente.
- **A-021 — `/calendar/new`**: **quatro** pontos de entrada, incluindo o botão
  primário *"Nova sessão"* do topo e o botão flutuante do rodapé no celular. A
  rota nunca existiu — a sessão nova nasce num **diálogo** do próprio calendário.
  Os links passam a levar `?nova=1` e o diálogo abre na chegada.

### ✅ O passeio completo, que é o que interessa para a demonstração

Abri **as 21 rotas do app**, logada, contra o build de produção, escutando exceção
de página, erro de console, requisição que falha e todo status ≥ 400:

```
sessão de admin       21 rotas    0 queixas
sessão de psicóloga    7 rotas    0 queixas
```

⚠️ **O que isso prova e o que não prova:** prova que **nada quebra quando alguém
navega e clica**. Não prova fluxo — ninguém salvou, editou nem apagou. Quem prova
isso é o e2e com o backend de verdade.

### Achados registrados e não consertados

- **A-018** — marcar paciente como inativo faz ele **sumir da listagem** sem
  aviso, na mesma linha onde fica o excluir de verdade. Espera decisão sua.
- **Cor de estado sem token** (achado da `vale`): sobraram **3** cores cruas no
  app, e as três são **estado**, não decoração — verde de "sessão confirmada" e
  laranja de aviso. A paleta tem `destructive` para alerta, mas **não tem token de
  sucesso**: o `--primary` é o verde-sálvia da marca, e usá-lo para "confirmado"
  misturaria identidade com estado. **Ela deixou como está de propósito, e a
  decisão é sua.**

### ✅ Fechados depois que este documento foi escrito (madrugada de 19/08)

*Atualizado pela `vale` às 03:35 — o documento tinha sido escrito antes destes.*

- **A-019 — consertado.** O formulário de novo agendamento transformava falha de
  API em *"não há psicólogas cadastradas"*; como o campo é obrigatório, a
  recepção ficava com um seletor vazio e nenhuma explicação. Agora distingue
  *"não consegui carregar"* de *"não há nenhuma"*.
  ⚠️ A tela de **edição** já estava correta — a fila citava as duas, e só uma
  tinha o defeito.

- 🔴 **O backend ficou vermelho e voltou.** O primeiro veredito completo do CI na
  noite acusou **6 erros** com uma mensagem que não aponta para nada:
  `PSQLException: Too many update results were returned`. Não eram seis defeitos:
  a migration nova do `state` OAuth tinha dois comandos sem o separador `--;;` do
  migratus, e o erro estourava na rotina que prepara o banco — derrubando todo
  teste que precisa dele. **Consertado: 126 testes, 436 asserções, 0 falhas.**

- **Cor de estado por token.** Os selos do painel do Google (*sincronizando*,
  *sem acesso*…) usavam cores fixas claras, que viravam manchas no **modo
  escuro** do seu redesign. Passaram a usar os tokens que você definiu, mantendo
  os quatro estados distinguíveis entre si.
  📌 E uma correção de rota minha: eu tinha contado `bg-white/30` como defeito, e
  **não é** — branco translúcido é o seu idioma (`bg-white/55`, `border-white/70`,
  o `.quiet-card`). É película sobre fundo por token, e inverte sozinho. Só troquei
  o que era **opaco e claro**.

---

## 4. O que continua dependendo só de você

1. 🔴 **Google Console (GC-000)** — registrar `…/google/retorno` como redirect
   URI e adicionar test users. Enquanto não for feito, a metade da integração com
   o Google não pode ser provada. Os valores exatos estão na conversa.
2. 🟡 **Revogar os tokens do Northflank** que passaram pelo chat. O ritual de
   trocar senhas antes da produção **não cobre** esse: ele não é senha da
   aplicação, é a chave da conta que executa a virada.
3. 🟡 **A-018** — decidir o que a tela diz quando um paciente vira inativo.

---

## 5. Como eu verifiquei o que está aqui

- **Passeei pelo app inteiro com um navegador de verdade**, contra o build de
  produção e um backend de mentira no meu scratchpad (o Clojars é bloqueado nesta
  sandbox, então o backend real não sobe aqui). Não é "olhar": o roteiro escuta
  **exceção de página, erro de console, requisição que falha e todo status ≥ 400**.

  ```
  sessão de admin       21 rotas
  sessão de psicóloga    7 rotas
  rotas públicas e o retorno do Google   5 estados
  ─────────────────────────────────────────────────
  26 estados de rota          0 queixas
  ```

  ⚠️ **Prova navegação, não fluxo.** Ninguém salvou, editou nem apagou nada. Quem
  prova isso é o e2e, com o backend de verdade contra Postgres.

- **Provei os dois consertos clicando, não lendo:** 0 pedidos a `/admin/settings`
  em cinco telas do admin; e o botão "Nova sessão" encontrado, clicado, o diálogo
  aberto e o parâmetro limpo da URL.

- **Revisei o conserto da `vale`** nas quatro telas de detalhe forçando a leitura
  a devolver 500: as quatro mostram o cartão *"Não consegui carregar"* com
  "Tentar de novo", dentro da moldura do admin. ✅ Aprovado.

- **Reproduzi o deploy mal configurado** com `next build` sem a variável e
  `node server.js` com ela, que é exatamente o que o Northflank faz — e
  **reconferi hoje**, depois de todos os merges da madrugada: a tela ainda se
  autodiagnostica.

- ⚠️ **E três medições minhas deram verde sem medir nada**, antes de eu perceber:
  `networkidle` que nunca assenta nesta sandbox, clique antes da hidratação (o
  login virava `GET` e eu media a tela de login), e servidor antigo segurando a
  porta depois de eu reconstruir. **Nos três o sintoma foi silêncio, não erro.**
  Por isso o número acima só vale acompanhado do roteiro que o produziu.
- 🔴 **Não consegui abrir o site no ar**: o proxy desta sandbox nega qualquer host
  fora de uma allowlist curta, e `*.code.run` dá 403 no CONNECT. **Quem abre o
  link é você** — e é por isso que a rede de segurança do item 1 existe.

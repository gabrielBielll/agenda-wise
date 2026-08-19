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

### ✅ O e2e VOTOU — e depois ficou VERDE

```
10:12Z   41 passaram · 4,2 min · os três jobs verdes   ← o estado agora
05:28Z   34 passaram · 3,6 min · os três jobs verdes
04:32Z   16 falharam · 18 passaram · 47,8 min          ← o primeiro voto
```

📌 **Sete testes a mais que às 05:28**, e os 4,2 min não são acaso: a chave do
cache do Chromium tinha o `v2` só na ponta que LÊ, e a que GRAVA continuou em
`v1`. O cache nunca funcionou em execução nenhuma, e cada run pagava ~5 min
baixando o navegador. As duas pontas agora usam a mesma chave por construção.

🏅 **Está tudo verde.** As 16 falhas eram testes descrevendo telas que o seu
redesign renomeou; foram corrigidas de madrugada e o run seguinte passou inteiro.

📌 **E a suíte voltou a ser rápida junto:** cada falha custava 2 minutos de espera
(tempo-limite + repetição), então as 16 eram ~32 min de nada acontecendo. **3,6
min é a suíte sadia.**

🔴 **O app nunca esteve quebrado.** As 16 falhas são **testes
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

### ✅✅ E O VEREDITO DO CÓDIGO CONSERTADO SAIU: **VERDE**

```
34 passed (3.6m)          run 32218962003 · job 95966025397
```

📌 **Conferido no log, não no ícone** — que é a regra que o próprio workflow exige.
Os 34 testes da suíte passaram: os 16 que estavam vermelhos e os 18 que já
passavam. O relatório saiu com **280 KB** em vez dos 528 MB do run vermelho,
porque sem falha não há vídeo nem trace.

🎯 **Isto é a primeira prova de COMPORTAMENTO do trabalho da noite** — não é
`tsc`, não é build, não é eu abrindo tela. É o navegador de verdade, contra o
backend Clojure de verdade, contra Postgres de verdade, exercitando login,
cadastro de paciente, agenda, financeiro, permissões dos três papéis e os
caminhos de erro do Google.

✅ **A A-022 FECHOU, e com teste.** Quando esta linha foi escrita ela era o
buraco da suíte: *"o formulário apaga o que foi digitado quando o salvar falha"*,
achada injetando falha e sem vermelho escrito.

Agora são **treze formulários** com campos controlados — todos os que o app tem —
e **seis testes** segurando: três provam que o que foi digitado sobrevive à
recusa, e três protegem o que a mudança para campos controlados quase quebrou
junto (o horário de fim que se autopreenche, o fim já escolhido que não pode ser
sobrescrito, e o teto de sessões recorrentes). A `orla` mediu o conserto com o
backend recusando toda escrita: *"campo Nome vazio: NUNCA"*.

🔴 **Duas coisas que a varredura mostrou e valem para você saber:**

- **Os dois piores casos não estavam na lista original.** `patients/new` (5
  campos) e `admin/psicologos/novo` (13, o formulário mais longo do app) não
  tinham valor inicial nenhum — e é isso que piora: campo sem valor inicial
  reseta para **vazio**, em vez de voltar ao dado antigo. Quem cadastrasse um
  paciente inteiro e esbarrasse numa recusa recomeçava do zero.
- **Nas telas de edição o estrago tem outra cara**, e é mais difícil de ver: o
  reset devolve os campos aos **dados antigos**, a alteração some, e a tela fica
  com aparência de intacta. Campo vazio grita; campo com o valor velho de volta
  parece normal.

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
| `restore`/`save` separados no cache | o passo do Chromium **pode** cair de ~20 min para 30 s — ⚠️ ver a ressalva abaixo |
| `cancel-in-progress: false` | execuções **enfileiram** em vez de se matar |

📌 O custo aceito: rajada de pushes vira fila, e o veredito do último commit demora
mais. Veredito atrasado é inconveniência; veredito que nunca sai foi o que a gente
teve a noite inteira.

⚠️ **E uma correção contra mim, sobre o cache.** Eu escrevi que o passo do Chromium
"caiu para 30 s". Isso veio de **uma** execução: no run seguinte a restauração
**não** acertou e o download voltou a levar minutos. Não sei ainda por quê — a
chave do cache não mudou, então a suspeita é despejo por limite de espaço do
GitHub, que a gente enche depressa com os caches de `lein`, `~/.m2` e `npm`.

📌 **O que dá para afirmar:** o cache **consegue** ser gravado e acertar — isso
está medido, e era o impasse original. **O que eu não posso afirmar** é que o job
custa 30 s daqui para frente. Uma observação não é uma regra, e eu passei a noite
pagando por confundir as duas.

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

- ✅ **A-023 — CONSERTADA pela `orla` (`8dc3610`), depois que esta seção foi
  escrita.** O app ganhou `error.tsx` e `global-error.tsx`: cartão em português,
  com "Tentar de novo" e "Voltar ao início", e o identificador do erro no rodapé
  para ligar a tela à linha do log. **O risco de demonstração descrito abaixo não
  vale mais** — fica o registro do que era.

  🔎 Revisei pela D-002 e aprovei o `error.tsx`; deixei um achado no
  `global-error.tsx` (a tela de último recurso só oferece `reset()`, que retenta
  justamente o que quebrou). Está na mensageria 0177.

- 🔴 ~~**A-023 — o app não tem tela de erro, e a que aparece é em inglês.**~~
  Qualquer exceção não tratada no cliente substitui a tela inteira por:

  > *"Application error: a client-side exception has occurred while loading…"*

  Página em branco, uma linha, sem marca, sem navegação, sem volta — e tudo que
  a pessoa tinha digitado some junto. **Reproduzi** fazendo o envio de um
  formulário falhar no transporte (rede caindo no meio do "Salvar" produz
  exatamente isso).

  ⚠️ **É risco de demonstração:** se qualquer coisa lançar enquanto você mostra
  para a CEO, é essa tela que aparece no projetor.

  📌 **Não consertei de propósito:** o remédio é um `app/error.tsx`, e o que ele
  **diz** é a sua voz — a mesma razão pela qual eu não inventei a tela de
  configurações. O que eu recomendo: cartão na linguagem do app, com "Tentar de
  novo" e um caminho de volta, igual ao `FalhaDeCarregamento` que já existe.

- **A-018** — ver a decisão pronta no item 4.3. **Medi o mecanismo**, e ele é
  diferente do que eu tinha escrito: o paciente não é escondido por acidente —
  a listagem tem um seletor **Ativos / Inativos / Todos** bem visível, que nasce
  em "Ativos". 🔴 **O que não existe é confirmação de que salvou:** o caminho de
  sucesso faz `redirect()` **do servidor**, o componente desmonta, e nenhum aviso
  do cliente chega a aparecer. Você salva, não recebe nada, e cai numa lista onde
  a pessoa não está.
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
3. 🟡 **A-018 — uma escolha entre duas, e as duas são pequenas.**

   **O que acontece hoje, medido:** você edita a paciente, marca "inativo",
   salva. O servidor faz `revalidatePath` + `redirect("/admin/pacientes")`. A
   listagem abre filtrada por "Ativos" — então ela não está lá, e **nenhuma
   mensagem diz que deu certo**. Fica indistinguível de "salvou", "não salvou" e
   "apaguei sem querer".

   | | o que muda | custo |
   |---|---|---|
   | **(a)** *(recomendo)* | o `redirect` leva `?salvo=Marina`, e a listagem mostra uma faixa: *"Marina Alcântara agora está inativa e saiu desta lista."* com um atalho **Ver inativos** | pequeno, e resolve os dois problemas: confirma o salvamento **e** explica o sumiço |
   | **(b)** | o filtro passa a nascer em **"Todos"**; a inativa continua na lista com o selo cinza que já existe | menor ainda, mas muda a tela que a recepção usa o dia inteiro — passa a mostrar gente que ela não atende mais |

   📌 **Eu recomendo (a)** porque o defeito principal é o **silêncio**, não o
   filtro. (b) esconde o silêncio em vez de resolvê-lo: você continuaria sem
   saber se salvou, só que veria a pessoa na lista.

   ⚠️ **Não implementei nenhuma das duas** — o texto da faixa é a sua voz, e
   trocar o padrão de uma listagem de uso diário é decisão de produto.

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

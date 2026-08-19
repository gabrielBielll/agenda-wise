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

✅ **Está no branch do PR #7**, junto com as 280 correções. O Northflank constrói
esse branch — confirmado por um status de build chegando no sha do branch.

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

### O e2e não votou sobre o trabalho da noite

Front e backend estão **verdes**. O job de navegador **nunca terminou** — e a
causa tem duas camadas:

1. **Cadência** (achado da `vale`): cada push cancela o run anterior, e o job de
   navegador precisa de ~15 min contra os 5–7 dos outros. Resolvido com janela de
   silêncio.
2. **Impasse do cache** (achado meu, durante a janela): o download do Chromium
   estoura o `timeout 300` nas três tentativas — 17 min medidos, batendo com
   `apt + 3×300 + esperas`. E o `actions/cache` **só grava quando o job termina
   bem**, então o cache nunca foi gravado e todo run baixa do zero. O impasse se
   alimenta.

**Conserto:** `restore`/`save` separados com `if: always()`, para que a primeira
execução que baixar o Chromium já deixe ele no cache, e tentativas de 600s em vez
de 300s.

⚠️ **Consequência prática para a demonstração:** o comportamento das telas está
provado por `tsc`, `build`, pelos **122 testes de backend** e por mim **abrindo
cada tela**. Não está provado pelos 30 testes de navegador.

### Achados registrados e não consertados

- **A-018** — marcar paciente como inativo faz ele **sumir da listagem** sem
  aviso, na mesma linha onde fica o excluir de verdade. Espera decisão sua.

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

- **Rodei o app** contra um backend de mentira no meu scratchpad (o Clojars é
  bloqueado nesta sandbox, então o backend real não sobe aqui), fiz login e abri
  cada tela. ⚠️ **Isso prova pixel, não comportamento** — quem prova comportamento
  é o CI, com o backend de verdade contra Postgres.
- **Reproduzi o deploy mal configurado** com `next build` sem a variável e
  `node server.js` com ela, que é exatamente o que o Northflank faz.
- 🔴 **Não consegui abrir o site no ar**: o proxy desta sandbox nega qualquer host
  fora de uma allowlist curta, e `*.code.run` dá 403 no CONNECT. **Quem abre o
  link é você** — e é por isso que a rede de segurança do item 1 existe.

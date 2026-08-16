# Revisão pré-produção — 2026-08-13

Varredura geral pedida pelo Gabriel antes do refactor e do redesign. O objetivo
declarado foi **achar módulo que pode quebrar**, não fazer inventário de estilo.

## Método

Feito por leitura e análise estática no ambiente da `orla` (Claude na sandbox):
mapa de rotas, contagem por arquivo, rastreio de quem chama o quê, e inspeção
dirigida dos caminhos de maior risco. **Nada foi executado** — não compilo
Clojure aqui e não subi o front. Onde afirmo comportamento, digo se verifiquei
ou deduzi.

Eixos varridos: isolamento entre clínicas, guarda de rotas, contrato de datas,
tamanho e acoplamento dos módulos, paginação, instrumentação, segredos.

---

## 🔴 A-001 — "A série toda" reescreve o valor de sessões já pagas

**Viola:** [R-004](REGRAS_DE_NEGOCIO.md) (passado é imutável)
**Onde:** `core.clj`, modo `all` de `atualizar-agendamento-handler` (~linha 678)
**Achado em:** 2026-08-13, minutos depois de o Gabriel confirmar a R-004

```clojure
todos-agendamentos (execute-query! ["SELECT id, data_hora_sessao FROM agendamentos
                                 WHERE recorrencia_id = ?
                                 AND clinica_id = ?"   ; <- sem filtro de data
                                recorrencia-id clinica-id])
```

Sem filtro de data e **sem filtro de status**. Pega toda a série, inclusive
ocorrência `realizado` e `pago`.

E não para no horário. Repare em como o valor é montado:

```clojure
novo-valor (if (= status "cancelado") 0 (or valor_consulta (:valor_consulta agendamento-atual)))
...
(some? novo-valor) (assoc :valor_consulta novo-valor)
```

`novo-valor` **nunca é nil** — cai no valor do agendamento sendo editado. Como o
`cond->` só testa `some?`, o `valor_consulta` é gravado em **toda** ocorrência,
sempre.

**Consequência concreta:** o usuário abre uma sessão, escolhe "a série toda" só
para mudar o horário das próximas — e o sistema reescreve, em silêncio, o
`valor_consulta` de todas as sessões passadas, incluindo as que já foram pagas e
repassadas. O livro financeiro muda depois de o dinheiro ter andado.

Não há mensagem, não há confirmação, e a resposta diz "N agendamentos
atualizados com sucesso".

✅ **Reproduzido em 2026-08-14** contra PostgreSQL 16, com a JVM em UTC:
[`docs/reproducoes/serie_reescreve_passado.sql`](reproducoes/serie_reescreve_passado.sql).
Série de seis, quatro já realizadas e pagas a R$350. O usuário muda só o
horário para 09:00 e escolhe "a série toda" — as quatro passadas saem para
09:00 valendo R$200. **R$ 600 de diferença em sessões já pagas e repassadas.**
O que continua sendo leitura de código, e não execução: que `novo-valor` nunca
é nil. A `orla` não compila Clojure aqui.

---

## 🔴 A-002 — "Esta e as seguintes" é relativo à ocorrência, não a hoje

**Viola:** [R-004](REGRAS_DE_NEGOCIO.md)
**Onde:** `core.clj`, modo `all_future` (~linha 643)

```clojure
AND data_hora_sessao >= ?
...
recorrencia-id (:data_hora_sessao agendamento-atual) clinica-id
```

O corte é a data **da ocorrência aberta**, não `now()`. Abrir uma sessão de três
meses atrás e escolher "esta e as seguintes" alcança tudo daquela data em
diante — três meses de sessões já realizadas junto.

Mais sutil que a A-001 e pela mesma porta: o mesmo `novo-valor` incondicional
reescreve o `valor_consulta` de cada uma.

**Correção das duas:** o corte tem que ser `now()` **e** o status, não a data da
ocorrência. Ocorrência `realizado` sai do conjunto em qualquer modo — é o que a
R-004 diz.

✅ **Reproduzido junto com a A-001**, no mesmo arquivo: abrir a ocorrência mais
antiga da série alcança as seis, quatro delas realizadas.

✅ **Corrigidos em 2026-08-14**, autorizado pelo Gabriel. Em `core.clj`,
`filtro-do-passado` e `valor-para-a-serie`, compartilhados pelos dois modos.

⚠️ **A correção proposta acima estava errada em um ponto, e o erro só apareceu
ao escrever o teste.** "O corte tem que ser `now()`, não a data da ocorrência"
lido ao pé da letra quebra o `all_future`: com a série toda no futuro — o caso
comum — cortar só por `now()` faz "esta e as seguintes" pegar a série inteira,
inclusive as anteriores à que o usuário abriu. São os **dois** cortes, não a
troca de um pelo outro. O modo `all` leva só o de `now()`, porque ali não existe
corte de ocorrência.

Verificado contra PostgreSQL 16, os quatro casos: série atravessando hoje pelos
dois modos (2 alcançadas, nenhuma realizada) e série toda no futuro (`all_future`
na 3ª de 4 → 2; `all` → 4). As duas strings de SELECT foram extraídas do fonte e
aceitas pelo `PREPARE` do PostgreSQL. ✅ **A suíte Clojure rodou depois**, pela
`duna` em PostgreSQL 18: 67 testes, 253 asserções, 0 falhas, sem regressão nos
modos `all` e `all_future` ([0026](../mensageria/0026-duna-para-orla-r004-verde-no-postgres18.md)).

🧪 **Teste antes da correção, como manda a [D-008](../mensageria/DECISOES.md):**
`all-nao-reescreve-ocorrencia-ja-realizada` e
`all-future-corta-em-hoje-nao-na-ocorrencia-aberta`, em
`test/deep_saude_backend/agendamentos_test.clj`. Nasceram **vermelhos de
propósito** — descreviam a R-004, não o código de então — e ficaram verdes com a
correção, sem ajuste nenhum, que é o que a D-008 compra. Foram escritos sem nunca terem sido executados pela autora; a `duna`
(GPT local) executou os dois em PostgreSQL 18 e ambos passaram.

---

## 🔴 A-003 — Admin lê prontuário sem flag nenhuma

**Viola:** [R-012](REGRAS_DE_NEGOCIO.md)
**Onde:** `core.clj`, `listar-prontuarios-handler`

A R-012 diz: só o psicólogo autor, com saída de emergência por flag no código.
Hoje não existe flag — o admin da clínica lê direto.

A escrita já está certa (`atualizar-prontuario-handler` checa autoria e devolve
403). É a **leitura** que está aberta.

✅ **Corrigido em 2026-08-15.** `pode-ler-prontuarios?` em `core.clj`: só o
psicólogo do paciente lê. A saída de emergência da R-012 existe como
`super-admin-le-prontuario?`, um `def` **em código** — deliberadamente não é
variável de ambiente, porque a R-012 exclui "configuração que alguém com acesso
ao painel possa ligar", e o painel do Render é exatamente isso.

**Por onde a leitura passava:** o `wrap-checar-permissao` da rota exige
`visualizar_pacientes`, que o admin tem. Permissão de tela não é autorização
clínica — a guarda de papel existia, mas a de autoria não.

🔴 **Achado ao corrigir, e mais grave do que a A-003: o admin também *apagava*
prontuário alheio.** `remover-prontuario-handler` só disparava a guarda quando
`papel` era "psicologo"; para qualquer outro papel, passava direto para o
`DELETE`. O handler irmão de edição já checava autoria sem olhar papel — esta
linha ficou para trás dele. Corrigido junto, um passo além do escopo da A-003, e
registrado aqui para o Gabriel poder derrubar: apagar registro clínico é pior do
que lê-lo, e nenhuma tela do admin consome prontuário, então o alcance é zero.

🧪 Testes em `test/deep_saude_backend/prontuarios_test.clj` — leitura pelo autor,
pelo colega e pelo admin, exclusão pelos três, e a saída de emergência ligada e
desligada. ✅ **Verdes na primeira execução do CI**: a suíte saiu de 67 para 74
testes e de 253 para 265 asserções, sem falha. Escritos sem nunca terem sido
executados pela autora — quem os rodou foi o CI, minutos depois de existir.

⚠️ Mesmo padrão em `criar-prontuario-handler` (`and (= papel "psicologo")`): o
admin pode criar prontuário para paciente de outro psicólogo. Menos grave — ele
fica como autor, e depois da correção só ele mesmo lê. Não mexi; fica anotado.

---

## 🔴 A-004 — A comissão é estado de navegador, e o repasse gravado depende dela

**Achado em:** 2026-08-15, preparando as perguntas do oráculo — não por varredura
de código, e sim por tentar descrever ao Gabriel o que o sistema faz hoje.
**Onde:** `src/app/admin/financeiro/FinanceiroClient.tsx`
**Regra:** R-009, ainda **em aberto** — por isso não é violação de regra
confirmada como A-001 a A-003. É defeito de outra natureza: o sistema não tem
resposta, e improvisa uma diferente a cada carregamento de página.

O documento do oráculo afirmava que "existem colunas de comissão no banco".
**Não existem.** Não há coluna, campo, configuração nem endpoint de comissão —
procurado em migrations, backend e front.

O que existe é isto:

```ts
const [commissionRate, setCommissionRate] = useState<number>(50);   // linha 111
```

**50% nasce fixo a cada abertura da página**, mora só na memória do navegador e
nunca é persistido nem lido de lugar nenhum. E ele decide dinheiro:

```ts
// linha 320 — ao marcar/desmarcar repasse
const repasseValue = valorConsulta * (commissionRate / 100);

// linha 324 — o que a TELA passa a mostrar: preserva o valor que já existia
ag.valor_repasse ?? repasseValue

// linhas 333-334 — o que vai para a API: SEMPRE o recalculado
body: JSON.stringify({ status_repasse: newStatus, valor_repasse: repasseValue })
```

**Três consequências, e a terceira é a pior:**

1. **Não é determinístico.** A mesma sessão gera repasses diferentes conforme
   quem abriu a tela e se mexeu no controle antes de clicar.
2. **Não é auditável.** Nada registra qual taxa produziu qual valor, porque a
   taxa não é gravada em lugar nenhum.
3. **Tela e banco discordam.** A atualização otimista preserva o
   `valor_repasse` que já existia (`?? repasseValue`), mas o corpo enviado à API
   manda o recalculado **sem condição**. O admin vê o valor antigo e o banco
   guarda o novo. É a mesma família do item 1 — leitura e escrita discordando —
   e da A-001 — dinheiro reescrito em silêncio.

E alternar "transferido" → "disponível" → "transferido" recalcula a cada volta.

**Não corrigir antes da R-009.** A correção depende de qual é a regra: taxa fixa,
por psicólogo, por clínica ou negociada por sessão; e se sessões antigas mantêm a
taxa da época. Escolher no código seria inventar regra de negócio, que é
exatamente o que a [D-008](../mensageria/DECISOES.md) proíbe. O que dá para dizer sem a regra é que **a
taxa precisa estar no banco e o `valor_repasse` precisa ser gravado uma vez**, não
recalculado a cada clique.

---

## 🔴 A-005 — Qualquer um força agendamento sobre conflito

**Viola:** [R-006](REGRAS_DE_NEGOCIO.md), confirmada em 2026-08-15
**Onde:** `core.clj`, `criar-agendamento-handler` — `force` no corpo, linha ~606

```clojure
{:keys [... force ...]} (:body request)
...
agendamento-conflitante (when (not force) ...)
```

`force` é um campo do corpo da requisição e **não há checagem de papel nenhuma**.
Quem pode criar agendamento pode mandar `force: true` e passar por cima do
conflito — psicólogo, secretário, qualquer um.

A R-006 diz que **só a clínica força**. Para o psicólogo, o desenho é outro:
modal explicando o conflito e pedindo contato com a gestão, mais notificação no
painel da clínica.

**Correção:** a guarda é de papel, no backend — o `force` de quem não é
`admin_clinica` deve ser ignorado (ou recusado com 403), não obedecido. Tela que
esconde o botão não resolve: o campo está no corpo.

⚠️ **Detalhe medido, que estreita a correção:** o `force` pula **só** a checagem
de agendamento. O `bloqueio-existente`, calculado logo acima, não tem `when` e
roda sempre. Aquele ramo já está certo e não deve ser tocado.

⚠️ **O que a R-006 pede e não entra nesta correção:** a notificação no sininho do
painel da clínica. **Não existe notificação nenhuma no sistema** — conferido: sem
tabela, sem rota, sem código. É funcionalidade nova; a guarda vai sozinha, e
meia notificação seria pior do que nenhuma.

🔧 **Designada em 2026-08-16** à `duna`, com teste antes da correção (D-008) —
ver [0042](../mensageria/0042-orla-para-duna-a-005-e-a-006-o-teste-antes-da-correcao.md). Contrato: `403 {"code": "force_requires_admin"}`.

---

## 🔴 A-006 — Um bloqueio cancela sessões em massa, zera o valor delas e alcança o passado

**Viola:** [R-014](REGRAS_DE_NEGOCIO.md), confirmada em 2026-08-15 — e o
princípio da [R-004](REGRAS_DE_NEGOCIO.md), que já era confirmada
**Onde:** `core.clj`, `criar-bloqueio-handler`, ~linha 1123

```clojure
(when cancelar_conflitos
  (doseq [{start-ts :start end-ts :end} intervalos]
    (sql/update! tx :agendamentos
                 {:status "cancelado" :valor_consulta 0}      ; <- zera o valor
                 ["clinica_id = ? AND psicologo_id = ? AND status != 'cancelado'
                   AND data_hora_sessao < ?
                   AND (data_hora_sessao + (COALESCE(duracao, 50) * interval '1 minute')) > ?"
                  clinica-id target-psicologo-id end-ts start-ts])))
```

**Quatro problemas, e eles se somam:**

1. **É um booleano do corpo da requisição.** `cancelar_conflitos: true` e pronto —
   sem confirmação, sem as duas confirmações que a R-014 exige, sem aviso listando
   dia e hora das sessões atingidas.
2. **Zera `valor_consulta`.** Não é só cancelar: apaga o valor. É a mesma família
   da A-001 — dinheiro reescrito em silêncio.
3. **Não tem filtro de data.** O `WHERE` casa qualquer sobreposição, futura ou
   passada. Bloqueio criado sobre um intervalo já vivido **cancela e zera sessão
   já realizada e já paga** — exatamente o que a R-004 proíbe, e o mesmo defeito
   da A-002, que era a falta de corte em `now()`.
4. **É em massa por construção.** O handler aceita `recorrencia_tipo` e
   `quantidade_recorrencia`, então **um** request gera N intervalos e cancela em
   todos. Com o limite de 120 da R-005, um clique alcança 120 janelas.

E nada disso deixa rastro: não há histórico, não há autoria registrada, não há
como desfazer. A R-014 pede as três coisas explicitamente.

**Por que ninguém viu antes:** o caminho é legítimo e o nome do campo é honesto —
"cancelar conflitos" é o que a pessoa quer quando marca férias. O que não está
escrito em lugar nenhum é que ele também apaga o valor e que não olha a data.

**Correção — decidida em 2026-08-15, e é mais simples do que eu supunha.**

A R-014 foi confirmada como **proibição**, não como aviso: criar bloqueio
**nunca** cancela sessão. Isso muda o conserto de "cortar por `now()`" para
**tirar o cancelamento de dentro do handler de bloqueio**:

- `criar-bloqueio-handler` **recusa** quando há sobreposição, e devolve o dia e a
  hora de cada sessão atingida para a pessoa resolver antes. O parâmetro
  `cancelar_conflitos` deixa de existir nesse caminho.
- **Cancelar sessões em massa vira ação separada**, da administração da clínica,
  numa área de configurações avançadas — e essa sim exige as duas confirmações,
  o corte por `now()`, e registro no histórico com autoria.

Note que a proibição resolve os quatro problemas de uma vez, e por construção:
sem cancelamento no caminho, não há zeramento de valor, não há alcance ao
passado, e não há ação em massa acidental. O caminho destrutivo continua
existindo — mas passa a ser escolhido de propósito, por quem tem autoridade, num
lugar aonde ninguém chega sem querer.

⚠️ **Ordem — e eu tinha escrito isto errado aqui.** Eu havia registrado que o
histórico da R-010 vinha **antes** desta correção. Não vem, e a distinção importa
porque estava segurando um defeito que zera dinheiro.

A R-014 tem **duas** partes, e só uma precisa de histórico:

| Parte | Precisa da R-010? |
|---|---|
| **recusar** o bloqueio sobre sessão marcada | **não** — não há ação a registrar; a ação destrutiva deixa de existir |
| **cancelamento em massa** na área de configurações avançadas | **sim** — é ela que exige autoria, aviso e duas confirmações |

A recusa é a que apaga o defeito, e ela está desimpedida. O que espera o
histórico é a funcionalidade nova, que hoje não existe e não é urgente.

🔧 **Designada em 2026-08-16** à `duna`, com **teste antes da correção** (D-008) —
ver [0042](../mensageria/0042-orla-para-duna-a-005-e-a-006-o-teste-antes-da-correcao.md). Contrato da recusa, fixado para backend e front escreverem
contra a mesma forma:

```json
409 { "erro": "…", "code": "session_conflict",
      "sessoes": [{"id": "…", "data_hora_sessao": "…", "duracao": 50}] }
```

Só dia, hora e duração — é o que a R-014 pede. Sem nome de paciente: quem cria o
bloqueio pode ser um secretário mexendo na agenda de outro psicólogo.

---

## 🔴 1. O contrato de datas foi aplicado pela metade

**Onde:** `src/app/admin/agendamentos/**` (4 arquivos)
**Como achei:** `lib/datetime.ts` é importado por exatamente **dois** arquivos —
`(app)/calendar/CalendarClient.tsx` e `(app)/calendar/WeekView.tsx`.

O `lib/datetime.ts` foi criado justamente para ser o único lugar que traduz
horário de parede ↔ instante, depois do bug de 3 horas. Ele cobriu o calendário
do psicólogo. **O módulo de agendamentos do admin não foi migrado** e continua
fazendo data na mão.

`EditarAgendamentoForm.tsx`, linhas 100–103:

```ts
const date = new Date(dateString);
const offset = date.getTimezoneOffset() * 60000;
const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
```

Isso renderiza o instante **no fuso do navegador**. O backend agora grava
`TIMESTAMPTZ` com semântica de São Paulo. Enquanto o navegador estiver em
`America/Sao_Paulo`, coincide e ninguém percebe. Fora disso, diverge.

E o caminho de escrita do mesmo módulo está certo — `actions.ts` linha 70 manda
horário de parede, que é o contrato. Então **ida e volta discordam entre si**: o
formulário mostra uma hora convertida pelo fuso do navegador e salva a hora
literal do input.

**Por que é o pior da lista:** correção pela metade é mais perigosa do que
correção nenhuma. O bug foi dado como resolvido, os testes do calendário passam,
e a tela de edição do admin continua com o defeito original. Quem olhar o
histórico conclui que está fechado.

🔴 **Corrigido para pior em 2026-08-15: isto é defeito de ESCRITA, não de
exibição** — medido pela `vale` (Claude local) em 2904 casos × 8 fusos, e
reproduzido pela `orla` por caminho próprio.

A leitura converte para o fuso do navegador; a escrita manda o literal do input,
que o backend lê como São Paulo. Abrir a tela de edição e clicar **Salvar sem
tocar na data** desloca a sessão:

| Fuso do navegador | Form mostra | Grava | Desloca |
|---|---|---|---|
| `America/Sao_Paulo` | 14:00 | 14:00 | +0h |
| `America/New_York` | 13:00 | 13:00 | −1h |
| `UTC` | 17:00 | 17:00 | +3h |
| `Europe/Lisbon` | 18:00 | 18:00 | +4h |
| `Asia/Tokyo` | 02:00 | 02:00 do dia seguinte | **+12h e vira o dia** |

Mesma família da A-001: corrupção silenciosa, sem aviso e sem confirmação. A
diferença é que a A-001 precisava de "a série toda" e esta precisa de um
psicólogo em viagem abrindo a agenda.

🟠 **A migração para o contrato foi feita e não corrige nada.** `paraInputLocal`
é logicamente idêntico ao código que substituiu — os dois usam
`getTimezoneOffset()`, e a própria docstring dele diz "no fuso do navegador".
Preservar comportamento é o que se quer de um refactor; aqui significa que o
defeito atravessou intacto.

**A correção de verdade** é renderizar no fuso da **clínica**, o que mexe no
`lib/datetime.ts` compartilhado com o calendário do psicólogo — Fase 2.
Recomendação da `orla` ao Gabriel: corrigir o módulo inteiro, calendário junto,
agora que a Fase 2 destravou. Corrigir só o admin criaria duas semânticas de
data no mesmo app, o que é pior que o erro uniforme de hoje.

**Ainda não medido:** o `value` do `<input>` num DOM real. O formulário não vem
no HTML do SSR e não há Chromium para `aarch64`. A prova é no nível da função; a
ligação com a tela foi conferida por leitura.

---

## 🔴 2. O guarda de rotas falha aberto

**Onde:** `src/middleware.ts`

A proteção é uma allowlist por prefixo:

```ts
if (pathname.startsWith('/admin')) { ... }
const appRoutes = ['/dashboard', '/calendar', '/patients'];
```

Rota que não casa com nenhum dos dois cai em `NextResponse.next()` — **liberada,
sem token**. Não é hipótese: `/settings` já está nessa situação hoje.

Hoje não vaza nada, porque `/settings` é placeholder com `useState` e um toast
"Configurações Salvas (Simulado)". O problema é a regra: **toda rota nova nasce
desprotegida**, e o redesign vai criar rotas.

**Correção certa:** inverter para negar por padrão — lista o que é público
(`/`, `/login`, `/admin/login`) e exige sessão em todo o resto. Assim rota nova
nasce fechada e o erro possível vira "esqueci de liberar", que aparece na hora,
em vez de "esqueci de proteger", que não aparece nunca.

---

## 🟠 3. `core.clj` com 1492 linhas

37% do backend em um arquivo: configuração, JWT, middlewares, e os handlers de
usuários, pacientes, psicólogos, agendamentos, bloqueios, financeiro,
prontuários e provisionamento — mais as rotas e o `-main`.

O padrão bom já existe no próprio projeto e foi aberto nesta rodada: `tempo`,
`dominio`, `limites`, `db`, `google/*` são namespaces coesos e testados
isoladamente. O `core.clj` é o que sobrou de antes.

Corte natural, seguindo o que já está lá:

| Namespace | O que leva |
|---|---|
| `auth` | JWT, `wrap-jwt-autenticacao`, `wrap-checar-permissao`, login |
| `pacientes` | CRUD de pacientes |
| `psicologos` | CRUD de psicólogos e usuários |
| `agendamentos` | criação, recorrência, conflito, os três modos de edição |
| `financeiro` | pagamento, repasse, transferências em lote |
| `prontuarios` | CRUD de prontuários |
| `provisionamento` | clínica + admin |
| `core` | só composição: rotas, middlewares, `-main` |

---

## 🟠 4. Nenhuma listagem tem paginação

51 `SELECT` no `core.clj`, **zero** `LIMIT`. Toda listagem devolve a tabela
inteira da clínica: pacientes, agendamentos, prontuários, financeiro.

Com os índices que entraram no PR #7, a consulta ficou rápida. O que não mudou é
o volume trafegado e renderizado — uma clínica com anos de histórico devolve
tudo em toda tela. É o próximo gargalo, e já estava registrado na auditoria de
agosto.

---

## 🟠 5. Instrumentação de depuração no caminho quente

**20 `println "DEBUG"`** no backend e **31 `console.log`** no front.

O caso pior é `listar-psicologos-handler` (`core.clj` ~348): antes da consulta
real ele dispara **cinco consultas extras que só existem para imprimir** —
inclusive `SELECT id FROM clinicas`, que lista o identificador de **todas as
clínicas da plataforma** no log, e um `COUNT(*) FROM usuarios` sem filtro.

⚠️ **Não é vazamento entre clínicas.** Conferi: a resposta vem da consulta final,
que filtra por `clinica_id`. O que vaza é para o **log** — e log agregado costuma
ter mais leitores do que a API.

---

## 🟡 6. Dois componentes de 1306 linhas

`FinanceiroClient.tsx` e `CalendarClient.tsx`, ambos com 1306 linhas, e
`AgendamentosClient.tsx` com 709. São os arquivos que o redesign vai tocar
primeiro. Redesenhar em cima deles é caro; quebrá-los antes é o que torna o
redesign viável.

---

## 🟡 7. Token expirado manda o psicólogo para a porta do admin

`middleware.ts`: quando o `backendToken` expira, o redirecionamento é
`/admin/login` — para qualquer papel. Psicólogo com sessão vencida cai numa tela
de login administrativa. Existem duas portas (`/login` e `/admin/login`) e o
tratamento de expiração só conhece uma.

No mesmo bloco há um ramo morto: `if (role === 'admin_clinica')` dentro de um
`if` que já excluiu `admin_clinica`. Inofensivo, mas indica que a regra foi
editada sem releitura.

---

## O que está bom, e não deve entrar no refactor

Vale registrar para ninguém "arrumar" o que já está certo:

- **Isolamento entre clínicas.** Amostrei prontuários e psicólogos: a guarda
  filtra por `clinica_id` antes de qualquer escrita, o `update!` repete o filtro,
  e prontuário ainda checa autoria. Os `SELECT * WHERE id = ?` que aparecem sem
  filtro são releituras **depois** da guarda passar. Disciplinado.
- **Migrations.** Versionadas, com `.down.sql` testados nos dois bancos, dentro
  de transação. Ver D-001.
- **`tempo.clj`.** É o contrato de datas do backend e está correto e testado. O
  problema do item 1 é o front que não o acompanhou.
- **A suíte.** 65 testes / 245 asserções contra banco real, mais 11 de navegador.
  É o que torna o refactor possível.

---

## Plano

### Fase 0 — CI (**pré-requisito, não paralelo**)

Não existe CI (OPS-006). Refatorar 1500 linhas sem execução automática da suíte
é fazer no escuro: o custo do erro não aparece no commit, aparece semanas depois.

A suíte já está verde e já roda em três ambientes. Falta só amarrar. Precisa dos
**dois** comandos de type check — `tsc` da aplicação e `npm run typecheck:e2e` —
porque o `e2e` ficou fora do tsconfig da app.

**Isto vem antes de qualquer refactor.**

### Fase 1 — Fechar o que quebra

**A-001, A-002 e A-003 primeiro** — violam regra de negócio confirmada, e as
duas primeiras corrompem registro financeiro em silêncio.

Depois os itens 1, 2 e 7: correções pequenas e de risco alto se ficarem.

⚠️ **A-001 e A-002 precisam de teste antes da correção** ([D-008](../mensageria/DECISOES.md)): um que crie
série com ocorrência passada paga, edite pelos dois modos e falhe hoje.

### Fase 2 — Refactor estrutural

Itens 3, 5 e 6, com a suíte rodando a cada passo. Namespace por namespace, um
commit por extração, sem mudar comportamento.

### Fase 3 — Redesign do front

Depois da Fase 2, quando os componentes já estiverem quebrados em peças.

### Fase 4 — Entrega

Paginação (item 4) e o que o uso real mostrar.

---

## O que esta revisão não cobriu

- **Não executei nada.** Todo achado é de leitura.
- **Não varri o módulo Google a fundo** — é o mais novo e está bloqueado pelo
  Gabriel.
- **Não avaliei acessibilidade nem responsividade**, que são matéria da Fase 3.
- **Não revisei a suíte de testes** procurando teste que passa sem provar nada.

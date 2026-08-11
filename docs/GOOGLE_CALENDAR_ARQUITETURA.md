# Integração Google Agenda — Arquitetura sobre a base atual

> Criado em 2026-08-11.
> Companion da [spec de handoff](GOOGLE_CALENDAR_SPEC.md). **Aquele documento descreve o alvo; este descreve como chegar lá a partir do código que existe hoje.**

## Como ler este documento

A spec original foi escrita sem acesso ao repositório. Ela propõe um modelo de dados greenfield (`serie_sessao`, `sessao`, `vinculo_agenda`). O Deep Saúde já tem `agendamentos`, `recorrencia_id`, `bloqueios_agenda` — e um módulo financeiro em cima disso.

Este documento faz três coisas:

1. **Mapeia** cada decisão da spec para o que já existe (seção 2).
2. **Registra as adaptações** — onde eu discordo da spec ou preciso ir além dela, sempre com o motivo (seção 4, decisões D7–D13).
3. **Aponta os pré-requisitos** que a spec não podia conhecer e que bloqueiam a Fase 1 (seção 3).

Marcações: ⚠️ armadilha • ❓ pendente de confirmação • 🔴 bloqueador

---

## 1. O que já temos

### 1.1 Topologia atual

| Camada | Stack | Onde |
|---|---|---|
| Frontend | Next.js 15 (App Router), NextAuth, Shadcn | `deep-saude-plataforma-front-end/` |
| Backend | Clojure — Ring/Jetty/Compojure, next.jdbc, buddy JWT | `deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj` (1297 linhas, arquivo único) |
| Banco | PostgreSQL (CockroachDB em produção) | `setup_db.sql` |

### 1.2 O que existe hoje de recorrência

`criar-agendamento-handler` (`core.clj:460`) materializa até 150 linhas em `agendamentos`, todas com o mesmo `recorrencia_id` (UUID):

```clojure
qtd-sessoes     (min (or quantidade_recorrencia 1) 150)
intervalo-dias  (case recorrencia_tipo "semanal" 7 "quinzenal" 14 0)
offset-millis   (* i intervalo-dias 24 60 60 1000)   ;; ⚠️ aritmética em milissegundos
```

`atualizar-agendamento-handler` (`core.clj:558`) já implementa os modos **`this_and_future`** e **`all`**; `remover-agendamento-handler` (`core.clj:713`) já implementa **`all_future`** e **`all`**. Essas três semânticas são exatamente as do Google ("este evento", "este e os seguintes", "todos"). **Isso é a peça mais valiosa que já temos** — o modelo mental do usuário já bate.

Não existe tabela de série. O `recorrencia_id` é um UUID solto, sem linha correspondente: não há onde guardar `rrule`, `google_event_id` ou `etag` da série.

### 1.3 O que existe hoje de Google

| Item | Estado real |
|---|---|
| `GoogleProvider` no NextAuth (`api/auth/[...nextauth]/route.ts`) | Configurado, mas o callback `jwt` **não persiste `account.access_token`** — o provider está efetivamente morto |
| `POST /api/calendar/events` (`api/calendar/events/route.ts`) | Escreve em `calendarId: 'primary'` com timezone do browser, lendo um `session.accessToken` que nunca é populado. **Código morto e contrário às decisões D1/D2 da spec** |
| Toggle "Conectar Google Agenda" (`(app)/settings/page.tsx:17`) | `useState` puro, rotulado "(Simulado)" |
| Backend Clojure | Zero referências a Google. Nenhuma dependência HTTP client, nenhum scheduler |

**Conclusão:** não há integração para "melhorar". Há três stubs para remover e um greenfield para construir — mas dentro de um domínio já modelado.

### 1.4 O que já temos e a spec não sabia (e ajuda muito)

- **`bloqueios_agenda`** (`setup_db.sql`) — tabela de bloqueio de disponibilidade por psicólogo, com `recorrencia_id` e `dia_inteiro`. É exatamente o destino que a spec 6.6 pede para eventos criados fora da plataforma.
- **Detecção de conflito já existente** — `criar-agendamento-handler` já checa colisão contra `agendamentos` **e** contra `bloqueios_agenda` antes de inserir. Assim que eventos externos do Google virarem bloqueios, o compromisso pessoal que o psicólogo criou no celular passa a impedir agendamento em cima dele. Feature de graça.
- **RBAC por permissão** (`wrap-checar-permissao`) — já há o gancho para restringir vínculo agenda↔psicólogo a admin (spec 5.4).
- **Modos de recorrência** — descritos em 1.2.

---

## 2. Mapa spec → código

| Spec | Tabela/conceito proposto | O que já temos | Ação |
|---|---|---|---|
| 3.1 | `google_conexao` | — | **Criar** (nova) |
| 3.2 | `vinculo_agenda` | — | **Criar** (nova) |
| 3.3 | `google_canal_watch` | — | **Criar** (nova) |
| 3.4 | `serie_sessao` | `recorrencia_id` (UUID sem tabela) | **Materializar** como `recorrencias`, reaproveitando o UUID existente como PK |
| 3.5 | `sessao` | `agendamentos` | **Estender** com colunas de sync — não substituir |
| 6.6 | "importar como bloqueio" | `bloqueios_agenda` | **Estender** com `origem` + `google_event_id` |
| D5 | identidade é da plataforma | `usuarios` + JWT + RBAC | Já vale. Falta só `google_email` verificado |

Nenhuma tabela da spec substitui uma tabela existente. O trabalho é **aditivo**, e é isso que torna a Fase 1–2 viável sem tocar no módulo financeiro.

---

## 3. 🔴 Pré-requisitos — Fase 0

A spec começa na Fase 1 (OAuth). Não dá. Três coisas bloqueiam antes disso.

### 3.1 🔴 Timezone: o banco é *naive*, o Google não é

Hoje o caminho de uma data é:

```
Frontend:  "2026-08-17T14:00"  →  .replace("T"," ") + ":00"     (actions.ts:70)
Backend:   java.sql.Timestamp/valueOf "2026-08-17 14:00:00"     (core.clj:~466)
Banco:     data_hora_sessao TIMESTAMP  (sem timezone)           (setup_db.sql)
```

Em nenhum ponto existe um fuso. O sistema inteiro assume "horário de parede, implicitamente São Paulo". Funciona enquanto tudo é local — e quebra no primeiro contato com o Google, que devolve RFC3339 com offset (`2026-08-17T14:00:00-03:00`).

Se sincronizarmos sem corrigir isso, o sintoma não é um erro: é sessão aparecendo com 3h de diferença dependendo de qual lado escreveu por último. Silencioso, intermitente, e o financeiro em cima.

**Ação:**

```sql
ALTER TABLE agendamentos  ALTER COLUMN data_hora_sessao TYPE TIMESTAMPTZ
  USING data_hora_sessao AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE bloqueios_agenda ALTER COLUMN data_inicio TYPE TIMESTAMPTZ
  USING data_inicio AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE bloqueios_agenda ALTER COLUMN data_fim TYPE TIMESTAMPTZ
  USING data_fim AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE clinicas ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
```

E no backend, trocar `java.sql.Timestamp/valueOf` por `ZonedDateTime` com o fuso da clínica. O frontend continua mandando horário de parede — a conversão vira responsabilidade explícita do backend, não um acidente do JDBC.

⚠️ **A aritmética de recorrência em milissegundos** (`(* i 7 24 60 60 1000)`) precisa virar `.plusWeeks(i)` sobre `ZonedDateTime`. Hoje o Brasil não tem horário de verão, então o bug está dormindo; ele acorda se o horário de verão voltar ou se a clínica atender alguém em outro fuso. Custa uma linha corrigir agora e é uma investigação de meio dia depois.

### 3.2 🔴 Migrações versionadas antes de mexer em schema

O schema evolui hoje via `ensure-finance-columns!` (`core.clj:70`): um `future` no startup que tenta `ALTER TABLE ADD COLUMN` e engole a exceção quando já existe. Vamos adicionar 4 tabelas e ~12 colunas. Fazer isso nesse padrão é insustentável.

**Depende de [ROB-004](cards/sprint-2-robustness/ROB-004-migratus.md) (Migratus).** Puxar esse card para antes da integração.

### 3.3 🔴 Domínio verificado + app em Produção

Sem isso: sem webhook (o Google exige HTTPS em domínio verificado no Cloud Console) e refresh token morrendo a cada 7 dias.

**Depende de [AWS-012](cards/aws-migration/AWS-012-route53-acm-dominio.md).** O refresh token criptografado depende de [AWS-006](cards/aws-migration/AWS-006-secrets-manager.md) (Secrets Manager para a chave de envelope).

⚠️ Publicar o consent screen em **Produção** é gratuito e imediato, e já resolve o problema dos 7 dias. **Verificação** é outra coisa, leva semanas — começar em paralelo, como diz a spec 8.2.

---

## 4. Decisões arquiteturais adicionais

A spec vai de D1 a D6. Estas são as que faltam, específicas desta base de código.

### D7 — A integração vive no backend Clojure, não no Next.js

Todo o código Google (OAuth, escrita, sync, webhook) fica no backend. O Next.js só desenha tela.

**Por quê:**
- O refresh token da clínica dá acesso à agenda de **todos** os pacientes. Ele não pode transitar por rota Next.js, que roda em ambiente de edge/serverless com superfície muito maior.
- Renovação de canal de watch e polling de fallback são processos de longa duração. Amplify/Vercel não sustentam isso.
- A prevenção de eco e o `If-Match` dependem de ler e escrever `etag` na mesma transação do write de `agendamentos`. Isso só existe onde está o banco.

**Ação imediata:** deletar `src/app/api/calendar/events/route.ts` e o toggle simulado de `settings/page.tsx`. Manter o `GoogleProvider` do NextAuth **apenas** com escopos `openid email profile` (spec 5.5), persistindo `email_verified` no JWT — é o insumo do matching da spec 5.4, e não dá acesso nenhum a agenda.

⚠️ Nunca pedir escopo de Calendar no login do psicólogo. O acesso vem do token da clínica. Pedir escopo sensível no login individual multiplicaria por N o problema do teto de 100 usuários.

**Contrapartida:** `googleapis` (Node) é uma biblioteca mais confortável que fazer HTTP na mão em Clojure. Aceito: o volume de endpoints que usamos é pequeno (`calendarList.list`, `events.{insert,patch,delete,list,watch}`, `calendars.insert`, `acl.insert`, `channels.stop`) e o cliente Java oficial do Google resolve refresh de token sozinho.

### D8 — Outbox transacional, não chamada síncrona

A spec 6.1 diz "ao criar/alterar série, chamar a API e guardar o etag". Direto assim, não.

`criar-agendamento-handler` com recorrência semanal de 1 ano já faz ~52 queries de checagem de conflito. Pendurar chamadas HTTP ao Google no mesmo request significa: latência do endpoint refém da rede do Google, e — pior — falha do Google virando falha de agendamento. A secretária não consegue marcar sessão porque a API do Google está lenta. Inaceitável.

```sql
CREATE TABLE google_sync_outbox (
  id             BIGSERIAL PRIMARY KEY,
  clinica_id     UUID NOT NULL REFERENCES clinicas(id),
  psicologo_id   UUID REFERENCES usuarios(id),      -- vira quotaUser
  entidade       TEXT NOT NULL,                     -- recorrencia | agendamento | bloqueio
  entidade_id    UUID NOT NULL,
  operacao       TEXT NOT NULL,                     -- criar | atualizar | cancelar | remover
  payload        JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendente',  -- pendente | processando | ok | erro | descartado
  tentativas     INT NOT NULL DEFAULT 0,
  proxima_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_erro    TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em  TIMESTAMPTZ
);
CREATE INDEX ON google_sync_outbox (status, proxima_em);
CREATE INDEX ON google_sync_outbox (entidade, entidade_id);
```

O handler grava `agendamentos` + linha de outbox **na mesma transação** e responde 201. Um worker drena a fila com backoff exponencial e jitter (spec seção 9).

Três benefícios que caem no colo:

1. **Retry e backoff de graça** — 403/429/5xx do Google não perdem nada.
2. **Prevenção de eco de graça** — antes de aplicar uma mudança vinda do Google, checar se há outbox recente/pendente para a mesma entidade. É a "janela de supressão" da spec 6.4 item 3, sem timer arbitrário.
3. **Auditoria de graça** — a fila é o log de tudo que a plataforma mandou para o Google.

⚠️ Isto depende de [ROB-010](cards/sprint-2-robustness/ROB-010-transacoes.md) (transações em writes multi-statement). Hoje `criar-agendamento-handler` faz N `sql/insert!` fora de transação: se cair no meio, sobram sessões órfãs. Com outbox isso vira divergência com o Google.

### D9 — IDs de evento determinísticos

`events.insert` aceita um `id` gerado pelo cliente (charset base32hex: `0-9`, `a-v`, 5–1024 chars). Derivamos o ID do Google do UUID da plataforma:

```
google_event_id = "ds" + base32hex(uuid_bytes_da_recorrencia_ou_agendamento)
```

**Por quê:** torna `insert` idempotente. Worker de outbox que falhou depois de escrever no Google mas antes de commitar o `etag` reprocessa e recebe `409 Duplicate` em vez de criar um segundo evento. Sem isso, toda falha parcial vira sessão duplicada na agenda do psicólogo — e ninguém percebe até o paciente reclamar.

Também elimina uma coluna de estado: dado um `agendamento.id`, sabemos qual evento consultar sem ler o banco.

### D10 — `agendamentos` continua materializado; `recorrencias` é a projeção para o Google

A spec D4 quer **um** evento com RRULE no Google. Concordo. A spec 3.5 sugere trocar as ocorrências materializadas por expansão. **Discordo.**

As linhas de `agendamentos` não são cache de horários: cada uma carrega `valor_consulta`, `valor_repasse`, `status_pagamento`, `status_repasse`, e é referenciada por `prontuarios.agendamento_id`. **É o livro-caixa.** Não se substitui livro-caixa por expansão de RRULE em memória.

**Modelo escolhido — RRULE só para fora:**

```
recorrencias (1)  ──────────►  1 evento-mãe no Google (com RRULE)
     │
     └── agendamentos (N)  ──►  instâncias; só viram evento próprio quando são exceção
```

```sql
CREATE TABLE recorrencias (
  id                UUID PRIMARY KEY,          -- reaproveita o recorrencia_id que já geramos
  clinica_id        UUID NOT NULL REFERENCES clinicas(id),
  psicologo_id      UUID NOT NULL REFERENCES usuarios(id),
  paciente_id       UUID NOT NULL REFERENCES pacientes(id),
  rrule             TEXT NOT NULL,
  dtstart           TIMESTAMPTZ NOT NULL,
  duracao_minutos   INT NOT NULL,
  timezone          TEXT NOT NULL,
  google_event_id   TEXT,
  google_etag       TEXT,
  google_updated    TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'ativa',   -- ativa | encerrada
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agendamentos
  ADD COLUMN original_start_time TIMESTAMPTZ,   -- ⚠️ chave de reconciliação
  ADD COLUMN google_event_id     TEXT,          -- só quando vira exceção
  ADD COLUMN google_etag         TEXT,
  ADD COLUMN google_updated      TIMESTAMPTZ,
  ADD COLUMN origem_ultima_alteracao TEXT,      -- plataforma | google
  ADD COLUMN sync_status         TEXT DEFAULT 'pendente';  -- pendente | sincronizado | divergente

ALTER TABLE agendamentos
  ADD CONSTRAINT fk_recorrencia FOREIGN KEY (recorrencia_id) REFERENCES recorrencias(id);

CREATE INDEX ON agendamentos (recorrencia_id, original_start_time);
CREATE INDEX ON agendamentos (google_event_id);
```

`original_start_time` é preenchido na criação com o mesmo valor de `data_hora_sessao` e **nunca muda**. Quando alguém remarca (de qualquer lado), `data_hora_sessao` muda e `original_start_time` permanece — é assim que reencontramos a linha quando o Google devolve uma exceção com `originalStartTime`. É o ⚠️ da spec seção 3.5, e é a armadilha que gera duplicata se ignorada.

**Usar `COUNT=`, não `UNTIL=`.** A spec 4.3 propõe `UNTIL`. Para esta base, `COUNT` é melhor: já temos `quantidade_recorrencia` (máx. 150), o mapeamento é 1:1 com o número de linhas materializadas, e evita inteiramente a armadilha do `UNTIL` em UTC com sufixo `Z`. Ocorrências canceladas continuam consumindo o `COUNT` no Google, o que preserva o alinhamento N linhas ↔ N ocorrências.

| Plataforma | RRULE |
|---|---|
| `semanal`, 40 sessões | `RRULE:FREQ=WEEKLY;COUNT=40` |
| `quinzenal`, 20 sessões | `RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=20` |

O `BYDAY` é redundante quando `DTSTART` já cai no dia certo e o `INTERVAL` é semanal — não incluir evita divergência entre `DTSTART` e `BYDAY`.

### D11 — Mapeamento das operações existentes → Google

Esta é a tabela que quem implementar vai consultar toda hora.

| Operação na plataforma | Hoje faz | Vai fazer no Google |
|---|---|---|
| Criar avulso | 1 `INSERT` | `events.insert` (sem `recurrence`) |
| Criar recorrente | N `INSERT` com `recorrencia_id` | **1** `events.insert` com `recurrence: [RRULE]` no evento-mãe |
| Editar 1 sessão | `UPDATE` de 1 linha | `events.patch` na **instância** (via `events.instances` → `originalStartTime`) → vira exceção |
| Editar `this_and_future` | `UPDATE` em N linhas (`core.clj:567`) | **Split de série** — ver abaixo |
| Editar `all` | `UPDATE` em N linhas (`core.clj:610`) | `events.patch` no evento-mãe |
| Cancelar 1 sessão (`status='cancelado'`) | `UPDATE` | `events.delete` na instância (o Google marca `status: cancelled`, não some) |
| Deletar 1 | `DELETE` de 1 linha | `events.delete` na instância |
| Deletar `all_future` (`core.clj:723`) | `DELETE` de N linhas | `events.patch` no mãe reduzindo o `COUNT` |
| Deletar `all` (`core.clj:733`) | `DELETE` de N linhas | `events.delete` no evento-mãe |

**Sobre o split de série (`this_and_future`):** o comportamento nativo do Google para "este e os seguintes" é encurtar a série original e criar uma nova a partir do ponto de corte. Recomendo replicar isso: `PATCH` no mãe com `COUNT=i`, `insert` de um novo mãe com `COUNT=N-i`, e repontar as linhas futuras de `agendamentos` para a nova `recorrencias`. Localmente é barato — só um `UPDATE ... SET recorrencia_id`.

A alternativa (transformar as N futuras em N exceções individuais) é mais simples de codar e visualmente pior: mudar o horário de 100 sessões futuras geraria 100 eventos-exceção e 100 chamadas de API. Só cair nela se o split provar ser problemático.

### D12 — Eventos externos entram em `bloqueios_agenda`, não em `agendamentos`

A spec 6.6 pede "importar como bloqueio de agenda". A tabela já existe. Estender:

```sql
ALTER TABLE bloqueios_agenda
  ADD COLUMN origem            TEXT NOT NULL DEFAULT 'plataforma',  -- plataforma | google
  ADD COLUMN google_event_id   TEXT,
  ADD COLUMN google_calendar_id TEXT,
  ADD COLUMN google_etag       TEXT;
CREATE UNIQUE INDEX ON bloqueios_agenda (google_event_id) WHERE google_event_id IS NOT NULL;
```

⚠️ **Filtrar o próprio rastro.** Todo evento que a plataforma cria leva `extendedProperties.private.origem = "plataforma"`. Ao importar, só vira bloqueio o evento **sem** essa marca. Sem esse filtro, cada sessão criada volta do Google como bloqueio, colide com ela mesma na checagem de conflito de `criar-agendamento-handler`, e o sistema trava sozinho.

⚠️ **Não converter evento externo em sessão automaticamente.** Não há paciente nem valor a inferir. A UI oferece "converter em sessão" e o humano completa os dados.

### D13 — Cancelamento vindo do Google não reverte dinheiro sozinho

Interação que a spec não podia prever. `sincronizar-status-global!` (`core.clj:757`) vira toda sessão passada em `realizado` + `pago`. Se o psicólogo cancelar no celular uma sessão de ontem que já foi marcada como paga, o sync inbound tentaria reverter um lançamento financeiro sem rastro.

**Regra:** cancelamento vindo do Google para sessão com `status_pagamento = 'pago'` ou `status_repasse = 'transferido'` **não** altera o financeiro. Marca `sync_status = 'divergente'` e sobe no painel do admin para decisão humana. É a aplicação concreta do ⚠️ da spec 6.5 ("nunca último-a-escrever-ganha cego").

---

## 5. Arquitetura de execução

### 5.1 Componentes

```
                       ┌──────────────────────────────────┐
   Next.js             │  Backend Clojure                 │
   (só UI)             │                                  │
   ─────────           │  handlers/       ← REST atual    │
   painel admin ──────►│  google.oauth    ← consent, token│
   settings            │  google.client   ← HTTP+backoff  │
   calendário          │  google.rrule    ← recorrência↔RRULE
                       │  google.outbox   ← worker saída  │
                       │  google.inbound  ← aplica deltas │
                       │  google.channels ← watch/renovação
                       │  scheduler       ← chime         │
                       └────────┬──────────────┬──────────┘
                                │              │
                     ┌──────────▼───┐   ┌──────▼────────┐
                     │  PostgreSQL  │   │ Google Calendar│
                     │  + outbox    │   │      API       │
                     └──────────────┘   └───────┬────────┘
                                                │ webhook
                       POST /api/webhooks/google-calendar (público)
```

⚠️ **Não colocar nada disso em `core.clj`.** O arquivo já tem 1297 linhas. Namespaces novos desde o começo — é o momento barato de fazer a separação que [QUA-*](SPRINTS.md) pede.

**Dependências a somar em `project.clj`:** um cliente HTTP (`hato` ou `clj-http`), `cheshire` (JSON), `chime` (agendamento in-process), `buddy-core` (AES-GCM para o refresh token — já vem transitivamente com `buddy-sign`).

### 5.2 Fluxo de saída (plataforma → Google)

```
POST /api/agendamentos
  └─ TRANSAÇÃO
       ├─ INSERT recorrencias  (rrule derivada de recorrencia_tipo + quantidade)
       ├─ INSERT agendamentos × N  (original_start_time = data_hora_sessao)
       └─ INSERT google_sync_outbox  (entidade=recorrencia, operacao=criar)
  └─ 201 imediato

worker (a cada 10s)
  └─ SELECT ... WHERE status='pendente' AND proxima_em <= now() FOR UPDATE SKIP LOCKED
       ├─ events.insert com id determinístico (D9) + quotaUser = psicologo_id
       ├─ UPDATE recorrencias SET google_event_id, google_etag, google_updated
       └─ status='ok'   |   erro → tentativas++, proxima_em = now() + backoff
```

⚠️ `FOR UPDATE SKIP LOCKED` importa: com mais de uma instância do backend rodando (App Runner escala), sem isso duas instâncias processam a mesma linha.

### 5.3 Fluxo de entrada (Google → plataforma)

Três gatilhos, um caminho:

| Gatilho | Frequência | Papel |
|---|---|---|
| Webhook `events.watch` | tempo real | Latência baixa. Não traz dado — só "algo mudou" |
| Polling de fallback | 15 min | Rede de segurança. Webhook perdido acontece |
| Renovação de canais | diário | Canais expiram em ~7 dias, sem endpoint de renovação |

Todos convergem para:

```
sync-incremental(vinculo_agenda)
  ├─ events.list?syncToken=…&singleEvents=false&showDeleted=true
  ├─ 410 Gone → descarta token, full sync com timeMin = now-3meses, grava token novo
  └─ para cada evento alterado:
       ├─ etag == etag armazenado?            → eco, ignora
       ├─ outbox pendente/recente p/ entidade? → eco, ignora
       ├─ extendedProperties.origem ausente?   → bloqueios_agenda (D12)
       ├─ tem recurringEventId?
       │     └─ match por (recorrencia.google_event_id, originalStartTime) → UPDATE agendamento
       └─ é evento-mãe? → RRULE mudou? encerra/reprocessa série + sinaliza admin
```

⚠️ O webhook precisa entrar em `public-routes` (`core.clj:1153`), **fora** do `wrap-jwt-autenticacao`. A autenticação dele é a comparação do header `X-Goog-Channel-Token` com o `channel_token` armazenado — e mais nada. Responder 200 rápido: enfileirar e retornar, nunca processar dentro do request (o Google reenvia se demorar).

### 5.4 ⚠️ O scheduler é o ponto frágil do deploy

Renovação de canal e polling são jobs que precisam rodar **mesmo sem tráfego**. Em Render free/starter a instância dorme; em App Runner ela pode escalar a zero. Se dormir, os canais expiram em silêncio e a sincronização morre sem nenhum sintoma — exatamente o ⚠️ da spec 6.3.

Duas saídas, decisão pendente:

| Opção | Como | Trade-off |
|---|---|---|
| `chime` in-process | Loop dentro do backend Clojure | Simples, zero infra. Exige instância que não dorme, e precisa de lock distribuído se escalar |
| EventBridge → endpoint | Regra cron chamando `POST /api/internal/jobs/…` autenticado | Sobrevive a escala-a-zero, observável no CloudWatch. Depende de [AWS-008](cards/aws-migration/AWS-008-app-runner-backend.md)/[AWS-014](cards/aws-migration/AWS-014-cloudwatch-alarms-sns.md) |

Recomendo `chime` para chegar rápido à Fase 3 e migrar para EventBridge junto com a migração AWS. Isso também resolve a dívida #1 de `TECHNICAL_NOTES.md` (cronjob de sincronização de status) — mesmo scheduler, dois consumidores.

---

## 6. Segurança e privacidade

Além do que a spec 7 já cobre:

- **Permissão nova, não bypass de admin.** Criar `gerenciar_integracao_google` em `permissoes` e proteger as rotas de vínculo com `wrap-checar-permissao`. Não depender do bypass global de admin, que [SEC-006](cards/sprint-1-security/SEC-006-rbac-granular-admin.md) vai remover.
- **Chave de criptografia do refresh token** em Secrets Manager ([AWS-006](cards/aws-migration/AWS-006-secrets-manager.md)), nunca em env var no repo — ver [SEC-002](cards/sprint-1-security/SEC-002-rotacionar-credenciais.md).
- **`summary` sem nome de paciente.** `pacientes.nome` nunca vai para o Google. Padrão: `"Sessão — A.P."`. O evento aparece em notificação de tela bloqueada e para quem tem acesso de leitura à agenda, incluindo secretaria. Em contexto clínico é quebra de sigilo, não detalhe de UX.
- **Logs.** [SEC-009](cards/sprint-1-security/SEC-009-remover-logs-sensíveis.md) já pede remoção de PII dos logs. O caminho do Google não pode reintroduzir: nada de `println` de payload de evento, e nunca de token.
- **Isolamento multi-tenant.** Toda query do caminho de sync precisa de `clinica_id`. Um bug aqui vaza agenda entre clínicas — ver [LGPD RLS](cards/sprint-6-lgpd/).

---

## 7. Plano de fases

Ajustado à realidade do repositório. As fases 1–3 já entregam valor; a 4 transforma em produto.

| Fase | Escopo | Depende de |
|---|---|---|
| **0 — Fundação** | `TIMESTAMPTZ` + fuso explícito (3.1); Migratus (3.2); consent screen em Produção; domínio verificado; iniciar verificação OAuth; **remover os 3 stubs** (D7) | ROB-004, AWS-006, AWS-012 |
| **1 — Conexão** | `google_conexao` + `vinculo_agenda`; OAuth da clínica; refresh token criptografado; `calendarList.list`; tela de mapeamento manual (sem heurístico) | Fase 0 |
| **2 — Escrita** | `recorrencias` + colunas de sync; `google.rrule`; outbox + worker (D8); IDs determinísticos (D9); todas as operações de D11; `If-Match` e 412 | Fase 1, ROB-010 |
| **3 — Leitura** | Full sync + `syncToken`; 410 Gone; polling 15 min; tradução inbound (5.3); `bloqueios_agenda` externos (D12); regra financeira (D13) | Fase 2 |
| **4 — Tempo real** | Webhook + validação de `channel_token`; `events.watch`; `google_canal_watch`; cron de renovação; estado `sem_acesso` com alerta | Fase 3, decisão de scheduler (5.4) |
| **5 — Refinamento** | Modelo B (`calendars.insert` + `acl.insert`); login Google com escopo básico + `usuarios.google_email`; sugestão de vínculo; painel de saúde; log de auditoria | Fase 4 |

⚠️ Na Fase 5, `calendars.insert` seguido de `INSERT vinculo_agenda` **não** cabe numa transação de banco — chamada de rede dentro de transação é anti-padrão. O padrão: gravar a intenção primeiro (linha `pendente`), chamar a API, confirmar. Se o processo morrer no meio, sobra uma agenda no Google sem vínculo — reconciliável via `calendarList.list`, que é justamente o que a Fase 1 já sabe fazer.

---

## 8. ❓ Pendências

Herdadas da spec (seção 12) e ainda válidas:

1. **Tipo de compartilhamento atual** — ACL ("compartilhar com pessoas específicas") ou endereço secreto iCal? Só o primeiro escreve pela API. **Isto é o primeiro teste a fazer** — se for iCal, todos os psicólogos precisam refazer o compartilhamento antes de qualquer linha de código valer alguma coisa.
2. **Permissão concedida** — writer ("fazer alterações nos eventos") ou reader?
3. **`acl.list` com `writer`** — se funcionar, vira o método primário de identificação de dono e simplifica muito a Fase 5.
4. **Workspace ou Gmail pessoal?** — define se Domain-Wide Delegation é viável (spec 8.3), o que eliminaria OAuth, refresh token e teto de usuários de uma vez.
5. **Posse da agenda** — migrar para Modelo B ou preservar posse dos profissionais? Decisão política, não técnica.

Novas, deste documento:

6. **Scheduler** — `chime` in-process agora ou EventBridge direto? (5.4)
7. **`this_and_future`** — split de série ou exceções individuais? (D11)
8. **Retroatividade** — as recorrências já materializadas em produção ganham `recorrencias` retroativa e vão para o Google, ou a integração só vale para o que for criado a partir da Fase 2? Recomendo: backfill de `recorrencias` (derivável do `recorrencia_id` + espaçamento das linhas) mas push para o Google só sob ação explícita do admin, agenda por agenda. Empurrar um ano de histórico de todos os psicólogos num primeiro deploy é como se descobre o limite de quota.

---

## 9. Checklist de armadilhas — versão desta base

Além do checklist da spec (seção 11), específico daqui:

- [ ] `TIMESTAMPTZ` em `agendamentos` e `bloqueios_agenda` antes de qualquer sync
- [ ] `ZonedDateTime.plusWeeks` no lugar da aritmética em milissegundos
- [ ] `original_start_time` preenchido na criação e **imutável** depois
- [ ] `extendedProperties.private.origem = "plataforma"` em todo evento escrito
- [ ] Filtro `origem != plataforma` antes de importar como bloqueio (senão o sistema colide consigo mesmo)
- [ ] Webhook em `public-routes`, fora do `wrap-jwt-autenticacao`
- [ ] Webhook responde 200 antes de processar
- [ ] `FOR UPDATE SKIP LOCKED` no worker de outbox
- [ ] Nenhuma chamada ao Google dentro de transação de banco
- [ ] `clinica_id` em toda query do caminho de sync
- [ ] Cancelamento inbound não reverte `status_pagamento = 'pago'` (D13)
- [ ] `google.*` em namespaces novos, nada em `core.clj`
- [ ] `src/app/api/calendar/events/route.ts` deletado
- [ ] `GoogleProvider` do NextAuth restrito a `openid email profile`

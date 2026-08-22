# Integração Google Agenda — Especificação Técnica

**Documento de handoff para implementação**
Plataforma de gestão de clínica de psicologia — sincronização bidirecional com Google Calendar

---

## 0. Como usar este documento

Este é um documento de especificação, não um tutorial. Ele registra **decisões já tomadas e o motivo delas**, para que quem implementar não precise refazer o raciocínio nem desfaça escolhas por desconhecer a contrapartida.

Seções marcadas com ⚠️ são armadilhas que só aparecem em produção — leia antes de codar a parte correspondente.

Seções marcadas com ❓ são pontos que precisam ser confirmados contra o ambiente real antes de implementar.

---

## 1. Contexto e situação atual

### O que a plataforma já faz

- Cria sessões recorrentes para pacientes, gerando ocorrências até uma data limite (aproximadamente 1 ano à frente).
- Cada sessão carrega dados clínicos e financeiros (paciente, valor, status de pagamento).

### Como a clínica usa o Google Agenda hoje (fora da plataforma)

- Cada psicólogo criou uma agenda no Google e compartilhou com a conta da clínica.
- A clínica enxerga e edita a agenda de cada psicólogo individualmente.
- Cada psicólogo enxerga apenas a própria agenda.

**Este modelo será preservado.** Ele mapeia quase perfeitamente para a API do Google Calendar e é a base da arquitetura escolhida.

### Problemas a resolver

1. Eventos criados pela plataforma no Google não ficam com aparência "nativa" (sem recorrência real).
2. Não há sincronização Google → plataforma.
3. Não há prevenção de sobrescrita mútua entre os dois lados.
4. Não há modelo de identidade ligando usuário da plataforma ↔ agenda do Google.

---

## 2. Decisões arquiteturais

Cada decisão vem com o motivo. Se for necessário reverter alguma, entenda a contrapartida antes.

### D1 — Uma única conexão OAuth por clínica, não por psicólogo

A conta da clínica autoriza uma vez. Como as agendas dos psicólogos já estão compartilhadas com ela, `calendarList.list` retorna todas, e o mesmo token permite ler e escrever em todas.

**Por quê:**
- O psicólogo não precisa passar por OAuth nenhum — reduz atrito de onboarding a zero.
- O teto de 100 usuários de app não verificado conta por Conta Google que autoriza. Uma conexão por clínica = 100 clínicas de margem, em vez de 100 psicólogos.
- Um único refresh token para gerenciar por clínica.

**Contrapartida:** ponto único de falha. Se o token da clínica for revogado, a sincronização de todos os psicólogos daquela clínica para. Mitigação na seção 8.4.

### D2 — Agenda dedicada, nunca a agenda `primary`

A plataforma só lê e escreve em agendas secundárias explicitamente vinculadas. Nunca toca em `primary` de ninguém.

**Por quê:**
- Elimina ruído de aniversários, compromissos pessoais, feriados.
- Reduz drasticamente a superfície de privacidade (a plataforma não vê a vida pessoal do profissional).
- Desconexão limpa: basta remover o vínculo.

### D3 — Duas topologias de posse de agenda, com preferência pela inversão

| | **Modelo A — psicólogo é dono** | **Modelo B — clínica é dona** (preferido) |
|---|---|---|
| Quem cria a agenda | Psicólogo, manualmente | Plataforma, via `calendars.insert` |
| Compartilhamento | Psicólogo → clínica (writer) | Plataforma → psicólogo (writer), via `acl.insert` |
| `accessRole` da clínica | `writer` | `owner` |
| Vínculo usuário↔agenda | Mapeamento assistido, com confirmação humana | Automático — o `calendarId` volta na criação |
| Saída do profissional | Ele leva a agenda; a clínica perde o histórico | Histórico permanece na clínica |
| `acl.list` disponível | Não (403 com `writer`) | Sim |

**Decisão:** suportar ambos. Modelo A para o legado já existente. Modelo B como padrão para novos cadastros.

**Por quê o B é melhor:** ele elimina por construção o problema de "de quem é esta agenda?" e protege a continuidade dos dados da clínica. A contrapartida é política, não técnica — alguns profissionais preferem ser donos da própria agenda.

### D4 — Recorrência via RRULE, não via N eventos soltos

Uma série de sessões recorrentes = **um** evento no Google com `recurrence`, não 52 eventos independentes.

**Por quê:** é o que torna o evento visualmente idêntico ao criado pela interface do Google (mostra "Repete semanalmente", permite editar "este e os seguintes"), e reduz drasticamente o número de chamadas à API.

### D5 — Identidade da plataforma é a fonte da verdade

Quem é quem, quem vê o quê, quais permissões — tudo isso vive nas tabelas da plataforma. O Google Calendar é apenas um espelho de horários. A permissão do Google nunca é usada como mecanismo de autorização da aplicação.

### D6 — Ownership de campos: cada lado manda no que é seu

| Campo | Quem manda | Motivo |
|---|---|---|
| Horário, duração | Google pode ganhar | O profissional remarca pelo celular; é o uso natural |
| Paciente, valor, status de pagamento | Plataforma, exclusivamente | Dado clínico/financeiro; não trafega para o Google |
| Cancelamento | Ambos podem originar | Precisa refletir nos dois lados |
| Título, cor, lembretes | Plataforma | Padronização visual |

---

## 3. Modelo de dados

### 3.1 Conexão OAuth (uma por clínica)

```sql
CREATE TABLE google_conexao (
  id                   BIGSERIAL PRIMARY KEY,
  clinica_id           BIGINT NOT NULL REFERENCES clinica(id),
  google_account_email TEXT NOT NULL,          -- e-mail da conta da clínica
  refresh_token        TEXT NOT NULL,          -- CRIPTOGRAFADO EM REPOUSO
  access_token         TEXT,                   -- cache; expira em 1h
  access_token_expira_em TIMESTAMPTZ,
  escopos              TEXT[] NOT NULL,
  status               TEXT NOT NULL,          -- ativa | invalida | revogada
  ultimo_erro          TEXT,
  ultimo_erro_em       TIMESTAMPTZ,
  criada_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinica_id)
);
```

⚠️ `refresh_token` deve ser criptografado em repouso (envelope encryption ou KMS). É a chave de acesso à agenda de todos os pacientes da clínica.

### 3.2 Vínculo agenda ↔ psicólogo

```sql
CREATE TABLE vinculo_agenda (
  id                  BIGSERIAL PRIMARY KEY,
  clinica_id          BIGINT NOT NULL REFERENCES clinica(id),
  usuario_id          BIGINT REFERENCES usuario(id),   -- NULL enquanto pendente
  google_calendar_id  TEXT NOT NULL,                   -- xxx@group.calendar.google.com
  nome_no_google      TEXT,                            -- summary do calendarList
  access_role         TEXT NOT NULL,                   -- owner | writer | reader | freeBusyReader
  topologia           TEXT NOT NULL,                   -- modelo_a | modelo_b
  status              TEXT NOT NULL,                   -- pendente | ativo | orfao | sem_acesso | pausado
  sync_token          TEXT,
  ultima_sync_em      TIMESTAMPTZ,
  vinculado_por       BIGINT REFERENCES usuario(id),
  vinculado_em        TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, google_calendar_id)
);
```

**Estados do campo `status`:**

| Estado | Significado | Ação esperada |
|---|---|---|
| `pendente` | Agenda apareceu no `calendarList`, ninguém mapeou | Admin mapeia na UI |
| `ativo` | Mapeada e sincronizando | — |
| `orfao` | Agenda existe no Google, sem psicólogo correspondente | Admin decide: mapear ou ignorar |
| `sem_acesso` | Estava ativa e sumiu do `calendarList` | ⚠️ Alerta no painel — alguém descompartilhou |
| `pausado` | Sincronização desligada manualmente | — |

⚠️ O estado `sem_acesso` é crítico. Sem ele, um descompartilhamento acidental faz a sincronização parar em silêncio e ninguém percebe até um paciente aparecer no horário errado.

### 3.3 Canais de watch (webhook)

```sql
CREATE TABLE google_canal_watch (
  id                 BIGSERIAL PRIMARY KEY,
  vinculo_agenda_id  BIGINT NOT NULL REFERENCES vinculo_agenda(id) ON DELETE CASCADE,
  channel_id         UUID NOT NULL,          -- gerado por nós
  resource_id        TEXT NOT NULL,          -- devolvido pelo Google; necessário p/ stop
  channel_token      TEXT NOT NULL,          -- segredo para validar o webhook
  expira_em          TIMESTAMPTZ NOT NULL,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id)
);
```

### 3.4 Série de sessões (o evento-mãe recorrente)

```sql
CREATE TABLE serie_sessao (
  id                 BIGSERIAL PRIMARY KEY,
  clinica_id         BIGINT NOT NULL,
  usuario_id         BIGINT NOT NULL,        -- psicólogo
  paciente_id        BIGINT NOT NULL,
  rrule              TEXT NOT NULL,          -- ex: RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=...
  inicio_primeira    TIMESTAMPTZ NOT NULL,
  duracao_minutos    INT NOT NULL,
  timezone           TEXT NOT NULL,          -- ex: America/Sao_Paulo
  valor_padrao       NUMERIC(10,2),
  google_event_id    TEXT,                   -- id do evento-mãe
  google_etag        TEXT,
  google_updated     TIMESTAMPTZ,
  status             TEXT NOT NULL,          -- ativa | encerrada
  criada_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 Sessão individual (ocorrência)

```sql
CREATE TABLE sessao (
  id                    BIGSERIAL PRIMARY KEY,
  serie_id              BIGINT REFERENCES serie_sessao(id),  -- NULL se avulsa
  clinica_id            BIGINT NOT NULL,
  usuario_id            BIGINT NOT NULL,
  paciente_id           BIGINT NOT NULL,
  inicio                TIMESTAMPTZ NOT NULL,
  fim                   TIMESTAMPTZ NOT NULL,
  original_start_time   TIMESTAMPTZ,          -- chave de reconciliação com o Google
  google_event_id       TEXT,                 -- preenchido quando vira exceção
  google_recurring_event_id TEXT,
  google_etag           TEXT,
  google_updated        TIMESTAMPTZ,
  valor                 NUMERIC(10,2),
  status                TEXT NOT NULL,        -- agendada | realizada | cancelada | falta
  status_pagamento      TEXT,
  origem_ultima_alteracao TEXT,               -- plataforma | google
  criada_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON sessao (serie_id, original_start_time);
CREATE INDEX ON sessao (google_event_id);
```

⚠️ **A chave de reconciliação com o Google é `(google_recurring_event_id, original_start_time)`, não o `google_event_id`.** Quando alguém remarca uma ocorrência, o Google cria uma exceção com ID novo, mas mantém o `originalStartTime` apontando para a ocorrência original. Reconciliar pelo ID isolado gera duplicatas.

---

## 4. Recorrência — como criar eventos com aparência nativa

### 4.1 Payload de criação

```json
POST /calendar/v3/calendars/{calendarId}/events

{
  "summary": "Sessão — A.P.",
  "description": "Sessão de psicoterapia.\nGerenciado pela plataforma.",
  "start": {
    "dateTime": "2026-08-17T14:00:00-03:00",
    "timeZone": "America/Sao_Paulo"
  },
  "end": {
    "dateTime": "2026-08-17T14:50:00-03:00",
    "timeZone": "America/Sao_Paulo"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270816T235959Z"
  ],
  "colorId": "9",
  "transparency": "opaque",
  "visibility": "private",
  "reminders": {
    "useDefault": false,
    "overrides": [{ "method": "popup", "minutes": 60 }]
  },
  "extendedProperties": {
    "private": {
      "origem": "plataforma",
      "serieId": "4821",
      "pacienteId": "137",
      "clinicaId": "3",
      "versao": "7"
    }
  }
}
```

### 4.2 Campos e por que cada um importa

| Campo | Por quê |
|---|---|
| `recurrence` (RRULE) | ⭐ É o que faz o evento ser recorrente de verdade e parecer nativo |
| `timeZone` explícito | ⚠️ Sem ele, horário de verão e mudanças de fuso quebram a série inteira. Nunca confie só no offset (`-03:00`) |
| `extendedProperties.private` | Invisível ao usuário. Guarda os IDs da plataforma. Permite filtrar com `privateExtendedProperty=origem=plataforma` |
| `colorId` | Identidade visual consistente |
| `reminders.overrides` | Evita herdar lembretes aleatórios da conta |
| `visibility: private` | Detalhes não vazam para quem tem acesso de "ver disponibilidade" |
| `conferenceData` | Se houver atendimento online — gera link do Meet. Requer `conferenceDataVersion=1` na query string |

### 4.3 Mapeamento recorrência plataforma → RRULE

| Padrão na plataforma | RRULE |
|---|---|
| Semanal, segunda | `FREQ=WEEKLY;BYDAY=MO;UNTIL=...` |
| Quinzenal, quarta | `FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;UNTIL=...` |
| Duas vezes por semana | `FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=...` |
| Mensal, mesma data | `FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=...` |

⚠️ `UNTIL` deve estar em UTC com sufixo `Z` quando o `dtstart` tem timezone. Formato: `YYYYMMDDTHHMMSSZ`.

### 4.4 Exceções na série

Quando uma ocorrência é alterada individualmente:

- Google gera um evento novo com `recurringEventId` (aponta para a série) e `originalStartTime`.
- Se cancelada, vem com `status: "cancelled"`.
- Ao ler via `events.list`, use `singleEvents=false` para ver a estrutura de série; `singleEvents=true` expande em ocorrências.

Para sincronização incremental, **use `singleEvents=false`** e expanda no seu lado. Expansão feita pelo Google gera volume desnecessário no sync token.

---

## 5. Fluxos

### 5.1 Onboarding da clínica (uma vez)

1. Admin clica em "Conectar Google Agenda" no painel.
2. OAuth com a conta da clínica. Escopo: `https://www.googleapis.com/auth/calendar` (necessário `calendar` completo se for usar Modelo B, pois `calendars.insert` e `acl.insert` exigem; se for só Modelo A, `calendar.events` basta e facilita a verificação).
3. Guarda refresh token criptografado em `google_conexao`.
4. Chama `calendarList.list` → cria linhas `pendente` em `vinculo_agenda` para cada agenda com `accessRole` em (`owner`, `writer`).
5. Exibe tela de mapeamento.

❓ **Confirmar antes de implementar:** verificar se o compartilhamento atual das agendas é por **"Compartilhar com pessoas específicas"** (ACL — funciona pela API) ou pelo **endereço secreto em formato iCal** (`.ics` — somente leitura, não funciona pela API). Se for o segundo, os psicólogos precisarão refazer o compartilhamento pelo caminho correto antes de qualquer coisa funcionar.

### 5.2 Onboarding de psicólogo — Modelo A (legado)

1. Admin cadastra o profissional na plataforma com o e-mail Google dele.
2. Profissional compartilha a agenda com a conta da clínica, com permissão **"Fazer alterações nos eventos"** (writer). Este é o fluxo que já existe hoje.
3. Admin clica "Buscar novas agendas" → reconciliação do `calendarList` → nova linha `pendente`.
4. UI sugere o vínculo (ver 5.4).
5. Admin confirma → `ativo`, cria canal de watch, faz sync inicial.

### 5.3 Onboarding de psicólogo — Modelo B (padrão para novos)

1. Admin cadastra o profissional.
2. Plataforma chama `calendars.insert` → cria "Nome — Atendimentos" na conta da clínica.
3. Plataforma chama `acl.insert` → concede `writer` ao e-mail do profissional.
4. Grava `vinculo_agenda` já com `status = ativo` **na mesma transação** — o `calendarId` volta na resposta de `calendars.insert`.
5. Cria canal de watch.

Nenhuma ambiguidade de identidade. Nenhum passo manual do profissional. A agenda aparece automaticamente no Google Calendar dele.

### 5.4 Sugestão automática de vínculo (só Modelo A)

Não existe forma confiável de descobrir o dono de uma agenda secundária com acesso apenas `writer`. O ID (`xxx@group.calendar.google.com`) não é e-mail de pessoa, e o `summary` é texto livre editável.

**Heurísticos para _sugerir_ (nunca para confirmar sozinho):**

1. Ler alguns eventos recentes e olhar `creator.email` / `organizer.email` — normalmente é o dono.
2. Comparar com o e-mail Google **verificado** obtido no login (ver 5.5).
3. Fuzzy match do `summary` com o nome cadastrado.

A UI apresenta: *"'Juliana — Atendimentos' parece ser de Juliana Silva (eventos criados por juliana@gmail.com). Confirmar?"*

⚠️ **A confirmação humana é obrigatória e não pode ser pulada.** Vincular errado significa expor a agenda de pacientes de um profissional a outro — falha grave de sigilo que não aparece em teste e aparece em auditoria.

⚠️ **Somente usuário com papel de admin da clínica pode criar ou alterar vínculo.** Nunca ofereça ao próprio psicólogo uma lista de agendas para ele escolher "qual é a minha" — é um vetor direto de acesso indevido.

❓ `acl.list` na agenda retorna quem tem acesso e com qual papel, mas exige `accessRole = owner`. Testar contra uma agenda real do Modelo A: com `writer` a expectativa é 403. Se funcionar, vira o método primário de sugestão.

### 5.5 Login do profissional

Use **"Entrar com Google" com escopos básicos** (`openid`, `email`, `profile`).

**Por quê:**
- Escopos básicos não são sensíveis: não entram na verificação OAuth, não contam para o teto de 100 usuários.
- Devolve o e-mail Google **verificado**, não o que a pessoa digitou. Isso torna o matching da 5.4 muito mais confiável.
- Não dá nenhum acesso à agenda — o acesso continua vindo do token da clínica.

Login por e-mail/senha continua como alternativa.

---

## 6. Sincronização bidirecional

### 6.1 Plataforma → Google

Fluxo direto: ao criar/alterar série ou sessão, chamar a API e **guardar o `etag` e o `updated` devolvidos** nas colunas correspondentes. Isso é essencial para a prevenção de loop (6.4).

### 6.2 Google → Plataforma

Duas peças complementares:

**a) Push notification (`events.watch`)**

```json
POST /calendar/v3/calendars/{calendarId}/events/watch
{
  "id": "<uuid gerado por nós>",
  "type": "web_hook",
  "address": "https://api.plataforma.com.br/webhooks/google-calendar",
  "token": "<segredo por canal>"
}
```

⚠️ **O webhook não traz dado de evento algum.** O POST que chega é apenas "algo mudou nesta agenda", com headers `X-Goog-Channel-ID`, `X-Goog-Resource-ID`, `X-Goog-Resource-State`, `X-Goog-Channel-Token`. Ao receber, é preciso ir buscar as mudanças.

Requisitos de infraestrutura: endpoint HTTPS com certificado válido, domínio verificado e registrado no Google Cloud Console.

Validação obrigatória: comparar `X-Goog-Channel-Token` recebido com o `channel_token` armazenado. Se não bater, descartar. (Este é o erro "channel token does not match".)

**b) Sync incremental (`events.list` com `syncToken`)**

```
GET /calendar/v3/calendars/{id}/events?syncToken={token}&singleEvents=false&showDeleted=true
```

Retorna apenas o que mudou desde a última chamada, mais um `nextSyncToken` novo para guardar.

O primeiro sync é completo (sem `syncToken`), com `timeMin` limitado (ex.: 3 meses atrás) para não trazer histórico irrelevante.

⚠️ `showDeleted=true` é obrigatório — sem ele, cancelamentos feitos no Google não chegam.

### 6.3 Ciclo de vida dos canais e tokens

| Item | Prazo | Tratamento |
|---|---|---|
| Access token | 1 hora | Renovação automática pela biblioteca cliente |
| Refresh token (app em Produção) | Indefinido, com ressalvas | Ver 8.4 |
| Refresh token (app em **Testing** + External) | **7 dias** | ⚠️ Publicar em Produção resolve. Causa nº 1 de "funcionava e parou" |
| Canal de watch | ~7 dias, sem endpoint de renovação | Cron diário recriando canais que vencem em <48h |
| `syncToken` | Sem prazo fixo; pode ser invalidado | Ao receber **410 Gone**: descartar token, fazer full sync, gravar token novo |

**Job de renovação de canais (diário):**

```
para cada vinculo_agenda ativo:
  se canal.expira_em < agora + 48h:
    novo_canal = events.watch(...)
    grava novo canal
    channels.stop(canal_antigo)   # opcional, mas evita webhooks duplicados
```

⚠️ Sem esse job, as notificações param em silêncio após ~7 dias e nada indica o problema.

**Polling de fallback:** manter um job a cada 15 minutos que roda sync incremental em todas as agendas ativas, independente de webhook. Webhook perdido acontece; o custo em quota é irrelevante (ver seção 9).

### 6.4 Prevenção de loop de eco

O problema: a plataforma escreve no Google → Google dispara webhook → plataforma lê a própria escrita como se fosse mudança externa → escreve de novo → loop infinito.

**Solução em camadas:**

1. **Comparação de `etag`.** Ao escrever, guardar o `etag` devolvido. Ao processar uma mudança vinda do sync, se o `etag` for igual ao armazenado, é eco da própria escrita → ignorar. Isso resolve a grande maioria dos casos.
2. **Marcador em `extendedProperties.private.versao`.** Contador incrementado a cada escrita da plataforma. Se a versão recebida for igual à última que escrevemos, é eco.
3. **Janela de supressão.** Após uma escrita, ignorar notificações daquele evento por alguns segundos. Rede de segurança, não mecanismo principal.

### 6.5 Resolução de conflito

Usar `If-Match` com o `etag` em todas as atualizações:

```
PATCH /calendar/v3/calendars/{cid}/events/{eid}
If-Match: "<etag armazenado>"
```

**Resposta 412 Precondition Failed** = alguém alterou o evento entre a leitura e a escrita.

Tratamento:
1. Reler o evento.
2. Aplicar a política de ownership da tabela D6.
3. Reaplicar somente os campos que a plataforma controla.
4. Registrar em log de auditoria.

⚠️ Nunca usar "último a escrever ganha" cego. Isso faz uma remarcação feita no celular sobrescrever um registro de pagamento — perda de dado financeiro sem rastro.

### 6.6 Tradução de mudanças vindas do Google

| Situação no Google | Ação na plataforma |
|---|---|
| Evento com `recurringEventId` conhecido, horário diferente | Atualiza `sessao` correspondente (match por `original_start_time`) |
| Evento com `status: cancelled` e `recurringEventId` | Marca sessão como cancelada |
| Evento-mãe com `status: cancelled` | Encerra a série; sinaliza no painel |
| RRULE alterada no evento-mãe | ⚠️ Reprocessar a série. Sinalizar ao admin — impacta valores e agendamentos futuros |
| Evento novo, sem `extendedProperties.origem` | Compromisso criado direto no Google. Importar como bloqueio de agenda, **não** como sessão (não há paciente nem valor) |

⚠️ Eventos criados fora da plataforma não devem virar sessões automaticamente. Não há como inferir paciente e valor. Trate como bloqueio de disponibilidade e ofereça ao profissional a ação "converter em sessão" na UI.

---

## 7. Privacidade e conformidade

### 🔴 A regra do título está SUPERADA — [D-026](../mensageria/DECISOES.md), 2026-08-22

**O título do evento LEVA o nome do paciente.** Vale a **R-017**
([REGRAS_DE_NEGOCIO](REGRAS_DE_NEGOCIO.md)), que é regra ditada pelo Gabriel em 15/08.

📌 **Havia aqui uma contradição que ninguém tinha anotado.** A R-017 dizia
*"título = nome do paciente"*; esta seção dizia *"não coloque o nome no `summary`"*.
**Nenhuma das duas citava a outra**, e quem pegasse o GC-003 escolheria uma e
quebraria a outra sem saber que havia uma escolha. A [D-026](../mensageria/DECISOES.md) fechou isso:
a R-017 é do **oráculo**; o texto abaixo era **recomendação da `orla`**, e
recomendação não vence regra.

**O que fez a regra ganhar:** a D-026 exige que a agenda do Google seja
**operável sem a plataforma** — com o Agenda Wise fora do ar, a clínica ainda
precisa ler e editar ali. `"Sessão — A.P. #137"` é ilegível **exatamente para
quem não tem a plataforma para decodificar o código**, que é o cenário que o
requisito existe para cobrir.

⚠️ **Atenção à leitura do que foi superado: só a REGRA.** O alerta abaixo continua
factualmente verdadeiro e **não** foi revogado — ele deixou de **decidir**, não de
**valer**. Quem escrever o GC-003 precisa saber o que o título expõe.

✅ **A secretária lendo o nome do paciente é decisão tomada** (Gabriel, 22/08 —
D-026): *"a secretaria vai precisar sim ler o nome dos pacientes […] pq vai
atrapalhar muito"*. O argumento é operacional: sem o nome na agenda, a recepção
para. **Um título só, igual para os três papéis.**

⚠️ Isso **não** afrouxa a D-021: **nome na agenda não é prontuário.** `description`
sem dado clínico, prontuário e valor **só na plataforma**.

### O texto original (2026-08-17) — preservado, porque o alerta continua de pé

> ⚠️ **Não colocar nome completo de paciente no `summary` do evento.**
>
> O título aparece em notificação de tela bloqueada, em tela compartilhada, e para qualquer pessoa com acesso de leitura à agenda (incluindo a secretaria). Em contexto clínico isso é quebra de sigilo profissional e incidente de LGPD.
>
> **Padrão recomendado:**
> - `summary`: iniciais + código curto — `"Sessão — A.P. #137"`
> - `description`: sem dado clínico; apenas referência ao registro na plataforma
> - Nome completo, prontuário, valor: **só na plataforma**

**O veredito, linha por linha:**

| linha do texto original | estado |
|---|---|
| *"não colocar nome completo no `summary`"* | 🔴 **superada** pela R-017 + D-026 |
| *"padrão `Sessão — A.P. #137`"* | 🔴 **superado** — não implementar |
| *"o título aparece em notificação de tela bloqueada, em tela compartilhada, e para qualquer pessoa com acesso de leitura à agenda (incluindo a secretaria)"* | ✅ **continua verdadeiro** — é fato sobre o Google, não opinião, e a agenda da clínica é compartilhada por desenho (D-026) |
| *"`description`: sem dado clínico"* | ✅ **continua valendo, sem exceção** |
| *"nome completo, prontuário, valor: só na plataforma"* | ⚠️ **o nome saiu da lista; prontuário e valor NÃO.** O título passou; o prontuário não passa |

### Os pontos que não foram tocados por nada disso

- `visibility: "private"` em todos os eventos.
- Criptografia do refresh token em repouso.
- Log de auditoria de toda alteração de vínculo (quem vinculou qual agenda a qual profissional, quando).
- Tela de desconexão que efetivamente revoga o token e para os canais de watch.

---

## 8. OAuth — configuração e operação

### 8.1 Escopos

| Escopo | Quando usar | Categoria |
|---|---|---|
| `openid`, `email`, `profile` | Login do profissional | Básico — sem verificação |
| `.../auth/calendar.events` | Suficiente se só Modelo A | Sensível |
| `.../auth/calendar` | Necessário para Modelo B (`calendars.insert`, `acl.insert`) | Sensível |
| `.../auth/calendar.app.created` | **Modelo C** ([D-015](../mensageria/DECISOES.md)) — cria a agenda e escreve nela | Sensível |
| 🔴 `.../auth/calendar.acls` | **Modelo C, o compartilhamento com a conta da clínica** ([D-026](../mensageria/DECISOES.md)) | ⚠️ **a confirmar no console** |

Preferir o escopo mais restrito que atenda ao caso — revisão de verificação mais simples.

#### 🔴 `calendar.app.created` **não** autoriza `acl.insert` — medido em 2026-08-22

Medido no *discovery document* oficial (`https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest`, `revision: 20260812`), lendo o campo `scopes` de cada método:

| método | escopos aceitos | `app.created` serve? |
|---|---|---|
| `calendars.insert` | `calendar`, **`calendar.app.created`**, `calendar.calendars` | ✅ sim |
| `events.insert` | `calendar`, **`calendar.app.created`**, `calendar.events`, `calendar.events.owned` | ✅ sim |
| **`acl.insert`** | `calendar`, **`calendar.acls`** | 🔴 **não** |
| `acl.list` / `acl.get` | `calendar`, `calendar.acls`, `calendar.acls.readonly` | 🔴 **não** |

📌 **As duas primeiras linhas são o caso de controle** — se a leitura estivesse errada, `calendars.insert` também teria vindo sem `app.created`, e ele veio **com**. O `não` do `acl.insert` é medição, não impressão.

🔴 **Peça `calendar.acls` na PRIMEIRA submissão**, junto com os outros — **escopo novo depois reabre a verificação inteira** (semanas). Ver GC-000 em [GOOGLE_CARDS](GOOGLE_CARDS.md): passam a ser **quatro** escopos, não três.

💡 **`calendar.acls.readonly` de brinde:** permite **conferir se o compartilhamento ainda está de pé** sem poder alterá-lo — o sinal de saúde **por efeito** que o `sem_acesso` sempre quis. Se o de escrita for pedido, este não custa mais nada.

⚠️ **O que NÃO foi medido:** como o Google **classifica** o `calendar.acls` na verificação (o discovery diz quais métodos o escopo abre, não o que a revisão exige), e se a agenda criada por `calendars.insert` conta como *"calendar you own"* para esse escopo. Confirmar na tela e contra uma agenda real (GC-000b) antes de o desenho depender disso.

### 8.2 Verificação — começar cedo

- App não verificado que pede escopo sensível: exibe tela de aviso "app não verificado" e sofre teto de **100 usuários, permanente no projeto** — não reseta criando outro client ID.
- Revisão de escopo sensível leva tipicamente semanas, com troca de e-mails, vídeo de demonstração e documentos de justificativa.
- Requisitos: domínio verificado, política de privacidade pública, vídeo do fluxo de consentimento.

**Ação:** iniciar o processo em paralelo ao desenvolvimento, não depois.

**Publicar em Produção ≠ estar verificado.** É possível (e necessário) estar em Produção não-verificado — isso já elimina o problema dos 7 dias do refresh token.

### 8.3 Se a clínica usa Google Workspace

Alternativa mais limpa: **Domain-Wide Delegation** com service account. O admin autoriza o client ID uma vez no Admin Console e o backend impersona qualquer usuário do domínio — sem OAuth, sem refresh token, sem tela de consentimento, sem teto de usuários.

Limitação: só funciona dentro do domínio. Não serve para profissionais com Gmail pessoal. Vale como caminho para clínicas maiores.

### 8.4 Causas de perda de refresh token

| Causa | Prevenção |
|---|---|
| App em Testing + External (7 dias) | Publicar em Produção |
| 6 meses sem uso | Sync periódico já resolve naturalmente |
| Usuário removeu o app da Conta Google | Detectar `invalid_grant` e alertar |
| Limite de 100 refresh tokens vivos por usuário/client | ⚠️ Não re-pedir consentimento sem necessidade |

⚠️ **Erro clássico:** chamar `prompt=consent` em todo login "por garantia". Isso queima os 100 slots e invalida silenciosamente as conexões mais antigas. Só reautorize quando houver `invalid_grant` real.

Nota: revogação por troca de senha só afeta escopos do Gmail. Calendar não sofre disso.

**Monitoramento obrigatório:** ao detectar `invalid_grant`, marcar `google_conexao.status = invalida`, exibir banner no painel do admin e notificar por e-mail. Nunca falhar em silêncio — a conexão da clínica cobre todos os profissionais.

---

## 9. Cotas e limites

- 10.000 requisições/minuto por projeto; 600/minuto por usuário por projeto (projetos criados a partir de 01/05/2026). Projetos que usaram a API entre nov/2025 e abr/2026 mantêm as cotas anteriores.
- Limiar de 1.000.000 requisições/dia por projeto. Abaixo disso não há cobrança hoje; detalhes de cobrança previstos para 2026 com pelo menos 90 dias de aviso. Esse limite diário não pode ser aumentado.
- Erros de cota: HTTP 403 (`usageLimits`) ou 429 → backoff exponencial com jitter.

⚠️ Como todas as chamadas passam pela mesma conta da clínica, o limite relevante é o de **600/min por usuário**. Implementar o parâmetro **`quotaUser`** desde já, passando o ID do psicólogo — distribui o uso entre usuários lógicos, custa nada agora e evita refatoração depois.

Para o volume esperado (dezenas de profissionais, sync incremental), as cotas são folgadas. O gargalo real do projeto é a verificação OAuth, não a quota.

---

## 10. Plano de implementação em fases

**Fase 1 — Fundação**
- Cadastro no Google Cloud, OAuth consent screen, publicar em Produção
- Iniciar processo de verificação
- Fluxo OAuth da clínica + armazenamento criptografado do refresh token
- `calendarList.list` + tela de mapeamento manual (sem heurístico ainda)

**Fase 2 — Escrita (plataforma → Google)**
- Criação de série com RRULE
- `extendedProperties` com IDs
- Atualização e cancelamento com `If-Match`
- Armazenamento de `etag`/`updated`

**Fase 3 — Leitura (Google → plataforma)**
- Full sync inicial + `syncToken`
- Tratamento de 410 Gone
- Polling de fallback a cada 15 min
- Tradução de mudanças conforme 6.6

**Fase 4 — Tempo real**
- Verificação de domínio no Google Cloud
- Endpoint de webhook + validação de `channel_token`
- `events.watch` por agenda
- Cron de renovação de canais
- Health check e estado `sem_acesso`

**Fase 5 — Refinamento**
- Modelo B (criação de agenda pela plataforma)
- Login com Google + sugestão automática de vínculo
- Painel de saúde da integração para o admin
- Log de auditoria

Fases 1–3 já entregam valor real. Fase 4 é o que transforma em produto.

---

## 11. Checklist de armadilhas

- [ ] `timeZone` explícito em todo evento (não só offset)
- [ ] `UNTIL` do RRULE em UTC com sufixo `Z`
- [ ] Reconciliação por `(recurringEventId, originalStartTime)`, não por ID isolado
- [ ] `showDeleted=true` no sync incremental
- [ ] `singleEvents=false` no sync incremental
- [ ] App publicado em Produção (senão refresh token morre em 7 dias)
- [ ] Nunca `prompt=consent` desnecessário
- [ ] Cron de renovação de canais de watch
- [ ] Tratamento de 410 Gone no `syncToken`
- [ ] Validação do `X-Goog-Channel-Token` no webhook
- [ ] Webhook não traz dados — sempre buscar via `events.list`
- [ ] `If-Match` em toda atualização; tratar 412
- [ ] Comparação de `etag` para suprimir eco
- [ ] Estado `sem_acesso` com alerta visível
- [ ] Confirmação humana obrigatória no vínculo agenda↔profissional
- [ ] Só admin pode criar/alterar vínculo
- [x] ~~Nome de paciente fora do `summary`~~ — 🔴 **superado pela [D-026](../mensageria/DECISOES.md)**: o título **leva** o nome do paciente (R-017). Ver §7
- [ ] `description` sem dado clínico, e prontuário/valor **só na plataforma** — este continua
- [ ] Refresh token criptografado em repouso
- [ ] `quotaUser` em todas as chamadas
- [ ] Backoff exponencial em 403/429

---

## 12. Pontos a confirmar antes de codar

📌 **A [D-026](../mensageria/DECISOES.md) (22/08) mexeu nesta lista, e não a apaga** — as perguntas
continuam válidas **para as agendas do legado (Modelo A)**, onde o compartilhamento
foi feito à mão e nós não sabemos o que foi concedido. O que muda é o **destino**:

- **os itens 2 e 3 deixam de ser pergunta no Modelo C** — o app faz o `acl.insert`
  com `writer` no ato da conexão, então ele **sabe** o que concedeu porque foi ele
  que concedeu (GC-013). ⚠️ Isso depende do escopo `calendar.acls` da §8.1;
- **o item 5 está respondido:** nem Modelo B nem posse pura do profissional — é o
  **Modelo C** ([D-015](../mensageria/DECISOES.md)) com a agenda **compartilhada com a conta da clínica**,
  e com mais ninguém. É o que entrega o isolamento pedido: psi A nunca esteve na
  ACL da agenda de psi B.

1. **Tipo de compartilhamento atual** — ACL ("compartilhar com pessoas específicas") ou endereço secreto iCal? Só o primeiro funciona pela API para escrita.
2. **Permissão concedida** — é "Fazer alterações nos eventos" (writer) ou apenas "Ver todos os detalhes" (reader)? Escrita exige writer.
3. **`acl.list` com `writer`** — testar contra agenda real; se funcionar, vira método primário de identificação de dono.
4. **Contas são Google Workspace ou Gmail pessoal?** — define se Domain-Wide Delegation é viável.
5. **Política sobre posse de agenda** — a clínica quer migrar para Modelo B ou preservar a posse dos profissionais?

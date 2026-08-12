# Auditoria — agosto/2026

> Feita em 2026-08-12, com o objetivo de preparar o projeto para produção.
> Complementa a [auditoria de maio](PRODUCTION_READINESS_REVIEW.md) e o [board de sprints](SPRINTS.md).

## Como ler

A auditoria de maio continua válida no essencial. Esta aqui faz três coisas:

1. **Achados novos** — o que a auditoria anterior não pegou (seção 2). Estes são os que importam.
2. **O que já foi corrigido** nesta rodada (seção 3).
3. **A fila** — próximos passos, ordenados por dependência e não por gosto (seção 4).

Severidade: 🔴 bloqueia produção • 🟠 dói em produção • 🟡 dívida que cresce

---

## 1. Retrato do sistema hoje

| | |
|---|---|
| Backend | Clojure, arquivo único de ~1300 linhas + 8 namespaces novos |
| Banco | PostgreSQL / CockroachDB |
| Frontend | Next.js 15, ~10 erros de tipo pré-existentes |
| Testes | 105 asserções (todas criadas nesta rodada); `core.clj` sem cobertura |
| Migrations | Versionadas desde esta rodada |

---

## 2. Achados novos

### 2.1 🔴 As tabelas de negócio não tinham nenhum índice

`agendamentos`, `pacientes`, `prontuarios`, `usuarios` e `bloqueios_agenda` tinham **apenas as chaves primárias**. Nenhum índice de acesso.

Como toda query filtra por `clinica_id` — e a PK é o UUID da linha, que não ajuda nisso — toda listagem era varredura completa da tabela.

**Medido**, com 240 mil agendamentos (20 clínicas × 8 psicólogos × 25 pacientes × 60 sessões, que é uma clínica de porte médio com ~5 anos de histórico):

| Query | Sem índice | Com índice | |
|---|---|---|---|
| Checagem de conflito | 25,6 ms | 4,8 ms | 5× |
| Listagem do calendário (200 linhas) | 21,8 ms | 0,24 ms | **90×** |
| Job de sincronização de status | 22,7 ms | 0,022 ms | **1000×** |

O número que mais importa é o primeiro, porque **a checagem de conflito roda uma vez por ocorrência**. Criar uma recorrência de 40 sessões fazia 40 varreduras completas de `agendamentos` — cerca de 1 segundo só de leitura de disco, num Postgres local e quente. Contra CockroachDB pela rede, muito pior.

**Corrigido** — migration `20260812090000-indices`.

### 2.2 🔴 `POST /api/admin/provisionar-clinica` era público e sem autenticação

Qualquer pessoa na internet podia criar clínicas e contas de administrador, sem limite. Enchia o banco e gerava admins arbitrários.

A auditoria de maio registrou "rate limiting em login e provisionamento" (SEC-010), o que subestima: o problema não era a taxa, era não haver autorização nenhuma.

**Corrigido** — exige `X-Provisioning-Token` conferido contra `PROVISIONING_TOKEN`, com comparação em tempo constante, e **falha fechada**: sem a variável configurada o endpoint não funciona.

⚠️ **Isto muda o comportamento.** Para provisionar clínicas é preciso definir `PROVISIONING_TOKEN` no ambiente e mandar o header.

### 2.3 🔴 Nenhum pool de conexões

`jdbc/get-datasource` sobre o mapa de configuração abre uma conexão nova a cada query e a descarta. Contra Postgres local passa despercebido; contra CockroachDB gerenciado, **cada query paga handshake TCP + TLS**. Um handler que faz 5 queries pagava 5 handshakes.

**Corrigido** — HikariCP, com `maxLifetime` abaixo do corte típico do servidor (é o que evita o "connection reset" intermitente que bancos gerenciados provocam ao derrubar conexões ociosas).

### 2.4 🟠 A listagem de agendamentos não tem paginação

`GET /api/agendamentos` devolve **todo o histórico da clínica**, ordenado, a cada carregamento do calendário. Na base de teste: 12.000 linhas, 41 ms no banco — mais serialização JSON, rede e parse no browser. Cresce para sempre, linearmente.

**Não corrigido**: mudar isso altera o contrato da API e o frontend depende do formato atual. Ver 4.1.

### 2.5 🟠 Respostas de erro vazavam detalhe interno

Seis endpoints devolviam `(.getMessage e)` ao cliente — nomes de coluna, texto de erro do driver, estrutura interna.

**Corrigido** — resposta genérica ao cliente, detalhe continua no log do servidor.

### 2.6 🟠 Health check não checava nada

`/api/health` devolvia 200 fixo. Com o banco fora, a aplicação continuava "saudável" para o balanceador enquanto toda requisição real falhava.

**Corrigido** — verifica o banco e devolve 503 quando indisponível.

### 2.7 🟡 Consulta redundante de papel por requisição

Duas listagens reliam `nome_papel` do banco a cada requisição, sendo que o papel já vem assinado no JWT.

**Corrigido.**

### 2.8 🟡 Admin ignora todo o sistema de permissões

`wrap-checar-permissao` tem short-circuit: se o papel é `admin_clinica`, o handler roda sem consultar `papel_permissoes`. A tabela de permissões é decorativa para admins.

Já registrado como SEC-006. Continua valendo — e vale mais agora, porque a permissão nova `gerenciar_integracao_google` também é ignorada pelo bypass.

### 2.9 🟡 Sem limite de payload e sem rate limiting

Nenhum limite de tamanho de corpo e nenhum rate limiting em login ou provisionamento. Login sem limite permite força bruta.

---

## 3. O que foi corrigido nesta rodada

Além dos itens marcados acima:

| | |
|---|---|
| 🔴 Bypass de autenticação no login | O `catch` gravava a senha digitada como novo hash do usuário e autenticava |
| 🔴 Fuso horário implícito | Colunas viraram `TIMESTAMPTZ`; tradução explícita em `deep-saude-backend.tempo` |
| 🟠 Escritas sem transação | Criação de série, updates de recorrência, criação de bloqueio e provisionamento |
| 🟠 Schema sem versionamento | Migratus substituiu os `ALTER TABLE` de startup |
| 🟠 `JWT_SECRET` parcial no log | Imprimia os 4 primeiros e 4 últimos caracteres |
| 🟠 Enumeração de usuários no login | Respostas diferentes para "não existe" e "senha errada" |
| 🟡 Recorrência em milissegundos | Trocada por `ZonedDateTime.plusWeeks` |
| 🟡 Contrato de data no frontend | Três parsings diferentes do mesmo campo, unificados |

---

## 4. A fila

Ordenada por dependência. O que está em cima destrava o que está embaixo.

### 4.1 Antes de qualquer deploy

1. **Compilar e rodar `lein test`.** Nada do que foi escrito nesta rodada passou por compilação — o ambiente não alcançava o Clojars. Migrations, `tempo`, `rrule`, `cripto` e `vinculos` têm teste; `core.clj` foi verificado por reader e por análise estática de referências (`dev/checa_refs.clj`), o que não é a mesma coisa.
2. **Definir `PROVISIONING_TOKEN`** — senão não há como criar clínicas (2.2).
3. **Definir `GOOGLE_TOKEN_KEY`** — 32 bytes em base64, senão a integração recusa conectar.
4. **Migration de fuso e código no mesmo deploy** — separados, toda sessão nova entra com 3 horas de diferença, sem erro visível.

### 4.2 Fila curta — semanas próximas

| | Por quê |
|---|---|
| **Paginação em agendamentos e pacientes** (2.4) | É o próximo gargalo depois dos índices. Envolve frontend |
| **Rate limiting em login e provisionamento** (2.9) | Login sem limite é força bruta livre |
| **Limite de payload** (2.9) | Uma linha de middleware |
| **Validação de input no backend** | Hoje a validação real está no frontend; o backend confia no que chega |
| **Testes de `core.clj`** | A parte com dinheiro e sigilo é a que não tem teste |
| **RBAC sem bypass de admin** (2.8) | Quanto mais permissões existirem, pior fica |

### 4.3 Google Agenda — continuidade

A Fase 1 (conexão e mapeamento) está no código. A partir daqui, conforme [a arquitetura](GOOGLE_CALENDAR_ARQUITETURA.md):

- **Fase 2 — escrita**: worker de outbox, criação de série no Google, `If-Match`
- **Fase 3 — leitura**: sync incremental, tratamento de 410, polling
- **Fase 4 — tempo real**: webhook, canais de watch, estado `sem_acesso`

⚠️ Antes da Fase 2, decidir o scheduler (`chime` in-process ou EventBridge) — ver seção 5.4 da arquitetura. E confirmar os escopos no OAuth Playground **antes** de submeter à verificação, que é o item de maior prazo do projeto inteiro.

### 4.4 Estrutural — quando houver fôlego

- **Quebrar `core.clj`.** 1300 linhas com handlers, middleware, rotas e migrations juntos. A extração de `db.clj` foi o primeiro corte; o caminho natural é um namespace por domínio.
- **Logs estruturados.** Hoje é `println`, incluindo PII em vários pontos. Em produção sem log estruturado não se investiga incidente.
- **Erros de tipo no frontend.** 10 erros pré-existentes, alguns reais — em `FinanceiroClient` há comparação entre valores de `status_repasse` que nunca podem ser iguais, o que significa um ramo morto no módulo financeiro.

---

## 5. O que eu não consegui verificar

Sendo explícito sobre os limites desta auditoria:

- **Nada foi compilado nem executado como aplicação.** Sem acesso ao Clojars, o que existe é: migrations testadas contra PostgreSQL 16 real, namespaces puros com 105 asserções, e verificação estática de sintaxe e referências.
- **Os números de performance são de PostgreSQL local**, não de CockroachDB gerenciado. A direção do resultado é confiável; a magnitude, contra rede, tende a ser maior, não menor.
- **Não avaliei o frontend em profundidade** — só o caminho de data/hora e os stubs do Google.
- **Não olhei LGPD/CFM**, retenção de dados, nem o fluxo de prontuário. Ficam para uma rodada dedicada (sprint 6 do board).

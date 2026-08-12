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
| Testes | 158 asserções (todas criadas nesta rodada); `core.clj` sem cobertura |
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

### 2.9 🔴 O build ignorava erros de tipo — e escondia bugs reais

`next.config.ts` tinha `typescript.ignoreBuildErrors: true`. Com isso, TypeScript era decoração: não reprovava nada. Os erros acumulados não eram ruído.

O que estava escondido:

| | |
|---|---|
| **Contador zerado no painel financeiro** | `status_repasse === 'pago'` numa comparação que **nunca pode ser verdadeira**. A coluna "{pagos}/{total} Pagos" por psicólogo ficava permanentemente em zero |
| **Quatro definições de tipo apagadas** | `ProntuarioListProps`, `Patient`, `FormState` e o import de `DateRange` foram removidos por edições parciais e substituídos por comentários `// ... existing code`. Um deles quebrava um import entre arquivos |
| **`authOptions` exportado de `route.ts`** | No App Router só handlers podem ser exportados de um arquivo de rota. **Isto reprova o build de produção** — provavelmente o motivo de a checagem ter sido desligada |
| **`params` do Next.js 15** | `src/app/api/pacientes/[id]/route.ts` usava a assinatura antiga; no Next 15 `params` é `Promise` |

**Corrigido** — os 10 erros resolvidos, `authOptions` movido para `src/lib/auth.ts` (23 importadores atualizados) e a checagem religada. **O build de produção passa com o type check ligado.**

`eslint.ignoreDuringBuilds` continua `true`: religar exige uma passada de limpeza própria, e é o type check que pega bug de verdade.

### 2.10 🔴 O módulo financeiro apontava para `localhost` em produção

Todo o `FinanceiroClient` chama a API em caminho relativo (`/api/agendamentos/...`, 8 pontos). Esses caminhos dependem dos `rewrites` do `next.config`, que tinham `http://localhost:3000` **fixo**.

Em desenvolvimento funciona, porque o backend roda nessa porta. Em produção, com frontend e backend em hosts diferentes, marcar pagamento, marcar repasse e as transferências em lote apontavam para lugar nenhum.

E `src/app/api/pacientes/[id]/route.ts` encaminhava para `${BACKEND_URL}/pacientes/:id` — **sem o prefixo `/api`**, que é onde o backend expõe a rota. Como arquivo de rota tem precedência sobre rewrite, a atualização de paciente pelo financeiro caía em 404.

**Corrigido** — rewrites passam a ler `API_PROXY_TARGET` / `NEXT_PUBLIC_API_URL`, e o prefixo foi acertado.

### 2.11 🟠 `status_repasse` tinha duas máquinas de estado concorrentes

Dois handlers do mesmo arquivo escreviam valores diferentes na mesma coluna, pelo mesmo endpoint:

| Handler | Alterna entre | Call sites |
|---|---|---|
| `handleUpdateRepasse` | `'pago'` ↔ `'pendente'` | **nenhum** |
| `handleUpdateRepasseStatus` | `'transferido'` ↔ `'disponivel'` | 1 |

Somando o default do banco (`'pendente'`) e o vocabulário documentado em `TECHNICAL_NOTES`, a coluna aceitava **cinco valores vindos de três vocabulários**. O backend gravava o que chegasse, sem validar.

Na primeira leitura eu classifiquei isto como decisão de negócio e deixei em aberto. Ao investigar os call sites, deixou de ser: **`handleUpdateRepasse` era código morto** — duplicata obsoleta de `handleUpdatePagamento` que ficou apontando para a coluna errada. A máquina viva é a documentada em `TECHNICAL_NOTES`.

**Corrigido** — handler morto removido, tipo estreitado para o vocabulário real, e o contador do painel acertado para `'transferido'` (o estado terminal do repasse).

**E a causa raiz também:** o novo namespace `deep-saude-backend.dominio` centraliza os vocabulários de `status`, `status_pagamento` e `status_repasse`, e a atualização de agendamento passa a devolver 422 para valor fora do conjunto. Coluna de estado sem validação no servidor não é um campo — é um campo de texto livre com nome bonito, e foi exatamente assim que cinco valores incompatíveis entraram.

### 2.12 🟠 Token do backend em `localStorage`

`src/lib/admin-api.ts` guarda o JWT do backend em `localStorage`, legível por qualquer XSS. Já registrado como SEC-008; continua valendo.

### 2.13 🟠 Sem limite de payload e sem rate limiting

Nenhum limite de tamanho de corpo e nenhum rate limiting. Login sem limite é força bruta livre: a senha de qualquer conta vira questão de tempo e banda.

**Corrigido** — `deep-saude-backend.limites`:

| | |
|---|---|
| Login | 10 tentativas / 5 min, por IP **e por e-mail tentado** — atacar uma conta não consome a cota de todo mundo atrás do mesmo NAT. Zera no acerto da senha |
| Provisionamento | 5 / hora por IP |
| Payload | 256 KB, recusado **antes** do parser de JSON |

⚠️ Contador em memória, por instância: ao escalar horizontalmente o limite efetivo multiplica pelo número de instâncias. É o trade-off aceito para não introduzir Redis agora; o ponto de troca está isolado nesse namespace.

⚠️ `X-Forwarded-For` é forjável por quem fala direto com a aplicação. Isto limita tráfego normal; bloquear atacante determinado é trabalho da borda (WAF/CDN, [AWS-016](cards/aws-migration/AWS-016-waf-shield.md)).

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

### 4.0 Variáveis de ambiente novas

| Variável | Obrigatória? | Para quê |
|---|---|---|
| `PROVISIONING_TOKEN` | **Sim, para provisionar** | Sem ela o endpoint de criar clínica não funciona (falha fechada) |
| `GOOGLE_TOKEN_KEY` | Só para o Google | 32 bytes em base64. Gerar com `deep-saude-backend.google.cripto/gerar-chave` |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Só para o Google | Credenciais OAuth |
| `API_PROXY_TARGET` | Recomendada no frontend | Destino dos rewrites; sem ela cai em `NEXT_PUBLIC_API_URL` e depois em localhost |
| `DB_POOL_SIZE` | Não | Padrão 10 |

### 4.1 Antes de qualquer deploy

1. **Compilar e rodar `lein test`.** Nada do que foi escrito nesta rodada passou por compilação — o ambiente não alcançava o Clojars. Migrations, `tempo`, `rrule`, `cripto` e `vinculos` têm teste; `core.clj` foi verificado por reader e por análise estática de referências (`dev/checa_refs.clj`), o que não é a mesma coisa.
2. **Definir `PROVISIONING_TOKEN`** — senão não há como criar clínicas (2.2).
3. **Definir `GOOGLE_TOKEN_KEY`** — 32 bytes em base64, senão a integração recusa conectar.
4. **Migration de fuso e código no mesmo deploy** — separados, toda sessão nova entra com 3 horas de diferença, sem erro visível.

### 4.2 Fila curta — semanas próximas

| | Por quê |
|---|---|
| **Limpeza dos dados de `status_repasse`** | A validação impede novos valores inválidos, mas as linhas já gravadas com vocabulário errado continuam lá. Precisa de um `UPDATE` de correção depois de conferir o volume em produção |
| **Paginação em agendamentos e pacientes** (2.4) | É o próximo gargalo depois dos índices. Envolve frontend |
| **Validação nos demais handlers** | `dominio/validar` está ligado na atualização de agendamento; falta estender para criação e para os outros recursos |
| **Testes de `core.clj`** | A parte com dinheiro e sigilo é a que não tem teste |
| **Token fora do `localStorage`** (2.12) | Cookie httpOnly |
| **RBAC sem bypass de admin** (2.8) | Quanto mais permissões existirem, pior fica |
| **Religar o ESLint** | O type check já voltou; o lint é a próxima camada |

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
- **O frontend foi auditado por build e tipo, não por uso.** O build de produção passa com type check ligado, mas nenhuma tela foi aberta. Bug de comportamento que o compilador não vê continua possível.
- **Não olhei LGPD/CFM**, retenção de dados, nem o fluxo de prontuário. Ficam para uma rodada dedicada (sprint 6 do board).
- **Não avaliei acessibilidade nem performance de render.**

### Uma observação sobre o padrão dos achados

Quatro definições de tipo apagadas e substituídas por `// ... existing code`, um import quebrado entre arquivos, um contador comparando valores que nunca se igualam. É o rastro de edições parciais que nunca foram verificadas — e sobreviveram porque **as duas verificações que teriam pego isso estavam desligadas**: o type check no build e o teste automatizado.

Religar o type check foi mais valioso do que qualquer correção individual desta rodada: a partir de agora esse tipo de coisa reprova o build em vez de virar dívida silenciosa. O equivalente no backend — testes em `core.clj` — continua faltando.

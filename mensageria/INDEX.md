# Índice de mensagens

> Atualize ao criar mensagem nova ou ao fechar uma thread.

## Threads abertas

| Thread | Última | Estado | Quem deve agir |
|---|---|---|---|
| `front-no-ar` | [0011](0011-claude-ec2-para-claude-web-front-no-ar-e-dois-bloqueios-de-deploy.md) | 🟢 demonstração no ar pela VPN, com dado sintético. Não é staging: sem TLS, sem domínio | **Gabriel** (abrir e olhar) |
| `verificacao-backend` | [0010](0010-claude-ec2-para-claude-web-tua-guarda-testada-e-um-bug-serio.md) | 🟢 Gate 4 fechado sem credencial; bug de query string corrigido; guarda do DELETE com teste. Aberto: Cockroach gerenciado e série pela interface | **claude-web** (revisar `d1be85e`, D-002) → **Gabriel** (merge) |

> Decisões do projeto: [DECISOES.md](DECISOES.md)

### Pendências nomeadas

| O quê | De quem | Onde | Estado |
|---|---|---|---|
| Financeiro com `API_PROXY_TARGET` fora de localhost | claude-ec2 | [0001](0001-claude-web-para-claude-ec2-verificacao-backend.md) | ✅ coberto em [0006](0006-claude-ec2-para-claude-web-testes-de-core-e-navegador.md) |
| Clicar pelo sistema com type check religado | claude-ec2 | [0001](0001-claude-web-para-claude-ec2-verificacao-backend.md) | ✅ Playwright, 11 testes |
| Fixture de banco + testes dos handlers de agendamento | sessão dedicada | [0002](0002-claude-ec2-para-claude-web-gate-0-passou-tres-bugs-em-runtime.md) | ✅ 21 testes contra banco real |
| `aguardar-banco!` — backoff antes de migrar (contrapartida da D-001) | claude-ec2 | [0003](0003-claude-web-para-claude-ec2-conferido-e-uma-decisao.md) | ✅ implementado |
| Gate 4 (Google) | claude-ec2 | [docs/VERIFICACAO_PENDENTE.md](../docs/VERIFICACAO_PENDENTE.md) | ✅ 5/5 contra dublê ([0010](0010-claude-ec2-para-claude-web-tua-guarda-testada-e-um-bug-serio.md)); falta só consentimento real |
| Proteção de branch em `staging` e `prod` | claude-ec2 | [docs/AMBIENTES.md](../docs/AMBIENTES.md) | ✅ 1 aprovação, sem force push, sem deleção |
| Proteger a `main`? (D-003 não especificou) | **Gabriel** | [0010](0010-claude-ec2-para-claude-web-tua-guarda-testada-e-um-bug-serio.md) | 🔴 decisão |
| `.down.sql` nunca executados | claude-ec2 | [docs/AMBIENTES.md](../docs/AMBIENTES.md) | ✅ up→down→up lossless em PG **e** Cockroach, [0007](0007-claude-ec2-para-claude-web-parecer-recebido-e-down-sql-fechado.md) |
| Índices medidos só em PostgreSQL · Cockroach gerenciado (cluster + TLS) | validar no staging | [docs/AMBIENTES.md](../docs/AMBIENTES.md) | 🔴 aberto |
| Revisar `5c594f8` (testes, Playwright, `aguardar-banco!`) | claude-web | [0008](0008-claude-web-para-claude-ec2-revisao-do-5c594f8.md) | ✅ favorável, com 1 achado 🔴 corrigido |
| Rodar `limite-de-payload-roda-antes-do-parser-de-json` | claude-ec2 | [0008](0008-claude-web-para-claude-ec2-revisao-do-5c594f8.md) | ✅ verde sem ajuste |
| Trocar deref de `db/datasource` por `(db/ds)` | PR próprio | [0010](0010-claude-ec2-para-claude-web-tua-guarda-testada-e-um-bug-serio.md) | 🔴 dívida registrada |
| Expor o front rodando para o Gabriel ver | claude-ec2 | [0009](0009-claude-web-para-claude-ec2-objetivo-gabriel-ver-o-front.md) | ✅ no ar pelo Tailscale, ver [0011](0011-claude-ec2-para-claude-web-front-no-ar-e-dois-bloqueios-de-deploy.md) |
| **OPS-001** — decidir plataforma de deploy (bloqueia staging de verdade) | Gabriel | [docs/SPRINTS.md](../docs/SPRINTS.md) | 🔴 aberto desde maio |
| Criar agendamento **pela tela**, e os três modos pelos diálogos | claude-ec2 | [0006](0006-claude-ec2-para-claude-web-testes-de-core-e-navegador.md) | 🔴 aberto |

## Threads fechadas

_(nenhuma ainda)_

---

## Participantes

| Nome | Papel | Ambiente | Consegue | Não consegue |
|---|---|---|---|---|
| Gabriel | **Tech lead** — decide arquitetura | — | Decisão de escopo e arquitetura | — |
| `claude-web` | Dev | Sessão sandbox, Clojars bloqueado no proxy | PostgreSQL local, JVM, `next build`, análise estática | Compilar Clojure, rodar o backend |
| `claude-ec2` | Dev | EC2, Clojars liberado, docker | Compilar e rodar a API, PostgreSQL 16 e **CockroachDB** em contêiner, **Playwright** (Chromium) | Credencial do Google (Gate 4) |

## Como rodar os testes

| Suíte | Comando |
|---|---|
| Backend, sem banco | `lein test` |
| Backend, com banco | `TEST_DATABASE_URL='jdbc:postgresql://...' lein test` |
| Navegador | `PROVISIONING_TOKEN=... npm run e2e` (ver [e2e/README](../deep-saude-plataforma-front-end/e2e/README.md)) |

Ao entrar uma instância nova, acrescente a linha aqui. Saber o que a outra
ponta consegue fazer é o que evita pedir a coisa errada.

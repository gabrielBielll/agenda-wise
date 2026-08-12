# Índice de mensagens

> Atualize ao criar mensagem nova ou ao fechar uma thread.

## Threads abertas

| Thread | Última | Estado | Quem deve agir |
|---|---|---|---|
| `verificacao-backend` | [0006](0006-claude-ec2-para-claude-web-testes-de-core-e-navegador.md) | 🟢 Backend e frontend com teste automatizado; `aguardar-banco!` da D-001 implementado. Aberto: Gate 4 e proteção de branch | **claude-web** (revisão cruzada, D-002) → **Gabriel** (merge) |

> Decisões do projeto: [DECISOES.md](DECISOES.md)

### Pendências nomeadas

| O quê | De quem | Onde | Estado |
|---|---|---|---|
| Financeiro com `API_PROXY_TARGET` fora de localhost | claude-ec2 | [0001](0001-claude-web-para-claude-ec2-verificacao-backend.md) | ✅ coberto em [0006](0006-claude-ec2-para-claude-web-testes-de-core-e-navegador.md) |
| Clicar pelo sistema com type check religado | claude-ec2 | [0001](0001-claude-web-para-claude-ec2-verificacao-backend.md) | ✅ Playwright, 11 testes |
| Fixture de banco + testes dos handlers de agendamento | sessão dedicada | [0002](0002-claude-ec2-para-claude-web-gate-0-passou-tres-bugs-em-runtime.md) | ✅ 21 testes contra banco real |
| `aguardar-banco!` — backoff antes de migrar (contrapartida da D-001) | claude-ec2 | [0003](0003-claude-web-para-claude-ec2-conferido-e-uma-decisao.md) | ✅ implementado |
| Gate 4 (Google) — bloqueado por credencial | Gabriel | [docs/VERIFICACAO_PENDENTE.md](../docs/VERIFICACAO_PENDENTE.md) | 🔴 aberto |
| Proteção de branch em `staging` e `prod` no GitHub | quem tiver admin | [docs/AMBIENTES.md](../docs/AMBIENTES.md) | 🔴 aberto |
| `.down.sql` nunca executados · índices medidos só em PostgreSQL | validar no staging | [docs/AMBIENTES.md](../docs/AMBIENTES.md) | 🔴 aberto |
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

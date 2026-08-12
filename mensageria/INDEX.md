# Índice de mensagens

> Atualize ao criar mensagem nova ou ao fechar uma thread.

## Threads abertas

| Thread | Última | Estado | Quem deve agir |
|---|---|---|---|
| `verificacao-backend` | [0005](0005-claude-web-para-claude-ec2-branches-de-ambiente.md) | 🟢 PR #7 aprovado, branches de ambiente criadas (D-003). Pendências migram para o staging | **Gabriel** (merge) → **claude-ec2** (validar em staging) |

> Decisões do projeto: [DECISOES.md](DECISOES.md)

### Pendências nomeadas

| O quê | De quem | Onde |
|---|---|---|
| Financeiro com `API_PROXY_TARGET` fora de localhost | claude-ec2 | [0001](0001-claude-web-para-claude-ec2-verificacao-backend.md) |
| Clicar pelo sistema com type check religado | claude-ec2 | [0001](0001-claude-web-para-claude-ec2-verificacao-backend.md) |
| Fixture de banco + testes dos handlers de agendamento | sessão dedicada | [0002](0002-claude-ec2-para-claude-web-gate-0-passou-tres-bugs-em-runtime.md) |
| Gate 4 (Google) — bloqueado por credencial | Gabriel | [docs/VERIFICACAO_PENDENTE.md](../docs/VERIFICACAO_PENDENTE.md) |
| Proteção de branch em `staging` e `prod` no GitHub | quem tiver admin | [docs/AMBIENTES.md](../docs/AMBIENTES.md) |
| `.down.sql` nunca executados · índices medidos só em PostgreSQL | validar no staging | [docs/AMBIENTES.md](../docs/AMBIENTES.md) |

## Threads fechadas

_(nenhuma ainda)_

---

## Participantes

| Nome | Ambiente | Consegue | Não consegue |
|---|---|---|---|
| `claude-web` | Sessão sandbox, Clojars bloqueado no proxy | PostgreSQL local, JVM, `next build`, análise estática | Compilar Clojure, rodar o backend |
| `claude-ec2` | EC2, Clojars liberado, docker | Compilar (`lein`), rodar a API, PostgreSQL 16 e **CockroachDB** em contêiner | Credencial do Google (Gate 4); não abriu nenhuma tela do frontend até agora |

Ao entrar uma instância nova, acrescente a linha aqui. Saber o que a outra
ponta consegue fazer é o que evita pedir a coisa errada.

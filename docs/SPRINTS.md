# Sprints — visão de board

> Atualizado: 2026-05-15
> Total: 45 cards / 8 sprints (sprints 1-4: hardening pré-launch; 5-8: escala e roadmap futuro)

## Legenda

- **Severidade:** 🔴 Critical • 🟠 High • 🟡 Medium • 🟢 Low
- **Esforço:** S (≤2h) • M (meio dia) • L (1-2 dias) • XL (>2 dias)
- **Status:** TODO • DOING • DONE • BLOCKED

---

## 🔴 Sprint 1 — Segurança Crítica (bloqueadores reais)

> Objetivo: tornar o sistema seguro o suficiente para receber usuários reais.
> Esforço total estimado: ~3-4 dias.

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [SEC-001](cards/sprint-1-security/SEC-001-remover-auto-correct-hash.md) | Remover auto-correct hash do login + migração one-shot | 🔴 | M | TODO |
| [SEC-002](cards/sprint-1-security/SEC-002-rotacionar-credenciais.md) | Rotacionar credenciais expostas (CockroachDB, JWT, MinIO, admin) | 🔴 | M | TODO |
| [SEC-003](cards/sprint-1-security/SEC-003-remover-scripts-admin.md) | Remover scripts Python e backups/ do repo + limpar histórico | 🔴 | M | TODO |
| [SEC-004](cards/sprint-1-security/SEC-004-verificar-jwt-middleware.md) | Verificar assinatura JWT no middleware do Next.js | 🔴 | S | TODO |
| [SEC-005](cards/sprint-1-security/SEC-005-remover-override-admin-nextauth.md) | Remover override hardcoded de admin no NextAuth | 🔴 | S | TODO |
| [SEC-006](cards/sprint-1-security/SEC-006-rbac-granular-admin.md) | Eliminar bypass total de admin no RBAC | 🟠 | L | TODO |
| [SEC-007](cards/sprint-1-security/SEC-007-restringir-cors.md) | Restringir CORS — remover wildcard `.code.run` e hardcodes | 🟠 | S | TODO |
| [SEC-008](cards/sprint-1-security/SEC-008-token-backend-httponly.md) | Mover token backend pra cookie httpOnly | 🟠 | M | TODO |
| [SEC-009](cards/sprint-1-security/SEC-009-remover-logs-sensíveis.md) | Remover logs de PII e JWT_SECRET parcial do startup | 🟠 | S | TODO |
| [SEC-010](cards/sprint-1-security/SEC-010-rate-limiting.md) | Rate limiting em login e provisionamento | 🟠 | M | TODO |

---

## 🟠 Sprint 2 — Robustez e Escalabilidade

> Objetivo: aguentar carga real, falhar com graça, manter integridade.
> Esforço total estimado: ~5-7 dias.

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [ROB-001](cards/sprint-2-robustness/ROB-001-pool-hikari.md) | Configurar pool HikariCP explícito | 🔴 | S | TODO |
| [ROB-002](cards/sprint-2-robustness/ROB-002-tuning-jetty.md) | Tuning do Jetty (threads, timeouts) | 🟠 | S | TODO |
| [ROB-003](cards/sprint-2-robustness/ROB-003-validacao-input.md) | Validação de input no backend (malli) | 🟠 | L | TODO |
| [ROB-004](cards/sprint-2-robustness/ROB-004-migratus.md) | Migrar para Migratus (versionamento de schema) | 🟠 | L | TODO |
| [ROB-005](cards/sprint-2-robustness/ROB-005-timeouts-retry-fetch.md) | Timeouts e retry nas chamadas fetch do frontend | 🟠 | M | TODO |
| [ROB-006](cards/sprint-2-robustness/ROB-006-double-click-protection.md) | Proteção contra duplo clique em mutations | 🟡 | M | TODO |
| [ROB-007](cards/sprint-2-robustness/ROB-007-n-plus-1-recorrencias.md) | Eliminar N+1 em updates de recorrências | 🟡 | M | TODO |
| [ROB-008](cards/sprint-2-robustness/ROB-008-logs-estruturados.md) | Logs estruturados — timbre no backend, remover console.log | 🟠 | M | TODO |
| [ROB-009](cards/sprint-2-robustness/ROB-009-payload-limit-erros.md) | Limite de payload + erros sem stack traces vazadas | 🟠 | S | TODO |
| [ROB-010](cards/sprint-2-robustness/ROB-010-transacoes.md) | Transações em writes multi-statement | 🟠 | M | TODO |

---

## 🟡 Sprint 3 — Operações e Produção

> Objetivo: deploy, observabilidade, CI/CD.
> Esforço total estimado: ~4-5 dias. Depende de OPS-001 (decisão de deploy).

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [OPS-001](cards/sprint-3-production/OPS-001-decidir-deploy.md) | Decidir e configurar plataforma de deploy unificada | 🟠 | L | TODO |
| [OPS-002](cards/sprint-3-production/OPS-002-sentry-observabilidade.md) | Sentry + log aggregation (frontend + backend) | 🟠 | M | TODO |
| [OPS-003](cards/sprint-3-production/OPS-003-cronjob-sincronizacao.md) | Cronjob de sincronização de status (sair do startup) | 🟡 | M | TODO |
| [OPS-004](cards/sprint-3-production/OPS-004-healthchecks.md) | Healthcheck do backend + corrigir healthcheck Postgres | 🟠 | S | TODO |
| [OPS-005](cards/sprint-3-production/OPS-005-docker-prod-ready.md) | Multi-stage build backend + resource limits + restart policy | 🟡 | M | TODO |
| [OPS-006](cards/sprint-3-production/OPS-006-ci-cd.md) | CI/CD com GitHub Actions (test + lint + deploy) | 🟡 | M | TODO |
| [OPS-007](cards/sprint-3-production/OPS-007-pinar-imagens.md) | Pinar versões das imagens Docker | 🟢 | S | TODO |
| [OPS-008](cards/sprint-3-production/OPS-008-backups-encriptados.md) | Backups encriptados + offsite + retention policy | 🟠 | M | TODO |

---

## 🟢 Sprint 4 — Qualidade (não-bloqueante, contínuo)

> Objetivo: pagar dívida técnica para manter velocidade no longo prazo.
> Pode acontecer pós-launch. Boa para um dia "limpa casa" por sprint.

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [QUA-001](cards/sprint-4-quality/QUA-001-eliminar-any.md) | Eliminar usos de `as any` no frontend | 🟢 | XL | TODO |
| [QUA-002](cards/sprint-4-quality/QUA-002-timezone-calendar.md) | Refatorar handling de timezone do calendário | 🟡 | L | TODO |
| [QUA-003](cards/sprint-4-quality/QUA-003-error-boundary.md) | Error boundary global no Next.js | 🟡 | S | TODO |
| [QUA-004](cards/sprint-4-quality/QUA-004-api-versioning.md) | Versionamento de API (`/api/v1`) | 🟢 | M | TODO |
| [QUA-005](cards/sprint-4-quality/QUA-005-security-headers.md) | Headers de segurança HTTP (CSP, HSTS, X-Frame-Options) | 🟡 | S | TODO |
| [QUA-006](cards/sprint-4-quality/QUA-006-refatorar-calendar-client.md) | Refatorar CalendarClient (16+ state vars → useReducer) | 🟢 | L | TODO |

---

---

## 🟠 Sprint 5 — Performance e escala (Onda 1)

> Objetivo: estabilizar para 100-500 simultâneos reais. Sem isso, "milhares simultâneos" é impossível.
> Esforço total estimado: ~4-5 dias.
> Análise base: gargalos identificados em 2026-05-15 (ver memória `project_performance_scale.md`).

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [PERF-001](cards/sprint-5-performance/PERF-001-indices-banco.md) | Criar índices secundários no banco | 🔴 | S | TODO |
| [PERF-002](cards/sprint-5-performance/PERF-002-paginacao-listagens.md) | Paginação em listagens (agendamentos, prontuários, pacientes) | 🟠 | M | TODO |
| [PERF-003](cards/sprint-5-performance/PERF-003-cache-identidade-rbac.md) | Cache de identidade e RBAC em memória | 🟠 | M | TODO |
| [PERF-004](cards/sprint-5-performance/PERF-004-react-query-cache-http.md) | TanStack Query + cache HTTP no Next 15 | 🟠 | L | TODO |
| [PERF-005](cards/sprint-5-performance/PERF-005-code-splitting-bundle.md) | Code-splitting e tree-shaking do bundle do frontend | 🟠 | M | TODO |
| [PERF-006](cards/sprint-5-performance/PERF-006-suspense-streaming.md) | Suspense + loading.tsx para streaming progressivo | 🟡 | M | TODO |
| [PERF-007](cards/sprint-5-performance/PERF-007-rewrites-env-var.md) | Rewrites do Next via variável de ambiente | 🔴 | S | TODO |
| [PERF-008](cards/sprint-5-performance/PERF-008-remover-ignore-errors.md) | Remover `ignoreBuildErrors`/`ignoreDuringBuilds` | 🟠 | L | TODO |

---

## 🔴 Sprint 6 — LGPD e compliance de saúde

> Objetivo: tornar legalmente viável armazenar dados de saúde no Brasil.
> Esforço total estimado: ~3-4 dias.
> Nota: dados de saúde são "sensíveis" pela LGPD — sem audit log e soft delete, vender o produto para clínicas reais é arriscado.

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [LGPD-001](cards/sprint-6-lgpd/LGPD-001-audit-log.md) | Audit log de acesso e mutação de dados de saúde | 🔴 | L | TODO |
| [LGPD-002](cards/sprint-6-lgpd/LGPD-002-soft-delete-retencao.md) | Soft delete + retenção legal CFM/LGPD | 🟠 | M | TODO |
| [LGPD-003](cards/sprint-6-lgpd/LGPD-003-row-level-security.md) | Row-Level Security por clinica_id | 🟠 | L | TODO |
| [LGPD-004](cards/sprint-6-lgpd/LGPD-004-email-scope-clinica.md) | Email de usuário escopado por clínica | 🟡 | M | TODO |

---

## 🟠 Sprint 7 — Real-time / Chat (Onda 2)

> Objetivo: preparar a arquitetura para chat real-time entre psicólogo e paciente, com suporte a 1k-5k simultâneos.
> Esforço total estimado: ~6-8 dias.
> Pré-requisito: Sprints 1-3 concluídas, Sprint 5 idealmente estabilizada.

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [RT-001](cards/sprint-7-realtime/RT-001-migrar-aleph.md) | Migrar de Jetty para Aleph (async + WebSocket) | 🟠 | L | TODO |
| [RT-002](cards/sprint-7-realtime/RT-002-redis-infra.md) | Infraestrutura Redis (cache, pub/sub, rate limit) | 🟠 | M | TODO |
| [RT-003](cards/sprint-7-realtime/RT-003-schema-mensagens-chat.md) | Schema de mensagens de chat + presença | 🟠 | M | TODO |
| [RT-004](cards/sprint-7-realtime/RT-004-websocket-chat-pubsub.md) | WebSocket de chat com pub/sub Redis | 🟠 | XL | TODO |

---

## 🟠 Sprint 8 — Vídeo / Telemedicina (Onda 3)

> Objetivo: sessões de psicoterapia por vídeo com gravação compliance.
> Esforço total estimado: ~5-7 dias + custo recorrente do SaaS.
> Pré-requisito: Sprints 1-7 (especialmente Sprint 6 — gravação exige consentimento LGPD).

| ID | Título | Sev | Esf | Status |
|---|---|---|---|---|
| [VID-001](cards/sprint-8-video/VID-001-livekit-sfu-webrtc.md) | Vídeo de sessão (WebRTC via LiveKit SFU) | 🟠 | XL | TODO |
| [VID-002](cards/sprint-8-video/VID-002-consentimento-gravacao-retencao.md) | Consentimento, criptografia e retenção da gravação | 🔴 | L | TODO |

---

## Resumo por severidade

| Severidade | Quantidade | Onde |
|---|---|---|
| 🔴 Critical | 10 | SEC-001 a 005, ROB-001, PERF-001/007, LGPD-001, VID-002 |
| 🟠 High | 25 | SEC-006 a 010, ROB-002/003/004/005/008/009/010, OPS-001/002/004/008, PERF-002/003/004/005/008, LGPD-002/003, RT-001/002/003/004, VID-001 |
| 🟡 Medium | 8 | ROB-006/007, OPS-003/005/006, QUA-002/003/005, PERF-006, LGPD-004 |
| 🟢 Low | 4 | OPS-007, QUA-001/004/006 |

## Visão de cronograma sugerido

```
==== PRÉ-LAUNCH ====
Semana 1  ████████████  Sprint 1 (Segurança crítica)
Semana 2  ██████████    Sprint 2 (Robustez) — parte 1
Semana 3  ██████        Sprint 2 — parte 2
Semana 3  ████████      Sprint 3 (Produção)
[Launch para piloto]  ✦
Pós-launch:  Sprint 4 (Qualidade) — incremental

==== ESCALA E ROADMAP ====
Semana 5-6  ██████████  Sprint 5 (Performance — Onda 1)
                        Gate: aguenta 500 simultâneos
Semana 7-8  ████████    Sprint 6 (LGPD — compliance)
                        Pré-requisito para vender em escala
Semana 9-11 ████████████ Sprint 7 (Chat real-time — Onda 2)
                        Gate: 1k-5k simultâneos com chat
Semana 12-14 ████████████ Sprint 8 (Vídeo — Onda 3)
                        Roadmap de telemedicina
```

## Notas sobre Sprints 5-8

- **Sprint 5** tem cards de **Critical** (PERF-001 índices, PERF-007 env-var rewrites) que podem ser executados em paralelo às Sprints 2-3.
- **Sprint 6** é bloqueador legal: dados de saúde sem audit log + sem soft delete = exposição jurídica em auditoria.
- **Sprint 7** assume **Aleph** em produção. Se preferir manter Jetty, precisa terceirizar chat em serviço Node/Elixir separado (decisão pendente — registrar se mudar).
- **Sprint 8** tem custo recorrente (LiveKit Cloud). Modelar no pricing antes de habilitar.

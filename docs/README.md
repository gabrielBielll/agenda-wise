# Deep Saúde — Documentação de Hardening e Roadmap

> Documentação criada em 2026-05-15.
> Status: 45 cards abertos, distribuídos em 8 sprints.
> Sprints 1-4: hardening pré-launch (auditoria de segurança/robustez/produção/qualidade).
> Sprints 5-8: escala e roadmap futuro (performance, LGPD, chat real-time, vídeo).

## O que é esta pasta

Esta pasta organiza tudo o que precisa ser feito antes do Deep Saúde ir para produção, em formato de cards (estilo Jira) escritos em Markdown. Cada card é um arquivo independente, dimensionado para ser executado como uma unidade de trabalho.

## Como navegar

| Arquivo | Para quê |
|---|---|
| [PRODUCTION_READINESS_REVIEW.md](PRODUCTION_READINESS_REVIEW.md) | Relatório completo da auditoria — leitura única, panorâmica |
| [SPRINTS.md](SPRINTS.md) | Visão de board: quais cards em cada sprint, status, severidade |
| [cards/sprint-1-security/](cards/sprint-1-security/) | Bloqueadores críticos de segurança — **fazer primeiro** |
| [cards/sprint-2-robustness/](cards/sprint-2-robustness/) | Robustez e escalabilidade — sem isso, cai sob carga |
| [cards/sprint-3-production/](cards/sprint-3-production/) | Deploy, observabilidade, CI/CD — sem isso, não rastreia bugs |
| [cards/sprint-4-quality/](cards/sprint-4-quality/) | Qualidade de código — pode ser contínuo, não-bloqueante |
| [cards/sprint-5-performance/](cards/sprint-5-performance/) | Performance Onda 1 — destrava 100-500 simultâneos |
| [cards/sprint-6-lgpd/](cards/sprint-6-lgpd/) | LGPD + CFM — audit log, soft delete, RLS, email scope |
| [cards/sprint-7-realtime/](cards/sprint-7-realtime/) | Chat real-time (Onda 2) — Aleph, Redis, WebSocket |
| [cards/sprint-8-video/](cards/sprint-8-video/) | Vídeo / telemedicina (Onda 3) — LiveKit + consentimento |
| [cards/aws-migration/](cards/aws-migration/) | **Trilha de migração para AWS** — 18 cards, dupla finalidade: migrar + estudar para certificação |

## Convenções dos cards

Cada card segue este formato:

```
# [ID] Título

**Severidade:** Critical / High / Medium / Low
**Sprint:** N
**Esforço:** S (≤2h) / M (meio dia) / L (1-2 dias) / XL (>2 dias)
**Área:** Backend / Frontend / Infra / Cross-cutting
**Status:** TODO / DOING / DONE / BLOCKED

## Contexto
O porquê — qual problema existe hoje

## Localização
Arquivo:linha do código afetado

## Solução proposta
O que fazer, em passos acionáveis

## Critérios de aceitação
- [ ] Checklist verificável

## Riscos / dependências
O que pode dar errado ou bloqueia
```

**IDs:**
- `SEC-NNN` — Sprint 1, segurança
- `ROB-NNN` — Sprint 2, robustez/escalabilidade
- `OPS-NNN` — Sprint 3, operações/deploy
- `QUA-NNN` — Sprint 4, qualidade de código
- `PERF-NNN` — Sprint 5, performance e escala (Onda 1)
- `LGPD-NNN` — Sprint 6, compliance LGPD/CFM
- `RT-NNN` — Sprint 7, chat real-time (Onda 2)
- `VID-NNN` — Sprint 8, vídeo / telemedicina (Onda 3)
- `AWS-NNN` — Trilha de migração para AWS

## Como atualizar progresso

1. Ao começar um card, edite o frontmatter `**Status:** TODO` → `DOING`
2. Ao terminar, marque os critérios de aceitação como `[x]` e mude para `DONE`
3. Se desbloquear ou alterar escopo, registre na seção "Riscos / dependências"

## Ordem recomendada

**Pré-launch:**
1. **Sprint 1 inteira** — não pula nada, são bloqueadores reais
2. **Sprint 2** — pode paralelizar items independentes
3. **Sprint 3** — alvo de deploy decidido antes (OPS-001 é primeiro)
4. **Sprint 4** — incremental, pode acontecer depois do launch

**Escala e roadmap:**
5. **Sprint 5** — performance (Onda 1). Cards Critical (PERF-001 índices, PERF-007 env-var) podem rodar em paralelo às Sprints 2-3.
6. **Sprint 6** — LGPD/CFM. Bloqueador legal para vender em escala. Pode rodar em paralelo à Sprint 5.
7. **Sprint 7** — chat real-time. Pré-requisito: Sprint 5 + Sprint 6 (especialmente LGPD-001 e LGPD-003).
8. **Sprint 8** — vídeo. Pré-requisito: Sprints 5-7 (especialmente VID-002 depende de LGPD-001).

## Decisões pendentes do usuário

Algumas decisões dependem do Gabriel e ainda não estão resolvidas:

- [ ] **OPS-001** — Plataforma de deploy final (Render? Fly.io? Railway? GCP App Hosting?)
- [ ] **SEC-002** — Senha do CockroachDB Cloud precisa ser rotacionada manualmente no painel
- [ ] **OPS-008** — Onde armazenar backups offsite (S3? GCS?)

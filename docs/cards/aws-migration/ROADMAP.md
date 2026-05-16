# Roadmap AWS — visão de board

> Atualizado: 2026-05-15
> Total: 18 cards / 7 fases

## Legenda

- **Severidade/Prioridade:** 🔴 Crítico • 🟠 Alto • 🟡 Médio • 🟢 Baixo
- **Esforço:** S (≤2h) • M (meio dia) • L (1-2 dias) • XL (>2 dias)
- **Status:** TODO • DOING • DONE • BLOCKED

---

## 🧱 Fase 0 — Fundamentos AWS

> Objetivo: ter conta segura, IAM bem configurado, billing controlado.
> **Sem isso, qualquer card de produção é prematuro.**
> Esforço total: ~1 dia.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-001](AWS-001-criar-conta-iam-billing.md) | Criar conta AWS + IAM + MFA + Billing Alerts | 🔴 | M | TODO |
| [AWS-002](AWS-002-aws-cli-perfis.md) | Configurar AWS CLI + perfis + acesso programático | 🟠 | S | TODO |
| [AWS-003](AWS-003-conceitos-vpc-network.md) | Entender VPC, subnets, Security Groups (sem criar nada custom ainda) | 🟠 | S | TODO |

---

## 💾 Fase 1 — Migração de Dados (estado primeiro)

> Objetivo: dados na AWS, isolados em VPC, com secrets gerenciados.
> Estado é o que importa — compute é descartável.
> Esforço total: ~2 dias.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-004](AWS-004-rds-aurora-postgres.md) | Provisionar Aurora PostgreSQL Serverless v2 + migrar schema/dados | 🔴 | L | TODO |
| [AWS-005](AWS-005-s3-bucket-storage.md) | Criar bucket S3 + migrar uploads do MinIO + IAM policy mínima | 🔴 | M | TODO |
| [AWS-006](AWS-006-secrets-manager.md) | Mover JWT_SECRET, DATABASE_URL, S3 keys pro Secrets Manager | 🔴 | M | TODO |

---

## ⚙️ Fase 2 — Compute: Backend Clojure

> Objetivo: backend rodando na AWS, lendo do RDS, autenticando, servindo JSON.
> Esforço total: ~1-2 dias.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-007](AWS-007-ecr-imagem-backend.md) | Criar repositório ECR e fazer push da imagem do backend | 🟠 | S | TODO |
| [AWS-008](AWS-008-app-runner-backend.md) | Deploy do backend Clojure no AWS App Runner | 🔴 | M | TODO |
| [AWS-009](AWS-009-alternativa-ecs-fargate.md) | (Opcional, certificação) Mesmo deploy em ECS Fargate + ALB | 🟢 | XL | TODO |

---

## 🎨 Fase 3 — Compute: Frontend Next.js

> Objetivo: frontend acessível por URL pública, integrando com backend AWS.
> Esforço total: ~1 dia.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-010](AWS-010-amplify-hosting-frontend.md) | Deploy do Next.js no AWS Amplify Hosting | 🔴 | M | TODO |
| [AWS-011](AWS-011-cloudfront-cdn.md) | CloudFront na frente para cache, HTTPS e proteção | 🟠 | M | TODO |

---

## 🌐 Fase 4 — DNS, SSL, Domínio

> Objetivo: domínio próprio (deepsaude.com.br ou similar) com SSL.
> Esforço total: ~meio dia + propagação DNS.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-012](AWS-012-route53-acm-dominio.md) | Route 53 + ACM (certificado SSL) + apontar domínio | 🟠 | M | TODO |

---

## 📊 Fase 5 — Observabilidade

> Objetivo: saber o que está acontecendo. Ver logs, métricas, alertas.
> Esforço total: ~1 dia.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-013](AWS-013-cloudwatch-logs.md) | CloudWatch Logs — coletar logs estruturados de backend e frontend | 🟠 | M | TODO |
| [AWS-014](AWS-014-cloudwatch-alarms-sns.md) | CloudWatch Alarms + SNS — alertas no e-mail quando algo quebra | 🟠 | M | TODO |

---

## 🤖 Fase 6 — CI/CD

> Objetivo: deploy automático ao mergear na `main`.
> Esforço total: ~meio dia.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-015](AWS-015-github-actions-oidc.md) | GitHub Actions com OIDC → push ECR + trigger App Runner/Amplify | 🟡 | M | TODO |

---

## 🛡️ Fase 7 — Segurança & Custos em Produção

> Objetivo: dormir tranquilo. WAF, backups, budgets.
> Esforço total: ~1 dia.

| ID | Título | Prio | Esf | Status |
|---|---|---|---|---|
| [AWS-016](AWS-016-waf-shield.md) | WAF na frente do CloudFront/App Runner + Shield Standard | 🟡 | M | TODO |
| [AWS-017](AWS-017-budgets-cost-alerts.md) | AWS Budgets + Cost Explorer + alertas de gasto | 🔴 | S | TODO |
| [AWS-018](AWS-018-backups-restore.md) | Backups RDS automatizados + S3 versioning + lifecycle | 🟠 | M | TODO |

---

## Cronograma sugerido

```
Semana 1  ███   Fase 0 (Fundamentos) + Fase 1 começo (RDS)
Semana 2  ██████ Fase 1 (Dados completo) + Fase 2 (Backend)
Semana 3  █████  Fase 3 (Frontend) + Fase 4 (DNS)
Semana 4  ████   Fase 5 (Observabilidade) + Fase 6 (CI/CD)
Semana 5  ███    Fase 7 (Segurança/Custos) — bolsão pra estudar certificação

[Marcar prova CLF-C02 entre semana 3 e 5]
```

## Custo estimado mensal (Free Tier + além)

| Cenário | Mês 1-12 (Free Tier) | Após Free Tier |
|---|---|---|
| **Mínimo** (1 user, tráfego baixo) | ~5-15 USD | ~30-50 USD |
| **Realista pré-launch** (testes) | ~10-25 USD | ~50-90 USD |
| **Produção 10 clínicas** | ~40-60 USD | ~120-180 USD |

> Aurora Serverless v2 é o maior custo fixo (~30 USD/mês mesmo ocioso, mínimo 0,5 ACU × 730h). Se isso doer no orçamento, AWS-004 tem rota alternativa com RDS `db.t4g.micro` que é Free Tier por 12 meses.

## Resumo por prioridade

| Prioridade | Quantidade | Onde |
|---|---|---|
| 🔴 Crítico | 6 | AWS-001, 004, 005, 006, 008, 010, 017 |
| 🟠 Alto | 8 | AWS-002, 003, 007, 011, 012, 013, 014, 018 |
| 🟡 Médio | 2 | AWS-015, 016 |
| 🟢 Baixo (opcional) | 1 | AWS-009 |

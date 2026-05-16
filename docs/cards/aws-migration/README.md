# Migração para AWS — Deep Saúde

> Trilha criada em 2026-05-15.
> Objetivo duplo: (1) migrar o Deep Saúde para AWS, (2) aprender AWS na prática para certificação.

## Para quem é esta trilha

Para você, Gabriel, que nunca fez deploy em AWS. Cada card é uma unidade de trabalho que entrega:

1. **Um pedaço da aplicação rodando na AWS**
2. **Conceitos novos da AWS** explicados no contexto do que você está fazendo
3. **Ponteiros para os domínios da certificação** que aquele card cobre

Não é um curso. É um guia de execução. Você aprende **fazendo**, e cada card faz parte do produto real.

## Trilha de certificação alvo

Os cards são desenhados pensando em duas certificações:

| Certificação | Quando fazer | Cards relevantes |
|---|---|---|
| **AWS Cloud Practitioner (CLF-C02)** — introdutória, 100 USD | Após Fase 1-3 | AWS-001 a AWS-010 cobrem 100% do exame |
| **AWS Solutions Architect Associate (SAA-C03)** — intermediária, 150 USD | Após terminar a migração | Toda a trilha + estudo focado em alta disponibilidade |

> **Recomendação:** mire na **CLF-C02 primeiro** (mais fácil, valida fundamentos). Use os meses de migração como tempo de estudo paralelo. Marque a prova quando estiver na Fase 4-5.

## Fases (visão rápida)

| Fase | Foco | Cards |
|---|---|---|
| **0** | Fundamentos AWS — antes de tocar em código | AWS-001, 002, 003 |
| **1** | Migração de **estado** (dados): RDS, S3, Secrets | AWS-004, 005, 006 |
| **2** | Backend Clojure em compute AWS | AWS-007, 008, 009 |
| **3** | Frontend Next.js em compute AWS | AWS-010, 011 |
| **4** | DNS, SSL, domínio | AWS-012 |
| **5** | Observabilidade | AWS-013, 014 |
| **6** | CI/CD automatizado | AWS-015 |
| **7** | Segurança e custos em produção | AWS-016, 017, 018 |

Veja o board completo em [ROADMAP.md](ROADMAP.md).
Para um panorama visual do **de → para**, veja [00-MAPA-ARQUITETURA.md](00-MAPA-ARQUITETURA.md).

## Convenções

Cada card segue o formato dos demais sprints do projeto, mas com **duas seções extras**:

```
## Conceitos AWS introduzidos
Glossário do que aparece no card pela primeira vez, com 1-2 linhas.

## Aprendizado para certificação
Quais domínios da CLF-C02 / SAA-C03 esse card cobre, e o que estudar
em paralelo.
```

**IDs:**
- `AWS-NNN` — todos os cards de migração AWS

**Estimativa de custo:**
Cada card tem uma linha **Custo estimado/mês** (em USD). Vou ser conservador: assumindo que você ficará majoritariamente dentro do **AWS Free Tier (12 meses iniciais)**, mas com nota do que cobra fora dele.

## Ordem recomendada

1. **Fase 0 inteira** — não pula. Sem IAM/MFA/billing alerts você queima a mão.
2. **Fase 1 inteira** — dados primeiro. Compute sem dados não serve pra nada.
3. **Fase 2 e 3 em paralelo** se quiser acelerar (são independentes).
4. **Fase 4-7 sequencial** — cada uma depende parcialmente da anterior.

## Decisões já tomadas (você pode mudar)

| Decisão | Escolhido | Alternativa |
|---|---|---|
| Região AWS | **`us-east-1`** (N. Virginia) | `sa-east-1` (São Paulo) — mais caro mas latência melhor pro BR |
| Banco | **Aurora PostgreSQL Serverless v2** | RDS PostgreSQL `db.t4g.micro` (Free Tier elegível) |
| Compute backend | **App Runner** (mais simples) | ECS Fargate + ALB (mais flexível, mais aprendizado) |
| Compute frontend | **Amplify Hosting** | App Runner + CloudFront |
| CI/CD | **GitHub Actions + OIDC** | CodePipeline + CodeBuild |

> **Sobre região:** `us-east-1` tem o catálogo mais completo de serviços e os preços mais baixos. `sa-east-1` (São Paulo) é ~30% mais caro e alguns serviços demoram pra chegar. Mas se seus usuários são brasileiros, vale considerar `sa-east-1` para o frontend/CDN (CloudFront resolve isso de qualquer jeito).

## Próximo passo

Abra [AWS-001-criar-conta-iam-billing.md](AWS-001-criar-conta-iam-billing.md) e siga em ordem.

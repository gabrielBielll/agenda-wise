# Mapa de Arquitetura — De → Para

> Visualização lado-a-lado: como está hoje vs. como vai ficar na AWS.

## Arquitetura atual (hoje)

```
┌──────────────────────────────────────────────────────────┐
│                         USUÁRIO                          │
│                  (browser, mobile, etc.)                 │
└─────────────────────────┬────────────────────────────────┘
                          │
                          │ HTTPS
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Firebase App Hosting                                    │
│  ├── Next.js 15 (standalone)                             │
│  ├── NextAuth (Credentials Provider)                     │
│  ├── Genkit + Google AI                                  │
│  └── Calls → NEXT_PUBLIC_API_URL                         │
└─────────────────────────┬────────────────────────────────┘
                          │
                          │ HTTPS (JSON API)
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Render (Docker container)                               │
│  ├── Clojure + Ring/Jetty                                │
│  ├── JWT (Buddy, HS256)                                  │
│  └── JDBC connections                                    │
└──────┬──────────────────────────────────┬───────────────┘
       │                                  │
       ▼                                  ▼
┌──────────────┐                ┌────────────────────┐
│ CockroachDB  │                │  MinIO (uploads,   │
│  Cloud       │                │   avatares,        │
│  (Postgres   │                │   anexos)          │
│   wire)      │                │                    │
└──────────────┘                └────────────────────┘
```

**Problemas dessa arquitetura para escala:**
- 3 provedores diferentes (Firebase + Render + CockroachDB) — 3 painéis, 3 faturas, 3 monitorings.
- MinIO sem alta disponibilidade (single-node Docker).
- Sem CDN próprio na frente do frontend.
- Secrets em variáveis de ambiente texto-puro nos painéis de cada provedor.
- Sem WAF, sem rate limiting estruturado.

## Arquitetura alvo (AWS)

```
┌──────────────────────────────────────────────────────────┐
│                         USUÁRIO                          │
└─────────────────────────┬────────────────────────────────┘
                          │
                          │ HTTPS (domínio próprio)
                          ▼
                  ┌────────────────┐
                  │   Route 53     │  (DNS gerenciado)
                  │   ACM (TLS)    │
                  └───────┬────────┘
                          │
                          ▼
                  ┌────────────────┐
                  │   CloudFront   │  (CDN global, cache, HTTP/3)
                  │   + AWS WAF    │  (rate limit, geo, OWASP)
                  └───────┬────────┘
                          │
            ┌─────────────┴──────────────┐
            │                            │
            ▼                            ▼
   ┌──────────────────┐         ┌────────────────────┐
   │ Amplify Hosting  │         │   App Runner       │
   │ (Next.js standa- │  /api/* │  (Docker Clojure   │
   │  lone, SSR)      │ ──────► │   backend)         │
   │                  │         │                    │
   └──────────────────┘         └─────────┬──────────┘
                                          │
                  ┌───────────────────────┼──────────────────┐
                  │                       │                  │
                  ▼                       ▼                  ▼
       ┌──────────────────┐    ┌──────────────────┐  ┌─────────────────┐
       │ Aurora Postgres  │    │       S3         │  │ Secrets Manager │
       │ Serverless v2    │    │ (uploads,        │  │ (JWT_SECRET,    │
       │ (multi-AZ)       │    │  anexos, fotos)  │  │  DB_URL, etc.)  │
       └──────────────────┘    └──────────────────┘  └─────────────────┘
                  │                       │
                  │                       │
                  └───────────┬───────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │   CloudWatch          │
                  │   - Logs              │
                  │   - Metrics           │
                  │   - Alarms → SNS      │
                  └───────────────────────┘
```

## Tabela de equivalências

| Componente | Hoje | AWS | Card que faz a migração |
|---|---|---|---|
| Banco de dados | PostgreSQL local / CockroachDB Cloud | **Amazon RDS for PostgreSQL** ou **Aurora Serverless v2** | [AWS-004](AWS-004-rds-aurora-postgres.md) |
| Object storage | MinIO (S3-compatible) | **Amazon S3** | [AWS-005](AWS-005-s3-bucket-storage.md) |
| Secrets | env vars em texto-puro | **AWS Secrets Manager** | [AWS-006](AWS-006-secrets-manager.md) |
| Container registry | (Render builda do Git) | **Amazon ECR** | [AWS-007](AWS-007-ecr-imagem-backend.md) |
| Compute backend | Render container | **AWS App Runner** | [AWS-008](AWS-008-app-runner-backend.md) |
| Compute frontend | Firebase App Hosting | **AWS Amplify Hosting** | [AWS-010](AWS-010-amplify-hosting-frontend.md) |
| CDN | (Firebase faz alguma coisa) | **Amazon CloudFront** | [AWS-011](AWS-011-cloudfront-cdn.md) |
| DNS | (registrar atual) | **Amazon Route 53** | [AWS-012](AWS-012-route53-acm-dominio.md) |
| SSL/TLS | Let's Encrypt automático nos provedores | **AWS Certificate Manager (ACM)** — grátis | [AWS-012](AWS-012-route53-acm-dominio.md) |
| Logs | `tail -f backend.log` | **CloudWatch Logs** | [AWS-013](AWS-013-cloudwatch-logs.md) |
| Alertas | (nenhum) | **CloudWatch Alarms + SNS** | [AWS-014](AWS-014-cloudwatch-alarms-sns.md) |
| CI/CD | (manual ou auto-deploy do Render) | **GitHub Actions + OIDC** | [AWS-015](AWS-015-github-actions-oidc.md) |
| WAF / proteção | (nenhuma) | **AWS WAF + Shield Standard** | [AWS-016](AWS-016-waf-shield.md) |
| Backups | Scripts `backup-db.sh` manuais | **RDS automated snapshots + S3 versioning** | [AWS-018](AWS-018-backups-restore.md) |
| Controle de custo | (verificar painel à mão) | **AWS Budgets + Cost Explorer** | [AWS-017](AWS-017-budgets-cost-alerts.md) |

## Decisões críticas de arquitetura

### 1. App Runner vs ECS Fargate vs Elastic Beanstalk

| Critério | App Runner | ECS Fargate | Elastic Beanstalk |
|---|---|---|---|
| Curva de aprendizado | ★ (simples) | ★★★ (médio) | ★★ (fácil) |
| Flexibilidade | Limitada | Total | Média |
| Auto-scaling | Automático | Configurável | Configurável |
| Custo | Pay-per-use, ~$0,007/vCPU-h | Mais barato em escala | Similar ao EC2 |
| Para certificação SAA | Aparece pouco | Aparece muito | Aparece médio |

**Decisão:** começamos com **App Runner** porque o objetivo principal é ter o produto rodando. O [AWS-009](AWS-009-alternativa-ecs-fargate.md) traz o caminho ECS Fargate como exercício de aprendizado adicional.

### 2. RDS vs Aurora Serverless v2

| Critério | RDS `db.t4g.micro` | Aurora Serverless v2 |
|---|---|---|
| Free Tier | ✅ 12 meses grátis | ❌ Não elegível |
| Custo após Free Tier | ~$15/mês | ~$30/mês (mínimo) |
| Escala automática | ❌ (precisa redimensionar manualmente) | ✅ (0,5 a 128 ACUs) |
| Multi-AZ | Pago extra | Incluso |
| Snapshots automáticos | ✅ | ✅ |

**Decisão:** Aurora Serverless v2 é o caminho moderno, mas **se você quer ficar dentro do Free Tier nos primeiros 12 meses**, comece com RDS `db.t4g.micro`. O card [AWS-004](AWS-004-rds-aurora-postgres.md) tem as duas trilhas.

### 3. Amplify Hosting vs App Runner para o Next.js

| Critério | Amplify Hosting | App Runner |
|---|---|---|
| Suporte Next.js 15 | Nativo (incl. SSR e ISR) | Roda Docker, qualquer framework |
| Build automático do Git | ✅ embutido | Precisa de CI externo |
| Custo | $0,01/min build + $0,15/GB serve | $0,007/vCPU-h |
| Para certificação | Aparece pouco | Mais "core" AWS |

**Decisão:** **Amplify Hosting**. É feito exatamente para isso e tem o melhor suporte a Next.js 15 com SSR. App Runner pode rodar o Dockerfile, mas perde features como ISR.

### 4. Por que não Lambda + API Gateway?

A tentação é "vai serverless full". Mas:

- **Backend é Clojure/JVM** — cold start de JVM em Lambda é doloroso (3-8s). Existem workarounds (SnapStart, GraalVM native-image), mas é complexo.
- **JWT signing com Buddy** assume processo de longa duração.
- **Pool de conexões JDBC** sofre com modelo serverless por padrão (precisa RDS Proxy).

Lambda faz sentido para **endpoints específicos** (ex: webhook de pagamento), mas não para o app inteiro. Pode ser explorado depois como otimização pontual.

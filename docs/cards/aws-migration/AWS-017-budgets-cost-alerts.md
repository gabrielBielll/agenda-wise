# [AWS-017] AWS Budgets + Cost Explorer + alertas de gasto

**Prioridade:** 🔴 Crítico
**Fase:** 7 — Custos
**Esforço:** S (≤2h)
**Área:** Infra / FinOps
**Status:** TODO
**Custo estimado/mês:** Primeiros 2 budgets grátis, depois $0,02/budget/dia (~$0,60/mês cada extra). Cost Explorer: $0,01/API call após Free Tier.

## Contexto

Você já criou budgets básicos no [AWS-001](AWS-001-criar-conta-iam-billing.md). Agora que tem mais serviços rodando, vamos:

1. Refinar budgets por serviço/tag
2. Habilitar **Cost Explorer** com visualização semanal
3. Configurar **Cost Anomaly Detection** (ML detecta gasto anormal)
4. Aprender a usar tags para rastrear custo por componente

**História real:** dev solo deixa um RDS rodando "esquecido", fatura mensal vai de $20 para $200. Acontece. Este card existe para você ver isso em 24h, não em 30 dias.

## Localização

100% AWS Console e CLI. Nenhum código local muda.

## Solução proposta

### Passo 1 — Habilitar Cost Explorer

Console → **Billing and Cost Management** → **Cost Explorer** → **Enable Cost Explorer**.

Cost Explorer demora **24h para popular dados na primeira vez**. Depois fica em tempo real.

### Passo 2 — Estratégia de Tags

Tags são pares chave/valor anexáveis a quase qualquer recurso. Essenciais para "qual feature está custando mais?".

**Convenção sugerida:**
- `Project = deep-saude`
- `Environment = production` (ou `staging`, `dev`)
- `Component = backend` (ou `frontend`, `database`, `storage`, `cdn`)
- `Owner = gabriel`

Aplique em todos os recursos criados nos cards anteriores:

```bash
# Exemplo: tag um App Runner service
aws apprunner tag-resource \
  --resource-arn arn:aws:apprunner:us-east-1:<account-id>:service/deep-saude-backend/<id> \
  --tags Key=Project,Value=deep-saude Key=Environment,Value=production Key=Component,Value=backend \
  --profile deep-saude

# Aurora cluster
aws rds add-tags-to-resource \
  --resource-name arn:aws:rds:us-east-1:<account-id>:cluster:deep-saude-cluster \
  --tags Key=Project,Value=deep-saude Key=Environment,Value=production Key=Component,Value=database \
  --profile deep-saude

# S3 bucket
aws s3api put-bucket-tagging \
  --bucket deep-saude-prod-uploads \
  --tagging 'TagSet=[{Key=Project,Value=deep-saude},{Key=Environment,Value=production},{Key=Component,Value=storage}]' \
  --profile deep-saude
```

### Passo 3 — Habilitar Cost Allocation Tags

Tags **não aparecem** em Cost Explorer por default. Você precisa habilitar:

Console → Billing → **Cost allocation tags** → **User-defined cost allocation tags**:
- Selecione `Project`, `Environment`, `Component`, `Owner` → **Activate**

Demora 24h para aparecer nos relatórios.

### Passo 4 — Budgets refinados

Você já tem budgets de $10/$50/$100 do [AWS-001](AWS-001-criar-conta-iam-billing.md). Adicione:

**Budget por componente** (para detectar fuga de RDS, por exemplo):
```bash
cat > budget-aurora.json <<'EOF'
{
  "BudgetName": "Aurora-deep-saude",
  "BudgetLimit": { "Amount": "50", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "TagKeyValue": ["user:Component$database"]
  }
}
EOF

cat > notifications.json <<'EOF'
[{
  "Notification": {
    "NotificationType": "ACTUAL",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": 80,
    "ThresholdType": "PERCENTAGE"
  },
  "Subscribers": [{
    "SubscriptionType": "EMAIL",
    "Address": "gabrielfurtunatofranca@gmail.com"
  }]
}]
EOF

aws budgets create-budget \
  --account-id <account-id> \
  --budget file://budget-aurora.json \
  --notifications-with-subscribers file://notifications.json \
  --profile deep-saude
```

Crie similares para: backend (App Runner), storage (S3), CDN (CloudFront).

### Passo 5 — Cost Anomaly Detection

Configuração com ML que detecta gasto fora do padrão:

Console → Billing → **Cost Anomaly Detection** → **Create monitor**:
- **Monitor type:** **AWS services** (qualquer serviço)
- Name: `deep-saude-all-services`
- Save and create alert subscription:
  - Name: `cost-anomaly-alerts`
  - Threshold: $10 absolute (ou 50% relative)
  - Frequency: **Individual alerts**
  - Recipient: seu email

**O que detecta:** gasto que está estatisticamente 2+ desvios padrão acima do baseline. Ex: backend custa $20/mês de média, num dia gasta $15 = anomalia.

### Passo 6 — Cost Explorer reports salvos

Console → Cost Explorer → **Reports** → **Create report**:

**Report 1: Custo diário por componente**
- Time range: last 30 days
- Granularity: Daily
- Group by: Tag → Component
- Save as `Daily cost per component`

**Report 2: Top 5 serviços mais caros**
- Time range: month-to-date
- Granularity: Monthly
- Group by: Service
- Save as `Top services this month`

**Report 3: Storage growth**
- Time range: 6 months
- Filter: Service = S3
- Save as `S3 storage trend`

### Passo 7 — Free Tier usage alerts

Console → Billing → **Free tier** → **Set alerts** → habilitar:
- Email notification when approach 85% of Free Tier limit

Vai te avisar quando estiver perto do limite gratuito de qualquer serviço.

### Passo 8 — Hábitos semanais

Reserve **15 minutos toda segunda-feira** para:
1. Abrir Cost Explorer → ver gráfico daily da última semana
2. Conferir se algum spike isolado apareceu
3. Olhar reports salvos
4. Se notar algo estranho, **investigar antes de virar problema**

## Critérios de aceitação

- [ ] Cost Explorer habilitado
- [ ] Tags `Project`, `Environment`, `Component`, `Owner` aplicadas em todos os recursos AWS
- [ ] Cost Allocation Tags ativadas (esperar 24h para popular)
- [ ] 4+ budgets criados (geral + por componente)
- [ ] Cost Anomaly Detection ativo com alertas por email
- [ ] 3+ Cost Explorer reports salvos
- [ ] Free Tier alerts habilitados
- [ ] Hábito semanal documentado no calendário

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **AWS Budgets** | Limite de gasto/uso/RI coverage. Alerta proativo. |
| **Cost Explorer** | Dashboard de gastos com gráficos, filtros, forecast. |
| **Cost Anomaly Detection** | ML que detecta gasto anormal. |
| **Cost Allocation Tags** | Tags que aparecem em relatórios de custo. Precisa ativar manualmente. |
| **AWS Cost & Usage Report (CUR)** | Relatório CSV/Parquet detalhado para análise no Athena/QuickSight. |
| **Savings Plans** | Compromisso de uso ($/h) por 1-3 anos em troca de desconto (até 72%). |
| **Reserved Instances (RI)** | Compromisso por instance type (EC2/RDS) por 1-3 anos. Desconto até 75%. |
| **Spot Instances** | EC2 com até 90% desconto, mas pode ser interrompido com 2min de aviso. |
| **AWS Pricing Calculator** | Estimar custo antes de provisionar. |
| **AWS Trusted Advisor** | Análise automática de melhorias (cost, security, performance, fault tolerance). Free Tier: 7 checks; Business support: 100+. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
**Domínio 4 (Billing and Pricing) inteiro é cobrado. Estude:**

- **Free Tier types:** Always Free / 12 Months Free / Trials
- **AWS Pricing principles:** pay as you go, pay less when you reserve, pay less per unit by using more, save more as AWS grows
- **Total Cost of Ownership (TCO)** vs on-prem
- **Pricing modelos:**
  - On-Demand (full price)
  - Reserved (1-3 year commit, 30-75% off)
  - Spot (interruptible, up to 90% off)
  - Savings Plans (mais flexível que RI)
  - Dedicated Hosts (compliance)
- **AWS Organizations** consolidated billing — múltiplas contas, 1 fatura, volume discounts
- **Service-specific pricing:**
  - EC2: por hora/segundo + storage + data transfer
  - S3: storage + requests + transfer out
  - Data Transfer: dentro de mesma AZ free, cross-AZ pago, internet egress pago, ingress free

### Solutions Architect Associate (SAA-C03)
- Quando escolher cada pricing model (workload previsível → RI/SP; pico ocasional → On-Demand; batch tolerante → Spot)
- Custo de transferência (vilão escondido) — VPC peering, NAT Gateway, internet egress
- **Saving design patterns:**
  - VPC Endpoints para S3/DynamoDB (evita NAT)
  - CloudFront → reduz egress
  - S3 Intelligent-Tiering / Glacier para dados frios
  - Lambda em vez de EC2 ocioso

## Riscos / dependências

- **Custo silencioso:** Aurora Serverless v2 cobra mesmo quando você não usa (mínimo 0,5 ACU). Configure auto-pause **se possível** (não disponível em todas as configs Aurora SLv2).
- **NAT Gateway esquecido**: $32/mês fixo + transferência. Se não está usando VPC Connector com subnet privada, **delete o NAT**.
- **Snapshots de RDS antigos** acumulam storage. Lifecycle não aplica a snapshots — você deleta manualmente.
- **CloudWatch Logs com retention infinita** = bomba relógio.
- **Free Tier não é "ilimitado"** — passou de 5GB EBS, 750h EC2, etc., você paga. Acompanhe Free Tier usage report.
- **Cost Anomaly Detection** precisa de ~14 dias de baseline para começar a detectar. Não espere alertas perfeitos no primeiro dia.

## Próximo card

[AWS-018 — Backups + Restore](AWS-018-backups-restore.md)

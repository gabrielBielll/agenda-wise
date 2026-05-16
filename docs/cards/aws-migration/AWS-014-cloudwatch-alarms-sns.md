# [AWS-014] CloudWatch Alarms + SNS — alertas por e-mail quando algo quebra

**Prioridade:** 🟠 Alto
**Fase:** 5 — Observabilidade
**Esforço:** M (meio dia)
**Área:** Infra
**Status:** TODO
**Custo estimado/mês:** $0,10/alarm/mês (10 alarmes grátis Free Tier) + SNS ~$0 (1k emails grátis)

## Contexto

Logs existem mas você não vai ficar olhando 24/7. Precisa ser **avisado** quando:

- Backend tem N erros em X minutos
- Latência P95 > 2s sustained
- CPU/RAM do App Runner > 80%
- Aurora storage > 80%
- 5xx >5% das requests
- Conta AWS gastando demais (já fizemos no [AWS-001](AWS-001-criar-conta-iam-billing.md), refina aqui)

CloudWatch Alarms + SNS resolve isso. SNS = "Simple Notification Service", pub/sub que manda email, SMS, ou trigger Lambda.

## Localização

Recursos a monitorar (todos já existentes):
- App Runner service `deep-saude-backend`
- Aurora cluster `deep-saude-cluster`
- CloudFront distribution
- S3 bucket
- Métrica `DeepSaude/BackendErrors` (criada em [AWS-013](AWS-013-cloudwatch-logs.md))

## Solução proposta

### Passo 1 — Criar SNS Topic

```bash
aws sns create-topic \
  --name deep-saude-alerts \
  --profile deep-saude
```

Anote o `TopicArn` retornado.

### Passo 2 — Inscrever seu email

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --protocol email \
  --notification-endpoint gabrielfurtunatofranca@gmail.com \
  --profile deep-saude
```

Vai chegar email de confirmação — clique. Sem confirmar, alertas não chegam.

> Para SMS use `--protocol sms --notification-endpoint +5511999999999`. Mas SMS cobra ~$0,06/mensagem fora EUA. Email é grátis.

### Passo 3 — Alarmes essenciais (baseline)

#### Alarme 1 — Backend 5xx (App Runner)

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name backend-5xx-rate \
  --alarm-description "Backend retornando 5xx em alta taxa" \
  --metric-name 5xxStatusResponses \
  --namespace AWS/AppRunner \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ServiceName,Value=deep-saude-backend \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --treat-missing-data notBreaching \
  --profile deep-saude
```

> Tradução: "Se em 5 min houver mais de 10 respostas 5xx do backend, alertar".

#### Alarme 2 — Latência P95 alta

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name backend-latency-p95 \
  --metric-name RequestLatency \
  --namespace AWS/AppRunner \
  --extended-statistic p95 \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 2000 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ServiceName,Value=deep-saude-backend \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --profile deep-saude
```

> "P95 > 2000ms por 2 períodos de 5min = alertar"

#### Alarme 3 — Erros no log (BackendErrors do metric filter)

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name backend-error-logs \
  --metric-name BackendErrors \
  --namespace DeepSaude \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --treat-missing-data notBreaching \
  --profile deep-saude
```

> "Se aparecerem 5+ logs `level=ERROR` em 5min, alertar"

#### Alarme 4 — Aurora CPU alta

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name aurora-cpu-high \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBClusterIdentifier,Value=deep-saude-cluster \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --profile deep-saude
```

#### Alarme 5 — Aurora storage (Aurora Serverless v2 já auto-escala, mas pra RDS clássico):

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name rds-storage-low \
  --metric-name FreeStorageSpace \
  --namespace AWS/RDS \
  --statistic Average \
  --period 600 \
  --evaluation-periods 1 \
  --threshold 5368709120 \
  --comparison-operator LessThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=deep-saude-instance-1 \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --profile deep-saude
```

> `5368709120` bytes = 5 GiB. Alerta quando free space < 5GB.

#### Alarme 6 — CloudFront 5xx error rate

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name cloudfront-5xx-rate \
  --metric-name 5xxErrorRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DistributionId,Value=<dist-id> Name=Region,Value=Global \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --profile deep-saude
```

> CloudFront métricas só em `us-east-1` mesmo sendo global.

### Passo 4 — Dashboard único

Console → CloudWatch → **Dashboards** → **Create dashboard** → `deep-saude-overview`:

Widgets a adicionar:
- App Runner: requests/min, 5xx, P95 latency, CPU
- Aurora: CPU, connections, FreeableMemory, ServerlessDatabaseCapacity
- CloudFront: requests, 4xx rate, 5xx rate, bytes downloaded
- S3: BucketSizeBytes (storage gauge)
- Custom metric: BackendErrors timeline

Use **Math expressions** para criar métricas derivadas (ex: success rate = (Requests - 5xx) / Requests).

### Passo 5 — Composite alarm (avançado, opcional)

Para evitar alerta storm: criar **composite alarm** que dispara só quando **vários** alarmes individuais estão em ALARM:

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name backend-degraded \
  --alarm-description "Backend está degradado (múltiplos sintomas)" \
  --alarm-rule "ALARM(backend-5xx-rate) AND ALARM(backend-latency-p95)" \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:deep-saude-alerts \
  --profile deep-saude
```

### Passo 6 — Diferenciar severidade (avançado)

Crie 2 SNS topics: `deep-saude-alerts-critical` (telefone via PagerDuty) e `deep-saude-alerts-info` (só email). Alarmes mais críticos vão para o primeiro.

## Critérios de aceitação

- [ ] SNS Topic `deep-saude-alerts` criado com email confirmado
- [ ] 6 alarmes baseline criados (5xx, latency, errors, CPU Aurora, storage, CloudFront)
- [ ] Recebeu email de teste (forçando alarme manualmente: `aws cloudwatch set-alarm-state ...`)
- [ ] Dashboard `deep-saude-overview` criado com widgets
- [ ] Alarmes em status `OK` ou `INSUFFICIENT_DATA` (não em `ALARM` quando tudo está saudável)

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **CloudWatch Alarms** | Regra "métrica X cruzou threshold Y por Z períodos = trigger ação". |
| **Métrica** | Série temporal de valores numéricos (CPU%, count, latency, etc.). |
| **Dimensão** | Tag/filtro da métrica (ex: ServiceName=deep-saude-backend). |
| **Statistic** | Como agregar pontos: Sum, Average, Min, Max, p50/p90/p95/p99. |
| **Period** | Janela de agregação (10s, 60s, 5min, 1h). |
| **Evaluation periods** | Quantos períodos seguidos precisam violar antes de virar ALARM. |
| **Treat missing data** | Como tratar gaps: missing, notBreaching, breaching, ignore. |
| **SNS (Simple Notification Service)** | Pub/sub messaging. Publishers → Topic → Subscribers (email, SMS, Lambda, SQS, HTTPS). |
| **SQS (Simple Queue Service)** | Filas de mensagens. SNS pode entregar em SQS para processamento posterior. |
| **EventBridge** | Antigo CloudWatch Events. Bus de eventos para integrações cross-service. |
| **Composite alarm** | Alarme que combina outros alarmes com lógica booleana. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- CloudWatch como ferramenta de monitoring principal
- SNS como serviço de notificações
- Saber a diferença entre **CloudWatch Logs**, **CloudWatch Metrics**, **CloudWatch Alarms**, **CloudWatch Events/EventBridge**

### Solutions Architect Associate (SAA-C03)
**Cobrado em muitos cenários.** Estudar:

- **SNS vs SQS** (mensagem entregue para N subscribers vs fila 1:1)
- **SNS fanout pattern** (SNS → múltiplas SQS para processamento desacoplado)
- **SQS Standard vs FIFO** (FIFO garante ordem e exactly-once, mas 300 msg/s vs ilimitado)
- **Dead Letter Queue (DLQ)** — para mensagens que falharam N vezes
- **EventBridge** — schemas, archives, replays, custom event buses
- **CloudWatch Synthetics** — canários (testes sintéticos contínuos do app)
- **CloudWatch ServiceLens / X-Ray** — distributed tracing
- **CloudWatch Anomaly Detection** — ML detecta padrão anormal automaticamente
- **CloudWatch Contributor Insights**

**Cenário clássico:** "Aplicação multi-tier, como notificar admin quando upload finaliza?" → S3 Event → SNS → email/Lambda.

## Riscos / dependências

- **Alert fatigue:** se você criar 30 alarmes barulhentos, vai mutar todos. Comece com 5-6 críticos e expanda.
- **Email atrasa 30-60s.** Não é canal para incidentes que exigem reação imediata. Para crítico: Slack via webhook (Lambda) ou PagerDuty.
- **Free Tier de alarms:** 10 alarms grátis. Cada extra $0,10/mês. 50 alarmes = $4/mês.
- **Métricas detalhadas (high-resolution, 1s)** cobram caro. 5min é o suficiente pra maioria.
- **`treat-missing-data`** importa: App Runner pausado não emite métrica = `INSUFFICIENT_DATA`. Use `notBreaching` para não disparar falso positivo.
- **Compliance:** alertas com nome de paciente NÃO no email/SMS. Logue ID, não nome.

## Próximo card

[AWS-015 — GitHub Actions com OIDC](AWS-015-github-actions-oidc.md)

# [AWS-013] CloudWatch Logs — coletar logs estruturados de backend e frontend

**Prioridade:** 🟠 Alto
**Fase:** 5 — Observabilidade
**Esforço:** M (meio dia)
**Área:** Infra / Backend / Frontend
**Status:** TODO
**Custo estimado/mês:** $0,50/GB ingest + $0,03/GB storage (Free Tier: 5GB ingest + 5GB armazenado, sempre)

## Contexto

App Runner e Amplify **já mandam logs para CloudWatch automaticamente** — sem configuração. Mas:

1. Logs do backend Clojure provavelmente são **texto puro**, difícil de filtrar.
2. Logs do frontend Next.js só capturam `stdout`/`stderr` do processo Node.
3. Você não tem **retention policy** definida — logs acumulam indefinidamente, custo cresce.
4. Não há **structured logging** (JSON) para queries com CloudWatch Logs Insights.

Este card resolve isso: estrutura os logs, define retention, e ensina a usar Logs Insights.

> Relacionado: [ROB-008 — Logs estruturados](../sprint-2-robustness/ROB-008-logs-estruturados.md) já cobre o trabalho no código. Este card complementa do lado AWS.

## Localização

- Backend Clojure: dependência `org.clojure/tools.logging` + `ch.qos.logback/logback-classic` (logback é padrão JVM)
- Frontend Next.js: `console.log` no SSR vai para CloudWatch via Amplify

## Solução proposta

### Passo 1 — Verificar log groups que já existem

Após App Runner e Amplify rodarem, esses log groups devem existir:

```bash
aws logs describe-log-groups --profile deep-saude \
  --query 'logGroups[*].[logGroupName,retentionInDays,storedBytes]' \
  --output table
```

Você verá algo como:
```
/aws/apprunner/deep-saude-backend/...
/aws/amplify/dXXXXXXXX
```

### Passo 2 — Definir retention policy

Por default, logs ficam para sempre. Para ambientes sem compliance estrita:

```bash
# Backend (alta volumetria) — 30 dias
aws logs put-retention-policy \
  --log-group-name /aws/apprunner/deep-saude-backend/<service-id>/application \
  --retention-in-days 30 \
  --profile deep-saude

# Frontend (menos volumoso) — 30 dias
aws logs put-retention-policy \
  --log-group-name /aws/amplify/<app-id> \
  --retention-in-days 30 \
  --profile deep-saude
```

Para todos de uma vez:
```bash
for LG in $(aws logs describe-log-groups --query 'logGroups[*].logGroupName' --output text --profile deep-saude); do
  aws logs put-retention-policy --log-group-name "$LG" --retention-in-days 30 --profile deep-saude
done
```

> Compliance saúde (LGPD/HIPAA) pode exigir retention maior. Confira antes.

### Passo 3 — Structured logging no backend Clojure

Adicione em `project.clj`:
```clojure
[ch.qos.logback/logback-classic "1.5.6"]
[net.logstash.logback/logstash-logback-encoder "7.4"]
[org.clojure/tools.logging "1.3.0"]
```

Crie `resources/logback.xml`:
```xml
<configuration>
  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
      <includeContext>true</includeContext>
      <customFields>{"app":"deep-saude-backend","env":"${APP_ENV:-development}"}</customFields>
    </encoder>
  </appender>

  <root level="INFO">
    <appender-ref ref="STDOUT" />
  </root>
</configuration>
```

Cada log linha vai para stdout como JSON:
```json
{"@timestamp":"2026-05-15T22:30:01.234Z","level":"INFO","logger":"deep-saude-backend.core","message":"User logged in","app":"deep-saude-backend","env":"production","user_id":"abc-123"}
```

CloudWatch ingere e indexa automaticamente os campos.

No código Clojure:
```clojure
(require '[clojure.tools.logging :as log])

;; Em handlers:
(log/info "User logged in" {:user-id user-id :clinica-id clinica-id})
;; logback-classic intercepta e formata como JSON
```

**Importantíssimo:** nunca logue `senha`, `senha_hash`, `JWT token completo`, dados de paciente. Veja [SEC-009](../sprint-1-security/SEC-009-remover-logs-sensíveis.md).

### Passo 4 — Structured logging no frontend Next.js

Para Server Components e API routes em Next.js, instale `pino` (logger rápido, output JSON):

```bash
cd deep-saude-plataforma-front-end
npm install pino
```

Crie `src/lib/logger.ts`:
```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    app: "deep-saude-frontend",
    env: process.env.NODE_ENV,
  },
  timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
});
```

Uso:
```typescript
import { logger } from "@/lib/logger";

logger.info({ userId: session.user.id }, "Dashboard loaded");
logger.error({ err }, "Failed to fetch patients");
```

> `console.log` em Client Components não chega ao CloudWatch (roda no browser). Pra capturar erros do client, use Sentry ([OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md)).

### Passo 5 — Testar Logs Insights

Console → CloudWatch → **Logs Insights** → selecione log group do backend → exemplo de query:

```
fields @timestamp, level, message, user_id, @logStream
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

Outras queries úteis:

```
# Erros nos últimos 5 min agrupados por mensagem
fields @timestamp, message
| filter level = "ERROR"
| stats count() by message

# Latência por endpoint (se você logar request duration)
fields @timestamp, path, duration_ms
| stats avg(duration_ms), max(duration_ms), pct(duration_ms, 95) by path
| sort avg desc

# Quantos logins/hora
fields @timestamp
| filter message = "User logged in"
| stats count() by bin(1h)
```

### Passo 6 — Salvar queries comuns

CloudWatch Logs Insights permite salvar queries:
- Console → Logs Insights → Saved queries → Save query
- Nome: "Backend errors última hora"

Crie 3-5 saved queries que você usa toda semana.

### Passo 7 — Metric Filter (transformar log em métrica)

Se você quer alertar quando "ERROR" aparece >10x em 5min:

```bash
aws logs put-metric-filter \
  --log-group-name /aws/apprunner/deep-saude-backend/<id>/application \
  --filter-name backend-errors \
  --filter-pattern '{ $.level = "ERROR" }' \
  --metric-transformations \
    metricName=BackendErrors,metricNamespace=DeepSaude,metricValue=1,defaultValue=0 \
  --profile deep-saude
```

Agora a métrica `DeepSaude/BackendErrors` no CloudWatch é alimentada. Em [AWS-014](AWS-014-cloudwatch-alarms-sns.md) criamos alarm em cima dela.

## Critérios de aceitação

- [ ] Retention policy aplicada (≤30 dias para dev/staging, definir para prod)
- [ ] Backend Clojure emite JSON estruturado via logback + logstash encoder
- [ ] Frontend Next.js emite JSON estruturado via pino
- [ ] Sem dados sensíveis nos logs (sem senha, hash, paciente)
- [ ] Pelo menos 3 saved queries no CloudWatch Logs Insights
- [ ] Metric filter `BackendErrors` criado

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **CloudWatch Logs** | Serviço de coleta e busca de logs. Centraliza logs de todos os serviços AWS. |
| **Log Group** | Container lógico de log streams. Geralmente por aplicação/ambiente. |
| **Log Stream** | Sequência de eventos de uma instância/source. |
| **Log Event** | Uma linha de log + timestamp + metadata. |
| **Retention Policy** | Quanto tempo manter logs (1 dia a 10 anos ou never expire). |
| **Logs Insights** | Query language para logs. Sintaxe `fields | filter | stats | sort | limit`. |
| **Metric Filter** | Regra "extraia métrica X quando log match pattern Y". Cria CloudWatch Metric. |
| **Subscription Filter** | Encaminhar logs em real-time para Kinesis, Lambda, ElasticSearch. |
| **Embedded Metric Format (EMF)** | Formato JSON que CloudWatch reconhece como métrica + log ao mesmo tempo. Sem cost extra. |
| **Log Anomaly Detection** | ML que detecta padrões anômalos em logs (feature mais nova). |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- CloudWatch é o serviço de monitoring/logging principal
- Diferença entre **CloudWatch Logs** (logs) e **CloudWatch Metrics** (métricas numéricas) e **CloudTrail** (auditoria de API calls)

### Solutions Architect Associate (SAA-C03)
- **CloudWatch Logs + Metric Filter + Alarm** — padrão clássico, cobrado
- **CloudWatch Logs Insights** — query syntax básico
- **Subscription Filters** — para fan-out de logs (Kinesis, Lambda)
- **Cross-account log aggregation**
- **Log Group encryption** (KMS)
- **EventBridge** vs CloudWatch Events (renomeado)
- **Centralized logging architectures** com Kinesis Firehose → S3 + Athena

## Riscos / dependências

- **Custo de ingest é o vilão.** $0,50/GB pode somar rapidamente se você logar muito. Backend chatty (100 reqs/s × 1KB log cada × 86400s = ~8GB/dia = $4/dia = $120/mês). Reduza verbosidade em prod.
- **Compressão não reduz cost de ingest** — é cobrado por bytes ingeridos, não comprimidos.
- **PII em logs = problema LGPD.** Audite metric filters e logs antes de virar produção real.
- **`console.log` em Client Component** não vai pra CloudWatch — roda no browser. Para erros client, use Sentry.
- **CloudWatch Logs ≠ S3.** Para retention longa (1+ ano) com queries ocasionais, **exportar para S3** + usar Athena é 10x mais barato.

## Próximo card

[AWS-014 — CloudWatch Alarms + SNS](AWS-014-cloudwatch-alarms-sns.md)

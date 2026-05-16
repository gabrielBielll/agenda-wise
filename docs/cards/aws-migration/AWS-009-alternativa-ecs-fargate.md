# [AWS-009] (Opcional, certificação) Mesmo deploy em ECS Fargate + ALB

**Prioridade:** 🟢 Baixo (opcional)
**Fase:** 2 — Backend
**Esforço:** XL (>2 dias)
**Área:** Infra / Backend
**Status:** TODO
**Custo estimado/mês:** ~$15-30 (Fargate) + ~$18 (ALB fixo) ≈ ~$33-48

## Contexto

Este card **não é necessário** se o [AWS-008](AWS-008-app-runner-backend.md) (App Runner) já está rodando. Mas é **extremamente valioso para a prova SAA-C03** porque ECS Fargate + ALB cobre 5-10 questões diretamente.

Aqui você refaz o deploy do backend usando o **caminho clássico** da AWS para containers: ECS + Fargate + ALB. Você vai entender o que o App Runner esconde de você.

> Recomendação: faça este card **após** ter o produto rodando em App Runner. Considere como projeto paralelo de estudo, não de migração. Se quiser, depois pode até migrar de App Runner pra ECS por economia (Fargate é mais barato em workloads previsíveis), mas isso é otimização tardia.

## Localização

Mesmos arquivos do [AWS-008](AWS-008-app-runner-backend.md): imagem ECR + secrets + RDS.

## Solução proposta

### Passo 1 — Conceitos antes da execução

Você vai criar (ou usar default):

```
       VPC
        │
    ┌───┴───┐
    │       │
 Public  Public
 Subnet  Subnet     (2 AZs para HA)
  AZ-a   AZ-b
    │       │
    └───┬───┘
        │
   ┌────┴────────────┐
   │   ALB (LB)      │  ← entry point HTTPS
   │   listener 443  │
   └────────┬────────┘
            │
       Target Group
       (deep-saude-backend-tg)
            │
   ┌────────┴─────────┐
   │  ECS Service     │
   │  ───────────     │
   │  Fargate tasks   │  ← seus containers
   │  (1-3 instances) │
   └──────────────────┘
```

Componentes:
- **ECS Cluster** — agrupamento lógico
- **Task Definition** — "Dockerfile + recursos" (CPU, RAM, env vars, secrets, image)
- **Service** — garante que N tasks estão rodando, faz deploys rolling
- **ALB (Application Load Balancer)** — distribui tráfego HTTP/HTTPS
- **Target Group** — endpoints que o ALB roteia
- **Fargate** — modo de execução serverless (você não gerencia EC2)

### Passo 2 — Criar ECS Cluster

```bash
aws ecs create-cluster --cluster-name deep-saude-cluster --profile deep-saude
```

### Passo 3 — Criar Task Definition

```bash
cat > task-def.json <<EOF
{
  "family": "deep-saude-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<account-id>:role/DeepSaudeBackendInstanceRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "APP_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "AWS_REGION", "value": "us-east-1" }
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:deep-saude/prod/jwt-secret-xxxxx"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/deep-saude-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

# Criar log group antes:
aws logs create-log-group --log-group-name /ecs/deep-saude-backend --profile deep-saude

# Garantir ecsTaskExecutionRole existe (geralmente já existe — se não, AWS docs ensinam a criar):
# https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html

aws ecs register-task-definition --cli-input-json file://task-def.json --profile deep-saude
```

> Note `secrets` no container definition — ECS injeta o valor do Secrets Manager como variável de env automaticamente (não precisa SDK chamando `GetSecretValue` em runtime).

### Passo 4 — Criar ALB

```bash
# 1. Security Group para ALB
aws ec2 create-security-group \
  --group-name deep-saude-alb-sg \
  --description "ALB SG" \
  --vpc-id <vpc-id> \
  --profile deep-saude
# permitir 80 e 443 de qualquer lugar
aws ec2 authorize-security-group-ingress \
  --group-id <sg-alb-id> --protocol tcp --port 80 --cidr 0.0.0.0/0 --profile deep-saude
aws ec2 authorize-security-group-ingress \
  --group-id <sg-alb-id> --protocol tcp --port 443 --cidr 0.0.0.0/0 --profile deep-saude

# 2. SG para Fargate tasks (só aceita do ALB)
aws ec2 create-security-group \
  --group-name deep-saude-fargate-sg \
  --description "Fargate tasks SG" \
  --vpc-id <vpc-id> \
  --profile deep-saude
aws ec2 authorize-security-group-ingress \
  --group-id <sg-fargate-id> --protocol tcp --port 3000 \
  --source-group <sg-alb-id> --profile deep-saude

# 3. Criar ALB
aws elbv2 create-load-balancer \
  --name deep-saude-alb \
  --subnets <subnet-az1> <subnet-az2> \
  --security-groups <sg-alb-id> \
  --type application \
  --scheme internet-facing \
  --profile deep-saude

# Anote o ARN do ALB.

# 4. Target Group
aws elbv2 create-target-group \
  --name deep-saude-backend-tg \
  --protocol HTTP --port 3000 \
  --vpc-id <vpc-id> \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --profile deep-saude

# 5. Listener (HTTP por enquanto; HTTPS no AWS-012)
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=<target-group-arn> \
  --profile deep-saude
```

### Passo 5 — Criar ECS Service

```bash
aws ecs create-service \
  --cluster deep-saude-cluster \
  --service-name deep-saude-backend \
  --task-definition deep-saude-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-az1>,<subnet-az2>],securityGroups=[<sg-fargate-id>],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=<target-group-arn>,containerName=backend,containerPort=3000" \
  --health-check-grace-period-seconds 60 \
  --profile deep-saude
```

> `assignPublicIp=ENABLED` é necessário se você está em **public subnet** para puxar a imagem do ECR pela internet. Para private subnet, precisa NAT Gateway ou VPC Endpoint para ECR.

### Passo 6 — Configurar Auto Scaling

```bash
# Registrar scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/deep-saude-cluster/deep-saude-backend \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 --max-capacity 4 \
  --profile deep-saude

# Policy: target CPU 70%
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/deep-saude-cluster/deep-saude-backend \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-target-70 \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 60,
    "ScaleOutCooldown": 60
  }' \
  --profile deep-saude
```

### Passo 7 — Testar

```bash
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names deep-saude-alb \
  --query 'LoadBalancers[0].DNSName' --output text \
  --profile deep-saude)

curl http://$ALB_DNS/health
```

### Passo 8 — Comparar com App Runner

| Aspecto | App Runner | ECS Fargate + ALB |
|---|---|---|
| Componentes criados | 1 | ~8 (cluster, task def, service, ALB, TG, listener, 2 SGs) |
| Tempo até primeiro deploy | ~10min | ~1-2h |
| HTTPS automático | ✅ | Precisa ACM + listener 443 |
| Auto scaling automático | ✅ | Você configura |
| Logs em CloudWatch | ✅ automático | Configura no task def |
| Custo mínimo/mês | ~$25 (com pause) | ~$33 + ALB fixo |
| Flexibilidade | Limitada | Total |
| Para SAA | Pouco aparece | Aparece muito |

## Critérios de aceitação

- [ ] ECS Cluster, Task Definition, Service, ALB e Target Group criados
- [ ] Tasks rodando saudáveis (passed health check)
- [ ] ALB DNS responde 200 em `/health`
- [ ] Auto scaling configurado (1-4 tasks por CPU)
- [ ] Logs do container chegam em `/ecs/deep-saude-backend` no CloudWatch
- [ ] Você consegue explicar a diferença entre Task, Service, Cluster, Target Group, ALB

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **ECS (Elastic Container Service)** | Orquestrador de containers AWS, mais simples que Kubernetes. |
| **Task Definition** | "Receita" do container (image, CPU, RAM, env, secrets, logs). Versionado. |
| **Task** | Instância em execução de uma Task Definition. |
| **Service** | Wrapper que mantém N tasks rodando, faz deploy rolling, integra com LB. |
| **Cluster** | Agrupamento lógico de tasks/services. Pode ter vários services. |
| **Fargate** | Launch type serverless. Você não vê/gerencia EC2 subjacente. |
| **EC2 launch type** | Alternativa ao Fargate: você gerencia EC2 hosts no cluster. |
| **ALB (Application Load Balancer)** | Layer 7 LB. Roteia HTTP/HTTPS, path-based, host-based, sticky sessions. |
| **Target Group** | Grupo de IPs/instâncias que o ALB roteia. Tasks Fargate se registram aqui. |
| **Listener** | Configuração "porta + protocolo + ação" do ALB. |
| **Application Auto Scaling** | Serviço genérico de scaling (ECS, DynamoDB, Spot Fleet). |

## Aprendizado para certificação

### Solutions Architect Associate (SAA-C03)
**Este card sozinho cobre ~8 questões da prova.** Tópicos diretos:

- **ALB vs NLB vs GLB vs CLB:**
  - ALB: Layer 7 (HTTP), path/host-based routing, WebSocket, redirect
  - NLB: Layer 4 (TCP/UDP), low latency, static IP, milhões de RPS
  - GLB: Layer 3 (gateway), insere firewalls/security appliances
  - CLB: legado, evitar
- **ECS deployment strategies:** rolling, blue/green (com CodeDeploy), canary
- **Task placement strategies:** binpack, spread, random
- **Service Discovery** (Cloud Map)
- **Capacity Providers** (FARGATE, FARGATE_SPOT, EC2 ASG)
- **Networking modes:** `awsvpc` (cada task tem ENI próprio), `bridge`, `host`, `none`
- **Persistent storage:** EFS (compartilhado entre tasks), EBS (não em Fargate)
- **AppMesh** (service mesh)

**Cenários típicos da prova:**
- "Como migrar app monolítico para containers?" → ECS Fargate
- "Como reduzir custo de workload com tolerância a interrupção?" → Fargate Spot
- "Aplicação precisa de IP estático" → NLB (não ALB)
- "Roteamento HTTP por path" → ALB

## Riscos / dependências

- **Complexidade desproporcional ao MVP.** Não faça este card para acelerar o launch — faça **depois** que App Runner está rodando, como aprendizado.
- **ALB custa fixo ~$18/mês** mesmo sem tráfego (~$0,025/h). Se você for usar este caminho em produção, conte isso.
- **Auto Scaling demora 2-3min** para reagir a CPU spike — o "pico" passa antes de ter capacidade. Considere CloudWatch alarms com métricas custom para reagir mais rápido.
- **VPC Endpoints** para ECR/CloudWatch economizam NAT Gateway em private subnets — mais caro upfront mas escala melhor.
- Se decidir migrar de App Runner para ECS em produção: cuidado com janela. Faça o ECS rodar em paralelo, troque DNS para apontar pro ALB, deixe App Runner como fallback por 1 semana.

## Próximo card

Volte para [AWS-010 — Deploy do Next.js no Amplify Hosting](AWS-010-amplify-hosting-frontend.md)

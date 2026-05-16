# [AWS-008] Deploy do backend Clojure no AWS App Runner

**Prioridade:** 🔴 Crítico
**Fase:** 2 — Backend
**Esforço:** M (meio dia)
**Área:** Infra / Backend
**Status:** TODO
**Custo estimado/mês:** ~$25-50 (1 vCPU + 2GB RAM, auto-pause após 15min ocioso)

## Contexto

App Runner é o serviço **mais simples** da AWS para rodar containers em produção. Você dá uma imagem ECR, ele provisiona compute, load balancer, HTTPS, auto-scaling, deploys com zero downtime. Tudo gerenciado.

Para o backend Clojure do Deep Saúde, é a opção ideal pra começar — sem mexer em VPC, sem ALB, sem target groups, sem ECS task definitions.

> O [AWS-009](AWS-009-alternativa-ecs-fargate.md) faz a **mesma coisa em ECS Fargate** como exercício de certificação. Ignore-o agora.

## Localização

- Imagem ECR criada em [AWS-007](AWS-007-ecr-imagem-backend.md)
- Secrets criados em [AWS-006](AWS-006-secrets-manager.md)
- Aurora endpoint do [AWS-004](AWS-004-rds-aurora-postgres.md)
- S3 bucket do [AWS-005](AWS-005-s3-bucket-storage.md)

## Solução proposta

### Passo 1 — Criar a IAM Role do App Runner

O service precisa de **duas roles**:

1. **Access Role** — permite App Runner puxar imagem do ECR
2. **Instance Role** — usada pelo app rodando (acessar Secrets Manager, S3, etc.)

#### Access Role (pull do ECR)

```bash
cat > apprunner-ecr-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "build.apprunner.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name AppRunnerECRAccessRole \
  --assume-role-policy-document file://apprunner-ecr-trust.json \
  --profile deep-saude

aws iam attach-role-policy \
  --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess \
  --profile deep-saude
```

#### Instance Role (que o app usa em runtime)

```bash
cat > apprunner-instance-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "tasks.apprunner.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name DeepSaudeBackendInstanceRole \
  --assume-role-policy-document file://apprunner-instance-trust.json \
  --profile deep-saude

# Anexar as policies criadas anteriormente
aws iam attach-role-policy \
  --role-name DeepSaudeBackendInstanceRole \
  --policy-arn arn:aws:iam::<account-id>:policy/DeepSaudeBackendSecretsAccess \
  --profile deep-saude

aws iam attach-role-policy \
  --role-name DeepSaudeBackendInstanceRole \
  --policy-arn arn:aws:iam::<account-id>:policy/DeepSaudeBackendS3Access \
  --profile deep-saude
```

### Passo 2 — Criar o App Runner Service

Vamos usar o Console (mais visual). Console CLI tem 30+ flags.

1. Console → **App Runner** → **Create service**
2. **Source:**
   - Repository type: **Container registry**
   - Provider: **Amazon ECR**
   - Container image URI: `123456789012.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend:latest`
   - Deployment trigger: **Automatic** (deploya ao push de `latest` — muito útil!) ou **Manual**
   - ECR access role: **Use existing service role** → `AppRunnerECRAccessRole`
3. **Service settings:**
   - Service name: `deep-saude-backend`
   - Virtual CPU & memory: **1 vCPU / 2 GB** (suficiente para Clojure + JVM)
   - Environment variables:
     ```
     APP_ENV=production
     PORT=3000
     AWS_REGION=us-east-1
     ```
     > Não adicione secrets aqui! Eles vêm do Secrets Manager via SDK.
   - Port: **3000** (porta do Ring/Jetty no [project.clj](../../../deep-saude-plataforma-api/deep-saude-backend/project.clj))
   - Instance role: `DeepSaudeBackendInstanceRole`
4. **Auto scaling:**
   - Min size: **1**
   - Max size: **3** (para começar)
   - Max concurrency: **100** requests por instance
5. **Health check:**
   - Protocol: HTTP
   - Path: `/health` (precisa existir no backend! Se não tem, vai falhar — implementar antes ou usar TCP)
   - Interval: 10s, timeout 5s, healthy threshold 1, unhealthy 5
6. **Security:**
   - AWS KMS key: default (AWS-managed)
7. **Networking:**
   - Outgoing network traffic: **Custom VPC** (apenas se RDS está em VPC privada — para nossa configuração default VPC, **Public access** funciona)

   > **Atenção:** App Runner roda em VPC gerenciada pela AWS. Para alcançar Aurora na **sua VPC**, precisa de **VPC Connector**. Sem isso, App Runner sai pela internet e o Aurora deve estar accessible (que é nosso caso atual). Em produção real você prefere VPC Connector + Aurora privado.

8. **Observability:**
   - Tracing: enable AWS X-Ray (opcional, $5/milhão de traces — pode ligar depois)

9. **Create & deploy**

### Passo 3 — Aguardar deploy

Provisionamento + pull da imagem leva ~3-5 minutos. Status passa por: `OPERATION_IN_PROGRESS` → `RUNNING`.

A URL é algo como `https://abc123xyz.us-east-1.awsapprunner.com`. HTTPS automático.

### Passo 4 — Smoke tests

```bash
APP_URL="https://abc123xyz.us-east-1.awsapprunner.com"

# Health check
curl $APP_URL/health
# {"status":"ok"}

# Endpoint público (ex: GET papeis)
curl $APP_URL/api/papeis

# Login
curl -X POST $APP_URL/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@deepsaude.com","senha":"<senha>"}'
```

### Passo 5 — Restringir Security Group do RDS

Agora o App Runner está rodando. Vamos **fechar o RDS** para só receber tráfego do App Runner.

App Runner sem VPC Connector sai pela internet com **IP dinâmico** — não dá pra prender SG por IP. Duas opções:

#### Opção A — Configurar VPC Connector (recomendado)

1. Console → App Runner → seu service → **Configuration** → **Networking**
2. Outgoing network → **Custom VPC**
3. Create new VPC connector:
   - Subnets: as subnets privadas (ou public, da default VPC)
   - Security groups: criar/usar SG `deep-saude-apprunner-sg`
4. Aguardar update do service (~3min)
5. Agora atualize o SG do RDS:
   ```bash
   aws ec2 authorize-security-group-ingress \
     --group-id <sg-rds-id> \
     --protocol tcp --port 5432 \
     --source-group <sg-apprunner-id> \
     --profile deep-saude
   
   aws ec2 revoke-security-group-ingress \
     --group-id <sg-rds-id> \
     --protocol tcp --port 5432 \
     --cidr <seu-ip>/32 \
     --profile deep-saude
   ```

#### Opção B — Aurora público (menos seguro, mais simples para dev)

Mantém `Publicly Accessible = Yes` no RDS, mas com SG só aceita do CIDR de App Runner (que não é único). Não recomendado em prod.

### Passo 6 — Apontar frontend para nova URL do backend

Por enquanto, atualizar `NEXT_PUBLIC_API_URL` no Firebase para apontar para a URL do App Runner:
```
NEXT_PUBLIC_API_URL=https://abc123xyz.us-east-1.awsapprunner.com
```

Mais tarde, [AWS-012](AWS-012-route53-acm-dominio.md) vai dar domínio `api.deepsaude.com.br`.

### Passo 7 — Configurar custom domain (opcional, antes do AWS-012)

App Runner → service → **Custom domains** → **Link domain** → digitar `api.deepsaude.com.br`. Ele gera certificados ACM + registros DNS para você adicionar no provider de DNS atual. Vai ser feito direito no [AWS-012](AWS-012-route53-acm-dominio.md).

## Critérios de aceitação

- [ ] Roles `AppRunnerECRAccessRole` e `DeepSaudeBackendInstanceRole` criadas
- [ ] Service `deep-saude-backend` rodando em status `RUNNING`
- [ ] Endpoint HTTPS responde 200 em `/health`
- [ ] Login funciona via curl com credenciais reais
- [ ] App Runner consegue ler Secrets Manager (não dá erro 500 por causa de secrets)
- [ ] VPC Connector configurado (Opção A) e SG do RDS restringido
- [ ] Frontend (ainda no Firebase) consome essa nova URL com sucesso
- [ ] Logs do app aparecem em CloudWatch Logs (default)

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **App Runner** | PaaS de containers totalmente gerenciado. Pull de ECR, scale, HTTPS, LB tudo automático. |
| **Service Role** | IAM Role que o serviço AWS assume para fazer ações em seu nome (ex: pull ECR). |
| **Instance Role** | IAM Role usada pelo container em runtime (substitui credenciais hardcoded). |
| **VPC Connector** | Recurso do App Runner que conecta o service à sua VPC privada (para falar com RDS, ElastiCache, etc.). |
| **Auto-pause** | App Runner pausa instâncias após 15min ocioso. Free mode resume on demand (1ª request demora). |
| **Provisioned concurrency** | Manter instâncias quentes mesmo em ócio (cobra mais). |
| **Trust policy** | Documento JSON que define qual serviço pode assumir uma role (`sts:AssumeRole`). |
| **ARN (Amazon Resource Name)** | Identificador único de qualquer recurso AWS. Formato: `arn:aws:<service>:<region>:<account>:<resource>`. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Compute opções: EC2, Lambda, ECS, App Runner, Beanstalk — saber para que serve cada
- Modelo de pricing (pay-per-use, instâncias on-demand vs reserved vs spot — não em App Runner, mas em EC2)

### Solutions Architect Associate (SAA-C03)
**App Runner aparece pouco na prova** (é serviço relativamente novo). O que aparece muito é o que ele esconde:
- **ELB (Elastic Load Balancer):** ALB vs NLB vs GLB. App Runner usa ALB por trás.
- **Auto Scaling Groups (ASG):** scaling policies (target tracking, step, simple)
- **ECS Fargate:** task definitions, services, clusters
- **EKS** (Kubernetes)
- **Elastic Beanstalk:** abstração PaaS mais antiga

**Estude as diferenças entre App Runner / Elastic Beanstalk / ECS / EKS / Lambda** — questão clássica "Qual serviço escolher para X?"

## Riscos / dependências

- **App Runner cobra por vCPU-hora + GB-hora** mesmo ocioso (a menos que auto-pause). 1 vCPU + 2GB rodando 24/7 = ~$25-30/mês. Auto-pause ajuda mas cold start na 1ª request.
- **JVM cold start:** primeiro `GetSecretValue` + abrir pool JDBC pode levar 5-10s. Considere health check de TCP em vez de HTTP enquanto isso.
- **Sem `/health` no backend:** se você não tem endpoint `/health` ainda, App Runner marca o service como unhealthy e fica em loop de restart. Solução rápida: health check `TCP` na porta 3000 até implementar o endpoint.
- **VPC Connector adiciona ~30s no deploy** e usa ENIs (Elastic Network Interfaces) — verifique limite de ENIs na sua conta se subir muitos services.
- **Dependência crítica:** funciona somente se [AWS-004](AWS-004-rds-aurora-postgres.md), [AWS-005](AWS-005-s3-bucket-storage.md), [AWS-006](AWS-006-secrets-manager.md), [AWS-007](AWS-007-ecr-imagem-backend.md) estão completos.

## Próximo card

[AWS-010 — Deploy do Next.js no Amplify Hosting](AWS-010-amplify-hosting-frontend.md)
(O AWS-009 é opcional/alternativo)

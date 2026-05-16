# [AWS-015] GitHub Actions com OIDC → push ECR + trigger App Runner/Amplify

**Prioridade:** 🟡 Médio
**Fase:** 6 — CI/CD
**Esforço:** M (meio dia)
**Área:** Infra / CI/CD
**Status:** TODO
**Custo estimado/mês:** $0 (GitHub Actions free tier: 2000 min/mês para repos privados; AWS OIDC sem custo)

## Contexto

Hoje o deploy do backend é manual (`./push-backend.sh` do [AWS-007](AWS-007-ecr-imagem-backend.md)). Amplify já tem auto-deploy do GitHub. Vamos automatizar o backend também.

**Por que OIDC e não access keys?** Access keys do GitHub Secrets:
- Permanentes — se vazarem, comprometem até você revogar
- Não rastreáveis — sem audit trail granular

**OIDC (OpenID Connect)** entre GitHub e AWS:
- GitHub Actions assume **IAM Role** temporária (1h)
- AWS valida via OIDC provider que o request vem do seu repo/branch
- Sem secrets armazenados no GitHub
- Audit trail via CloudTrail (cada AssumeRole logado)

> Este é o **padrão moderno** AWS + GitHub. Aparece em entrevistas DevOps e em SAA-C03.

## Localização

- Repo GitHub `gabrielBielll/deep-saude-plataform` (ajustar nome real)
- Workflow file: `.github/workflows/deploy-backend.yml`

## Solução proposta

### Passo 1 — Criar OIDC Identity Provider no IAM

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  --profile deep-saude
```

> O thumbprint é fixo conhecido para `token.actions.githubusercontent.com`. AWS hoje aceita sem thumbprint válido (validado automaticamente), mas o CLI exige passar algum.

### Passo 2 — Criar IAM Role que o GitHub Actions vai assumir

```bash
cat > github-actions-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:gabrielBielll/deep-saude-plataform:ref:refs/heads/main"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name GitHubActionsDeployRole \
  --assume-role-policy-document file://github-actions-trust.json \
  --profile deep-saude
```

> `StringLike` permite wildcard. Para deploy só do branch `main`: `ref:refs/heads/main`. Para qualquer branch: `ref:refs/heads/*`. Para PRs também: adicione `pull_request`.

### Passo 3 — Policy de permissões para a role

```bash
cat > github-deploy-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRLogin",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:DescribeImages"
      ],
      "Resource": "arn:aws:ecr:us-east-1:<account-id>:repository/deep-saude/backend"
    },
    {
      "Sid": "AppRunnerDeploy",
      "Effect": "Allow",
      "Action": ["apprunner:StartDeployment"],
      "Resource": "arn:aws:apprunner:us-east-1:<account-id>:service/deep-saude-backend/*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name GitHubActionsDeployPolicy \
  --policy-document file://github-deploy-policy.json \
  --profile deep-saude

aws iam attach-role-policy \
  --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::<account-id>:policy/GitHubActionsDeployPolicy \
  --profile deep-saude
```

### Passo 4 — Workflow do GitHub Actions

Criar `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'deep-saude-plataforma-api/**'
      - '.github/workflows/deploy-backend.yml'
  workflow_dispatch:  # permite trigger manual

permissions:
  id-token: write   # necessário para OIDC
  contents: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    env:
      AWS_REGION: us-east-1
      ECR_REPOSITORY: deep-saude/backend
      APPRUNNER_SERVICE_ARN: arn:aws:apprunner:us-east-1:<account-id>:service/deep-saude-backend/<service-id>

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<account-id>:role/GitHubActionsDeployRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag and push image
        env:
          REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          REPO: ${{ env.ECR_REPOSITORY }}
          GIT_SHA: ${{ github.sha }}
        run: |
          cd deep-saude-plataforma-api/deep-saude-backend
          docker build --platform linux/amd64 \
            -t $REGISTRY/$REPO:$GIT_SHA \
            -t $REGISTRY/$REPO:latest .
          docker push $REGISTRY/$REPO:$GIT_SHA
          docker push $REGISTRY/$REPO:latest

      - name: Trigger App Runner deployment
        run: |
          aws apprunner start-deployment \
            --service-arn ${{ env.APPRUNNER_SERVICE_ARN }}

      - name: Wait for App Runner to become RUNNING
        run: |
          for i in {1..30}; do
            STATUS=$(aws apprunner describe-service \
              --service-arn ${{ env.APPRUNNER_SERVICE_ARN }} \
              --query 'Service.Status' --output text)
            echo "Attempt $i — status: $STATUS"
            if [ "$STATUS" == "RUNNING" ]; then exit 0; fi
            if [ "$STATUS" == "CREATE_FAILED" ] || [ "$STATUS" == "DELETE_FAILED" ]; then
              echo "Deploy falhou"; exit 1
            fi
            sleep 30
          done
          echo "Timeout esperando App Runner"; exit 1
```

> Substituir `<account-id>` e `<service-id>` reais. Use **GitHub Repository Variables** (não Secrets, são públicos por design) se quiser parametrizar.

### Passo 5 — Frontend já está coberto

Amplify Hosting (do [AWS-010](AWS-010-amplify-hosting-frontend.md)) já tem auto-deploy do GitHub configurado. Sem trabalho extra aqui.

> Se quiser, pode também criar workflow para o frontend que **falha o PR se typecheck/lint não passarem**. Recomendado:

`.github/workflows/check-frontend.yml`:
```yaml
name: Frontend Checks
on:
  pull_request:
    paths: ['deep-saude-plataforma-front-end/**']

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: deep-saude-plataforma-front-end/package-lock.json }
      - run: npm ci
        working-directory: deep-saude-plataforma-front-end
      - run: npm run typecheck
        working-directory: deep-saude-plataforma-front-end
      - run: npm run lint
        working-directory: deep-saude-plataforma-front-end
```

### Passo 6 — Habilitar branch protection no GitHub

GitHub repo → Settings → Branches → Add rule for `main`:
- Require pull request before merging
- Require status checks to pass: marcar **Frontend Checks** e (após primeira execução) **Deploy Backend**
- Require branches to be up to date

### Passo 7 — Testar fluxo

```bash
# Fazer um commit qualquer no backend:
echo "# touch" >> deep-saude-plataforma-api/deep-saude-backend/README.md
git add deep-saude-plataforma-api/
git commit -m "test: trigger CI/CD"
git push origin main
```

GitHub → Actions tab → ver workflow rodando. Em ~5-8min, App Runner está com nova imagem.

## Critérios de aceitação

- [ ] OIDC provider criado no IAM
- [ ] Role `GitHubActionsDeployRole` com trust policy restringindo ao repo certo
- [ ] Policy mínima anexada (ECR push + App Runner deploy, nada além)
- [ ] Workflow `deploy-backend.yml` no repo, rodando ao push em `main`
- [ ] Workflow `check-frontend.yml` rodando em PRs
- [ ] Branch protection em `main` exigindo CI verde
- [ ] Pelo menos 1 deploy end-to-end com sucesso (push → ECR → App Runner)

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **OIDC (OpenID Connect)** | Camada de identidade sobre OAuth 2.0. Permite federar identidades sem compartilhar credenciais. |
| **IAM OIDC Identity Provider** | Configuração no IAM que aceita tokens de um provider externo (GitHub, Auth0, Google). |
| **AssumeRoleWithWebIdentity** | Action STS para trocar token OIDC por credenciais temporárias AWS. |
| **Trust Policy** | Define **quem** pode assumir a role (Federated, Service, Account, AWS principal). |
| **Permissions Policy** | Define **o que** a role pode fazer após assumir. |
| **Session token** | Credencial temporária (1h-12h) emitida por STS. |
| **GitHub Actions OIDC** | Cada job recebe automaticamente token JWT que pode ser usado para AssumeRoleWithWebIdentity. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Conceitos de IAM Role e quando usar (vs IAM User)
- Modelo de credenciais temporárias vs permanentes

### Solutions Architect Associate (SAA-C03)
**Tópico recorrente.** Estudar:

- **IAM Role tipos:**
  - Service role (EC2 → S3, Lambda → DynamoDB)
  - Cross-account role (conta A assumindo role na conta B)
  - Federated role (SAML, OIDC, Cognito)
- **STS Actions:**
  - `AssumeRole` (cross-account, IAM user)
  - `AssumeRoleWithSAML` (corporate SSO)
  - `AssumeRoleWithWebIdentity` (OIDC: GitHub, Google, etc.)
  - `GetSessionToken`, `GetFederationToken`
- **AWS SSO (Identity Center)** — sucessor mais novo
- **Cognito User Pools vs Identity Pools** (autenticação app vs federação credentials)
- **External ID** — pattern de segurança para roles cross-account (evita confused deputy)
- **Permission boundaries** — limite máximo do que role pode (não conferir, restringir)
- **Service Control Policies (SCP)** via Organizations — limites no nível conta

**Cenário clássico de prova:**
- "Workload precisa acessar S3 em outra conta" → cross-account role + AssumeRole
- "Webapp permite usuário fazer upload S3" → Cognito + temporary credentials, não access keys

## Riscos / dependências

- **Trust policy muito ampla** (sem condition de repo/branch) = qualquer GitHub Action no mundo pode assumir sua role. **Sempre** condicione a `sub`.
- **Wildcard `ref:refs/heads/*`** = qualquer branch pode deployar. Em produção, prenda a `main`.
- **Pull request workflows não devem ter privilégio de deploy.** PR de fora (fork) pode injetar código malicioso. Use `pull_request_target` com cuidado ou ambientes do GitHub.
- **Secret leakage em logs**: `aws ... | jq ...` pode imprimir token. Use `aws ... --no-paginate --output text` ou mascare manualmente. GitHub Actions já mascara `secrets.*` mas não outputs de comandos.
- **Free Tier GitHub Actions**: 2000 min/mês para repos privados. Builds Docker pesados consomem rapidamente. Considere ECR build (CodeBuild) em vez de docker build no GitHub se passar do limite.
- **App Runner deployment** durante `start-deployment` tem ~3-5min de downtime na nova versão (rolling deploy, mas a primeira instance precisa subir). Considere **multi-instance** (min size 2) para zero downtime real.

## Próximo card

[AWS-016 — WAF + Shield Standard](AWS-016-waf-shield.md)

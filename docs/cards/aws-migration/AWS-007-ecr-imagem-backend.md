# [AWS-007] Criar repositório ECR e fazer push da imagem do backend

**Prioridade:** 🟠 Alto
**Fase:** 2 — Backend
**Esforço:** S (≤2h)
**Área:** Infra / Backend
**Status:** TODO
**Custo estimado/mês:** $0,10/GB/mês storage + transferência grátis dentro da região (Free Tier: 500MB/mês)

## Contexto

App Runner (próximo card) precisa de uma imagem Docker em um **registry acessível pela AWS**. Você poderia usar Docker Hub, mas o caminho idiomático é **Amazon ECR (Elastic Container Registry)** — integra com IAM, é privado por default, mais rápido que Docker Hub para puxar.

Esse card é pequeno mas importante: você aprende o fluxo `build → tag → login → push` que repete em todo deploy.

## Localização

- [deep-saude-plataforma-api/deep-saude-backend/Dockerfile](../../../deep-saude-plataforma-api/deep-saude-backend/Dockerfile) — Dockerfile do backend
- [deep-saude-plataforma-api/deep-saude-backend/](../../../deep-saude-plataforma-api/deep-saude-backend/) — contexto de build

## Solução proposta

### Passo 1 — Criar repositório ECR

```bash
aws ecr create-repository \
  --repository-name deep-saude/backend \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE \
  --encryption-configuration encryptionType=AES256 \
  --profile deep-saude
```

Anote o `repositoryUri` retornado:
```
123456789012.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend
```

**`scanOnPush=true`** — escaneamento de vulnerabilidades em camadas (CVEs conhecidos). Grátis.

**`MUTABLE`** — permite sobrescrever tags. Para produção séria, prefira `IMMUTABLE` (cada tag única, sem `latest`). Por ora, `MUTABLE` é mais simples.

### Passo 2 — Configurar lifecycle policy (evitar acúmulo de imagens antigas)

```bash
cat > ecr-lifecycle.json <<'EOF'
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Manter apenas as 10 imagens mais recentes",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    }
  ]
}
EOF

aws ecr put-lifecycle-policy \
  --repository-name deep-saude/backend \
  --lifecycle-policy-text file://ecr-lifecycle.json \
  --profile deep-saude
```

Sem isso, cada build acumula camadas indefinidamente. ECR cobra storage.

### Passo 3 — Garantir Dockerfile com healthcheck e usuário não-root

O Dockerfile atual em [deep-saude-plataforma-api/deep-saude-backend/Dockerfile](../../../deep-saude-plataforma-api/deep-saude-backend/Dockerfile) usa `clojure:lein-2.11.2`. Funciona, mas é pesado (~600MB). Vamos otimizar para produção:

```dockerfile
# --- Stage 1: build uberjar ---
FROM clojure:temurin-21-lein-2.11.2 AS build
WORKDIR /app
COPY project.clj .
RUN lein deps
COPY . .
RUN lein uberjar

# --- Stage 2: runtime (slim) ---
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/target/uberjar/*-standalone.jar app.jar
RUN chown -R app:app /app
USER app

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["java", "-jar", "app.jar"]
```

> Não vamos refatorar o Dockerfile agora **se** o atual está rodando bem no Render. Mantenha o atual e otimize depois ([OPS-005](../sprint-3-production/OPS-005-docker-prod-ready.md)). O foco deste card é só *fazer chegar no ECR*.

### Passo 4 — Login no ECR via Docker

```bash
aws ecr get-login-password --region us-east-1 --profile deep-saude | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com
```

> Token dura 12 horas. Você refaz quando expira.

### Passo 5 — Build, tag e push

```bash
cd /Users/gabriel/Documents/developer/deep-saude-plataform/deep-saude-plataforma-api/deep-saude-backend

# Build
docker build -t deep-saude-backend:latest .

# Tag com URI do ECR (latest E sha — para rollback)
docker tag deep-saude-backend:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend:latest

GIT_SHA=$(git rev-parse --short HEAD)
docker tag deep-saude-backend:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend:$GIT_SHA

# Push
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/deep-saude/backend:$GIT_SHA
```

> **Tag `latest`** é conveniente mas perigosa em prod (ambiguidade). **Tag pelo SHA** permite rollback determinístico.

### Passo 6 — Validar

```bash
aws ecr list-images --repository-name deep-saude/backend --profile deep-saude
```

Você deve ver as 2 tags. Console → ECR → repositórios → veja resultado do scan (provavelmente algumas Medium/Low — sem pânico, eclipse-temurin é maduro).

### Passo 7 — Salvar um `push-backend.sh` no repo (sem credenciais!)

```bash
#!/bin/bash
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile deep-saude)
REPO_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/deep-saude/backend"
GIT_SHA=$(git rev-parse --short HEAD)

cd "$(dirname "$0")/deep-saude-plataforma-api/deep-saude-backend"

aws ecr get-login-password --region $REGION --profile deep-saude | \
  docker login --username AWS --password-stdin $REPO_URI

docker build -t deep-saude-backend:$GIT_SHA .
docker tag deep-saude-backend:$GIT_SHA $REPO_URI:latest
docker tag deep-saude-backend:$GIT_SHA $REPO_URI:$GIT_SHA

docker push $REPO_URI:latest
docker push $REPO_URI:$GIT_SHA

echo "✅ Pushed $REPO_URI:$GIT_SHA"
```

Em [AWS-015](AWS-015-github-actions-oidc.md), o GitHub Actions vai substituir esse script.

## Critérios de aceitação

- [ ] Repositório ECR `deep-saude/backend` criado
- [ ] Scan on push habilitado
- [ ] Lifecycle policy aplicada (max 10 imagens)
- [ ] Imagem pushada com 2 tags (`latest` + git SHA)
- [ ] Scan finalizou sem CVEs Critical bloqueantes
- [ ] Script `push-backend.sh` salvo na raiz do repo

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **ECR (Elastic Container Registry)** | Registry Docker gerenciado AWS. Privado por default. |
| **Repository** | Um repo por imagem (não é repo git — é repo de imagens com tags). |
| **Image manifest** | Metadata da imagem (layers, arquitetura, tag). |
| **Image scanning** | Scan automático de CVEs ao push (Basic, gratuito) ou contínuo (Enhanced, pago). |
| **Lifecycle policy** | Regras pra deletar imagens antigas automaticamente. |
| **Tag immutability** | `MUTABLE` permite sobrescrever, `IMMUTABLE` força tags únicas. |
| **Authentication token** | `get-login-password` gera token IAM de 12h. Não confundir com docker hub credentials. |
| **Public ECR** (`public.ecr.aws`) | Registry público da AWS (alternativa ao Docker Hub para imagens base). |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- ECR aparece como "container registry da AWS" — saber que existe e o que faz
- Conceito de container vs VM (Domínio 2)

### Solutions Architect Associate (SAA-C03)
- ECR + ECS + Fargate aparecem juntos em **vários cenários** de prova
- **ECS Task Definition** com imagem ECR (sempre cobrado)
- **Cross-account ECR access** (resource policy no repo)
- **ECR replication** (multi-região, multi-conta)
- **ECR vs ECR Public** — diferenças
- **Pull through cache** (acelerar pull de Docker Hub via ECR)
- **App Mesh, Service Connect** — service mesh para containers
- **EKS** (Kubernetes gerenciado) — também usa ECR

## Riscos / dependências

- **Free Tier ECR é 500MB/mês**. Imagem Clojure pesa ~400-600MB. 10 imagens = 4-6GB. **Lifecycle policy é obrigatória.**
- **Build local M1/M2 (ARM)** vs **App Runner (x86)**: por default seu Mac builda imagem ARM e App Runner é x86. **Force `--platform linux/amd64`** ao buildar:
  ```bash
  docker build --platform linux/amd64 -t deep-saude-backend:latest .
  ```
  Senão você vai bater em erros `exec format error` no App Runner.
- **Tag `latest`** parece simples mas é traiçoeira: deploy não sabe "qual versão" subiu. Sempre tagueie por SHA também.
- **Sem login expirado**: erro `no basic auth credentials` = token de 12h expirou. Refazer `get-login-password`.
- **Dependência:** [AWS-008](AWS-008-app-runner-backend.md) vai puxar dessa imagem. ECR + App Runner precisam estar na mesma região (`us-east-1`).

## Próximo card

[AWS-008 — Deploy backend Clojure no App Runner](AWS-008-app-runner-backend.md)

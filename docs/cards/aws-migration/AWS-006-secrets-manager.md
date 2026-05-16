# [AWS-006] Mover secrets para AWS Secrets Manager

**Prioridade:** 🔴 Crítico
**Fase:** 1 — Dados
**Esforço:** M (meio dia)
**Área:** Infra / Backend
**Status:** TODO
**Custo estimado/mês:** $0,40/secret + $0,05/10k API calls (Free Tier: 30 dias por secret)

## Contexto

Hoje os secrets do Deep Saúde (JWT_SECRET, DATABASE_URL, credenciais MinIO/S3) estão em **variáveis de ambiente em texto puro** nos painéis Render/Firebase. Problemas:

- Quem tem acesso ao painel vê todos os secrets em claro
- Sem auditoria de quem leu o quê e quando
- Sem rotação automática
- Difícil de versionar e replicar entre ambientes

**Secrets Manager** resolve isso: secrets encriptados (KMS), permissões IAM granulares, rotação automática para alguns serviços (RDS), CloudTrail registra cada `GetSecretValue`.

> Existe também **Parameter Store** (SSM Parameter Store) que é **grátis** para tier Standard. Mais simples mas menos features. Comparação no fim do card.

## Localização

Secrets a migrar:
- `JWT_SECRET` → backend Clojure
- `NEXTAUTH_SECRET` → frontend Next.js
- `DATABASE_URL` → backend (já vamos referenciar o Aurora do [AWS-004](AWS-004-rds-aurora-postgres.md))
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` para S3 → se IAM Role no App Runner ([AWS-008](AWS-008-app-runner-backend.md)) substitui, **não precisa armazenar**
- Credenciais Google AI / Genkit
- `NEXTAUTH_URL` (não é secret, vai em env normal)

## Solução proposta

### Passo 1 — Criar um secret por valor sensível

```bash
# JWT_SECRET (backend)
aws secretsmanager create-secret \
  --name deep-saude/prod/jwt-secret \
  --description "JWT signing secret for backend (HS256)" \
  --secret-string "$(openssl rand -base64 64)" \
  --profile deep-saude

# NEXTAUTH_SECRET (frontend)
aws secretsmanager create-secret \
  --name deep-saude/prod/nextauth-secret \
  --secret-string "$(openssl rand -base64 64)" \
  --profile deep-saude

# DATABASE_URL (backend)
aws secretsmanager create-secret \
  --name deep-saude/prod/database-url \
  --secret-string '{"username":"deepsaude_admin","password":"<senha-aurora>","host":"<endpoint-aurora>","port":5432,"dbname":"deep_saude_db"}' \
  --profile deep-saude

# Genkit Google AI API key
aws secretsmanager create-secret \
  --name deep-saude/prod/google-ai-api-key \
  --secret-string "<sua-api-key>" \
  --profile deep-saude
```

**Convenção de nomes:** `<app>/<env>/<resource>` é a convenção da AWS. Permite IAM policy com wildcard `deep-saude/prod/*`.

### Passo 2 — Criar IAM policy mínima para o backend

```bash
cat > backend-secrets-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:<account-id>:secret:deep-saude/prod/jwt-secret-*",
        "arn:aws:secretsmanager:us-east-1:<account-id>:secret:deep-saude/prod/database-url-*",
        "arn:aws:secretsmanager:us-east-1:<account-id>:secret:deep-saude/prod/google-ai-api-key-*"
      ]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name DeepSaudeBackendSecretsAccess \
  --policy-document file://backend-secrets-policy.json \
  --profile deep-saude
```

> O **sufixo `-*`** é importante. AWS adiciona um sufixo random ao ARN para garantir unicidade quando você deleta e recria.

Outra policy similar para o frontend (apenas `nextauth-secret`).

### Passo 3 — Atualizar backend para ler secrets ao inicializar

No Clojure (em `core.clj` na função `init-db` ou similar):

```clojure
(ns deep-saude-backend.config
  (:require [cheshire.core :as json])
  (:import [software.amazon.awssdk.services.secretsmanager
            SecretsManagerClient]
           [software.amazon.awssdk.services.secretsmanager.model
            GetSecretValueRequest]))

(defn get-secret [secret-name]
  (let [client (SecretsManagerClient/create)
        request (-> (GetSecretValueRequest/builder)
                    (.secretId secret-name)
                    .build)
        response (.getSecretValue client request)]
    (.secretString response)))

(defn load-config []
  (let [env (or (System/getenv "APP_ENV") "development")]
    (if (= env "production")
      {:jwt-secret    (get-secret "deep-saude/prod/jwt-secret")
       :database-url  (-> (get-secret "deep-saude/prod/database-url")
                          (json/parse-string true)
                          build-jdbc-url)
       :google-ai-key (get-secret "deep-saude/prod/google-ai-api-key")}
      ;; Dev: variáveis de ambiente locais
      {:jwt-secret    (System/getenv "JWT_SECRET")
       :database-url  (System/getenv "DATABASE_URL")
       :google-ai-key (System/getenv "GOOGLE_AI_API_KEY")})))
```

Adicione dependência AWS SDK em `project.clj`:
```clojure
[software.amazon.awssdk/secretsmanager "2.25.0"]
```

### Passo 4 — Atualizar frontend (server-side)

Next.js: secrets só são acessíveis no servidor (não em `NEXT_PUBLIC_*`). Em `src/lib/secrets.ts`:

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });

let cachedSecret: string | null = null;

export async function getNextAuthSecret(): Promise<string> {
  if (process.env.NODE_ENV !== "production") {
    return process.env.NEXTAUTH_SECRET!;
  }
  if (cachedSecret) return cachedSecret;

  const response = await client.send(new GetSecretValueCommand({
    SecretId: "deep-saude/prod/nextauth-secret"
  }));
  cachedSecret = response.SecretString!;
  return cachedSecret;
}
```

Instalar:
```bash
cd deep-saude-plataforma-front-end
npm install @aws-sdk/client-secrets-manager
```

### Passo 5 — Cache + tratamento de erro

**Importante:** `GetSecretValue` cobra por API call ($0,05/10k). **Cache em memória** durante a vida do processo. Backend recém-iniciado faz `GetSecretValue` 3-4x, depois nunca mais.

### Passo 6 — Rotação automática (opcional, avançado)

Para senhas de banco, Secrets Manager faz rotação automática via Lambda:

1. Console → Secrets Manager → secret `deep-saude/prod/database-url`
2. **Edit rotation** → enable
3. Rotation schedule: 30 days
4. Use a Lambda function from AWS template (`SecretsManagerRDSPostgreSQLRotationSingleUser`)

Vai exigir VPC + Lambda + dois pares de credenciais alternados. **Pule por enquanto** — habilite quando o app estiver estável.

## Critérios de aceitação

- [ ] Secrets criados em Secrets Manager com convenção `deep-saude/prod/<nome>`
- [ ] Policies IAM mínimas criadas para backend e frontend
- [ ] Código do backend lê secrets em produção via SDK
- [ ] Código do frontend lê secrets em produção via SDK
- [ ] Cache em memória implementado (não chama API a cada request)
- [ ] Em dev local, `APP_ENV=development` ainda lê `.env.local` (não cobra Secrets Manager)
- [ ] Smoke test em produção valida que app sobe lendo secrets do AWS

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **Secrets Manager** | Cofre de secrets gerenciado. Encriptação KMS, IAM, rotação. $0,40/secret/mês. |
| **Parameter Store (SSM)** | Parâmetros de config (com ou sem encriptação). Tier Standard é grátis. |
| **KMS (Key Management Service)** | Serviço de chaves. Cada secret é encriptado com uma CMK (Customer Master Key). |
| **CMK (Customer Master Key)** | Chave criptográfica gerenciada pela AWS ou por você. AWS-managed é grátis, custom é $1/mês. |
| **Resource-based policy** | Policy anexada **ao recurso** (ex: ao secret), controlando quem pode acessar de fora. |
| **Cross-account access** | Secrets podem ser compartilhados entre contas AWS via resource policy. |
| **CloudTrail** | Log de chamadas de API. Cada `GetSecretValue` é registrado — auditoria automática. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Conceito de "AWS managed secrets" vs hardcoded — aparece em domínio Security
- KMS como serviço de criptografia central

### Solutions Architect Associate (SAA-C03)
- **Secrets Manager vs Parameter Store** — diferenças (cobrado!)
  - Secrets Manager: rotação automática, $0,40/secret, valor < 64KB
  - Parameter Store: grátis (Standard), sem rotação built-in, valor < 4KB (Standard) ou 8KB (Advanced)
- **KMS conceitos:**
  - CMK vs Data Key (envelope encryption)
  - Symmetric vs Asymmetric keys
  - Key policies vs IAM policies (e a interação entre as duas)
  - Multi-region keys (réplica em outras regiões)
  - Key rotation (automática anual vs manual)
- **AWS Certificate Manager (ACM)** — relacionado, gerencia certificados SSL/TLS
- **CloudHSM** (hardware module dedicado) — quando KMS não basta (compliance pesado)

## Parameter Store como alternativa

Se você quer ficar **grátis** e os secrets não precisam de rotação automática:

```bash
# Criar parâmetro encriptado:
aws ssm put-parameter \
  --name /deep-saude/prod/jwt-secret \
  --value "$(openssl rand -base64 64)" \
  --type SecureString \
  --profile deep-saude

# Ler:
aws ssm get-parameter \
  --name /deep-saude/prod/jwt-secret \
  --with-decryption \
  --query 'Parameter.Value' --output text \
  --profile deep-saude
```

**Vantagens:**
- Tier Standard é **grátis** (até 10.000 parâmetros)
- Permite hierarquia (`/deep-saude/prod/*`)
- Mesma encriptação KMS

**Desvantagens vs Secrets Manager:**
- Não tem rotação automática (você implementa)
- Tier Advanced (>4KB ou parameter policies) cobra $0,05/parâmetro

**Recomendação:** comece com **Parameter Store** para economia. Migre para Secrets Manager apenas para o `database-url` quando quiser rotação automática.

## Riscos / dependências

- **Custos surpresa:** cada `GetSecretValue` cobra. App que reinicia 100x/dia e busca 5 secrets = 500 calls. Free Tier de 10k cobre, mas atenção.
- **Latência:** primeira chamada de `GetSecretValue` adiciona 100-300ms no startup. Cache resolve.
- **App Runner não tem nativo "inject secret as env var"** como ECS Task Definition. App lê via SDK no startup.
- **NÃO confunda** Secrets Manager com Parameter Store. Pode causar pesadelo de billing.
- **CloudTrail logs** geram custo se data events ligados. Por default os management events de Secrets Manager são grátis.
- **Dependência:** [AWS-008](AWS-008-app-runner-backend.md) vai anexar a IAM Role do App Runner. Sem isso, o backend não consegue chamar `GetSecretValue`.

## Próximo card

Fase 1 completa! Vai para Fase 2 → [AWS-007 — Criar repositório ECR](AWS-007-ecr-imagem-backend.md)

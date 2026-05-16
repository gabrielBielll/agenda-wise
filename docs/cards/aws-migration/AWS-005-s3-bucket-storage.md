# [AWS-005] Migrar uploads do MinIO para Amazon S3

**Prioridade:** 🔴 Crítico
**Fase:** 1 — Dados
**Esforço:** M (meio dia)
**Área:** Infra / Backend
**Status:** TODO
**Custo estimado/mês:** ~$0,023/GB armazenado + $0,0004/1k requests (Free Tier: 5GB + 20k GET + 2k PUT por 12 meses)

## Contexto

O Deep Saúde usa **MinIO** localmente como object storage (avatares, anexos de prontuário). MinIO é S3-compatible, então a migração é direta — só trocamos endpoint e credenciais.

S3 é provavelmente o **serviço AWS mais cobrado** na prova de certificação. Storage classes, lifecycle, versioning, encryption — todos aparecem.

## Localização

- [docker-compose.yml:22-38](../../../docker-compose.yml#L22-L38) — definição do MinIO (mantém em dev)
- Backend Clojure — código que faz upload/download (procurar referências a `MINIO_ROOT_USER`, `S3_*`, `aws-sdk-s3` no `core.clj`)

## Solução proposta

### Passo 1 — Criar o bucket S3

**Nome do bucket precisa ser globalmente único** em toda a AWS. Convenção: `<empresa>-<projeto>-<env>-<propósito>`.

```bash
# Bucket de produção:
aws s3api create-bucket \
  --bucket deep-saude-prod-uploads \
  --region us-east-1 \
  --profile deep-saude

# Bucket de staging (separar ambientes):
aws s3api create-bucket \
  --bucket deep-saude-staging-uploads \
  --region us-east-1 \
  --profile deep-saude
```

> Se a região for diferente de `us-east-1`, precisa passar `--create-bucket-configuration LocationConstraint=<region>`.

### Passo 2 — Bloquear acesso público (default seguro)

S3 buckets **NÃO devem ser públicos** por default. Você libera o que precisa via policy específica depois.

```bash
aws s3api put-public-access-block \
  --bucket deep-saude-prod-uploads \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile deep-saude
```

### Passo 3 — Habilitar versioning (recuperação de delete acidental)

```bash
aws s3api put-bucket-versioning \
  --bucket deep-saude-prod-uploads \
  --versioning-configuration Status=Enabled \
  --profile deep-saude
```

### Passo 4 — Habilitar encryption at rest (default)

```bash
aws s3api put-bucket-encryption \
  --bucket deep-saude-prod-uploads \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": { "SSEAlgorithm": "AES256" }
    }]
  }' \
  --profile deep-saude
```

### Passo 5 — Configurar lifecycle (custos)

Mover arquivos antigos para storage classes mais baratos:

```bash
cat > lifecycle.json <<'EOF'
{
  "Rules": [
    {
      "ID": "MoveOldFilesToIA",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 180, "StorageClass": "GLACIER" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket deep-saude-prod-uploads \
  --lifecycle-configuration file://lifecycle.json \
  --profile deep-saude
```

### Passo 6 — Configurar CORS (frontend faz upload direto?)

Se o frontend Next.js faz upload **direto pro S3** com presigned URL (recomendado), precisa de CORS:

```bash
cat > cors.json <<'EOF'
{
  "CORSRules": [{
    "AllowedOrigins": ["https://app.deepsaude.com.br", "http://localhost:9002"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
EOF

aws s3api put-bucket-cors \
  --bucket deep-saude-prod-uploads \
  --cors-configuration file://cors.json \
  --profile deep-saude
```

Se uploads passam pelo backend (não direto), pode pular CORS.

### Passo 7 — Criar IAM user/role específico pro backend

**Princípio do menor privilégio.** Backend não precisa de `AdministratorAccess` — só de PUT/GET/DELETE no bucket.

```bash
# 1. Criar policy
cat > s3-backend-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::deep-saude-prod-uploads",
        "arn:aws:s3:::deep-saude-prod-uploads/*"
      ]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name DeepSaudeBackendS3Access \
  --policy-document file://s3-backend-policy.json \
  --profile deep-saude
```

Anote o `Arn` retornado (ex: `arn:aws:iam::123456789012:policy/DeepSaudeBackendS3Access`).

A **role** que o backend vai assumir vai ser criada quando subirmos o App Runner em [AWS-008](AWS-008-app-runner-backend.md). Por ora, pode criar um IAM user específico para testes locais:

```bash
aws iam create-user --user-name deep-saude-backend-local --profile deep-saude
aws iam attach-user-policy \
  --user-name deep-saude-backend-local \
  --policy-arn arn:aws:iam::<account-id>:policy/DeepSaudeBackendS3Access \
  --profile deep-saude
aws iam create-access-key --user-name deep-saude-backend-local --profile deep-saude
# Anote AccessKeyId + SecretAccessKey
```

### Passo 8 — Migrar dados existentes do MinIO

Se o MinIO local tem arquivos importantes a preservar:

```bash
# Listar buckets do MinIO:
aws --endpoint-url http://localhost:9000 \
    --profile minio-local \
    s3 ls

# Copiar tudo de um bucket do MinIO pro S3:
aws --endpoint-url http://localhost:9000 \
    --profile minio-local \
    s3 sync s3://meu-bucket-minio ./local-tmp/

aws s3 sync ./local-tmp/ s3://deep-saude-prod-uploads/ --profile deep-saude

rm -rf ./local-tmp/
```

> O profile `minio-local` é configurado em `~/.aws/credentials` com as credenciais do MinIO. Ou use o cliente `mc` (MinIO Client).

### Passo 9 — Atualizar backend para apontar pro S3

No código Clojure (procurar onde está a config do MinIO), trocar:

```clojure
;; Antes (MinIO):
(def s3-config
  {:endpoint   "http://localhost:9000"
   :access-key (System/getenv "MINIO_ROOT_USER")
   :secret-key (System/getenv "MINIO_ROOT_PASSWORD")
   :region     "us-east-1"
   :path-style true})

;; Depois (AWS S3):
(def s3-config
  {:endpoint   "https://s3.us-east-1.amazonaws.com"
   :access-key (System/getenv "AWS_ACCESS_KEY_ID")
   :secret-key (System/getenv "AWS_SECRET_ACCESS_KEY")
   :region     "us-east-1"
   :path-style false})  ; S3 oficial usa virtual-hosted style
```

Em produção (App Runner), você **não vai passar** AWS_ACCESS_KEY_ID — vai usar **IAM Role** anexada ao service. A SDK detecta automaticamente.

### Passo 10 — Atualizar referências em código

Localmente, mantenha MinIO no `docker-compose.yml` para desenvolvimento offline. Em produção, use S3.

Padrão recomendado — usar variável `S3_ENDPOINT`:
- Em dev: `S3_ENDPOINT=http://localhost:9000` + flag path-style
- Em prod: `S3_ENDPOINT` vazio → SDK usa endpoint padrão AWS

## Critérios de aceitação

- [ ] Buckets `deep-saude-prod-uploads` e `deep-saude-staging-uploads` criados
- [ ] Public access bloqueado (verificou em Console → Permissions)
- [ ] Versioning ativo
- [ ] Encryption AES256 default
- [ ] Lifecycle policy aplicada
- [ ] CORS configurado se houver upload direto do front
- [ ] Policy `DeepSaudeBackendS3Access` criada
- [ ] Backend código adaptado para falar com S3 (endpoint + credenciais)
- [ ] Upload + download testados em dev apontando para S3
- [ ] Dados antigos do MinIO migrados (se aplicável)

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **S3 (Simple Storage Service)** | Object storage. Não é file system — não tem "diretórios", só prefixes. |
| **Bucket** | Container de objects. Nome globalmente único, lowercase, sem `_`. |
| **Object** | Arquivo + metadata. Identificado por `bucket + key` (key = nome do arquivo, pode ter `/`). |
| **Storage Classes** | Tiers: Standard, Standard-IA (infrequent access), Glacier, Glacier Deep Archive. Mais frio = mais barato + mais lento pra recuperar. |
| **Versioning** | Cada PUT cria nova versão. Delete só "esconde" (delete marker). Permite recuperar. |
| **Lifecycle policy** | Regras "após X dias, mover para storage class Y" ou "expirar". |
| **Server-side encryption** | SSE-S3 (AES256 pela AWS), SSE-KMS (chaves KMS), SSE-C (você fornece a chave). |
| **Block Public Access** | Toggle "guarda-chuva" que sobrescreve qualquer policy permissiva. Deve estar ON. |
| **Bucket Policy vs IAM Policy** | Bucket policy = recurso (quem pode acessar este bucket). IAM = identidade (a quem dou permissão). |
| **Presigned URL** | URL temporária assinada que permite upload/download sem credenciais AWS. Ideal para upload direto do navegador. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- S3 é mencionado **dezenas de vezes**. Conheça:
  - Storage classes (todas)
  - Durability vs Availability (11 9's = 99,999999999%)
  - Versioning, lifecycle
  - Casos de uso típicos: static website, backup, big data lake

### Solutions Architect Associate (SAA-C03)
**Tópico super importante.** Para a prova:
- **Transfer Acceleration** (cobrado, usa CloudFront edges)
- **Multipart Upload** (>100MB obrigatório, recomendado >5MB)
- **Cross-Region Replication (CRR)** e **Same-Region Replication (SRR)**
- **S3 Object Lock** (WORM compliance — Write Once Read Many)
- **Storage Gateway** (híbrido on-prem ↔ S3)
- **S3 Glacier** retrieval tiers: Expedited (1-5min), Standard (3-5h), Bulk (5-12h)
- **S3 Inventory, Storage Lens, Analytics** (cobrados em cenários de governança)
- **VPC Gateway Endpoint para S3** — acesso ao S3 sem sair pra internet (economiza NAT)
- **CloudFront + S3 origin** (clássico OAI vs OAC — Origin Access Control, novidade 2022)

## Riscos / dependências

- **Custo crescente:** versioning duplica storage sempre que arquivo é alterado. Lifecycle de `NoncurrentVersionExpiration` (90 dias) limita isso.
- **Block Public Access** — se você desativar para "testar", esqueça desligado e o bucket vaza. **Nunca desative em produção.** Distribua via CloudFront com OAC.
- **IAM permissions são unforgiving:** se app quebrar com `AccessDenied`, é quase sempre policy faltando. Use IAM Policy Simulator para debugar.
- **Migração de muitos arquivos** (>100GB) pode ser lenta. Considere DataSync ou Snowball (extremo).
- **Não use** credentials AWS embedded no front-end React/Next. Use presigned URLs gerada pelo backend.
- **Pré-requisito** para [AWS-006](AWS-006-secrets-manager.md) — as access keys do S3 (se você criou na opção local) devem ir pro Secrets Manager. Em produção mesmo, IAM Role no App Runner elimina necessidade de credenciais hardcoded.

## Próximo card

[AWS-006 — Secrets Manager](AWS-006-secrets-manager.md)

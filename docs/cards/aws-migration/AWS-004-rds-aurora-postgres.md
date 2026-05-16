# [AWS-004] Provisionar Aurora PostgreSQL Serverless v2 + migrar schema/dados

**Prioridade:** 🔴 Crítico
**Fase:** 1 — Dados
**Esforço:** L (1-2 dias)
**Área:** Infra / Backend
**Status:** TODO
**Custo estimado/mês:** ~$30 (Aurora Serverless v2 mínimo) ou ~$15 (RDS t4g.micro Free Tier 12 meses)

## Contexto

Hoje o banco de produção é **CockroachDB Cloud** com wire-compatibility Postgres. Funciona bem mas:

- Tira a stack 100% AWS (mais um painel, mais uma fatura)
- Não conta como aprendizado AWS para certificação
- CockroachDB Free tier tem limites (5GB) — quando passar, custo similar ao Aurora

Vamos migrar para **Amazon Aurora PostgreSQL Serverless v2** (recomendado) ou **RDS PostgreSQL t4g.micro** (caminho Free Tier).

## Localização

Arquivos no projeto que precisam apontar para o novo banco:
- [docker-compose.yml:8-15](../../../docker-compose.yml#L8-L15) — dev local (mantém)
- [start-dev.sh:68](../../../start-dev.sh#L68) — `DATABASE_URL` local (mantém)
- Variável `DATABASE_URL` no ambiente do backend em produção (vai mudar)

## Decisão: Aurora Serverless v2 vs RDS t4g.micro

| Critério | Aurora Serverless v2 | RDS PostgreSQL t4g.micro |
|---|---|---|
| Free Tier | ❌ | ✅ 12 meses |
| Custo mês 1-12 | ~$30 (mínimo 0,5 ACU 24/7) | $0 (Free Tier) |
| Custo após | ~$30-100 (auto scale) | ~$15 fixo |
| Escala automática | ✅ 0,5–128 ACUs | ❌ (precisa redimensionar) |
| Multi-AZ | Incluso | +100% custo |
| Backup retention | 1-35 dias | 1-35 dias |
| Storage auto-scaling | ✅ | ✅ |

**Recomendação:**
- Se você está OK gastando ~$30/mês para aprender: **Aurora Serverless v2**
- Se você quer ficar dentro do Free Tier nos primeiros 12 meses: **RDS t4g.micro** (e revisita depois)

Este card cobre as duas trilhas. Escolha uma no Passo 2.

## Solução proposta

### Passo 1 — Backup do banco atual (CockroachDB ou Postgres local)

**Backup completo, antes de tudo.** Mesmo que algo dê errado na migração, você consegue voltar atrás.

```bash
# Para CockroachDB Cloud:
pg_dump "postgresql://gabriel:<senha>@<host>:26257/deep_saude_db?sslmode=verify-full" \
  --no-owner --no-acl --format=plain --file=backup_pre_aws.sql

# Para Postgres local:
docker exec deep-saude-postgres pg_dump -U erp_user deep_saude_db > backup_pre_aws.sql

# Verifique que tem schema + dados:
head -100 backup_pre_aws.sql
wc -l backup_pre_aws.sql  # esperado: milhares de linhas
```

Guarde esse `backup_pre_aws.sql` **fora do repo** (Google Drive, etc.) e **encriptado**.

### Passo 2 — Provisionar o banco AWS

#### Opção A — Aurora PostgreSQL Serverless v2 (recomendado)

```bash
# 1. Criar Security Group para o cluster
aws ec2 create-security-group \
  --group-name deep-saude-rds-sg \
  --description "Security group for Deep Saude RDS" \
  --vpc-id <vpc-id-do-AWS-003> \
  --profile deep-saude
# Anote o GroupId retornado (sg-xxxxxxxxx)

# 2. Permitir acesso na 5432 a partir de qualquer IP (temporário, para migração)
aws ec2 authorize-security-group-ingress \
  --group-id <sg-id> \
  --protocol tcp --port 5432 --cidr 0.0.0.0/0 \
  --profile deep-saude
# ATENÇÃO: vamos restringir depois para o SG do App Runner

# 3. Criar DB subnet group (precisa de pelo menos 2 AZs)
aws rds create-db-subnet-group \
  --db-subnet-group-name deep-saude-subnet-group \
  --db-subnet-group-description "Subnets for Deep Saude DB" \
  --subnet-ids <subnet-id-az1> <subnet-id-az2> \
  --profile deep-saude

# 4. Criar o cluster Aurora Serverless v2
aws rds create-db-cluster \
  --db-cluster-identifier deep-saude-cluster \
  --engine aurora-postgresql \
  --engine-version 15.4 \
  --master-username deepsaude_admin \
  --master-user-password "<senha-forte-32-chars-gerada-com-openssl>" \
  --db-subnet-group-name deep-saude-subnet-group \
  --vpc-security-group-ids <sg-id> \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=4 \
  --storage-encrypted \
  --backup-retention-period 7 \
  --profile deep-saude

# 5. Criar instância writer no cluster
aws rds create-db-instance \
  --db-instance-identifier deep-saude-instance-1 \
  --db-cluster-identifier deep-saude-cluster \
  --engine aurora-postgresql \
  --db-instance-class db.serverless \
  --profile deep-saude
```

Aguarde ~10-15min até status `available`:
```bash
aws rds describe-db-clusters \
  --db-cluster-identifier deep-saude-cluster \
  --query 'DBClusters[0].Status' \
  --profile deep-saude
```

Pegue o endpoint:
```bash
aws rds describe-db-clusters \
  --db-cluster-identifier deep-saude-cluster \
  --query 'DBClusters[0].Endpoint' \
  --profile deep-saude
# Algo como: deep-saude-cluster.cluster-xxxxx.us-east-1.rds.amazonaws.com
```

#### Opção B — RDS PostgreSQL t4g.micro (Free Tier)

Pode ser feito pelo Console (mais visual para iniciante):

1. Console → **RDS** → **Create database**
2. Standard create → **PostgreSQL** → versão 15.4
3. Template: **Free tier**
4. DB instance identifier: `deep-saude-db`
5. Master username: `deepsaude_admin`
6. Master password: senha forte gerada
7. Instance class: `db.t4g.micro`
8. Storage: 20 GiB, **enable storage autoscaling** até 100 GiB
9. Connectivity: **default VPC**, **Public access: Yes** (temporário pra migração), Security group: criar novo `deep-saude-rds-sg`
10. Database authentication: Password authentication
11. Initial database name: `deep_saude_db`
12. Enabled automated backups, retention: 7 days
13. **Encryption**: enable (KMS default)
14. Create database

Aguarde ~10min. Anote o endpoint.

### Passo 3 — Conectar e validar

```bash
# Substituir <endpoint>, <senha>
psql "postgresql://deepsaude_admin:<senha>@<endpoint>:5432/postgres?sslmode=require"

# Você deve ver o prompt psql=>
# Criar database (se RDS):
CREATE DATABASE deep_saude_db;
\q
```

### Passo 4 — Restaurar o backup

```bash
psql "postgresql://deepsaude_admin:<senha>@<endpoint>:5432/deep_saude_db?sslmode=require" < backup_pre_aws.sql
```

Validar:
```sql
\dt                          -- lista tabelas
SELECT count(*) FROM usuarios;
SELECT count(*) FROM pacientes;
SELECT count(*) FROM agendamentos;
```

### Passo 5 — Apontar backend (em produção) para o novo banco

A `DATABASE_URL` muda de:
```
postgresql://gabriel:<senha>@<cockroachdb-host>:26257/deep_saude_db?sslmode=verify-full
```
Para:
```
postgresql://deepsaude_admin:<senha>@<aurora-endpoint>:5432/deep_saude_db?sslmode=require
```

**Por enquanto** atualize na variável de ambiente do Render (o backend ainda está rodando lá). Depois, no [AWS-006](AWS-006-secrets-manager.md), vai vir do Secrets Manager.

### Passo 6 — Smoke test em produção

- Login com credencial real
- Listar pacientes
- Criar agendamento
- Conferir CloudWatch (logs do RDS) por queries lentas/erro

### Passo 7 — Restringir Security Group (pós-migração)

Agora o RDS está aberto pra `0.0.0.0/0:5432`. **Inaceitável em produção.** Vai ser ajustado em [AWS-008](AWS-008-app-runner-backend.md) quando o App Runner subir — restringir inbound do SG do RDS apenas ao SG do App Runner.

Por enquanto, no fim deste card, mude para "seu IP residencial":
```bash
# Pegar seu IP público:
curl ifconfig.me

# Revogar regra aberta:
aws ec2 revoke-security-group-ingress \
  --group-id <sg-id> --protocol tcp --port 5432 --cidr 0.0.0.0/0 \
  --profile deep-saude

# Permitir só seu IP:
aws ec2 authorize-security-group-ingress \
  --group-id <sg-id> --protocol tcp --port 5432 --cidr <seu-ip>/32 \
  --profile deep-saude
```

## Critérios de aceitação

- [ ] Backup `backup_pre_aws.sql` salvo fora do repo
- [ ] Cluster Aurora (ou instância RDS) provisionado e em status `available`
- [ ] Encryption at rest ativo (KMS default)
- [ ] Automated backups configurados, retention >= 7 dias
- [ ] Schema + dados restaurados, contagem de linhas confere com CockroachDB
- [ ] Backend de produção conecta no novo banco (apontamento via env var temporário)
- [ ] Smoke test passou (login + listar paciente + criar agendamento)
- [ ] Security Group restringido (não está mais 0.0.0.0/0)

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **RDS (Relational Database Service)** | Banco gerenciado: AWS cuida de patches, backups, failover. Você cuida do schema. |
| **Aurora** | Engine custom da AWS, wire-compatible Postgres/MySQL. Storage distribuído entre 6 cópias em 3 AZs. Mais rápido, mais caro. |
| **Aurora Serverless v2** | Aurora que escala compute por ACU (Aurora Capacity Unit ≈ 2GB RAM + CPU proporcional). Min 0,5, max 128. |
| **DB Subnet Group** | Conjunto de subnets em ≥2 AZs onde o RDS pode rodar. Obrigatório. |
| **Multi-AZ** | RDS espelha em standby em outra AZ para failover automático. Em Aurora é nativo. |
| **Encryption at rest** | Storage encriptado com KMS. Não tem como ligar depois — só na criação. |
| **Automated backups** | Snapshots diários + PITR (point-in-time recovery) dentro da janela de retention. |
| **KMS (Key Management Service)** | Serviço de chaves criptográficas. AWS default keys são grátis. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Domínio 2: serviços de banco da AWS — DynamoDB vs RDS vs Aurora vs Redshift
- Modelo de responsabilidade compartilhada em DB gerenciado

### Solutions Architect Associate (SAA-C03)
Esse card cobre vários tópicos de prova:
- **Aurora** — leia tudo. Aparece em ~5-8 questões. Storage layer compartilhado, read replicas (até 15), global database, backtrack
- **RDS Multi-AZ vs Read Replica** (diferença crucial — Multi-AZ é HA, Read Replica é escala de leitura)
- **RDS Proxy** — pooling de conexões para apps serverless
- **Aurora Serverless** — diferenças v1 vs v2 (v2 é a moderna)
- **DynamoDB** (NoSQL, completamente diferente — mas aparece muito na prova)
- **Backup vs Snapshot vs Replication** — quando usar cada
- **Encryption at rest** com KMS (CMK vs AWS-managed key)

**Estude também:**
- DMS (Database Migration Service) — usado em prova para cenários "migrar de Oracle on-prem pra AWS"
- ElastiCache (Redis/Memcached) — cache de aplicação

## Riscos / dependências

- **Custo silencioso:** Aurora Serverless v2 cobra mesmo com 0,5 ACU ociosa. ~$30/mês mesmo se você não usar. Deletar o cluster quando não estiver usando ativamente, ou ficar no t4g.micro Free Tier.
- **Backup deve ser TESTADO restaurando** — backup que nunca foi restaurado não existe. Faça isso em um banco temporário antes de confiar.
- **`sslmode=require`** é obrigatório. Aurora/RDS aceitam conexão sem SSL por default, mas você está expondo o tráfego. Force no client.
- **Senha do master** vai pro Secrets Manager no [AWS-006](AWS-006-secrets-manager.md) — não deixe espalhada em config.
- **Antes de cancelar CockroachDB**, deixe os dois bancos rodando em paralelo por ≥1 semana e compare. Migração de DB não é reversível sem perda de dados.

## Próximo card

[AWS-005 — Migrar uploads do MinIO para S3](AWS-005-s3-bucket-storage.md)

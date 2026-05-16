# [OPS-008] Backups encriptados + offsite + retention policy

**Severidade:** 🟠 High
**Sprint:** 3
**Esforço:** M (meio dia)
**Área:** Infra
**Status:** TODO

## Contexto

O script `backup-db.sh` gera dumps SQL locais sem encriptação, sem retention, sem replicação para outro lugar. Em contexto de dados de saúde (LGPD/HIPAA-like), isso é dois problemas:

1. **Confidencialidade:** dumps em plaintext incluem PII de pacientes, prontuários, hash de senhas
2. **Resiliência:** se o servidor cair / disco corromper, perdemos tudo

Adicionalmente, esses backups antigos hoje estão sendo trackados no git ([SEC-003](../sprint-1-security/SEC-003-remover-scripts-admin.md) trata disso).

## Solução proposta

### Decisão estratégica

O banco em produção é CockroachDB Cloud. Ele tem **backups automáticos managed** no plano serverless/standard. Verificar isso primeiro:

1. Console CockroachDB Cloud → seu cluster → Backups
2. Confirmar política existente (frequência, retention, restore tested)

Se backups managed cobrem o caso, este card vira "documentar a política existente + testar restore". Se não cobrem o suficiente (raro), implementar backup adicional.

### Cenário A — backup managed (CockroachDB) suficiente

1. Documentar em `docs/RUNBOOK.md` (criar):
   - Frequência e retention
   - Procedimento de restore (com tempos esperados)
   - Quem tem permissão
   - Contato Cloud support

2. Testar restore em ambiente isolado:
   - Criar cluster de teste
   - Restaurar último backup
   - Verificar integridade (count de tabelas, dados de smoke)

3. Adicionar alerta se backup falhar (CockroachDB Cloud expõe webhook)

### Cenário B — precisa de backup adicional offsite

Geralmente justificável só se: regulação exige, ou se desconfia do single-vendor.

#### Script `tools/backup-encrypted.sh`

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/tmp/deep-saude-backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="deep_saude_${DATE}.sql.gz.enc"
GPG_RECIPIENT="${GPG_RECIPIENT:?GPG_RECIPIENT env var required}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET env var required}"

mkdir -p "$BACKUP_DIR"

# dump → gzip → encrypt
pg_dump "$DATABASE_URL" \
  | gzip -9 \
  | gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" --output "$BACKUP_DIR/$FILENAME"

# upload to S3 / R2 / GCS
aws s3 cp "$BACKUP_DIR/$FILENAME" "s3://$S3_BUCKET/$FILENAME" \
  --storage-class STANDARD_IA

# cleanup local
rm "$BACKUP_DIR/$FILENAME"

# rotate old backups (manter 30 dias)
aws s3 ls "s3://$S3_BUCKET/" | awk '{print $4}' | while read f; do
  age_days=$(( ($(date +%s) - $(date -d "${f:14:10}" +%s)) / 86400 ))
  if [ "$age_days" -gt 30 ]; then
    aws s3 rm "s3://$S3_BUCKET/$f"
  fi
done
```

#### Schedule via cronjob

(reaproveitando infra de [OPS-003](OPS-003-cronjob-sincronizacao.md))

```yaml
- type: cron
  name: backup-daily
  schedule: "0 3 * * *"   # 3am UTC = ~meianoite Brasil
  dockerCommand: ["/app/tools/backup-encrypted.sh"]
  envVars:
    - DATABASE_URL
    - GPG_RECIPIENT
    - S3_BUCKET
    - AWS_ACCESS_KEY_ID
    - AWS_SECRET_ACCESS_KEY
```

### Em qualquer cenário — testar restore

A regra de ouro: **backup que nunca foi restaurado não é backup, é esperança**. Agendar dry-run trimestral:

1. Spinup cluster vazio
2. Restaurar último backup
3. Verificar checksums e queries básicas
4. Documentar tempo de RTO real

### MinIO / objetos

Anexos de prontuário em MinIO precisam de backup separado. Em produção, **considerar migrar pra S3/R2/GCS managed** — versionamento e replicação ficam triviais.

## Critérios de aceitação

- [ ] Política de backup do banco documentada em `docs/RUNBOOK.md`
- [ ] Restore testado em ambiente isolado pelo menos uma vez
- [ ] Se Cenário B: script de backup encriptado + offsite rodando como cron
- [ ] Retention configurada (mínimo 30 dias)
- [ ] Anexos do MinIO/objeto store com plano de backup (replicação ou migração pra managed)
- [ ] Alerta de falha de backup configurado

## Riscos / dependências

- **Compliance:** se LGPD/regulação aplicar, talvez precise retenção mais longa (1 ano+). Verificar.
- **Custo:** S3 IA storage é ~$0.0125/GB/month. 50 backups × 1GB = trivial.
- **Dependência:** [SEC-003](../sprint-1-security/SEC-003-remover-scripts-admin.md) já trata da remoção do `backups/` legado do git.

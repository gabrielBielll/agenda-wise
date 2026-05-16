# [AWS-018] Backups RDS automatizados + S3 versioning + lifecycle + Restore drill

**Prioridade:** 🟠 Alto
**Fase:** 7 — Continuidade
**Esforço:** M (meio dia)
**Área:** Infra
**Status:** TODO
**Custo estimado/mês:** RDS snapshots: storage = volume DB grátis até esse mesmo tamanho, depois $0,095/GB; S3 versioning: ~$0,023/GB

## Contexto

Backup é o sinal de maturidade que separa "isso é um projeto" de "isso é um produto". Para um SaaS médico (dados de paciente, prontuários), **perder dados é catastrófico** — não só técnico, é jurídico (LGPD).

Boas notícias:
- RDS já faz **snapshots automáticos** se configurado em [AWS-004](AWS-004-rds-aurora-postgres.md)
- S3 já tem **versioning** ativo de [AWS-005](AWS-005-s3-bucket-storage.md)

Este card:
1. Verifica que as duas coisas estão configuradas corretamente
2. Adiciona **AWS Backup** como camada unificada
3. **Testa restore** — porque backup que nunca foi restaurado não existe
4. Documenta o procedimento de Disaster Recovery

## Localização

- Aurora cluster `deep-saude-cluster`
- S3 bucket `deep-saude-prod-uploads`
- Documentação do procedimento — vai ficar em `docs/RUNBOOK.md` (criar)

## Solução proposta

### Passo 1 — Conferir retention atual

```bash
# RDS Aurora
aws rds describe-db-clusters \
  --db-cluster-identifier deep-saude-cluster \
  --query 'DBClusters[0].{Retention:BackupRetentionPeriod,Window:PreferredBackupWindow}' \
  --profile deep-saude

# Output esperado: Retention >= 7 dias
```

Para aumentar:
```bash
aws rds modify-db-cluster \
  --db-cluster-identifier deep-saude-cluster \
  --backup-retention-period 14 \
  --preferred-backup-window 06:00-07:00 \
  --apply-immediately \
  --profile deep-saude
```

> Para saúde/LGPD considere retention 30 dias. Cobra storage proporcionalmente.

### Passo 2 — AWS Backup (orquestração centralizada)

AWS Backup é serviço que **agenda + gerencia + retém** backups de múltiplos serviços (RDS, EFS, DynamoDB, EC2 EBS, S3, FSx) num só lugar.

#### Criar Backup Vault
```bash
aws backup create-backup-vault \
  --backup-vault-name deep-saude-vault \
  --profile deep-saude
```

#### Criar Backup Plan
```bash
cat > backup-plan.json <<'EOF'
{
  "BackupPlan": {
    "BackupPlanName": "deep-saude-daily-backup",
    "Rules": [
      {
        "RuleName": "DailyBackups",
        "TargetBackupVaultName": "deep-saude-vault",
        "ScheduleExpression": "cron(0 6 * * ? *)",
        "StartWindowMinutes": 60,
        "CompletionWindowMinutes": 180,
        "Lifecycle": {
          "DeleteAfterDays": 35,
          "MoveToColdStorageAfterDays": 7
        }
      },
      {
        "RuleName": "MonthlyArchive",
        "TargetBackupVaultName": "deep-saude-vault",
        "ScheduleExpression": "cron(0 6 1 * ? *)",
        "Lifecycle": {
          "DeleteAfterDays": 365,
          "MoveToColdStorageAfterDays": 30
        }
      }
    ]
  }
}
EOF

aws backup create-backup-plan \
  --backup-plan file://backup-plan.json \
  --profile deep-saude
```

Anote o `BackupPlanId` retornado.

#### Selection (quais recursos)

Por tag — todos com `Project=deep-saude`:

```bash
cat > backup-selection.json <<EOF
{
  "BackupSelection": {
    "SelectionName": "all-deep-saude-resources",
    "IamRoleArn": "arn:aws:iam::<account-id>:role/service-role/AWSBackupDefaultServiceRole",
    "ListOfTags": [
      {
        "ConditionType": "STRINGEQUALS",
        "ConditionKey": "Project",
        "ConditionValue": "deep-saude"
      }
    ]
  }
}
EOF

aws backup create-backup-selection \
  --backup-plan-id <plan-id> \
  --backup-selection file://backup-selection.json \
  --profile deep-saude
```

> Se a service role `AWSBackupDefaultServiceRole` não existe, AWS Backup cria automaticamente ao usar pela primeira vez via Console.

### Passo 3 — Manual snapshot antes de mudanças críticas

Antes de qualquer migração de schema, deploy de risco, ou alteração estrutural:

```bash
# Snapshot manual do Aurora:
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier deep-saude-cluster \
  --db-cluster-snapshot-identifier "pre-migration-$(date +%Y%m%d-%H%M)" \
  --profile deep-saude
```

Snapshots manuais **não expiram** automaticamente. Mais seguro, mas você gerencia delete.

### Passo 4 — S3 cross-region replication (opcional, paranoia level)

Se a região `us-east-1` virar inacessível (já aconteceu), seu S3 morre junto. Para evitar:

```bash
# Bucket destino em outra região:
aws s3api create-bucket \
  --bucket deep-saude-prod-uploads-dr \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2 \
  --profile deep-saude

# Versioning obrigatório no destino:
aws s3api put-bucket-versioning \
  --bucket deep-saude-prod-uploads-dr \
  --versioning-configuration Status=Enabled \
  --profile deep-saude

# Replication rule (precisa IAM role que pode ler source e escrever destination):
# Configuração JSON longa — feito mais fácil via Console:
# S3 → bucket source → Management → Replication rules → Create
```

> Vai dobrar custo de storage para o bucket replicado. Para saúde com LGPD, vale. Para projeto pessoal, pula.

### Passo 5 — TESTE de restore (crítico)

**Backup que nunca foi restaurado não existe.** Faça este drill:

#### Cenário: "Aurora cluster deletado por engano às 14:00"

1. **Identificar último backup utilizável:**
   ```bash
   aws rds describe-db-cluster-snapshots \
     --db-cluster-identifier deep-saude-cluster \
     --query 'DBClusterSnapshots[*].[DBClusterSnapshotIdentifier,SnapshotCreateTime,Status]' \
     --output table --profile deep-saude
   ```

2. **Restaurar para novo cluster temporário** (sem deletar o atual, é só drill):
   ```bash
   aws rds restore-db-cluster-from-snapshot \
     --db-cluster-identifier deep-saude-cluster-restore-test \
     --snapshot-identifier <id-do-snapshot> \
     --engine aurora-postgresql \
     --db-subnet-group-name deep-saude-subnet-group \
     --vpc-security-group-ids <sg-id> \
     --profile deep-saude

   # Criar instância writer no cluster restaurado:
   aws rds create-db-instance \
     --db-instance-identifier deep-saude-restore-instance \
     --db-cluster-identifier deep-saude-cluster-restore-test \
     --engine aurora-postgresql \
     --db-instance-class db.serverless \
     --profile deep-saude
   ```

3. **Validar que dados estão lá:**
   ```bash
   psql "postgresql://deepsaude_admin:<senha>@<novo-endpoint>:5432/deep_saude_db?sslmode=require"
   ```
   ```sql
   SELECT count(*) FROM pacientes;
   SELECT count(*) FROM agendamentos;
   SELECT max(data_hora_sessao) FROM agendamentos;
   -- Bater com produção
   ```

4. **Medir RTO (Recovery Time Objective):** quanto tempo levou do "perdi" ao "recuperado"? Anote.

5. **Deletar cluster de teste:**
   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier deep-saude-restore-instance \
     --skip-final-snapshot --profile deep-saude

   aws rds delete-db-cluster \
     --db-cluster-identifier deep-saude-cluster-restore-test \
     --skip-final-snapshot --profile deep-saude
   ```

> Faça este drill **uma vez** agora, depois **uma vez por trimestre**. Sem prática, na hora real você trava.

### Passo 6 — Documentar Runbook de DR

Criar `docs/RUNBOOK.md` (ou similar) com:

```markdown
# Runbook — Disaster Recovery

## Cenário 1: Aurora cluster deletado/corrompido

**RTO (objetivo):** ≤ 30min
**RPO (objetivo):** ≤ 24h (dado pode estar até 1 dia atrás)

Passos:
1. `aws rds describe-db-cluster-snapshots --db-cluster-identifier deep-saude-cluster`
2. Escolher snapshot mais recente sem corrupção
3. `aws rds restore-db-cluster-from-snapshot ...` (ver AWS-018 para syntax exata)
4. Criar instância writer
5. Atualizar Secrets Manager `deep-saude/prod/database-url` com novo endpoint
6. App Runner detecta mudança? Sim, mas backend cacheia secret em memória — restart manual: `aws apprunner start-deployment ...`

## Cenário 2: S3 bucket apagado

[Documentar]

## Cenário 3: App Runner service falhou e não recupera

[Documentar]

## Contatos
- AWS Support: console → Support Center
- Conta: <account-id>
```

## Critérios de aceitação

- [ ] Aurora retention >= 14 dias (>=30 para LGPD)
- [ ] AWS Backup Vault + Plan + Selection configurados
- [ ] Tag `Project=deep-saude` em todos os recursos backupáveis
- [ ] Pelo menos 1 snapshot manual criado para baseline
- [ ] Drill de restore executado com sucesso, RTO medido
- [ ] `docs/RUNBOOK.md` criado com pelo menos cenário Aurora documentado
- [ ] (Opcional) S3 CRR configurado para outra região
- [ ] Calendário de drill trimestral marcado

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **AWS Backup** | Serviço unificado de orquestração de backup multi-serviço. |
| **Backup Vault** | Container de recovery points (snapshots). Pode ter lock (immutable). |
| **Backup Plan** | Política de schedule + retention + cold storage. |
| **Recovery Point** | Snapshot resultante. Versionado, datado. |
| **PITR (Point-in-Time Recovery)** | Restaurar pra qualquer segundo dentro da retention window (Aurora suporta). |
| **RTO (Recovery Time Objective)** | Quanto tempo aceito ficar fora do ar. |
| **RPO (Recovery Point Objective)** | Quanto dado aceito perder (em tempo desde último backup). |
| **CRR (Cross-Region Replication)** | Replicação assíncrona S3 entre regiões. |
| **Vault Lock** | Tornar backups imutáveis por X dias — proteção contra ransomware. |
| **Cold storage tier** | Backups raramente acessados, mais barato, retrieval mais lento. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Backup conceitos básicos
- Diferença entre backup, snapshot e replication

### Solutions Architect Associate (SAA-C03)
**Tópico altamente cobrado.** Estudar:

- **Estratégias de DR:**
  - **Backup & restore** (RTO horas, RPO dia) — barato
  - **Pilot Light** (DB replicado, compute desligado) — RTO 10min
  - **Warm Standby** (versão reduzida sempre rodando) — RTO 1min
  - **Multi-Site Active/Active** (ambos rodando) — RTO ~0
- **RDS:**
  - Automated backups (storage = DB size grátis, depois pago)
  - Manual snapshots (não expiram, você gerencia)
  - Multi-AZ (HA, não é backup)
  - Read Replica (escala leitura, não é backup)
  - Aurora: backtrack, fast clone, global database
- **S3 Replication:** SRR vs CRR, replication time control
- **AWS Backup:** features pagas (vault lock, cross-region, cross-account)
- **EBS snapshots** (incrementais, em S3 internamente, multi-volume)
- **Storage Gateway** (híbrido)
- **AWS DRaaS:**
  - Elastic Disaster Recovery (CloudEndure) — para servers
  - AWS Backup é diferente (data only)

**Cenários da prova:**
- "RTO 4h, RPO 1h, custo baixo" → Backup & Restore
- "RTO 1min, RPO 0" → Multi-Site Active/Active com Global Accelerator
- "Ransomware protection" → Vault Lock + immutable backups

## Riscos / dependências

- **Backup só vale se você testou restore.** É a primeira regra. Faça drill.
- **PITR só funciona dentro da janela de retention** — se você precisa de 1 ano, retention precisa ser 1 ano (caro).
- **Cross-region replication tem ~minutos de lag.** Não é "instantaneamente" sincronizado.
- **Vault Lock** é irrevogável quando aplicado em modo Compliance. Use Governance mode até ter certeza.
- **AWS Backup tem cost surpresa**: storage do vault + transferência cross-region + restore (cobra GB restaurado).
- **Para compliance saúde (LGPD/HIPAA):** considere também AWS Audit Manager + Config para evidência regulatória.
- **Backups não cobrem código** — só dados. Para código, GitHub é seu backup. Garanta que branch protections + 2FA estão ativos.

## Final da trilha 🎉

Você terminou! Próximos passos sugeridos:

1. **Marcar prova CLF-C02** (https://aws.amazon.com/certification/) — você tem todo o conteúdo
2. Estudar 2-3 semanas focado no que ainda não viu (DynamoDB, EC2 details, Lambda)
3. Fazer simulados (Tutorials Dojo, ExamPro)
4. Após CLF-C02, mirar **SAA-C03** com 4-8 semanas de estudo adicional
5. **Manter este projeto vivo na AWS** — você tem laboratório próprio para experimentar

Boa sorte! 🚀

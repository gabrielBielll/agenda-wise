# [SEC-002] Rotacionar todas as credenciais expostas

**Severidade:** 🔴 Critical
**Sprint:** 1
**Esforço:** M (meio dia)
**Área:** Cross-cutting (Infra + Backend + Frontend)
**Status:** TODO

## Contexto

Várias credenciais e secrets estão em formato fraco, hardcoded no repo, ou expostas em logs. Antes de qualquer deploy de produção, todas precisam ser rotacionadas.

## Inventário de credenciais a rotacionar

| Credencial | Onde está hoje | Estado |
|---|---|---|
| **CockroachDB (prod)** user `gabriel` | [check_remote_hash.py:4](../../../check_remote_hash.py#L4) hardcoded `Mi97vMT0LHJ-T9h-0NNgdQ` | Exposta no working tree |
| **JWT_SECRET** (backend) | [start-dev.sh:69](../../../start-dev.sh#L69) e env do host | Placeholder fraco |
| **NEXTAUTH_SECRET** (frontend) | `.env.local` | Placeholder fraco, mesmo valor do JWT_SECRET |
| **Postgres local** `erp_user` | [docker-compose.yml:9](../../../docker-compose.yml#L9) | `advocacia123` hardcoded |
| **MinIO root** | [docker-compose.yml:25-27](../../../docker-compose.yml#L25-L27) | `minioadmin:minioadmin` |
| **Admin user** (`admin@deepsaude.com`) | Hash em backups SQL + scripts Python | Senha conhecida (`123456`) |

## Solução proposta

### Passo 1 — CockroachDB Cloud (manual, no painel)

1. Login em https://cockroachlabs.cloud
2. Acessar cluster `agenda-wise-db-12369`
3. Users → `gabriel` → Reset password (gerar nova, ≥32 chars aleatórios)
4. Atualizar `DATABASE_URL` no host de produção (env var, não em arquivo)
5. **Não** atualizar nenhum script local — eles devem ser removidos (ver SEC-003)

### Passo 2 — JWT_SECRET e NEXTAUTH_SECRET

```bash
# Gerar duas chaves independentes:
openssl rand -base64 64  # JWT_SECRET (backend)
openssl rand -base64 64  # NEXTAUTH_SECRET (frontend)
```

Configurar via variáveis de ambiente do host (Render dashboard, Fly secrets, etc.). **Nunca commitar.** Adicionar `.env*` ao `.gitignore` se ainda não estiver.

### Passo 3 — Postgres local (dev)

Trocar `advocacia123` por algo gerado por `openssl rand -hex 16` em:
- `docker-compose.yml` (via `env_file: .env` em vez de inline)
- `start-dev.sh`
- `backup-db.sh`, `restore-db.sh`

Criar `.env.example` com placeholders e `.env` real fora do git.

### Passo 4 — MinIO

- Trocar `minioadmin:minioadmin` por credenciais geradas
- Criar usuário/access key específico para a aplicação (princípio do menor privilégio), não usar root
- Atualizar onde a app consome essas chaves (procurar `MINIO_ROOT_USER` no backend)

### Passo 5 — Admin user

- Após SEC-001 estar aplicado, resetar senha do admin via fluxo seguro (não via script)
- Email atual `admin@deepsaude.com` é previsível — considerar exigir admin com email real do dono

## Critérios de aceitação

- [ ] CockroachDB Cloud password rotacionada e nova senha não está no repo
- [ ] `openssl rand -base64 64` rodado e novos secrets configurados nos hosts (backend + frontend)
- [ ] `docker-compose.yml` não tem mais `advocacia123` nem `minioadmin` literais
- [ ] `.env` está no `.gitignore`; `.env.example` documenta variáveis necessárias com placeholders
- [ ] Backend startup não imprime mais nenhum trecho do JWT_SECRET (relacionado a SEC-009)
- [ ] Login local funciona após rotação (smoke test)

## Riscos / dependências

- **Atenção:** rotacionar JWT_SECRET invalida todas as sessões ativas. Aceitável agora (pré-launch), inaceitável depois.
- **Dependência:** decisão de plataforma de deploy ([OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md)) define onde os secrets ficam (Render env vars? Fly secrets? GCP Secret Manager?). Pode rotacionar localmente já e revisitar no deploy.
- Este card depende parcialmente de [SEC-003](SEC-003-remover-scripts-admin.md) — limpeza do histórico do git deve acontecer antes do push da nova versão.

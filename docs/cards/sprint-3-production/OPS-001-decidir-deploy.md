# [OPS-001] Decidir e configurar plataforma de deploy unificada

**Severidade:** 🟠 High
**Sprint:** 3
**Esforço:** L (1-2 dias)
**Área:** Infra
**Status:** TODO — **decisão pendente do usuário**

## Contexto

O projeto tem 3 configurações de deploy parciais, nenhuma completa:

| Arquivo | O que indica | Estado |
|---|---|---|
| [apphosting.yaml](../../../deep-saude-plataforma-front-end/apphosting.yaml) | Firebase App Hosting (frontend only, maxInstances=1) | Incompleto |
| [Procfile](../../../Procfile) | Heroku/Render (frontend only, `npm start`) | Quebrado (start-dev usa `npm run dev`) |
| CORS hardcoda `deep-ngrv.onrender.com` | Backend roda hoje em Render? | Não documentado |

Não tem `render.yaml`, `fly.toml`, `railway.json`. Não tem GitHub Actions.

Pra arrumar a casa, primeira decisão: **onde fica frontend e backend em produção?**

## Opções

### A — Render (recomendado pra simplicidade)

**Vantagens:**
- Free tier generoso pra começar
- Suporta Clojure (build via lein) e Next.js natively
- Backups automáticos do Postgres
- Healthchecks, restart automático, rate limit nativo
- TLS automático
- Já parece estar parcialmente em uso (`deep-ngrv.onrender.com`)

**Desvantagens:**
- Free tier dorme após 15min idle (cold start lento)
- Sem edge/CDN incluso (precisa Cloudflare na frente)

**Configuração:** `render.yaml` na raiz:

```yaml
services:
  - type: web
    name: deep-saude-backend
    runtime: docker
    dockerfilePath: ./deep-saude-plataforma-api/deep-saude-backend/Dockerfile
    plan: starter
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: CORS_ALLOWED_ORIGINS
        value: https://app.deepsaude.com
    healthCheckPath: /api/health

  - type: web
    name: deep-saude-frontend
    runtime: docker
    dockerfilePath: ./deep-saude-plataforma-front-end/Dockerfile
    plan: starter
    envVars:
      - key: BACKEND_URL
        value: https://deep-saude-backend.onrender.com
      - key: NEXTAUTH_SECRET
        sync: false
```

### B — Fly.io

**Vantagens:**
- Edge globalmente, latência menor
- Pricing por uso, sem free tier dormindo
- Excelente pra Clojure (boa JVM tooling)
- Volumes persistentes nativos

**Desvantagens:**
- Curva de aprendizado maior (fly.toml)
- Sem managed Postgres no free tier (precisa Supabase, Neon ou self-host)

### C — Google App Hosting + Cloud Run

**Vantagens:**
- `apphosting.yaml` já tá lá pro frontend
- Integração nativa com Firebase, GCP
- Bom autoscaling

**Desvantagens:**
- Backend Clojure não tem suporte nativo em App Hosting — precisa container em Cloud Run, complica setup
- Custo escala rápido se não dimensionar

### D — Railway

**Vantagens:**
- DX excelente
- Postgres managed incluso
- Deploys rápidos

**Desvantagens:**
- Mais caro que Render no longo prazo
- Free tier limitado

### Banco de dados

Banco atual já está no **CockroachDB Cloud** (serverless tier). Manter — é uma boa escolha pra esse perfil de carga. Configurar `DATABASE_URL` como env var no host escolhido.

## Recomendação

**Render** pra plataforma de aplicação (frontend + backend) + CockroachDB Cloud que já está rodando.

Cenário simples, baixo custo, dá pra começar e migrar depois se escalar muito.

## Solução proposta

(assumindo escolha = Render)

### Passo 1 — criar `render.yaml`

Conteúdo conforme exemplo acima. Versionado no repo.

### Passo 2 — limpar configs antigas

- Deletar `Procfile` (não usado pra Render via Docker)
- Deletar `apphosting.yaml` se não for usar GCP
- Atualizar `CORS_ALLOWED_ORIGINS` ([SEC-007](../sprint-1-security/SEC-007-restringir-cors.md)) com domínios definitivos

### Passo 3 — configurar secrets no dashboard Render

- `DATABASE_URL` (CockroachDB)
- `JWT_SECRET` (gerado em SEC-002)
- `NEXTAUTH_SECRET`
- `BACKEND_URL` (URL interna do serviço backend Render)
- `MINIO_*` (se ainda usar MinIO — em prod, considere S3/R2/GCS)

### Passo 4 — configurar domínios

- `app.deepsaude.com` → frontend
- `api.deepsaude.com` → backend
- Configurar DNS no provedor de domínio
- Render emite TLS automaticamente

### Passo 5 — pipeline de deploy

Por enquanto, push para `main` triggers deploy. Em [OPS-006](OPS-006-ci-cd.md) adicionamos CI/CD com testes antes do deploy.

### Passo 6 — smoke test em staging primeiro

Antes de apontar DNS para produção:
- Deploy em `*.onrender.com` URLs default
- Login completo
- Criar paciente, agendamento
- Verificar logs do Render

## Critérios de aceitação

- [ ] Decisão tomada (Render / Fly / GCP / Railway) e documentada
- [ ] Arquivo de configuração da plataforma versionado (`render.yaml` ou equivalente)
- [ ] Frontend + backend deployando em URL temporária
- [ ] Smoke test E2E passando
- [ ] DNS configurado (depois de validar)
- [ ] Configs duplicadas/quebradas removidas (`Procfile`, `apphosting.yaml` se não usar)

## Riscos / dependências

- **Decisão pendente do usuário** — eu posso recomendar mas a escolha é sua. Critérios: orçamento, latência regional (Brasil → Render us-east tem latência alta; Fly tem `gru` perto), familiaridade.
- **Pré-requisito:** [SEC-002](../sprint-1-security/SEC-002-rotacionar-credenciais.md) — secrets novos prontos antes do primeiro deploy.
- **Próximo:** [OPS-002](OPS-002-sentry-observabilidade.md), [OPS-004](OPS-004-healthchecks.md), [OPS-006](OPS-006-ci-cd.md) dependem desta decisão.

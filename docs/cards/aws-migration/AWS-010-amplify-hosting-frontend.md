# [AWS-010] Deploy do Next.js no AWS Amplify Hosting

**Prioridade:** 🔴 Crítico
**Fase:** 3 — Frontend
**Esforço:** M (meio dia)
**Área:** Infra / Frontend
**Status:** TODO
**Custo estimado/mês:** $0,01/build-min + $0,15/GB serve + $0,023/GB armazenado (Free Tier: 1000 build-min/mês, 15GB serve, 5GB store, 12 meses)

## Contexto

O frontend Next.js 15 hoje está no **Firebase App Hosting**. Vamos migrar para **AWS Amplify Hosting**, que tem suporte nativo a Next.js 15 incluindo SSR, ISR e Server Actions.

Amplify é o "Vercel da AWS" — você conecta um repo GitHub, ele builda e deploya automaticamente em cada push.

> **Não confunda:** "AWS Amplify" como **library** (cliente JS) é uma coisa. "Amplify Hosting" como **serviço de hosting** é outra. Aqui usamos só o segundo. Você não precisa instalar nenhuma lib `aws-amplify` no seu Next.js.

## Localização

- [deep-saude-plataforma-front-end/](../../../deep-saude-plataforma-front-end/) — diretório do app
- [next.config.ts](../../../deep-saude-plataforma-front-end/next.config.ts) — config Next.js
- [package.json](../../../deep-saude-plataforma-front-end/package.json) — scripts de build

## Solução proposta

### Passo 1 — Confirmar build local funciona

```bash
cd deep-saude-plataforma-front-end
npm ci
npm run build
# Deve gerar .next/ standalone
```

Se passou, Amplify também vai passar.

### Passo 2 — Conectar repositório

1. Console → **Amplify** → **New app** → **Host web app**
2. Source: **GitHub** → autorize → escolha o repo `deep-saude-plataform` e branch `main`
3. **Monorepo detection:** Amplify percebe que tem mais de um app. Configure:
   - App root directory: `deep-saude-plataforma-front-end`
4. App name: `deep-saude-frontend`
5. Framework: deve auto-detectar **Next.js — SSR** (Amplify Hosting Gen 2). Confirme.

### Passo 3 — Arquivo `amplify.yml` (build spec)

Amplify vai sugerir um. Aceite, mas customize se quiser. Crie em `deep-saude-plataforma-front-end/amplify.yml`:

```yaml
version: 1
applications:
  - appRoot: deep-saude-plataforma-front-end
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
```

### Passo 4 — Configurar variáveis de ambiente

No console Amplify → seu app → **Hosting** → **Environment variables**:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL do App Runner (do [AWS-008](AWS-008-app-runner-backend.md)) |
| `NEXTAUTH_URL` | URL pública do Amplify (vai ser preenchida após primeiro deploy) |
| `NEXTAUTH_SECRET` | Secret do [AWS-006](AWS-006-secrets-manager.md) — pode colar valor direto **ou** usar Parameter Store integration |
| `NODE_VERSION` | `20` (Amplify default é 18, mas Next.js 15 prefere 20) |

> **Para puxar do Secrets Manager** em vez de colar valor: prefixe `SECRETSMANAGER_` e o valor é o nome do secret. Doc: https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html

### Passo 5 — Branch protections e auto-deploy

- Branch `main` → auto-deploy ON
- Considere criar branch `staging` linkado a outro Amplify app para preview de PRs

### Passo 6 — Disparar build

1. Salvar configuração
2. Amplify dispara build automático
3. Acompanhar logs em **Hosting** → último deploy → **View logs**
4. Tempo total: 3-6 minutos para Next.js 15

### Passo 7 — Smoke test na URL gerada

URL será algo como `https://main.dXXXXXXXX.amplifyapp.com`. Testar:
- Página inicial carrega
- Login funciona (NextAuth chega no backend)
- Página autenticada renderiza
- API calls vão para `NEXT_PUBLIC_API_URL`

### Passo 8 — Atualizar `NEXTAUTH_URL`

NextAuth precisa saber a URL pública para gerar callbacks. Atualize:
```
NEXTAUTH_URL=https://main.dXXXXXXXX.amplifyapp.com
```
Redeploy disparado automaticamente (Amplify rebuilda em mudança de env).

### Passo 9 — Pull request previews (opcional, recomendado)

Console → Amplify app → **Hosting** → **Previews** → enable. Cada PR gera URL única `pr-NN.dXXXX.amplifyapp.com`. Excelente para review antes de merge.

### Passo 10 — Comparar com Firebase

Após validar que tudo funciona, deixe Firebase rodando por 1 semana e use Amplify como produção. Se sentir estável, desligue Firebase App Hosting (deletar app no Firebase Console).

## Critérios de aceitação

- [ ] App Amplify `deep-saude-frontend` criado e conectado ao GitHub
- [ ] `amplify.yml` versionado no repo
- [ ] Env vars configuradas (`NEXT_PUBLIC_API_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NODE_VERSION`)
- [ ] Build verde no Amplify (logs sem erro)
- [ ] URL pública responde 200
- [ ] Login funcional (NextAuth + backend AWS)
- [ ] PR previews habilitados (opcional)

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **Amplify Hosting** | Serviço de hosting full-stack: build, deploy, CDN, custom domain, branch previews. |
| **Amplify Gen 1 vs Gen 2** | Gen 1 = config via console; Gen 2 = config como código (TypeScript). Para hosting puro, Gen 1 basta. |
| **Build spec (`amplify.yml`)** | YAML que descreve fases de build/test. Análogo a GitHub Actions workflow. |
| **Branch deployment** | Cada branch git é um environment separado com URL própria. |
| **Atomic deployment** | Build novo só substitui o antigo se completar com sucesso. Zero downtime. |
| **SSR (Server-Side Rendering)** | Páginas renderizadas no servidor a cada request. Amplify roda em Lambda@Edge underneath. |
| **ISR (Incremental Static Regeneration)** | Páginas estáticas regeneradas em background. Amplify suporta. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Amplify mencionado como opção de "deployment para devs"
- Conceito de CI/CD (que vai mais a fundo em [AWS-015](AWS-015-github-actions-oidc.md))

### Solutions Architect Associate (SAA-C03)
**Amplify Hosting aparece pouco na prova.** O que aparece muito do que ele esconde:
- **CloudFront** — Amplify usa CloudFront por baixo. Saiba bem.
- **S3 static website hosting** — alternativa "mão na massa" para SPA estático
- **Lambda@Edge / CloudFront Functions** — para SSR sem servidor dedicado
- **Route 53 + ACM** — domain + cert (vamos fazer no [AWS-012](AWS-012-route53-acm-dominio.md))

**Cenários típicos:**
- "Aplicação React estática, baixa latência global" → S3 + CloudFront
- "App Next.js com SSR" → Amplify Hosting OU ECS Fargate
- "Edge logic para A/B testing" → CloudFront Functions
- "Personalização por usuário em edge" → Lambda@Edge

## Riscos / dependências

- **Free Tier expira em 12 meses.** Depois cobra normal. Para apps pequenos, ~$5-15/mês é típico.
- **Build minutes**: 1000/mês grátis, depois $0,01/min. Builds de Next.js 15 levam 3-6min. 100 deploys/mês × 5min = 500min, dentro do free.
- **Cold start no SSR**: Amplify Hosting com SSR usa Lambda@Edge nos bastidores. Primeira request por região pode demorar 1-3s.
- **Build falhando por dependências:** se `npm ci` quebrar, verifique:
  - `package-lock.json` commitado
  - `NODE_VERSION` matchando local
  - Memory: builds pesados podem precisar de `_BUILD_MEM_SIZE` env var
- **NEXT_PUBLIC_*** é embeddado no bundle em build time. Não use para secrets — sai no JS do cliente. Para secrets server-side, NÃO use `NEXT_PUBLIC_` prefix.
- **Custos surpresa:** Amplify Hosting + CloudFront + Route 53 + ACM = ~$5-20/mês fácil em produção pequena.

## Próximo card

[AWS-011 — CloudFront na frente para cache e proteção](AWS-011-cloudfront-cdn.md)

# [AWS-011] CloudFront na frente para cache, HTTPS e proteção

**Prioridade:** 🟠 Alto
**Fase:** 3 — Frontend
**Esforço:** M (meio dia)
**Área:** Infra / Frontend
**Status:** TODO
**Custo estimado/mês:** ~$1-5 para tráfego pequeno (Free Tier: 1TB egress + 10M requests/mês, sempre — não é só 12 meses!)

## Contexto

Amplify Hosting já entrega via CloudFront por baixo, **mas a distribuição é gerenciada pela AWS** — você não controla. Para ter:

- Cache customizado (TTL por path)
- Headers de segurança (CSP, HSTS, X-Frame-Options)
- Geo-restriction (bloquear países, se aplicável)
- WAF na frente ([AWS-016](AWS-016-waf-shield.md))
- Custom domain único cobrindo frontend **e** backend

...você cria sua **própria distribuição CloudFront** apontando para Amplify + App Runner como origins.

> **Quando pular este card:** se você só tem tráfego BR, sem requisitos especiais, Amplify nativo já é "bom o suficiente". Você pode fazer este card só quando precisar de WAF/CSP/cache custom.

## Localização

- Origin 1: Amplify Hosting URL (frontend)
- Origin 2: App Runner URL (backend, em `/api/*`)

## Solução proposta

### Estratégia: 1 distribuição para tudo

```
                   Cliente
                      │
                      ▼
              ┌───────────────┐
              │  CloudFront   │  Edge locations (CDN)
              │  d12345.cloud │
              │   front.net   │
              └───┬───────┬───┘
                  │       │
       /api/*     │       │   /* (default)
                  ▼       ▼
        ┌────────────┐ ┌────────────┐
        │ App Runner │ │  Amplify   │
        │  (backend) │ │ (frontend) │
        └────────────┘ └────────────┘
```

Vantagens:
- 1 domínio único (`app.deepsaude.com.br`)
- Sem CORS entre front e back (mesma origem)
- WAF cobre tudo

### Passo 1 — Criar a distribuição

```bash
cat > cloudfront-config.json <<EOF
{
  "CallerReference": "deep-saude-$(date +%s)",
  "Comment": "Deep Saude — distribuição principal",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "amplify-frontend",
        "DomainName": "main.dXXXXXXXX.amplifyapp.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] }
        }
      },
      {
        "Id": "apprunner-backend",
        "DomainName": "abc123xyz.us-east-1.awsapprunner.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] }
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "amplify-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
    "Compress": true
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "apprunner-backend",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
          "Quantity": 7,
          "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
          "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
        },
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
        "Compress": true
      }
    ]
  }
}
EOF

aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json \
  --profile deep-saude
```

> Os IDs hexadecimais são **managed policies** da AWS:
> - `658327ea-...` = CachingOptimized (default behavior, cacheia front estático)
> - `4135ea2d-...` = CachingDisabled (API não cacheia)
> - `216adef6-...` = AllViewer (passa headers/cookies/query strings adiante)

PriceClass_100 = só edges EUA/Canadá/Europa (mais barato). PriceClass_200 = + Ásia/Brasil/Oceania. PriceClass_All = global.

### Passo 2 — Aguardar deploy (~15min)

CloudFront leva tempo (propaga para 400+ edges). Status `InProgress` → `Deployed`.

```bash
aws cloudfront list-distributions \
  --query 'DistributionList.Items[?Comment==`Deep Saude — distribuição principal`].{Id:Id,Status:Status,Domain:DomainName}' \
  --profile deep-saude
```

### Passo 3 — Adicionar Response Headers Policy (segurança)

Aproveite para forçar headers de segurança em todas as respostas:

```bash
aws cloudfront create-response-headers-policy \
  --response-headers-policy-config '{
    "Name": "deep-saude-security-headers",
    "Comment": "Headers de segurança",
    "SecurityHeadersConfig": {
      "StrictTransportSecurity": {
        "Override": true,
        "AccessControlMaxAgeSec": 63072000,
        "IncludeSubdomains": true,
        "Preload": true
      },
      "ContentTypeOptions": { "Override": true },
      "FrameOptions": { "Override": true, "FrameOption": "DENY" },
      "ReferrerPolicy": {
        "Override": true,
        "ReferrerPolicy": "strict-origin-when-cross-origin"
      },
      "XSSProtection": {
        "Override": true,
        "Protection": true,
        "ModeBlock": true
      },
      "ContentSecurityPolicy": {
        "Override": true,
        "ContentSecurityPolicy": "default-src '\''self'\''; img-src '\''self'\'' data: https:; script-src '\''self'\''; style-src '\''self'\'' '\''unsafe-inline'\''; connect-src '\''self'\'' https://*.amplifyapp.com https://*.awsapprunner.com"
      }
    }
  }' \
  --profile deep-saude
```

Anote o `Id` da policy retornada. Edite as cache behaviors da sua distribution para incluir `ResponseHeadersPolicyId`.

> CSP pode quebrar o frontend se você usar inline scripts. Comece com o policy report-only para detectar violações antes de enforçar.

### Passo 4 — Atualizar `NEXT_PUBLIC_API_URL`

Agora o backend é acessível em `https://d12345.cloudfront.net/api/...` (mesma origem do front). Atualize:

```
NEXT_PUBLIC_API_URL=  # vazio! same-origin
```

E em `next.config.ts`, os `rewrites` agora podem ficar relativos:
```typescript
rewrites: () => [
  { source: '/api/:path*', destination: '/api/:path*' }
]
```

Redeploya Amplify (push pra `main`).

### Passo 5 — Testar

- `https://d12345.cloudfront.net/` → frontend Next.js
- `https://d12345.cloudfront.net/api/papeis` → backend Clojure
- Browser DevTools → Network: ver header `Strict-Transport-Security`, etc.
- `https://securityheaders.com` → cole sua URL, mire em score A ou A+

### Passo 6 — Invalidação de cache pós-deploy

Quando você deploya o frontend, CloudFront pode servir conteúdo antigo. Invalide:

```bash
DIST_ID=$(aws cloudfront list-distributions \
  --query 'DistributionList.Items[?Comment==`Deep Saude — distribuição principal`].Id' \
  --output text --profile deep-saude)

aws cloudfront create-invalidation \
  --distribution-id $DIST_ID \
  --paths "/*" \
  --profile deep-saude
```

> 1000 invalidation-paths/mês grátis. Depois $0,005/path. Em automação, evite `/*` — invalide só os paths que mudaram.

## Critérios de aceitação

- [ ] Distribuição CloudFront criada com 2 origins (Amplify + App Runner)
- [ ] Behavior `/api/*` aponta para App Runner com cache disabled
- [ ] Default behavior aponta para Amplify com cache enabled
- [ ] Response Headers Policy com HSTS, CSP, X-Frame-Options aplicada
- [ ] Distribuição em status `Deployed`
- [ ] Front + back acessíveis via mesma URL CloudFront
- [ ] `securityheaders.com` retorna A ou A+
- [ ] Script de invalidation salvo localmente

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **CloudFront** | CDN da AWS. 400+ edge locations globais. Cache, SSL, compressão, HTTP/3. |
| **Distribution** | Configuração CloudFront. Cada uma tem um domain `d*.cloudfront.net`. |
| **Origin** | "Backend" do CloudFront — de onde ele puxa conteúdo. Pode ser S3, ALB, App Runner, custom. |
| **Cache Behavior** | Regra "para esse path-pattern, comporte-se assim" (cache policy, origin, methods). |
| **Cache Policy** | TTL + cache keys. AWS oferece managed policies prontas. |
| **Origin Request Policy** | Quais headers/cookies/query strings repassar para o origin. |
| **Response Headers Policy** | Headers que CloudFront adiciona à resposta antes de devolver. |
| **Invalidation** | Forçar expiração de cache para paths específicos. |
| **OAC (Origin Access Control)** | Para origins S3, garante que só CloudFront acessa (não direto). Sucessor do OAI. |
| **Price Class** | Quais edges usar. Restringir reduz custo. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- CloudFront é o serviço CDN da AWS. Saiba o que é e quando usar.
- Conceitos de edge location e latência

### Solutions Architect Associate (SAA-C03)
**Tópico muito importante.** Para a prova:
- **CloudFront + S3** com OAC vs OAI vs Public bucket — quando usar cada
- **Origin failover** (se primary origin cair, vai para secondary)
- **Lambda@Edge vs CloudFront Functions:**
  - CloudFront Functions: ultra-rápido (<1ms), JS limitado, só viewer request/response
  - Lambda@Edge: full Node.js/Python, mais lento, todos os 4 events
- **Signed URLs / Signed Cookies** — restringir conteúdo a usuários autenticados
- **Field-level encryption**
- **Real-time logs** vs **Standard logs**
- **Cache invalidation patterns** vs versioned URLs
- **Geographic restrictions** (whitelist/blacklist por país)
- **HTTP/3 (QUIC)** support

**Cenários típicos:**
- "Distribuir conteúdo estático global com baixa latência" → CloudFront + S3
- "Personalizar resposta por header de geolocalização sem ir até origin" → CloudFront Functions
- "Compliance: arquivos médicos só para usuários autenticados" → Signed URLs

## Riscos / dependências

- **CloudFront é eventual:** propagação de mudanças leva 5-15min. Não tente "fix em produção" sem paciência.
- **CSP é o calcanhar de Aquiles:** uma diretiva errada e seu app quebra. Comece com `Content-Security-Policy-Report-Only` (não-enforcing) por 1 semana, monitore, depois ative enforce.
- **Custos de transferência:** CloudFront tem free tier generoso (1TB/mês), mas se você expôe vídeos/imagens grandes, escala rapidamente.
- **Origem é HTTPS:** App Runner e Amplify só fazem HTTPS. Bom — CloudFront `https-only` para origin garante encriptação ponta-a-ponta.
- **Cuidado com `*` em invalidations:** invalidar `/*` conta como muitos paths em alguns casos. Use paths específicos quando possível.
- **CloudFront precisa estar em `us-east-1`** (mesmo sendo global) para várias features (WAF, Lambda@Edge).

## Próximo card

[AWS-012 — Route 53 + ACM + apontar domínio](AWS-012-route53-acm-dominio.md)

# [AWS-012] Route 53 + ACM + apontar domínio próprio

**Prioridade:** 🟠 Alto
**Fase:** 4 — DNS / SSL
**Esforço:** M (meio dia) + propagação DNS (até 48h)
**Área:** Infra / DNS
**Status:** TODO
**Custo estimado/mês:** $0,50/hosted zone + ~$0,40/milhão de queries + $12-15/ano domínio (se registrar via Route 53)

## Contexto

Hoje seus usuários acessam URLs como `main.dXXXXXXXX.amplifyapp.com` ou `d12345.cloudfront.net`. Em produção real, precisa de um domínio próprio: `app.deepsaude.com.br` (ou similar).

Vamos usar:
- **Route 53** — DNS gerenciado da AWS
- **ACM (AWS Certificate Manager)** — certificados SSL grátis, renovação automática

## Localização

Recursos a "vestir" com domínio:
- CloudFront distribution do [AWS-011](AWS-011-cloudfront-cdn.md)
- Ou Amplify Hosting direto (mais simples, se você pulou AWS-011)

## Pré-requisitos

- **Domínio registrado.** Opções:
  - Já tem domínio em **Registro.br** / GoDaddy / Namecheap? Mantenha lá, só aponte nameservers para Route 53.
  - Não tem? Registre via Route 53 (`.com` ~$12/ano, `.com.br` não é vendido via Route 53 — só Registro.br).

## Solução proposta

### Caminho A — Domínio já registrado em outro provider

#### Passo 1 — Criar hosted zone no Route 53

```bash
aws route53 create-hosted-zone \
  --name deepsaude.com.br \
  --caller-reference "$(date +%s)" \
  --profile deep-saude
```

Anote os 4 nameservers retornados (algo como `ns-XXX.awsdns-XX.com`).

#### Passo 2 — Atualizar nameservers no provider atual

No painel do Registro.br (ou wherever) → DNS → Nameservers → trocar para os 4 da AWS. Propagação: até 48h, normalmente 1-4h.

#### Passo 3 — Validar

```bash
# Esperar e checar:
dig NS deepsaude.com.br +short
# Deve retornar os nameservers da AWS
```

### Caminho B — Registrar domínio via Route 53

Console → **Route 53** → **Domains** → **Register domain** → seguir wizard. Route 53 cria hosted zone automaticamente.

> Para `.com.br`, **registre no Registro.br** (única opção). Mas use Route 53 como DNS apontando os nameservers.

---

### Passo 4 — Solicitar certificado ACM

⚠️ **CRÍTICO:** certificado para uso com CloudFront **DEVE** estar em `us-east-1`. Mesmo se sua infra está em `sa-east-1`. Para uso com ALB/App Runner não-CloudFront, na região do recurso.

```bash
aws acm request-certificate \
  --domain-name app.deepsaude.com.br \
  --subject-alternative-names "*.deepsaude.com.br" "deepsaude.com.br" \
  --validation-method DNS \
  --region us-east-1 \
  --profile deep-saude
```

Anote o `CertificateArn` retornado.

#### Passo 5 — Validar via DNS

ACM gera registros CNAME para você adicionar ao DNS:

```bash
aws acm describe-certificate \
  --certificate-arn <cert-arn> \
  --region us-east-1 \
  --profile deep-saude \
  --query 'Certificate.DomainValidationOptions[*].ResourceRecord'
```

Você verá registros tipo:
```
Name: _abc123.app.deepsaude.com.br
Type: CNAME
Value: _xyz.acm-validations.aws
```

Adicionar no Route 53:

```bash
# (Via Console é mais fácil:)
# Route 53 → seu hosted zone → Create record →
# Record type: CNAME
# Name: _abc123 (sem domínio, ele completa)
# Value: _xyz.acm-validations.aws
# Routing policy: simple
```

Ou via CLI (mais verboso, omitido aqui).

Aguardar 5-30min. Validação automática:

```bash
aws acm describe-certificate --certificate-arn <cert-arn> \
  --region us-east-1 --profile deep-saude \
  --query 'Certificate.Status'
# Quando retorna "ISSUED", está pronto
```

### Passo 6 — Anexar certificado ao CloudFront

Console → CloudFront → seu distribution → **Edit** → **Settings** :
- Alternate domain name (CNAME): `app.deepsaude.com.br`
- Custom SSL certificate: selecione o ACM (precisa estar `ISSUED` em us-east-1)
- Save → aguarde redeploy (~10min)

### Passo 7 — Criar registro A (alias) no Route 53

Apontar `app.deepsaude.com.br` → CloudFront:

Console → Route 53 → seu zone → Create record:
- Record name: `app`
- Record type: **A**
- Alias: **ON**
- Route traffic to: **Alias to CloudFront distribution**
- Choose distribution: selecione
- Save

Adicione também AAAA (IPv6) com o mesmo target — best practice.

### Passo 8 — Apex domain (`deepsaude.com.br` sem www) — opcional

Mesma ideia, mas record name vazio. Apex domain não pode ter CNAME — sempre alias A/AAAA.

### Passo 9 — Apontar custom domain no Amplify (se não usou CloudFront próprio)

Caminho alternativo se você pulou AWS-011:
- Amplify Console → seu app → **Hosting** → **Custom domains** → **Add domain**
- Domain: `deepsaude.com.br`
- Subdomain mapping:
  - `app.deepsaude.com.br` → branch `main`
  - `staging.deepsaude.com.br` → branch `staging`
- Amplify gerencia ACM cert internamente, te dá registros DNS para adicionar
- Salvar e aguardar (~15-30min)

### Passo 10 — Backend: `api.deepsaude.com.br` apontando para App Runner

App Runner suporta custom domain nativo:

1. Console → App Runner → seu service → **Custom domains** → **Link domain** → `api.deepsaude.com.br`
2. Ele gera registros DNS para validação — adicionar no Route 53
3. Ativa HTTPS automaticamente (cert managed)

Ou, se você está usando CloudFront na frente do App Runner (do [AWS-011](AWS-011-cloudfront-cdn.md)), não precisa — mesma distribuição já cobre.

### Passo 11 — Testar tudo

```bash
curl https://app.deepsaude.com.br/
# Deve retornar HTML do Next.js

curl https://app.deepsaude.com.br/api/papeis
# Deve retornar JSON do backend

# Headers de segurança:
curl -I https://app.deepsaude.com.br/ | grep -i 'strict-transport\|x-frame'
```

E no browser, conferir que cadeado verde aparece e cert é válido (clique no cadeado).

## Critérios de aceitação

- [ ] Hosted zone Route 53 criada
- [ ] Nameservers do provider de registro apontam pra Route 53
- [ ] `dig NS deepsaude.com.br` retorna nameservers AWS
- [ ] Certificado ACM em `ISSUED` em `us-east-1`
- [ ] CloudFront (ou Amplify) usa o certificado
- [ ] Registro A alias no Route 53 aponta `app.deepsaude.com.br` → distribuição
- [ ] HTTPS funciona sem warning (cert válido, sem mixed content)
- [ ] (Opcional) `api.deepsaude.com.br` ou path `/api/*` funcional

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **Route 53** | DNS gerenciado AWS. Suporta routing policies avançadas (geo, latency, failover). |
| **Hosted Zone** | Container de records DNS para um domínio. $0,50/mês cada. |
| **A record** | Mapeia domain → IPv4 |
| **AAAA record** | Mapeia domain → IPv6 |
| **CNAME** | Mapeia domain → outro domain |
| **Alias record** | Tipo "AWS-only" de A/AAAA que aponta para recursos AWS (CloudFront, ALB, S3). Sem custo de query. |
| **ACM (Certificate Manager)** | Emissão e gestão de certs SSL/TLS. **Grátis**. Renovação automática. |
| **DNS validation** | Provar ownership criando record CNAME no zone. Mais rápido e robusto que email validation. |
| **Routing policy** | Como Route 53 escolhe qual record retornar: simple, weighted, latency, failover, geolocation, geoproximity, multivalue. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Route 53 = "DNS da AWS" (saber que existe)
- ACM = certificados grátis

### Solutions Architect Associate (SAA-C03)
**Tópico cobrado com frequência alta.** Estudar:

- **Routing policies (DECORE):**
  - **Simple** — 1 record, padrão
  - **Weighted** — distribuir % entre múltiplos targets (canary deploys)
  - **Latency-based** — direciona para region mais próxima
  - **Failover** — primary/secondary com health check
  - **Geolocation** — por país/continente do cliente
  - **Geoproximity** — bias por distância geográfica (precisa Traffic Flow)
  - **Multivalue answer** — DNS round-robin com health check (até 8)

- **Health Checks** (endpoint, calculated, CloudWatch alarm)
- **Alias vs CNAME** — apex domain só com alias (CNAME não pode em raiz da zona)
- **Route 53 Resolver** (resolver DNS para VPCs híbridas)
- **DNSSEC** (assinatura de zona, anti-spoofing)
- **Public hosted zone vs Private hosted zone** (privada = só dentro da VPC)
- **Domain registration** (Route 53 também é registrar)

**Cenários da prova:**
- "Failover automático para região de DR" → Failover routing policy + health check
- "Direcionar usuários ásia → Tokyo, EUA → Virgínia" → Latency-based
- "Liberar gradualmente novo deploy" → Weighted (10%, 50%, 100%)

## Riscos / dependências

- **Propagação DNS é lenta.** Mudança de NS pode demorar até 48h. Faça em horário planejado.
- **TTL** dos registros antigos pode estar alto. Antes de mudar, reduza TTL para 60s no provider antigo, espere expirar caches, depois mude NS.
- **ACM em região errada**: cert no `sa-east-1` não funciona com CloudFront. **Sempre `us-east-1`** para CloudFront.
- **`.com.br` não pode ser registrado via Route 53** — só Registro.br. Use Route 53 apenas como DNS.
- **Custo de query Route 53**: $0,40/milhão. Free Tier inclui muitos queries. Em prática, ~$0,50-1/mês para apps pequenos.
- **Mixed content warnings**: se algum recurso é carregado via HTTP (não HTTPS) na página HTTPS, browser bloqueia. Confira `Content-Security-Policy: upgrade-insecure-requests`.

## Próximo card

[AWS-013 — CloudWatch Logs](AWS-013-cloudwatch-logs.md)

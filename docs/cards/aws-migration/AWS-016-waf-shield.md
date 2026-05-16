# [AWS-016] WAF na frente do CloudFront + Shield Standard

**Prioridade:** 🟡 Médio
**Fase:** 7 — Segurança em produção
**Esforço:** M (meio dia)
**Área:** Infra / Segurança
**Status:** TODO
**Custo estimado/mês:** $5/Web ACL + $1/regra + $0,60/milhão requests inspecionados (Shield Standard é grátis e automático)

## Contexto

Internet é hostil. Mesmo um app pequeno como o Deep Saúde será alvo de:

- Scanners automáticos buscando vulns conhecidos (Log4Shell, SQL injection)
- Bots tentando brute force em login
- Spam em endpoints públicos
- Volumetric DDoS

**Shield Standard** já está ativo desde [AWS-001](AWS-001-criar-conta-iam-billing.md) — proteção contra DDoS comuns (SYN flood, UDP reflection). Grátis e automático.

**WAF (Web Application Firewall)** complementa: regras Layer 7 (HTTP/HTTPS) baseadas em conteúdo do request. SQL injection, XSS, rate limiting, geo, OWASP.

## Localização

- CloudFront distribution do [AWS-011](AWS-011-cloudfront-cdn.md) — atachar WAF aqui
- Opcionalmente: ALB (se você fez [AWS-009](AWS-009-alternativa-ecs-fargate.md))

## Solução proposta

### Passo 1 — Criar Web ACL com regras managed

Console é mais visual aqui (WAF JSON é verboso). Console → **WAF & Shield** → **Web ACLs** → **Create web ACL**:

1. **Name:** `deep-saude-prod-waf`
2. **Scope:** **CloudFront distributions (global)** ⚠️ região fica `Global` automaticamente
3. **Resource type:** CloudFront distribution
4. **Add AWS resources:** selecione sua distribution
5. **Add rules:**
   - **AWS managed rule groups** (clique em "Add managed rule groups"):
     - ✅ **AWS Managed Rules — Core rule set (CRS)** — proteção genérica OWASP
     - ✅ **AWS Managed Rules — Known bad inputs** — bloqueia exploits conhecidos
     - ✅ **AWS Managed Rules — SQL database** — SQLi
     - ✅ **AWS Managed Rules — Linux operating system** — patterns de exploit Linux
     - ✅ **AWS Managed Rules — Amazon IP reputation list** — IPs flagged em threat intel
     - ❌ Outros (Anonymous IP, Bot Control) — cobram mais, podem ser adicionados depois
6. **Custom rules** (opcional, mas recomendado):
   - **Rate-based rule** para login: limit 100 requests por 5min por IP em `/api/login`
     - Type: Rate-based
     - Rate limit: 100 requests / 5 min
     - Scope of inspection: only requests matching a scope-down statement
     - Scope-down: URI path equals `/api/login`
     - Action: Block (or CAPTCHA)
   - **Geographic restriction** se aplicável: bloquear países de origem comum de abuso (RU, CN, KP) se você não opera lá
7. **Default action:** Allow
8. **Set rule priority** — managed rules antes, custom depois
9. **Configure metrics** — habilitar CloudWatch metrics e sample requests
10. Review and create

### Passo 2 — Validar associação

Console → CloudFront → seu distribution → **General** → AWS WAF: deve aparecer `deep-saude-prod-waf`.

Tempo de propagação ~5min.

### Passo 3 — Testar bloqueio

```bash
# SQLi simulado (deve ser bloqueado pela regra SQL database)
curl "https://app.deepsaude.com.br/api/papeis?id=1' OR '1'='1"
# Deve retornar 403 Forbidden

# Verificar nos logs:
# Console → WAF → Web ACLs → deep-saude-prod-waf → Sampled requests
```

### Passo 4 — Habilitar logging do WAF

Logs ajudam a refinar regras (entender false positives).

1. Console → WAF → seu ACL → **Logging and metrics** → **Enable logging**
2. Destination: criar um **Kinesis Firehose** que entrega em S3 (mais barato que CloudWatch Logs direto)

```bash
# Pré-requisito: criar S3 bucket para logs
aws s3api create-bucket --bucket deep-saude-waf-logs --region us-east-1 --profile deep-saude

# Criar Firehose:
aws firehose create-delivery-stream \
  --delivery-stream-name aws-waf-logs-deep-saude \
  --extended-s3-destination-configuration '{
    "BucketARN": "arn:aws:s3:::deep-saude-waf-logs",
    "RoleARN": "arn:aws:iam::<account-id>:role/firehose-waf-logs-role",
    "Prefix": "year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
    "ErrorOutputPrefix": "errors/"
  }' \
  --profile deep-saude
```

> O nome do Firehose **deve começar com `aws-waf-logs-`** — exigência WAF.

### Passo 5 — Iniciar em "Count mode" antes de "Block"

WAF tem dois modos por regra:
- **Count** — só conta, não bloqueia (ótimo para detectar false positive)
- **Block** — bloqueia

Sugestão: configurar regras managed em `Count` por 1-2 semanas, analisar Sample Requests, ver se algum tráfego legítimo está sendo flagado. Depois mudar para `Block`.

Mudar modo: WAF → seu ACL → Rules → editar regra → override actions.

### Passo 6 — Shield Standard vs Advanced

**Shield Standard** (já ativo):
- Grátis
- Proteção contra os ataques DDoS mais comuns (Layer 3/4: SYN/UDP flood, reflection)
- Detecção automática

**Shield Advanced** ($3000/mês 😱):
- Cobertura ampliada (Layer 7 DDoS)
- DDoS Response Team (DRT) acessível 24/7
- Custos de scale-out durante ataque cobertos pela AWS
- WAF inclusas grátis

> Shield Advanced **não é justificável** para o Deep Saúde. Para grande empresa sob ataque ativo, talvez.

### Passo 7 — Sample requests e bot insights

Console → WAF → seu ACL → **Overview** → **Sampled requests**: mostra últimos 5 min de requests inspecionadas (15% sample). Útil pra debugar falsos positivos.

### Passo 8 — Regras customizadas pelo seu app

Conforme você ganha experiência, adicione regras específicas:

**Bloquear scrapers em /api/pacientes:**
```
Match condition:
  URI path equals: /api/pacientes
  AND
  User-Agent contains: python-requests OR curl OR wget
Action: Block
```

**Permitir só Brasil:**
```
Geo match: country code IS NOT BR
Action: Block (CAUTION: vai bloquear VPN também)
```

Use parcimônia — regras erradas quebram seu app.

## Critérios de aceitação

- [ ] Web ACL `deep-saude-prod-waf` criada com escopo CloudFront (global)
- [ ] Pelo menos 4 managed rule groups habilitados
- [ ] Rate-based rule em `/api/login` ativa
- [ ] Web ACL associada à distribution CloudFront
- [ ] Logging WAF em S3 via Firehose
- [ ] SQLi de teste retorna 403
- [ ] Regras inicialmente em Count, plano de mudar para Block após 1-2 semanas

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **AWS WAF** | Web Application Firewall. Inspeciona HTTP/HTTPS Layer 7. |
| **Web ACL (Access Control List)** | Conjunto de regras WAF aplicado a um recurso (CloudFront, ALB, API Gateway, App Sync). |
| **Managed Rule Groups** | Regras prontas mantidas pela AWS ou marketplace vendors. Pagas por uso. |
| **Rate-based rule** | Conta requests por IP/header em janela 5min, bloqueia se passar. |
| **Geographic restriction** | Bloqueia/permite por país de origem (GeoIP). |
| **Bot Control** | Rule group avançado, detecta bots por sinal comportamental. Pago à parte. |
| **Captcha / Challenge action** | Em vez de bloquear, faz cliente resolver CAPTCHA ou problema computacional. |
| **AWS Shield Standard** | Anti-DDoS Layer 3/4, grátis e automático em CloudFront, R53, ALB. |
| **AWS Shield Advanced** | Pago ($3k/mês), proteção L7, suporte DRT, cobertura financeira de scale. |
| **AWS Firewall Manager** | Gerencia WAF/Shield/SG centralizadamente em multi-conta via Organizations. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- WAF e Shield mencionados como serviços de segurança
- Saber diferença básica entre Network ACL, Security Group e WAF

### Solutions Architect Associate (SAA-C03)
**Cobrado em cenários de segurança e edge.** Estudar:

- **WAF deployment scopes:** CloudFront (global), Regional (ALB, API Gateway, AppSync, App Runner)
- **Rule types:** IP set, Regex pattern, Size constraint, Geo, Rate-based, Managed
- **CAPTCHA / JS Challenge** vs Block — quando usar cada
- **Shield Standard vs Advanced** features (DDoS, Response Team, cost protection)
- **AWS Firewall Manager** vs WAF — quando faz sentido (multi-conta com Organizations)
- **Diferença entre WAF e:**
  - Security Group (Layer 4, stateful)
  - NACL (Layer 4, stateless, subnet)
  - Network Firewall (VPC-level, IDS/IPS — diferente de WAF que é app-level)

**Cenário clássico de prova:**
- "Bloquear SQL injection na app pública" → WAF Managed SQLi rule
- "DDoS protection para app crítica" → Shield Advanced
- "Restringir acesso por país" → WAF Geo match
- "Centralizar regras em 5 contas AWS" → Firewall Manager

## Riscos / dependências

- **False positives são comuns.** Managed CRS pode bloquear request legítima (ex: corpo JSON grande). Sempre teste em modo Count primeiro.
- **Custo escala com requests:** $0,60/milhão pode dobrar custo de tráfego. Monitore Cost Explorer após ativar.
- **WAF em CloudFront** é global (us-east-1). Para ALB regional, WAF na mesma região do ALB.
- **Shield Standard é grátis** mas não substitui WAF. Eles fazem coisas diferentes.
- **Rate-based rules:** janela é fixa 5min, não configurável. Para janelas customizadas, regras + Lambda + DynamoDB.
- **Logging via Firehose** cobra Firehose, S3 storage, e (se buscar) Athena. Em produção, considere lifecycle agressivo no S3 (mover pra Glacier após 30 dias).

## Próximo card

[AWS-017 — AWS Budgets + Cost Alerts](AWS-017-budgets-cost-alerts.md)

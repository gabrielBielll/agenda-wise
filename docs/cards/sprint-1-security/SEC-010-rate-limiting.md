# [SEC-010] Rate limiting em login e provisionamento

**Severidade:** 🟠 High
**Sprint:** 1
**Esforço:** M (meio dia)
**Área:** Backend
**Status:** TODO

## Contexto

Hoje, os endpoints `/api/auth/login` e `/api/admin/provisionar-clinica` aceitam volume infinito de requests. Isso permite:

- Brute force de senha em qualquer conta conhecida
- DoS por flooding de login (gerar trabalho de hash bcrypt no servidor)
- Spam de provisionamento de clínicas (consome registros + UUIDs)

## Solução proposta

### Opção A — middleware Ring de rate limit (in-memory)

Aceitável para single-instance. Não funciona se houver múltiplas instâncias do backend.

Adicionar ao `project.clj`:
```clojure
[ring.middleware.ratelimit "0.2.4"]
```

```clojure
(require '[ring.middleware.ratelimit :as rate])

(def login-rate-limiter
  (rate/wrap-ratelimit identity
    {:limits [(rate/ip-limit 5)]      ;; 5 requests
     :timeunit :minute}))

;; aplicar só na rota de login:
(POST "/api/auth/login" req (login-rate-limiter login-handler))
```

### Opção B — Redis-backed (production-ready)

Se for ter múltiplas instâncias, usar [ring-rate-limit](https://github.com/jeroenvandijk/ring-rate-limit) ou similar com Redis. Mais complexo, mas escala.

### Opção C — delegar pro proxy/edge

Cloudflare, Render, Fly têm rate limiting nativo no edge. Configurar regra:
- `/api/auth/login`: 10 req/min por IP
- `/api/admin/provisionar-clinica`: 5 req/hora por IP

Vantagem: sem código. Desvantagem: amarrado ao provedor.

### Recomendação

Para MVP: Opção A. Quando escalar: revisitar.

### Passo extra — proteção contra credential stuffing

Mesmo com rate limit por IP, atacantes usam bots distribuídos. Adicionar:

1. Logar (em log estruturado, não println) tentativas falhadas com `email + ip`
2. Detectar pattern (mesma conta, IPs diferentes) → trigger captcha ou bloqueio temporário da conta

Pode ficar como follow-up.

### Mensagens de erro

Importante: erro deve ser **genérico**. Não diferenciar "usuário não existe" de "senha errada":

```clojure
{:status 401 :body {:erro "Credenciais inválidas."}}
```

Já está assim, bom.

## Critérios de aceitação

- [ ] `POST /api/auth/login` aplica rate limit (escolher número: 5-10 req/min por IP)
- [ ] `POST /api/admin/provisionar-clinica` aplica rate limit mais agressivo (1-5 req/hora)
- [ ] Smoke test: 11 requests rápidos para `/login` resultam em 429 após o limite
- [ ] Mensagem de erro 429 clara mas sem revelar detalhes (`{:erro "Muitas tentativas. Tente novamente em alguns minutos."}`)

## Riscos / dependências

- **Single instance assumption:** se Opção A for adotada, lembrar que escalar horizontalmente vai precisar de Redis (ou trocar a estratégia). Documentar em comentário do código.
- **Falsos positivos:** clínicas em rede compartilhada (NAT corporativo) podem ter muitos usuários no mesmo IP. Considerar rate limit por `email` em conjunto, não só IP.
- **Dependência:** decisão de plataforma de deploy ([OPS-001](../sprint-3-production/OPS-001-decidir-deploy.md)) pode oferecer rate limit nativo (Opção C).

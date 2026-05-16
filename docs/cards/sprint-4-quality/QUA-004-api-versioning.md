# [QUA-004] Versionamento de API (`/api/v1`)

**Severidade:** 🟢 Low
**Sprint:** 4
**Esforço:** M (meio dia)
**Área:** Backend / Frontend
**Status:** TODO

## Contexto

Todas as rotas hoje começam em `/api/` sem versão (`/api/pacientes`, `/api/agendamentos`). Quando o produto evoluir e precisarmos quebrar contrato (mudar formato de response, renomear campos), não tem caminho de evolução: ou quebra todos os clientes ou nunca quebra.

Em produto SaaS sem clientes externos integrando, esse risco é menor — você controla frontend e backend juntos. Mas se algum dia surgir:

- App mobile
- Integrações via API (parceiros)
- Webhooks externos

…vai querer versionamento. Hora boa de adicionar é antes de subir pra produção (custos baixos, sem clientes esperando).

## Solução proposta

### Estratégia

URL-based versioning: `/api/v1/...`. Simples, visível, idiomático.

### Passo 1 — refatorar rotas backend

[core.clj:1207-1218](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1207-L1218):

```clojure
(defroutes app-routes
  (context "/api/v1" []
    (POST "/auth/login" req (login-handler req))
    (POST "/admin/provisionar-clinica" req (provisionar-clinica-handler req))
    (GET "/pacientes" req ((wrap-checar-permissao listar-pacientes-handler "ler_pacientes") req))
    ;; ... todas as rotas migram pra dentro do context
    )

  (GET "/api/health" [] (health-handler))   ;; health fica fora de versionamento

  (route/not-found "Recurso não encontrado"))
```

### Passo 2 — refatorar chamadas frontend

Centralizar URL base ([ROB-005](../sprint-2-robustness/ROB-005-timeouts-retry-fetch.md) já recomenda um `backend-client.ts`):

```typescript
// backend-client.ts
const BACKEND_URL = process.env.BACKEND_URL!;
const API_VERSION = "v1";
const API_BASE = `${BACKEND_URL}/api/${API_VERSION}`;

export async function callBackend(path: string, options: ...) {
  return fetch(`${API_BASE}${path}`, ...);
}
```

Aí no resto do codebase usa só `callBackend("/pacientes")` — versão centralizada.

### Passo 3 — atualizar CORS

[SEC-007](../sprint-1-security/SEC-007-restringir-cors.md) configurou CORS por env var. Garantir que o ajuste de URL não quebra preflights.

### Passo 4 — documentar política de versionamento

Em `docs/RUNBOOK.md`:

> ## API Versioning
>
> - URL-based: `/api/v1/...`
> - Breaking changes exigem nova versão: `/api/v2/...`
> - Versões anteriores mantidas no mínimo 6 meses após depreciação
> - Mudanças aditivas (novo campo opcional, novo endpoint) não exigem nova versão

### Quando criar `v2`?

Critério: **se quebra contrato com cliente existente, é nova versão.**

- Renomear campo → `v2`
- Mudar tipo de campo (string → number) → `v2`
- Remover endpoint → `v2`
- Adicionar campo opcional → `v1` ainda
- Adicionar endpoint → `v1` ainda
- Mudar mensagem de erro humana → `v1` ainda (técnico, mas raramente é breaking)

## Critérios de aceitação

- [ ] Todas as rotas backend agora estão sob `/api/v1`
- [ ] Frontend usa constante `API_VERSION` (não hardcoda `v1` em todo lugar)
- [ ] `/api/health` permanece fora de versionamento
- [ ] CORS ajustado se necessário
- [ ] Política documentada em RUNBOOK.md
- [ ] Smoke test: app completa funciona após refator

## Riscos / dependências

- **Esforço:** principalmente find-and-replace + smoke teste. Pode dar bugs em chamadas que ficaram sem migrar.
- **Atenção:** se houver webhooks/integrações já configuradas (ex: pagamentos) com URL antiga, manter redirecionamento temporário ou versão antiga até atualizar consumidores.
- **Card cosmético:** não urgente, mas hora boa é antes de qualquer integração externa começar.

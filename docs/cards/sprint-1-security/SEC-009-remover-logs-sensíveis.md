# [SEC-009] Remover logs de PII e do JWT_SECRET parcial

**Severidade:** 🟠 High
**Sprint:** 1
**Esforço:** S (≤2h)
**Área:** Cross-cutting
**Status:** TODO

## Contexto

O backend imprime no startup os 4 primeiros e 4 últimos caracteres do JWT_SECRET — vazando 8 chars do segredo para logs (que vão para CloudWatch/Logflare/etc. e podem ser visíveis a vários membros da equipe). Além disso, o login handler imprime `email` do usuário em plaintext, e a middleware de permissão imprime role/permissão por request.

No frontend, há `console.log` espalhado vazando `email`, `token`, IDs de paciente e detalhes de auth.

## Localizações

### Backend

| Linha | Conteúdo |
|---|---|
| [core.clj:54-59](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L54-L59) | Imprime início e fim do JWT_SECRET no startup |
| [core.clj:110](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L110) | `println "DEBUG: Middleware JWT. Token presente?"` |
| [core.clj:131, 136](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L131) | `println "DEBUG PERMISSAO: role="` |
| [core.clj:189-193](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L189-L193) | `println "DEBUG LOGIN: Tentativa de login para email:"` |

### Frontend

- `app/api/auth/[...nextauth]/route.ts` — várias linhas com `console.log` em `authorize`, `jwt`, `session` (~lines 42, 45, 50, 79, 90)
- `app/(app)/patients/page.tsx:55` — log de dados de paciente
- Muitas `actions.ts` em calendar/patients logam IDs e respostas

## Solução proposta

### Passo 1 — remover println do JWT_SECRET

Substituir o bloco de startup por algo neutro:

```clojure
(def jwt-secret
  (or (System/getenv "JWT_SECRET")
      (do (println "ERRO: JWT_SECRET não configurada.")
          (System/exit 1))))

(println (str "Backend iniciado — JWT_SECRET length: " (count jwt-secret) " chars."))
```

Comprimento não é segredo. Conteúdo (mesmo parcial) é.

### Passo 2 — remover println de PII e debug do hot path

Procurar e remover (ou rebaixar para timbre debug condicional):

```bash
grep -n "println" deep-saude-plataforma-api/deep-saude-backend/src/**/*.clj
```

Regra: **nenhum dado de usuário** (email, nome, hash, token, papel) pode aparecer em log em produção.

### Passo 3 — preparar terreno pra logs estruturados (ROB-008)

Não precisa fazer agora, mas evite simplesmente deletar — alguns logs são úteis para debugging. Marcar com `;; TODO: usar timbre debug` onde apropriado.

### Passo 4 — frontend

```bash
grep -rn "console.log\|console.warn\|console.error" deep-saude-plataforma-front-end/src/
```

Remover todos os `console.log`. `console.error` pode ficar para erros legítimos, mas nunca incluir PII. Substituir por logger condicional:

```typescript
const log = process.env.NODE_ENV === "development" ? console.log : () => {};
```

Ou simplesmente remover.

## Critérios de aceitação

- [ ] Startup do backend não imprime nenhum trecho do JWT_SECRET
- [ ] `grep -n "println.*email\|println.*senha\|println.*token" core.clj` retorna vazio
- [ ] `grep -rn "console.log" deep-saude-plataforma-front-end/src/` retorna apenas casos justificados (idealmente vazio)
- [ ] Logs do backend em produção não revelam PII

## Riscos / dependências

- **Atenção:** alguns desses logs eram úteis para debugging do incidente de hash. Antes de remover, conferir se já não estão obsoletos. Marcar com comentário `;; previously used for [...]` se houver receio de precisar de novo.
- **Próximo passo:** [ROB-008](../sprint-2-robustness/ROB-008-logs-estruturados.md) traz uma solução completa de logging.

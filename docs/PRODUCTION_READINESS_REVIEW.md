# Deep Saúde — Relatório de Auditoria Pré-Produção

> Data: 2026-05-15
> Escopo: backend Clojure, frontend Next.js 15, infraestrutura Docker
> Resultado: **Não pronto para produção.** 27 itens identificados, 10 deles bloqueadores.

## Sumário executivo

O Deep Saúde tem uma base funcional sólida — o MVP entrega prontuário, financeiro, agenda e RBAC. Mas a transição para produção exige hardening em três frentes:

1. **Segurança** — há vulnerabilidades graves que permitem bypass de autenticação e vazamento de credenciais.
2. **Escalabilidade** — sem pool de conexões, sem rate limiting e sem timeouts, o sistema cai com poucos usuários simultâneos.
3. **Operação** — sem observabilidade, alvo de deploy unificado ou migrations versionadas, manter o sistema em produção será doloroso.

A boa notícia: **nenhum dos problemas exige refatoração estrutural**. São correções localizadas que podem ser feitas em 3 sprints (~1-2 semanas de trabalho focado).

## Visão da arquitetura atual

```
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  Next.js 15 (9002)  │  HTTP   │  Clojure/Ring (3000) │  JDBC   │  Postgres 15    │
│  NextAuth + Server  │ ◄─────► │  Compojure + JWT     │ ◄─────► │  (CockroachDB   │
│  Actions            │         │  Buddy hashers       │         │   em prod)      │
└─────────────────────┘         └──────────┬───────────┘         └─────────────────┘
                                           │
                                           │ S3 API
                                           ▼
                                  ┌──────────────────┐
                                  │  MinIO (9000)    │
                                  └──────────────────┘
```

**Pontos fortes:**
- Separação clara front/back
- JWT signed com HS256 (Buddy) — algoritmo apropriado para single-issuer
- RBAC via tabela `papeis` + `papeis_permissoes` (modelo estendível)
- Multi-tenancy via `clinica_id` no JWT
- Server Actions usados no Next 15 (boa escolha)

**Dívidas estruturais:**
- Single arquivo `core.clj` com todos os handlers (manutenibilidade)
- Validação de input ausente em todas as camadas
- Sem camada de service/repository — handlers fazem SQL direto
- Componentes client-side gigantes no frontend (CalendarClient.tsx com 16+ pieces de state)

---

## 🔴 BLOQUEADORES (Sprint 1 — Segurança)

### 1. Auto-correção de hash no login = bypass total de autenticação

**Arquivo:** [deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:197-206](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L197-L206)

```clojure
(let [senha-valida (try
                     (hashers/check senha (:senha_hash usuario))
                     (catch Exception e
                       ;; "auto-corrige" hash quebrado regerando com a senha digitada
                       (let [new-hash (hashers/encrypt senha)]
                         (execute-one! ["UPDATE usuarios SET senha_hash = ? WHERE email = ?" new-hash email])
                         (hashers/check senha new-hash))))]
```

Esse bloco resolveu uma dor real (hashes legados em formato `bcrypt+sha512` incompatíveis com Buddy), mas a consequência é catastrófica: **qualquer pessoa que digite qualquer senha em uma conta com hash em formato não-Buddy se torna dona da conta**. Se um atacante souber o email do admin e o hash atual estiver em formato legado, ele faz login com qualquer senha e essa senha vira a senha real.

→ Card: [SEC-001](cards/sprint-1-security/SEC-001-remover-auto-correct-hash.md)

### 2. Credenciais de produção do CockroachDB hardcoded em script Python

**Arquivo:** [check_remote_hash.py:4](../check_remote_hash.py#L4)

```python
db_url = "postgresql://gabriel:Mi97vMT0LHJ-T9h-0NNgdQ@agenda-wise-db-12369.jxf.gcp-southamerica-east1.cockroachlabs.cloud:26257/..."
```

Untracked hoje, mas pronto para ser commitado. Outros scripts (`fix_admin_password.py`, `safe_update_admin.py`, `reset_password_final.py`, `check_admin_hash.py`) seguem o mesmo padrão. **Ação imediata:** rotacionar a senha no painel do CockroachDB.

→ Cards: [SEC-002](cards/sprint-1-security/SEC-002-rotacionar-credenciais.md), [SEC-003](cards/sprint-1-security/SEC-003-remover-scripts-admin.md)

### 3. Backups SQL com hash do admin trackados no git

A pasta `backups/` contém 16 dumps SQL com `INSERT INTO usuarios VALUES (...)` incluindo hash do admin. Mesmo se deletar agora, o histórico do git mantém para sempre.

→ Card: [SEC-003](cards/sprint-1-security/SEC-003-remover-scripts-admin.md)

### 4. Admin role bypassa TODOS os checks RBAC

**Arquivo:** [core.clj:135-138](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L135-L138)

```clojure
(if (= role "admin_clinica")
  (handler request)  ;; sem checagem
  ...)
```

Um admin comprometido tem acesso irrestrito. Pior: convida a quem desenvolve a confiar em `clinica_id` vindo do body em endpoints administrativos, abrindo brecha de tenant-crossing.

→ Card: [SEC-006](cards/sprint-1-security/SEC-006-rbac-granular-admin.md)

### 5. Middleware do Next.js valida JWT sem verificar assinatura

**Arquivo:** [deep-saude-plataforma-front-end/src/middleware.ts:23-39](../deep-saude-plataforma-front-end/src/middleware.ts#L23-L39)

A função `isBackendTokenExpired` decodifica o JWT só com `atob` no payload pra checar `exp`. Não verifica a assinatura. Atacante pode forjar um token com qualquer payload e passar pela middleware (o backend ainda valida, mas é defesa em profundidade quebrada).

→ Card: [SEC-004](cards/sprint-1-security/SEC-004-verificar-jwt-middleware.md)

### 6. Override hardcoded de admin no NextAuth

**Arquivo:** `deep-saude-plataforma-front-end/src/app/api/auth/[...nextauth]/route.ts:47-52, 88-92`

Lógica que força role `admin_clinica` para `admin@deepsaude.com` à parte do que o backend retorna.

→ Card: [SEC-005](cards/sprint-1-security/SEC-005-remover-override-admin-nextauth.md)

### 7. JWT_SECRET é literalmente um placeholder

[start-dev.sh:69](../start-dev.sh#L69) e `.env.local` usam `"chave-super-secreta-desenvolvimento-local-minimo-32-caracteres-aleatorios"`. Além disso, o backend imprime os 4 primeiros e 4 últimos chars do secret no log de startup ([core.clj:54-59](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L54-L59)).

→ Cards: [SEC-002](cards/sprint-1-security/SEC-002-rotacionar-credenciais.md), [SEC-009](cards/sprint-1-security/SEC-009-remover-logs-sensíveis.md)

### 8. CORS regex aceita qualquer subdomínio `.code.run`

**Arquivo:** [core.clj:1213](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1213)

```clojure
:access-control-allow-origin [#"http://localhost:3000" #"http://localhost:9002"
                              #"https://.*\.code\.run"  ;; perigoso
                              #"https://deep-ngrv.onrender.com"]
```

→ Card: [SEC-007](cards/sprint-1-security/SEC-007-restringir-cors.md)

### 9. Token do backend exposto no `session` do NextAuth

O backend-token vai pro objeto `session` retornado ao cliente, acessível a qualquer XSS. Deveria ser um cookie httpOnly.

→ Card: [SEC-008](cards/sprint-1-security/SEC-008-token-backend-httponly.md)

### 10. Sem rate limiting

`/api/auth/login` e `/api/admin/provisionar-clinica` aceitam volume infinito de tentativas.

→ Card: [SEC-010](cards/sprint-1-security/SEC-010-rate-limiting.md)

---

## 🟠 ESCALABILIDADE (Sprint 2 — Robustez)

### Conexões e concorrência

- **Sem pool HikariCP explícito** ([core.clj:50](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L50)) — `jdbc/get-datasource` usa defaults inadequados. Com ~20 usuários simultâneos clicando, conexões esgotam → [ROB-001](cards/sprint-2-robustness/ROB-001-pool-hikari.md)
- **Jetty sem tuning** ([core.clj:1297](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1297)) — sem `:max-threads`, `:max-idle-time` → [ROB-002](cards/sprint-2-robustness/ROB-002-tuning-jetty.md)
- **N+1 em updates de recorrências** ([core.clj:577-603](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L577-L603)) → [ROB-007](cards/sprint-2-robustness/ROB-007-n-plus-1-recorrencias.md)

### Validação e contratos

- **Sem validação de input** — handlers desestruturam `:body` direto, `Date/valueOf` em strings malformadas crasha com stack trace → [ROB-003](cards/sprint-2-robustness/ROB-003-validacao-input.md)
- **UUIDs parseados sem try/catch** — `/api/usuarios/abc` retorna 500 + stack trace
- **Sem limite de payload** — JSON gigante derruba memória → [ROB-009](cards/sprint-2-robustness/ROB-009-payload-limit-erros.md)

### Migrations e schema

- **`ALTER TABLE` rodando em `init-db`** ([core.clj:1224-1287](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1224-L1287)) — sem versionamento, sem rollback. Arquivos `setup_db.sql`, `update_schema.sql`, `add_*.sql` na raiz → [ROB-004](cards/sprint-2-robustness/ROB-004-migratus.md)

### Frontend

- **Sem timeouts/retry nas fetches** — backend lento congela a UI com overlay infinito → [ROB-005](cards/sprint-2-robustness/ROB-005-timeouts-retry-fetch.md)
- **Sem proteção contra duplo clique** — useFormState dispara depois de `pending`, dá pra duplicar mutations → [ROB-006](cards/sprint-2-robustness/ROB-006-double-click-protection.md)

### Logs e diagnóstico

- **`println` espalhado** no backend (login, middleware, debug) → [ROB-008](cards/sprint-2-robustness/ROB-008-logs-estruturados.md)
- **`console.log` espalhado** no frontend vazando email, token, IDs → [ROB-008](cards/sprint-2-robustness/ROB-008-logs-estruturados.md)

### Integridade

- **Sem transações em writes multi-statement** ([core.clj:169-185](../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L169-L185)) — provisionar-clinica pode deixar clínica órfã se o segundo insert falha → [ROB-010](cards/sprint-2-robustness/ROB-010-transacoes.md)

---

## 🟡 PRODUÇÃO (Sprint 3 — Operações)

### Alvo de deploy

A stack está fragmentada: `apphosting.yaml` (Firebase, frontend, maxInstances=1), `Procfile` (Heroku/Render, quebrado), CORS hardcoda `deep-ngrv.onrender.com`. Não tem CI/CD configurado. → [OPS-001](cards/sprint-3-production/OPS-001-decidir-deploy.md)

### Observabilidade

Zero hoje. Sem Sentry, sem métricas, sem log estruturado. Em produção, quando algo quebrar pra um usuário, você não vai saber. → [OPS-002](cards/sprint-3-production/OPS-002-sentry-observabilidade.md)

### Operação

- **`sincronizar-status-global!` no startup** — atualiza TODOS os agendamentos passados de TODAS as clínicas a cada boot. Não escala. Precisa virar cronjob → [OPS-003](cards/sprint-3-production/OPS-003-cronjob-sincronizacao.md)
- **Sem healthcheck no backend** + **healthcheck do Postgres aponta pro banco errado** (`erp_advocacia` vs `deep_saude_db`) → [OPS-004](cards/sprint-3-production/OPS-004-healthchecks.md)
- **Sem resource limits / restart policy** no docker-compose; backend não é multi-stage → [OPS-005](cards/sprint-3-production/OPS-005-docker-prod-ready.md)
- **CI/CD ausente** → [OPS-006](cards/sprint-3-production/OPS-006-ci-cd.md)

### Backups

`backup-db.sh` gera SQL sem encriptação, sem retention, sem replicação offsite. → [OPS-008](cards/sprint-3-production/OPS-008-backups-encriptados.md)

---

## 🟢 QUALIDADE (Sprint 4 — pode ser incremental)

- **~95 usos de `as any`** no frontend furam o `strict: true` do TS → [QUA-001](cards/sprint-4-quality/QUA-001-eliminar-any.md)
- **Calendário com aritmética de timezone client-side** — provável fonte recorrente dos bugs de UTC → [QUA-002](cards/sprint-4-quality/QUA-002-timezone-calendar.md)
- **Sem error boundary global no Next** — qualquer erro = tela branca → [QUA-003](cards/sprint-4-quality/QUA-003-error-boundary.md)
- **Sem versionamento de API** (`/api/v1/...`) → [QUA-004](cards/sprint-4-quality/QUA-004-api-versioning.md)
- **Sem headers de segurança HTTP** (CSP, HSTS, X-Frame-Options) → [QUA-005](cards/sprint-4-quality/QUA-005-security-headers.md)

---

## Apêndice — arquivos suspeitos na raiz do repo

Scripts que parecem ter sido criados durante incidentes operacionais e nunca foram limpos:

| Arquivo | O que faz | Ação |
|---|---|---|
| `check_admin_hash.py` | Consulta hash do admin no DB local | Remover, mover utilitário para `tools/` se útil |
| `check_remote_hash.py` | **Consulta hash no DB de PRODUÇÃO com credenciais hardcoded** | **Remover urgente, rotacionar credencial** |
| `fix_admin_password.py` | Reseta hash do admin para valor hardcoded | Remover |
| `safe_update_admin.py` | Reseta senha admin para "123456" + cria backup .txt | Remover |
| `reset_password_final.py` | Reset interativo de senha | Remover |
| `fix_inserts.py` | Manipula arquivos SQL | Avaliar, mover se necessário |
| `reorder_sql.py` | Reordena statements SQL | Avaliar, mover se necessário |
| `add_observacoes.sql` | Migration ad-hoc | Migrar pra Migratus (ROB-004) |
| `add_recorrencia_id.sql` | Migration ad-hoc | Migrar pra Migratus (ROB-004) |
| `update_schema.sql` | Schema changes acumulados | Migrar pra Migratus (ROB-004) |
| `setup_db.sql` | Bootstrap inicial | Migrar pra Migratus (ROB-004) |
| `backend.log`, `frontend.log` | Logs em runtime | Adicionar ao .gitignore |
| `backups/` | 16 dumps SQL com PII e hashes | Remover do tracking + limpar histórico |

---

## Próximos passos sugeridos

1. **Decidir alvo de deploy** ([OPS-001](cards/sprint-3-production/OPS-001-decidir-deploy.md)) — isso destrava OPS-002 a OPS-008
2. **Sprint 1 inteira** — bloqueadores reais, não há ordem de prioridade interna que importe, todos devem cair antes do launch
3. **Sprint 2** — pode paralelizar items independentes
4. **Sprint 3** — depois do alvo de deploy decidido
5. **Sprint 4** — contínuo, pode acontecer pós-launch

Veja [SPRINTS.md](SPRINTS.md) para a visão de board completa.

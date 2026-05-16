# [LGPD-001] Audit log de acesso e mutação de dados de saúde

**Severidade:** 🔴 Critical (compliance)
**Sprint:** 6
**Esforço:** L (1-2 dias)
**Área:** Backend / DB
**Status:** TODO

## Contexto

Prontuários de psicologia são **dados pessoais sensíveis** pela LGPD (Lei 13.709, art. 5º, II — "dado referente à saúde"). Soma-se:

- **CFM Resolução 2.228/2019:** prontuário deve ter registro de **acesso** + hora + profissional
- **Lei 13.787/2019 (Lei do Prontuário Eletrônico):** trilha de alterações obrigatória
- **LGPD art. 37:** controlador deve manter registro das operações de tratamento

Hoje o sistema **não registra nada** disso. Nenhuma tabela `audit_log`, nenhum middleware de logging de acesso a `prontuarios`/`pacientes`. Em auditoria pela ANPD, MP ou CRP, a clínica e o operador da plataforma (Deep Saúde) ficam expostos.

Este é bloqueador legal mais que técnico. Sem ele, vender o produto para clínicas reais é juridicamente arriscado.

## Localização

Toda operação em [core.clj](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj) sobre as tabelas: `prontuarios`, `pacientes`, `agendamentos`, `usuarios` (criação/alteração de usuário também é auditável).

## Solução proposta

### Passo 1 — schema

Migration via [ROB-004](../sprint-2-robustness/ROB-004-migratus.md):

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    UUID NOT NULL REFERENCES clinicas(id),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id),
  acao          TEXT NOT NULL,        -- VIEW_PRONTUARIO, CREATE_PRONTUARIO, UPDATE_PRONTUARIO, DELETE_*, LOGIN, EXPORT_DADOS, ...
  recurso_tipo  TEXT NOT NULL,        -- prontuarios, pacientes, agendamentos, usuarios
  recurso_id    UUID,                 -- pode ser null para LOGIN
  resultado     TEXT NOT NULL,        -- SUCCESS, DENIED_PERMISSION, NOT_FOUND, ERROR
  dados_antes   JSONB,                -- snapshot pre-mudança (UPDATE/DELETE)
  dados_depois  JSONB,                -- snapshot pós-mudança (CREATE/UPDATE)
  ip            INET,
  user_agent    TEXT,
  request_id    UUID,                 -- correlação com request log
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_clinica_data ON audit_log (clinica_id, created_at DESC);
CREATE INDEX idx_audit_recurso ON audit_log (recurso_tipo, recurso_id);
CREATE INDEX idx_audit_usuario ON audit_log (usuario_id, created_at DESC);
```

### Passo 2 — middleware Clojure que captura request id + IP

```clojure
(defn wrap-audit-context [handler]
  (fn [request]
    (let [req-id (java.util.UUID/randomUUID)
          ip    (get-in request [:headers "x-forwarded-for"]
                 (:remote-addr request))
          ua    (get-in request [:headers "user-agent"])]
      (binding [*audit-context* {:request-id req-id :ip ip :user-agent ua}]
        (handler request)))))
```

### Passo 3 — helper de gravação

```clojure
(defn audit! [{:keys [clinica-id usuario-id acao recurso-tipo recurso-id
                      resultado dados-antes dados-depois]}]
  (try
    (sql/insert! @datasource :audit_log
      {:clinica_id    clinica-id
       :usuario_id    usuario-id
       :acao          acao
       :recurso_tipo  recurso-tipo
       :recurso_id    recurso-id
       :resultado     (or resultado "SUCCESS")
       :dados_antes   (when dados-antes (json/generate-string dados-antes))
       :dados_depois  (when dados-depois (json/generate-string dados-depois))
       :ip            (:ip *audit-context*)
       :user_agent    (:user-agent *audit-context*)
       :request_id    (:request-id *audit-context*)})
    (catch Exception e
      (log/error e "Falha ao gravar audit_log") ; não derruba o request
      nil)))
```

### Passo 4 — instrumentar handlers críticos

**Mínimo obrigatório (CFM + LGPD):**
- `VIEW_PRONTUARIO` — toda leitura de prontuário individual ou listagem por paciente
- `CREATE_PRONTUARIO`, `UPDATE_PRONTUARIO`, `DELETE_PRONTUARIO`
- `VIEW_PACIENTE` (acesso à ficha completa)
- `UPDATE_PACIENTE`, `DELETE_PACIENTE`
- `LOGIN`, `LOGIN_FAILED`, `LOGOUT`
- `EXPORT_DADOS` (portabilidade — ver passo 6)

```clojure
(defn buscar-prontuario-handler [request]
  (let [{:keys [usuario-id clinica-id]} (:identity request)
        prontuario-id (parse-uuid (get-in request [:params :id]))
        prontuario (execute-one! ["SELECT * FROM prontuarios WHERE id = ? AND clinica_id = ?"
                                   prontuario-id clinica-id])]
    (audit! {:clinica-id clinica-id :usuario-id usuario-id
             :acao "VIEW_PRONTUARIO" :recurso-tipo "prontuarios" :recurso-id prontuario-id
             :resultado (if prontuario "SUCCESS" "NOT_FOUND")})
    (if prontuario
      {:status 200 :body prontuario}
      {:status 404 :body {:erro "não encontrado"}})))
```

### Passo 5 — retenção e proteção

- **Append-only:** sem UPDATE/DELETE em `audit_log` (controlar via permissão DB).
- **Retenção:** 20 anos para prontuário (CFM); 5 anos mínimo para outros (LGPD recomenda). Particionar por ano facilita rotação.
- **Backup separado** com encriptação ([OPS-008](../sprint-3-production/OPS-008-backups-encriptados.md)).

### Passo 6 — endpoint de portabilidade (LGPD art. 18, V)

```
GET /api/meus-dados
```

Retorna JSON com todos os dados do titular logado (paciente ou psicólogo): cadastro, agendamentos, prontuários, audit log de acessos próprios. Operação em si gera audit `EXPORT_DADOS`.

### Passo 7 — endpoint de revisão de acesso (CFM)

Admin da clínica pode consultar quem acessou o prontuário X:

```
GET /api/admin/audit?recurso_tipo=prontuarios&recurso_id=...
```

Restrito por RBAC. Próprio acesso ao audit também é audited (meta).

## Critérios de aceitação

- [ ] Tabela `audit_log` criada via migration
- [ ] Middleware `wrap-audit-context` no pipeline
- [ ] Handlers de prontuário (CRUD + VIEW) emitem `audit!`
- [ ] Handlers de paciente (UPDATE/DELETE/VIEW completo) emitem `audit!`
- [ ] Login (sucesso e falha) emite `audit!`
- [ ] Endpoint `/api/meus-dados` para portabilidade
- [ ] Endpoint `/api/admin/audit` (consulta pelo admin)
- [ ] DDL prevê `audit_log` append-only (sem UPDATE/DELETE via permissão DB)
- [ ] Documentação `docs/lgpd/audit.md` explicando o modelo

## Riscos / dependências

- **Performance:** cada request crítico ganha 1 INSERT. Em escala, considerar log assíncrono (fila in-process com batch flush a cada 1s). Não é prematuro: 10k req/min de auditoria = 10k inserts/min.
- **PII em `dados_antes`/`dados_depois`:** o JSON dump do prontuário inteiro contém o conteúdo da sessão. Considerar **só campos modificados**, não dump completo. Ou criptografar campo.
- **Dependência:** [ROB-004](../sprint-2-robustness/ROB-004-migratus.md) (Migratus) para versionar a migration.
- **Conversa com:** [LGPD-002](LGPD-002-soft-delete-retencao.md) — soft delete + audit andam juntos.
- **Conversa com:** [LGPD-003](LGPD-003-row-level-security.md) — RLS protege o `audit_log` por clínica.

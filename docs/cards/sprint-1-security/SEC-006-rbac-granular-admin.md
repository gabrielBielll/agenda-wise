# [SEC-006] Eliminar bypass total de admin no RBAC

**Severidade:** 🟠 High
**Sprint:** 1
**Esforço:** L (1-2 dias)
**Área:** Backend
**Status:** TODO

## Contexto

O middleware `wrap-checar-permissao` tem um curto-circuito que pula toda a checagem de permissões quando o role é `admin_clinica`. Isso significa que um admin tem acesso irrestrito a qualquer endpoint, incluindo endpoints que não deveriam ser dele (ex: visualizar prontuários de pacientes de outras clínicas, se algum endpoint não filtrar por `clinica_id`).

O modelo do banco tem tabelas `papeis`, `permissoes`, `papeis_permissoes` — a estrutura pra RBAC granular existe, só não está sendo usada para o admin.

## Localização

[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:135-138](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L135-L138)

```clojure
(defn wrap-checar-permissao [handler nome-permissao-requerida]
  (fn [request]
    (let [role (get-in request [:identity :role])]
      (println "DEBUG PERMISSAO: role=" role ", requer=" nome-permissao-requerida)
      (if (= role "admin_clinica")
        (handler request)  ;; bypass — nenhuma checagem
        (if (tem-permissao? (get-in request [:identity :papel_id]) nome-permissao-requerida)
          (handler request)
          {:status 403 :body {:erro "Acesso negado."}})))))
```

## Solução proposta

### Passo 1 — popular as permissões do admin no banco

Garantir que o role `admin_clinica` tem entradas em `papeis_permissoes` para todas as permissões que admin legítimamente precisa (NÃO incluir permissões cross-tenant).

```sql
-- Exemplo: idempotente
INSERT INTO papeis_permissoes (papel_id, permissao_id)
SELECT
  (SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'),
  p.id
FROM permissoes p
WHERE p.nome_permissao IN (
  'gerenciar_usuarios',
  'gerenciar_pacientes',
  'visualizar_financeiro',
  'gerenciar_agendamentos',
  -- etc.
)
ON CONFLICT DO NOTHING;
```

### Passo 2 — remover o bypass

```clojure
(defn wrap-checar-permissao [handler nome-permissao-requerida]
  (fn [request]
    (let [papel-id (get-in request [:identity :papel_id])]
      (if (tem-permissao? papel-id nome-permissao-requerida)
        (handler request)
        {:status 403 :body {:erro "Acesso negado."}}))))
```

### Passo 3 — garantir filtros de `clinica_id` em todas as queries

Toda query que retorna dados de tenants deve ter `WHERE clinica_id = ?` com o `clinica_id` vindo do JWT (não do body/params). Auditar:

- `listar-pacientes-handler`
- `obter-paciente-handler`
- `listar-agendamentos-handler`
- `listar-prontuarios-handler`
- Endpoints admin como `gerenciar-usuarios`

Para cada um, confirmar que `(get-in request [:identity :clinica_id])` é usado como filtro obrigatório.

### Passo 4 — endpoints de provisionamento global

`/api/admin/provisionar-clinica` é o único caso legítimo de operação cross-tenant. Esse deve ter um role separado (ex: `super_admin`) que existe fora das clínicas, ou ser protegido por uma chave de API estática (não JWT), ou simplesmente removido do produto final (provisionamento via painel ops).

## Critérios de aceitação

- [ ] `wrap-checar-permissao` não tem mais condicional especial para `admin_clinica`
- [ ] Tabela `papeis_permissoes` populada com permissões adequadas para admin
- [ ] Smoke test: admin consegue tudo que precisa (criar usuário, ver pacientes, etc.)
- [ ] Smoke test: admin de Clínica A não consegue ver pacientes da Clínica B (mesmo conhecendo o ID)
- [ ] `provisionar-clinica` movido para fluxo separado ou protegido por token estático

## Riscos / dependências

- **Esforço alto:** depende de quantos endpoints precisam de auditoria. Pode ser feito por endpoint em PRs separadas.
- **Risco:** se a tabela de permissões não estiver completa, admin pode perder acesso a fluxos legítimos no momento da troca. Mitigação: rodar primeiro em staging, ou popular antes de mergear.
- **Dependência indireta:** [SEC-009](SEC-009-remover-logs-sensíveis.md) — o `println` da função revela papel e permissão nos logs, mas isso é tratado lá.

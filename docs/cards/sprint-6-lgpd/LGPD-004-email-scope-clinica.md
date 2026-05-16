# [LGPD-004] Email de usuário escopado por clínica

**Severidade:** 🟡 Medium
**Sprint:** 6
**Esforço:** M (meio dia)
**Área:** DB / Backend
**Status:** TODO

## Contexto

[`setup_db.sql:32`](../../../setup_db.sql#L32) define:

```sql
email VARCHAR(255) NOT NULL UNIQUE
```

Email é **globalmente único** entre todos os usuários do sistema. Isto impede:

1. Um psicólogo trabalhar simultaneamente em **duas clínicas diferentes** com o mesmo email — caso comum no mercado de psicologia (profissional autônomo atendendo em vários consultórios).
2. Reutilização de email entre clínicas após desligamento — segundo a regra atual, o usuário "fica preso" à primeira clínica.

A tabela `pacientes` já trata isso corretamente: `UNIQUE (email, clinica_id)`. Falta replicar para `usuarios`.

Também é um problema de **isolamento de tenant**: um atacante que tem o email de um psicólogo em outra clínica pode tentar enumerar contas com aquele email no login global.

## Localização

[`setup_db.sql:25-37`](../../../setup_db.sql#L25-L37) — tabela `usuarios`

Handlers afetados:
- [core.clj:191](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L191) — `login-handler` busca por `email`
- Provisionamento de clínica cria admin com email único globalmente

## Solução proposta

### Passo 1 — migration

```sql
-- 1) remover constraint global
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_email_key;

-- 2) adicionar constraint composto
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_email_clinica_unique UNIQUE (email, clinica_id);

-- 3) índice na coluna email para lookup no login (sem clinica_id, ver passo 2)
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);
```

### Passo 2 — fluxo de login com email duplicado entre clínicas

Se um email existe em duas clínicas, o login precisa saber **qual clínica** entrar.

**Opção A — slug da clínica na URL** (recomendado, padrão SaaS B2B):

```
https://app.deep-saude.com.br/clinica-x/login
```

Frontend passa `slug` no body do login. Backend:

```clojure
(defn login-handler [request]
  (let [{:keys [email senha clinica-slug]} (:body request)
        clinica (execute-one! ["SELECT id FROM clinicas WHERE slug = ?" clinica-slug])
        usuario (execute-one! ["SELECT * FROM usuarios WHERE email = ? AND clinica_id = ?"
                               email (:id clinica)])]
    ...))
```

Migration adicional:
```sql
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL UNIQUE DEFAULT lower(replace(nome_da_clinica, ' ', '-'));
```

**Opção B — seleção pós-email** (UX menos elegante):

Login pede email + senha. Se backend acha múltiplos usuários com aquele email, retorna `300 Multiple Choices` com lista de clínicas. Frontend pergunta qual; segunda chamada confirma.

**Opção C — manter unique global, adicionar `clinica_secundaria`** — não recomendo, complica modelo.

### Passo 3 — frontend

Para Opção A:
- Domínio compartilhado com prefixo do slug, ou subdomínio por clínica
- Login form aceita `slug` (manual) ou deriva da URL
- Após login, JWT carrega `clinica_id` específico (já carrega)

### Passo 4 — convite / provisionamento

Quando admin convida psicólogo:
- Se email **já existe em outra clínica**: criar novo registro `usuarios` para esta clínica (sem reaproveitar — política de "uma conta por clínica")
- Se email **já existe nesta clínica**: erro `409 Conflict`

### Considerações operacionais

- **Reset de senha por email:** com email duplicado, precisa slug junto. Ou enviar email com lista de clínicas em que o email tem conta.
- **Notificações:** emails de "senha alterada" devem dizer claramente para qual clínica.

## Critérios de aceitação

- [ ] Migration troca UNIQUE global por `(email, clinica_id)` em `usuarios`
- [ ] `clinicas.slug` adicionado e populado (default a partir do nome)
- [ ] Login aceita `clinica_slug` (Opção A) ou variante negociada
- [ ] Provisionamento de psicólogo em segunda clínica não dá conflito
- [ ] Reset de senha funciona considerando o escopo
- [ ] Documentação `docs/auth/multi-clinica.md`

## Riscos / dependências

- **Dado existente:** migration falha se já houver `(email, clinica_id)` duplicados em rows existentes. Improvável dado que a constraint atual é global e sempre foi, mas verificar.
- **Breaking change no login:** apps em campo (mobile, se houver) que mandam só email + senha quebram. Manter fallback "se há apenas uma clínica para este email, faz login direto" durante migração.
- **Conversa com:** [SEC-010](../sprint-1-security/SEC-010-rate-limiting.md) — rate limit no login agora também por `(email, clinica_id)` ou por `(email)` global.
- **Conversa com:** [LGPD-001](LGPD-001-audit-log.md) — registro de login deve mencionar a clínica que foi acessada.

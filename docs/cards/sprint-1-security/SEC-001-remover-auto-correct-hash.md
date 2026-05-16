# [SEC-001] Remover auto-correct hash do login + migração one-shot

**Severidade:** 🔴 Critical
**Sprint:** 1
**Esforço:** M (meio dia)
**Área:** Backend
**Status:** TODO

## Contexto

O handler `login-handler` faz um `catch Exception` em `hashers/check` que regrava o hash do usuário com a senha digitada. Isso foi adicionado para resolver hashes legados em formato `bcrypt+sha512` (vindos do CockroachDB) que o Buddy não consegue ler. Resolveu a dor imediata, mas criou um bypass total de autenticação.

## Problema

**Cenário de ataque:**
1. Atacante sabe o email de um usuário (ex: `admin@deepsaude.com`)
2. A conta tem hash em formato legado incompatível
3. Atacante tenta login com senha arbitrária `aaa`
4. `hashers/check` lança exceção → cai no `catch`
5. Backend gera novo hash de `aaa` e salva no DB
6. Verifica `aaa` contra o hash que ACABOU de gerar → retorna true
7. Atacante autenticado, senha real perdida

## Localização

[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:197-206](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L197-L206)

```clojure
(let [senha-valida (try
                     (hashers/check senha (:senha_hash usuario))
                     (catch Exception e
                       (println "DEBUG LOGIN: Hash incompatível, auto-corrigindo..." (.getMessage e))
                       (let [new-hash (hashers/encrypt senha)]
                         (execute-one! ["UPDATE usuarios SET senha_hash = ? WHERE email = ?" new-hash email])
                         (hashers/check senha new-hash))))]
```

## Solução proposta

### Passo 1 — remover o catch perigoso

```clojure
(let [senha-valida (try
                     (hashers/check senha (:senha_hash usuario))
                     (catch Exception e
                       (println "ERRO: hash incompatível para email" email)
                       false))]  ;; trata como senha inválida, nunca regrava
```

### Passo 2 — migração one-shot pra hashes legados

Identificar usuários com hash em formato legado e forçar reset via fluxo seguro (email de recuperação). Criar arquivo `migrations/0001_reset_legacy_hashes.sql` ou script Clojure separado:

1. Identificar hashes que não começam com prefixo Buddy (`bcrypt+sha512$...` no formato Python vs `bcrypt+sha512$X$...` no formato Buddy)
2. Marcar usuários afetados com `senha_hash = NULL` e `forcar_reset = true`
3. No login, se `senha_hash IS NULL`, retornar mensagem "Sua conta precisa de redefinição de senha — verifique seu email"
4. Implementar endpoint `/api/auth/solicitar-reset` que envia email com token de reset (ver fora do escopo deste card — pode ser MVP simples só de UI)

### Passo 3 — testes

- [ ] Login com senha correta para usuário com hash válido → 200
- [ ] Login com senha errada → 401 (não recria hash)
- [ ] Login com exceção em `hashers/check` → 401 (não recria hash)

## Critérios de aceitação

- [ ] Bloco `catch` no `login-handler` não chama `hashers/encrypt` nem `execute-one!`
- [ ] Migração identifica e isola contas com hashes legados
- [ ] Tentativa de login em conta legada retorna mensagem clara sem regravar hash
- [ ] Teste manual: criar usuário com hash inválido no DB, tentar login com qualquer senha → 401

## Riscos / dependências

- **Risco:** usuários legítimos com hash legado perdem acesso temporariamente. Mitigação: contar quantos são (`SELECT count(*) FROM usuarios WHERE senha_hash NOT LIKE 'bcrypt+sha512$%$%'`) e avisar individualmente se for pouca gente.
- **Dependência:** se você não tem fluxo de reset de senha por email, esse card pode ficar parcial — minimamente, remover o auto-correct e atender resets manualmente até implementar.

# [SEC-003] Remover scripts Python administrativos + backups/ do repo

**Severidade:** 🔴 Critical
**Sprint:** 1
**Esforço:** M (meio dia)
**Área:** Infra / repo hygiene
**Status:** TODO

## Contexto

A raiz do repositório acumulou ~7 scripts Python operacionais que tocam credenciais e o banco de produção. A pasta `backups/` tem 16 dumps SQL com PII e hash do admin. Mesmo se forem removidos do HEAD, o histórico do git mantém para sempre — exigindo reescrita de histórico.

## Inventário

### Scripts Python (raiz)

| Arquivo | Comportamento | Ação |
|---|---|---|
| `check_admin_hash.py` | Lê hash do admin no DB local | Deletar |
| `check_remote_hash.py` | **Conecta no CockroachDB prod com credenciais hardcoded** | Deletar urgente |
| `fix_admin_password.py` | Reseta hash do admin para valor hardcoded | Deletar |
| `safe_update_admin.py` | Reseta senha admin para "123456", cria `backup_hash_admin.txt` em plaintext | Deletar |
| `reset_password_final.py` | Reset interativo de senha | Deletar |
| `fix_inserts.py` | Manipula arquivos SQL | Avaliar conteúdo — provavelmente deletar |
| `reorder_sql.py` | Reordena statements SQL | Avaliar conteúdo — provavelmente deletar |

### Diretório `backups/`

16 arquivos `.sql` contendo `INSERT INTO usuarios VALUES (..., 'bcrypt+sha512$...')`. Todos trackados no git.

### Logs

`backend.log` e `frontend.log` estão modificados no working tree — não devem ser trackados.

## Solução proposta

### Passo 1 — atualizar `.gitignore`

```gitignore
# Logs de runtime
*.log
backend.log
frontend.log

# Backups locais
backups/
*.sql.gz
*.dump

# Scripts ad-hoc (não fazem parte do produto)
check_*.py
fix_*.py
reset_*.py
safe_*.py
reorder_*.py
backup_hash_*.txt

# Env files
.env
.env.local
.env.production
```

### Passo 2 — remover do tracking sem deletar do disco

```bash
git rm --cached -r backups/
git rm --cached check_admin_hash.py check_remote_hash.py fix_admin_password.py \
                safe_update_admin.py reset_password_final.py \
                fix_inserts.py reorder_sql.py backend.log frontend.log
git rm --cached .env.local  # se estiver trackado no frontend
git commit -m "chore: remove ad-hoc scripts and backups from tracking"
```

### Passo 3 — deletar fisicamente os scripts perigosos

Depois de garantir que não há informação útil neles:

```bash
rm check_admin_hash.py check_remote_hash.py fix_admin_password.py \
   safe_update_admin.py reset_password_final.py
```

Avaliar `fix_inserts.py` e `reorder_sql.py` antes de deletar — podem conter lógica útil para a migração para Migratus ([ROB-004](../sprint-2-robustness/ROB-004-migratus.md)). Se valiosos, mover para `tools/` e documentar.

### Passo 4 — limpar histórico do git

**Pré-requisito:** SEC-002 já rotacionou as credenciais expostas. Mesmo assim, vale limpar o histórico para não deixar PII de pacientes em commits antigos.

Usar [git-filter-repo](https://github.com/newren/git-filter-repo) (mais seguro que filter-branch):

```bash
# Backup do repo primeiro!
cd ..
cp -r deep-saude-plataform deep-saude-plataform-BACKUP-$(date +%Y%m%d)
cd deep-saude-plataform

# Instalar git-filter-repo (brew install git-filter-repo)
# Listar paths a remover do histórico inteiro:
git filter-repo --invert-paths \
  --path backups/ \
  --path check_admin_hash.py \
  --path check_remote_hash.py \
  --path fix_admin_password.py \
  --path safe_update_admin.py \
  --path reset_password_final.py \
  --path fix_inserts.py \
  --path reorder_sql.py
```

### Passo 5 — force push e coordenação

⚠️ **Force-push reescreve histórico.** Se você for o único dev, ok. Se houver outros clones, todos precisam reclonar.

```bash
# Após filter-repo, o remote precisa ser reconfigurado:
git remote add origin <url-original>
git push --force-with-lease origin main
```

### Passo 6 — verificar

```bash
# Garantir que nada de sensível ficou no histórico:
git log --all --full-history -- backups/
git log --all -p | grep -i "Mi97vMT0LHJ"  # senha CockroachDB
git log --all -p | grep -i "advocacia123"
git log --all -p | grep -i "minioadmin"
```

## Critérios de aceitação

- [ ] `.gitignore` atualizado com os padrões listados
- [ ] Scripts Python perigosos não estão mais em `git ls-files`
- [ ] `backups/` não está mais em `git ls-files`
- [ ] Histórico do git limpo (verificar com `git log --all` greps)
- [ ] Backup do repo feito antes do filter-repo
- [ ] Se trabalhando em equipe: todos foram avisados e reclonaram

## Riscos / dependências

- **Risco alto:** `git filter-repo` é destrutivo. Backup obrigatório antes.
- **Dependência:** [SEC-002](SEC-002-rotacionar-credenciais.md) deve ter rotacionado credenciais — limpar histórico não vale nada se a senha ainda funciona.
- **Atenção:** se o repo tem PRs abertos, eles serão perdidos no force-push. Coordene timing.

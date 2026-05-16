# [OPS-006] CI/CD com GitHub Actions (test + lint + deploy)

**Severidade:** 🟡 Medium
**Sprint:** 3
**Esforço:** M (meio dia)
**Área:** Infra
**Status:** TODO

## Contexto

Não há CI/CD configurado. Deploys hoje são manuais. Testes (se existirem) só são executados localmente. Não há gate de qualidade antes do código ir pro main / pra produção.

## Solução proposta

GitHub Actions é a escolha óbvia (gratuito pra repos públicos, suficiente pra privados pequenos).

### Estrutura proposta

`.github/workflows/`
- `ci.yml` — roda em PR: lint, type-check, testes
- `deploy.yml` — roda em push para `main`: deploy via Render/Fly hook

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DeLaGuardo/setup-clojure@13.0
        with:
          lein: 2.11.2
      - name: Cache deps
        uses: actions/cache@v4
        with:
          path: ~/.m2
          key: ${{ runner.os }}-m2-${{ hashFiles('**/project.clj') }}
      - name: Lint (clj-kondo)
        run: |
          curl -sLO https://raw.githubusercontent.com/clj-kondo/clj-kondo/master/script/install-clj-kondo
          chmod +x install-clj-kondo && ./install-clj-kondo
          clj-kondo --lint src
      - name: Test
        working-directory: deep-saude-plataforma-api/deep-saude-backend
        run: lein test

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: deep-saude-plataforma-front-end
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: deep-saude-plataforma-front-end/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test --if-present
      - run: npm run build
        env:
          BACKEND_URL: http://localhost:3000  # placeholder pra build
          NEXTAUTH_SECRET: ci-placeholder-secret-not-used
```

### `.github/workflows/deploy.yml`

(exemplo Render — outros providers similares)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  wait-for-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Wait for CI checks
        uses: lewagon/wait-on-check-action@v1.3.1
        with:
          ref: ${{ github.ref }}
          check-regexp: ^(backend|frontend)$
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          wait-interval: 20

  deploy-backend:
    needs: wait-for-ci
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render deploy
        run: |
          curl -X POST "${{ secrets.RENDER_BACKEND_DEPLOY_HOOK }}"

  deploy-frontend:
    needs: wait-for-ci
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render deploy
        run: |
          curl -X POST "${{ secrets.RENDER_FRONTEND_DEPLOY_HOOK }}"
```

Deploy hooks são URLs únicas geradas no dashboard Render → Settings → Deploy Hook.

### Branch protection

No GitHub repo settings:
- Branch `main`: require PR
- Require status checks: `backend`, `frontend`
- Require up-to-date branch before merging

Isso garante que ninguém merge código que quebra CI.

### Secrets do GitHub

Em Settings → Secrets and variables → Actions:
- `RENDER_BACKEND_DEPLOY_HOOK`
- `RENDER_FRONTEND_DEPLOY_HOOK`

### O que falta: testes

Esse card configura a infra de CI, mas o projeto pode ter pouca cobertura de teste hoje. Sugestões:

**Backend (mínimo aceitável):**
- Testes de unidade para funções puras (validação, parsing UUID, transformações)
- Testes de integração para endpoints críticos (login, criar paciente) com DB em test container

**Frontend (mínimo aceitável):**
- Type-check com `tsc --noEmit` (já garantido)
- Lint com ESLint (já configurado)
- (Opcional) Playwright pra smoke E2E

Não é escopo deste card escrever testes — mas o CI fica pronto para quando forem adicionados.

## Critérios de aceitação

- [ ] `.github/workflows/ci.yml` rodando em PRs e push, executando lint + type-check + build
- [ ] `.github/workflows/deploy.yml` triggerando deploy em push para main
- [ ] Branch protection em `main` exige CI passando
- [ ] Secrets configurados (deploy hooks)
- [ ] Documento README atualizado com badge de CI status

## Riscos / dependências

- **Dependência:** [OPS-001](OPS-001-decidir-deploy.md) — passos de deploy variam por plataforma.
- **Atenção:** primeiro deploy via CI/CD deve ser numa branch staging primeiro, não direto pra main → prod.
- **Custo:** se o repo for privado e o time crescer, GitHub Actions cobra além do free tier (2000min/mês). Não é problema agora.

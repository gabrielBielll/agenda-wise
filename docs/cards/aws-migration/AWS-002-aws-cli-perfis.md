# [AWS-002] Configurar AWS CLI + perfis + acesso programático

**Prioridade:** 🟠 Alto
**Fase:** 0 — Fundamentos
**Esforço:** S (≤2h)
**Área:** Infra / Local
**Status:** TODO
**Custo estimado/mês:** $0

## Contexto

A maioria dos próximos cards vai usar AWS CLI (`aws s3 cp`, `aws ecr get-login-password`, etc.). Você precisa de credenciais programáticas configuradas no seu Mac, mas configurar errado é a #1 causa de leaks no GitHub.

Vamos configurar do jeito **certo**: usando o `aws configure sso` (SSO/Identity Center) — moderno, com tokens de curta duração — em vez de access keys permanentes.

> Se preferir o caminho clássico com access keys, está documentado no fim como "Plano B". É funcional mas você assume o risco de leak.

## Localização

- Local: `~/.aws/config` e `~/.aws/credentials` (a ser criados)
- AWS Console: IAM Identity Center (https://console.aws.amazon.com/singlesignon/)

## Solução proposta

### Passo 1 — Instalar AWS CLI v2 no Mac

```bash
# Via Homebrew (recomendado):
brew install awscli

# Verificar:
aws --version
# deve mostrar aws-cli/2.x.x
```

### Passo 2 — Habilitar IAM Identity Center (antigo AWS SSO)

1. Console AWS → **IAM Identity Center**
2. **Enable** (1 clique). Escolha região (deixe `us-east-1`)
3. Clique em **Users** → **Add user**
   - Username: `gabriel`
   - Email: o mesmo do seu usuário IAM
   - Confirmar criação → ele envia email com link de ativação
4. Ative o usuário pelo email, defina senha forte, ative MFA
5. Volte ao Console → IAM Identity Center → **Groups** → **Create group**
   - Nome: `Admins`
   - Adicionar `gabriel`
6. **AWS accounts** → marque sua conta → **Assign users or groups**
   - Group: `Admins`
   - Permission set: **Create permission set** → **Predefined** → `AdministratorAccess` → Next → Next → Create
   - Atribuir o permission set `AdministratorAccess` ao group `Admins`

### Passo 3 — Anotar o URL do portal SSO

Após configurar, IAM Identity Center mostra um **AWS access portal URL** tipo:
```
https://d-xxxxxxxxxx.awsapps.com/start
```
Anote esse URL. É por ele que você vai logar no SSO via CLI.

### Passo 4 — Configurar perfil SSO no CLI

```bash
aws configure sso
```

Vai perguntar:
- **SSO session name:** `deep-saude`
- **SSO start URL:** o URL do portal do passo 3
- **SSO region:** `us-east-1`
- **SSO registration scopes:** apertar Enter (default `sso:account:access`)

Vai abrir browser para login → autoriza → CLI lista contas e permission sets disponíveis.

- **Account:** escolha sua conta
- **Permission set:** `AdministratorAccess`
- **CLI default client Region:** `us-east-1`
- **CLI default output format:** `json`
- **CLI profile name:** `deep-saude`

### Passo 5 — Testar

```bash
# Login SSO (gera token de ~8h):
aws sso login --profile deep-saude

# Testar credenciais:
aws sts get-caller-identity --profile deep-saude
# deve retornar Account, Arn, UserId
```

### Passo 6 — Tornar `deep-saude` o perfil padrão (opcional)

Para evitar `--profile deep-saude` em todo comando:

```bash
export AWS_PROFILE=deep-saude
```

Adicione ao seu `~/.zshrc` para persistir. Ou crie alias:
```bash
alias awsds='aws --profile deep-saude'
```

### Passo 7 — Garantir que credenciais NÃO entrem no git

Adicionar ao `.gitignore` global do seu Mac:

```bash
# ~/.gitignore_global
.aws/
.env*
!.env.example
*.pem
```

```bash
git config --global core.excludesfile ~/.gitignore_global
```

---

## Plano B — Access Keys (NÃO RECOMENDADO, mas funcional)

Se você não quer mexer com SSO ainda:

1. IAM Console → Users → `gabriel-admin` → **Security credentials** → **Create access key**
2. Use case: **Command Line Interface (CLI)**
3. Anote `Access Key ID` e `Secret Access Key` **uma vez** (não tem como ver de novo)

```bash
aws configure --profile deep-saude
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region: us-east-1
# Default output: json
```

**Por que é pior:**
- Credenciais permanentes — se vazarem, comprometem até você revogar
- Bots no GitHub varrem repos por padrões `AKIA...` em segundos
- Sem auditoria de quando expira

Se for usar, **rotacione a cada 90 dias** e configure git-secrets ou `git secret-scanner` no pre-commit.

---

## Critérios de aceitação

- [ ] `aws --version` retorna 2.x
- [ ] IAM Identity Center habilitado com usuário `gabriel` no grupo `Admins`
- [ ] Perfil CLI `deep-saude` configurado via `aws configure sso`
- [ ] `aws sts get-caller-identity --profile deep-saude` retorna identidade
- [ ] `.aws/` está no `.gitignore` global do Mac
- [ ] URL do portal SSO salvo no gerenciador de senhas

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **AWS CLI v2** | Cliente oficial AWS para terminal. v2 substituiu v1 em 2020, adiciona SSO. |
| **AWS IAM Identity Center** | Antigo "AWS SSO". Provê login federado com sessions curtas. Sucessor moderno de access keys. |
| **Permission Set** | Conjunto de policies aplicadas a um usuário/grupo em uma conta via Identity Center. |
| **SSO Session** | Token temporário (8h padrão) gerado por `aws sso login`. Mais seguro que access key permanente. |
| **Profile** | Configuração nomeada em `~/.aws/config`. Permite alternar entre contas/permissões. |
| **STS (Security Token Service)** | Serviço que emite credenciais temporárias. `get-caller-identity` valida que você está autenticado. |
| **Access Key ID + Secret Access Key** | Credenciais permanentes (par chave/senha). Use apenas se SSO não for opção. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Métodos de acesso à AWS: Console, CLI, SDK, IaC (Terraform/CloudFormation/CDK)
- Conceito de credenciais temporárias vs permanentes
- IAM Identity Center como solução de SSO

### Solutions Architect Associate (SAA-C03)
- **STS AssumeRole** — base para acesso cross-account, federated identity
- IAM roles para EC2/Lambda/ECS (instance profiles, task roles)
- SAML / OIDC federation (vamos usar OIDC com GitHub no [AWS-015](AWS-015-github-actions-oidc.md))

## Riscos / dependências

- **Não comite `~/.aws/` em repo nenhum**, mesmo privado. Tem token de SSO que dá acesso.
- Tokens SSO expiram em ~8h por padrão. Quando expira, rode `aws sso login --profile deep-saude` de novo.
- Se você tem **múltiplas contas AWS** (pessoal, trabalho), use perfis nomeados (`pessoal`, `trabalho`, `deep-saude`) — nunca compartilhe perfil default.
- Se ainda escolher access keys: configure **git-secrets** ou **trufflehog** no `.git/hooks/pre-commit` para impedir push acidental.

## Próximo card

[AWS-003 — Entender VPC, subnets, Security Groups](AWS-003-conceitos-vpc-network.md)

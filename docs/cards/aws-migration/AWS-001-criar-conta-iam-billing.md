# [AWS-001] Criar conta AWS + IAM + MFA + Billing Alerts

**Prioridade:** 🔴 Crítico
**Fase:** 0 — Fundamentos
**Esforço:** M (meio dia)
**Área:** Infra / Conta AWS
**Status:** TODO
**Custo estimado/mês:** $0 (apenas configuração)

## Contexto

Antes de qualquer deploy, você precisa de uma conta AWS configurada de forma segura. **A conta root da AWS é como `sudo` em Linux**: se vazar, alguém pode minerar Bitcoin na sua conta e gerar uma fatura de dezenas de milhares de dólares. Já aconteceu com vários devs. Este card existe para evitar isso.

## Localização

Nenhum código local muda. Trabalho 100% no AWS Console:
- https://aws.amazon.com/ (criar conta)
- https://console.aws.amazon.com/iam/ (depois)
- https://console.aws.amazon.com/billing/ (depois)

## Solução proposta

### Passo 1 — Criar a conta AWS

1. Acesse https://aws.amazon.com/ e clique em **Create an AWS Account**
2. Email **dedicado a essa conta** (não use seu pessoal misturado — recomendo `aws-deepsaude@seu-dominio` ou Gmail com `+aws`)
3. Cartão de crédito internacional obrigatório (AWS valida cobrando ~$1 e estornando)
4. Plano de suporte: **Basic (grátis)** — você só pagaria pelos serviços usados
5. Após criação, **anote**:
   - Account ID (12 dígitos, ex: `123456789012`)
   - Email de root
   - Senha de root (gere com gerenciador de senhas: 32+ caracteres aleatórios)

### Passo 2 — Ativar MFA na conta root

1. Login como root → canto superior direito → **Security credentials**
2. **Assign MFA device** → escolha **Authenticator app** (Authy, 1Password, Google Authenticator)
3. Escaneie QR code, insira dois códigos consecutivos, confirme
4. **NÃO use SMS** — SIM swap é um vetor real de ataque

### Passo 3 — Criar usuário IAM admin (e NUNCA mais usar root)

A conta root só deve ser usada para:
- Criar o primeiro usuário IAM (agora)
- Mudar plano de suporte
- Fechar a conta
- Casos extremos (root password recovery)

Para tudo no dia a dia, use IAM:

1. Console → **IAM** → **Users** → **Create user**
2. Nome: `gabriel-admin`
3. Marque **Provide user access to AWS Management Console**
4. Senha: gerar custom, anotar no gerenciador, **desmarcar** "User must create a new password at next sign-in" se já é você
5. **Permissions:** attach policy directly → `AdministratorAccess`
6. Criar

Após criar:
- Anote o **sign-in URL** específico da conta (ex: `https://123456789012.signin.aws.amazon.com/console`)
- Ative MFA também nesse usuário IAM (mesmo processo do passo 2)

### Passo 4 — Logout do root, login como `gabriel-admin`

Daqui em diante, use **sempre** o usuário IAM. Salve o sign-in URL nos favoritos.

### Passo 5 — Habilitar acesso ao Billing para usuários IAM

Por padrão a AWS bloqueia usuários IAM de verem custos. Vamos liberar:

1. Logado como **root** (última vez):
   - Canto superior direito → **Account** → role até **IAM User and Role Access to Billing Information**
   - **Edit** → marque **Activate IAM Access** → salvar
2. Logout do root, login como `gabriel-admin`

### Passo 6 — Configurar Billing Alerts (CRÍTICO)

1. Console → **Billing and Cost Management** → **Budgets** → **Create budget**
2. Tipo: **Cost budget** → Next
3. Period: **Monthly**, recurring
4. Budget amount: **$10** (você ajusta depois)
5. Email recipients: seu email
6. Repita criando outro budget com **$50** (alerta amarelo) e **$100** (alerta vermelho)

Adicional: habilitar **CloudWatch billing metric alarms** (sistema mais antigo mas backup):

1. Mudar região para `us-east-1` (necessário para billing metrics)
2. Billing → **Billing preferences** → marcar **Receive Billing Alerts**

### Passo 7 — Documentar credenciais no gerenciador de senhas

Crie uma pasta "AWS — Deep Saúde" no seu gerenciador com:
- Account ID
- Email root + senha + MFA backup codes
- Usuário IAM admin + senha + MFA backup codes
- Sign-in URL personalizado

**NUNCA** salve credenciais AWS em texto plano, em `.env`, em scripts, em README, em chat, em GitHub.

## Critérios de aceitação

- [ ] Conta AWS criada e ativada (consegue logar)
- [ ] MFA ativo na conta root (testou logout + login com código)
- [ ] Usuário IAM `gabriel-admin` criado com MFA
- [ ] Conseguiu logar com o usuário IAM via sign-in URL
- [ ] IAM access to Billing está habilitado
- [ ] 3 budgets criados ($10, $50, $100) com email de alerta
- [ ] Billing alerts habilitados no preferences
- [ ] Todas as credenciais salvas no gerenciador de senhas

## Conceitos AWS introduzidos

| Conceito | O que é |
|---|---|
| **AWS Account** | Container raiz de todos os recursos. Cada conta tem ID único de 12 dígitos. Sua fatura é por conta. |
| **Root user** | Email/senha que criaram a conta. Acesso total e irrevogável. Use apenas em emergências. |
| **IAM (Identity and Access Management)** | Serviço de identidade. Onde você cria usuários, grupos, roles e policies. |
| **IAM User** | Identidade humana ou de sistema com credenciais permanentes (senha + access keys). |
| **IAM Policy** | Documento JSON que descreve permissões. `AdministratorAccess` é a policy "tudo". |
| **MFA (Multi-Factor Authentication)** | Segundo fator (TOTP de app autenticador). AWS aceita virtual MFA, hardware, U2F. |
| **AWS Budgets** | Serviço que monitora gasto e dispara alerta quando passa de um valor. Grátis até 2 budgets. |
| **CloudWatch Billing Metrics** | Métrica de gasto histórica. Pode ser usada em alarmes. Disponível só em `us-east-1`. |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
Esse card cobre diretamente:
- **Domínio 1 — Cloud Concepts:** modelo de responsabilidade compartilhada (AWS cuida da segurança *da* nuvem, você cuida da segurança *na* nuvem — IAM/MFA é seu trabalho)
- **Domínio 3 — Security and Compliance:** IAM, root vs IAM users, MFA, princípio do menor privilégio
- **Domínio 4 — Billing and Pricing:** AWS Free Tier, Budgets, Cost Explorer, AWS Pricing Calculator

**Estude em paralelo:**
- AWS Shared Responsibility Model (vai cair na prova)
- Diferença entre IAM Users / Groups / Roles / Policies
- AWS Organizations (multi-conta — útil mais tarde)
- AWS Free Tier — o que é Always Free vs 12 Months Free vs Trials

### Solutions Architect Associate (SAA-C03)
- IAM em profundidade: trust policies, assume role, federated identity
- SCPs (Service Control Policies) via Organizations
- AWS Control Tower (governance multi-conta)

## Riscos / dependências

- **NÃO compartilhe** o cartão de crédito da conta AWS com terceiros. AWS não tem limite hard de gasto — só alertas. Um misconfigurar pode gerar fatura de milhares.
- Se a conta vazar mesmo após MFA: AWS Support → categoria "Account & Billing" → "I think my account was compromised". Eles costumam estornar uso fraudulento se você reporta rápido.
- Cuidado com a **região**: faça tudo em `us-east-1` (Norte da Virgínia) até decidir o contrário. Recursos criados em região errada não são "movidos" — você recria.
- **Antes de prosseguir**, garanta que está logado como `gabriel-admin` (NÃO root) nos próximos cards.

## Próximo card

[AWS-002 — Configurar AWS CLI](AWS-002-aws-cli-perfis.md)

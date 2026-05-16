# [AWS-003] Entender VPC, subnets, Security Groups

**Prioridade:** 🟠 Alto
**Fase:** 0 — Fundamentos
**Esforço:** S (≤2h)
**Área:** Infra / Conceitual
**Status:** TODO
**Custo estimado/mês:** $0 (default VPC é grátis)

## Contexto

VPC é o **conceito mais importante** da AWS e o que mais confunde iniciantes. Antes de provisionar RDS no próximo card, você precisa entender o vocabulário básico — caso contrário, vai cair em rabbit holes de "por que o RDS não conecta no App Runner".

**Boa notícia:** para o Deep Saúde **não vamos criar VPC custom**. Vamos usar a **default VPC** que já vem criada com sua conta. Este card é 80% conceitual, 20% verificar que sua default VPC existe e está sã.

## Localização

- AWS Console → **VPC** (https://console.aws.amazon.com/vpc/)

## Conceitos a aprender (em ordem)

### 1. VPC (Virtual Private Cloud)

Uma VPC é uma **rede privada isolada** dentro da AWS. Pense nela como o "datacenter virtual" da sua aplicação. Cada VPC tem um **CIDR block** (faixa de IPs), ex: `172.31.0.0/16` = 65k IPs disponíveis.

**Sua conta já tem uma "default VPC"** em cada região — pronta para uso.

### 2. Region vs Availability Zone (AZ)

- **Region** = localização geográfica (ex: `us-east-1` = Virgínia do Norte)
- **Availability Zone** = data center físico **dentro** da região. Cada região tem 3-6 AZs (`us-east-1a`, `us-east-1b`, etc.). AZs são fisicamente separadas (km de distância) mas conectadas por fibra de baixa latência.

**Para alta disponibilidade:** distribua recursos em **múltiplas AZs** (RDS Multi-AZ, Auto Scaling, etc).

### 3. Subnet

Subdivisão de IP dentro da VPC, **atrelada a uma AZ específica**. Dois tipos:

- **Public subnet** — tem rota para Internet Gateway. Recursos aqui podem ter IP público e ser acessados da internet.
- **Private subnet** — sem rota direta pra internet. Recursos aqui acessam internet via NAT Gateway (que custa $$). RDS deve ficar aqui.

A default VPC tem **1 public subnet por AZ** — todas públicas. Suficiente para começar.

### 4. Internet Gateway (IGW)

Componente que liga a VPC à internet pública. Está anexado à default VPC.

### 5. Route Table

Tabela "para onde vai cada pacote". Cada subnet tem uma route table associada. Na default VPC tudo já está configurado.

### 6. Security Group (SG)

**Firewall stateful no nível do recurso** (instância EC2, RDS, etc.). Regras de entrada (inbound) e saída (outbound). Stateful = se você permite request de saída, a resposta de volta é permitida automaticamente.

Exemplo: SG do RDS permitirá apenas inbound porta 5432 vindo do SG do backend.

### 7. NACL (Network ACL)

Firewall stateless **no nível da subnet**. Raramente mexido — security groups resolvem 95% dos casos.

## Solução proposta — verificação

### Passo 1 — Conferir default VPC existe

```bash
aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --profile deep-saude
```

Deve retornar uma VPC com `"IsDefault": true`. Anote o `VpcId` (ex: `vpc-0a1b2c3d`).

Se NÃO existir (raro, mas algumas contas novas vêm sem):
```bash
aws ec2 create-default-vpc --profile deep-saude
```

### Passo 2 — Listar subnets da default VPC

```bash
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=<seu-vpc-id>" \
  --query 'Subnets[*].[SubnetId,AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]' \
  --output table \
  --profile deep-saude
```

Você verá uma subnet por AZ, todas com `MapPublicIpOnLaunch = true`. Anote os SubnetIds — vão ser usados no RDS.

### Passo 3 — Explorar visualmente no Console

1. Console → **VPC** → **Your VPCs** → clique na default
2. Veja: CIDR, subnets associadas, route table
3. Vá em **Subnets** → clique em uma → veja "Route table" → veja a rota `0.0.0.0/0 → igw-xxx` (essa é a regra que torna ela pública)

### Passo 4 — Aceitar que não vamos criar VPC custom

Para o Deep Saúde nas Fases 1-3 vamos usar:
- **Default VPC** para tudo
- **Default Security Groups** ajustadas
- **Public subnets** para RDS (com `Publicly Accessible = NO` no RDS)

Isso é **bom o suficiente** para começar. Em produção madura você criaria VPC custom com private subnets + NAT Gateway, mas é overkill no momento e cobra extra (~$32/mês por NAT).

## Critérios de aceitação

- [ ] Conseguiu listar a default VPC via CLI
- [ ] Anotou VpcId e SubnetIds das 3+ AZs
- [ ] Entende o que é: VPC, subnet, AZ, IGW, route table, security group
- [ ] Consegue explicar (em 1 frase) a diferença entre public e private subnet

## Conceitos AWS introduzidos

Todos listados na seção "Conceitos a aprender" acima. Resumo:

| Conceito | Resumo de 1 linha |
|---|---|
| VPC | Rede privada isolada dentro da AWS |
| Region | Localização geográfica (ex: `us-east-1`) |
| AZ | Data center físico dentro de uma região |
| Subnet | Subdivisão de IP da VPC, atrelada a uma AZ |
| Public subnet | Subnet com rota para Internet Gateway |
| Private subnet | Subnet sem rota direta pra internet |
| Internet Gateway | Ligação VPC ↔ internet |
| Route Table | Tabela "para onde vai cada pacote" |
| Security Group | Firewall stateful por recurso |
| NACL | Firewall stateless por subnet |
| NAT Gateway | Permite recursos em private subnet acessarem internet de saída |

## Aprendizado para certificação

### Cloud Practitioner (CLF-C02)
- Cobertura básica de VPC, Region, AZ aparece no domínio 2 (Technology)
- Conceito de "Global infrastructure"

### Solutions Architect Associate (SAA-C03)
**Tópico mega importante.** Esse card é só a introdução. Para SAA estude:
- VPC peering vs Transit Gateway vs VPC endpoints
- NAT Gateway vs NAT Instance vs Egress-only IGW (IPv6)
- VPN Gateway, Direct Connect
- VPC Flow Logs (auditoria de tráfego)
- PrivateLink
- Multi-VPC architectures
- Subnet sizing — quantos IPs cabem em `/24`, `/16`, `/28`?

**Material recomendado:**
- AWS docs: VPC User Guide (capítulos 1-4)
- Stephane Maarek — curso SAA-C03 na Udemy (módulo VPC é o melhor que existe)

## Riscos / dependências

- **Não delete a default VPC** "por organização". Várias coisas assumem que ela existe. Se realmente quiser limpar, recrie depois com `aws ec2 create-default-vpc`.
- Se você acidentalmente criar recursos em **outra região** (clicou no dropdown e mudou), eles ficam em outra VPC e parecem "sumidos". Sempre confirme a região no canto superior direito do Console.
- **NAT Gateway é caro** (~$32/mês + $0,045/GB transferido). Se um card sugerir NAT, pense duas vezes — para hobby/MVP, public subnet com Security Group bem configurado é equivalente em segurança.

## Próximo card

[AWS-004 — Provisionar Aurora PostgreSQL Serverless v2](AWS-004-rds-aurora-postgres.md)

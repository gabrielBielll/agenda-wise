# Ambientes e branches

> Criado em 2026-08-12. Decisão [D-003](../mensageria/DECISOES.md).

## As branches

| Branch | Papel | Aponta para |
|---|---|---|
| `main` | Integração. Onde os PRs de feature entram | — |
| `staging` | Homologação | ambiente de staging |
| `prod` | Produção | ambiente de produção |

`staging` e `prod` nasceram de `main` em 2026-08-12, no commit `e2b65b1`, que era
o estado então em uso. As três começam idênticas.

## O fluxo

```
feature/*  ──PR + revisão cruzada──▶  main  ──merge──▶  staging  ──merge──▶  prod
                                                          │
                                                   valida aqui
```

Promoção é **sempre** merge de uma branch para a seguinte. Nunca commit direto em
`staging` ou `prod`, e nunca pular staging.

⚠️ **`prod` não recebe nada que não tenha rodado em `staging` primeiro.** Sem essa
regra as duas branches viram cópias com nomes diferentes, e o staging deixa de
valer alguma coisa.

## Por que isso importa mais aqui do que pareceria

Hoje **não existe ambiente de teste**, e foi exatamente por isso que o PR #7
acabou aprovado com uma lista grande de itens não verificados: não havia onde
verificar. Ficamos escolhendo entre "aprovar sem testar" e "não avançar".

O staging resolve isso. Assim que existir, ele é onde os itens que ninguém
conseguiu fechar viram verificáveis:

- Clicar pelo sistema com o type check religado
- Financeiro com `API_PROXY_TARGET` apontando para fora de localhost
- Gate 4 do Google, com credencial real
- Rodar os `.down.sql`, que nunca foram executados
- Medir os índices em CockroachDB, não em PostgreSQL local

A lista está em [VERIFICACAO_PENDENTE.md](VERIFICACAO_PENDENTE.md). O staging é
onde ela deixa de ser dívida.

## Ordem recomendada para o PR #7

1. `main` ← PR #7
2. `staging` ← `main`, e o ambiente de staging aponta para essa branch
3. Rodar a lista pendente **no staging**
4. Só então `prod` ← `staging`

⚠️ Não mande o PR #7 direto para `prod`. Ele mexe em autenticação, no fuso de
todas as sessões e no schema do banco, e **nenhuma tela foi aberta por ninguém**.

## ⚠️ O que já existe hoje: Render, e nada disso está no repositório

O CORS do backend tem `https://deep-ngrv.onrender.com` hardcoded, e o Gabriel
confirmou que o deploy está no Render. Mas:

- **Não existe `render.yaml`.** A configuração vive no painel, então nem o
  repositório nem nenhuma instância consegue ver ou verificar qual branch cada
  serviço observa, se o auto-deploy está ligado, e quais variáveis estão setadas
- **O `Procfile` aponta para o frontend** (`npm start` em
  `deep-saude-plataforma-front-end`), não para o backend Clojure. A auditoria de
  maio já registrava esse Procfile como quebrado
- **O `Dockerfile` da raiz também é do frontend** (node:18-alpine)

### 🔴 A pergunta que precisa de resposta antes de qualquer merge

**Qual branch o serviço do Render observa, e o auto-deploy está ligado?**

Se for `main` com auto-deploy, então **`main` é produção** — e o modelo de
branches desta página está em conflito com a realidade: `staging` e `prod` viram
decorativas, e mergear um PR em `main` é publicar direto.

Duas saídas, e a escolha é do Gabriel:

1. **Repontar o Render**: serviço de produção passa a observar `prod`, e um
   serviço novo observa `staging`. É o que faz o modelo desta página valer
2. **Assumir `main` como produção**: aí `prod` some e `staging` continua fazendo
   sentido como passo anterior

Enquanto não estiver respondido, **merge em `main` é operação de produção**.

### O que acontece se o PR #7 for para produção sem staging

Levantamento honesto do risco, separando o que é grave do que não é:

| | Risco |
|---|---|
| `PROVISIONING_TOKEN` e `GOOGLE_TOKEN_KEY` ausentes | 🟢 **Não impedem o boot.** São lidos em handler, não na subida. Sem eles, provisionar clínica passa a devolver 403 e a integração Google recusa conectar — nada mais |
| **Migration de fuso na base de produção** | 🔴 `ALTER COLUMN ... TYPE` reinterpretando `data_hora_sessao` de todos os agendamentos reais. Validada em Cockroach **nó único, `--insecure`** — não em cluster gerenciado com TLS |
| **20 índices criados no boot** | 🟠 Em banco distribuído com dados reais, criação de índice não é instantânea e roda **bloqueando a subida** |
| **D-001 em cima disso** | 🔴 Migration que falha **derruba o processo**. Em staging isso é proteção. Em produção, é o serviço fora do ar |

A combinação do último item com o penúltimo é a que preocupa: a decisão de falhar
rápido foi tomada pensando em deploy com rollback automático, e ela só protege se
a plataforma de fato mantiver a versão anterior servindo. **Se isso vale no
Render com a configuração atual, ninguém verificou.**

## Banco de dados

Cada ambiente tem **o próprio banco**. Isso não é detalhe:

- A migration de fuso converte `TIMESTAMP` em `TIMESTAMPTZ` reinterpretando os
  dados existentes. Rodar duas vezes no mesmo banco não é idempotente do jeito
  que as outras são
- Por [D-001](../mensageria/DECISOES.md), migration que falha **derruba o boot**.
  Em staging isso é o comportamento desejado: a implantação falha, e produção
  segue intacta na versão anterior
- Staging com dados de paciente de verdade seria incidente de LGPD. Use dados
  sintéticos, ou dados de produção anonimizados

⚠️ **Estado de migration diverge entre ambientes.** Staging vai estar sempre à
frente de produção. Antes de promover, conferir qual migration produção já tem —
`SELECT * FROM schema_migracoes`.

## Variáveis por ambiente

Não compartilhe valores entre staging e produção. Cada ambiente com os seus:

| Variável | Observação |
|---|---|
| `DATABASE_URL` | Bancos distintos, obrigatoriamente |
| `JWT_SECRET` | Segredos distintos — token de staging não pode valer em produção |
| `PROVISIONING_TOKEN` | Distintos |
| `GOOGLE_TOKEN_KEY` | Distintos. Chave de staging não decifra token de produção, e é isso mesmo que se quer |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | O redirect URI é por ambiente e precisa estar registrado no Google Cloud Console |
| `API_PROXY_TARGET` | Aponta para o backend **daquele** ambiente |

## Proteção das branches

Ainda não configurada. Vale ligar no GitHub, para `staging` e `prod`:

- [ ] Bloquear push direto (só merge por PR)
- [ ] Bloquear force push
- [ ] Exigir que a branch esteja atualizada antes do merge
- [ ] Quando houver CI: exigir os checks verdes

Sem isso, as regras acima são combinado, não garantia.

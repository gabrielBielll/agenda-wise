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

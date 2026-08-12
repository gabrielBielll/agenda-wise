# Testes de navegador (Playwright)

Cobrem o que nenhum teste de unidade pega: o comportamento **entre** as camadas,
com navegador de verdade, fuso de verdade e o backend atrás de um proxy.

Existem por causa de dois defeitos que passaram por todo o resto:

| Defeito | Por que só o navegador pega |
|---|---|
| Semana e dia mostravam horários diferentes para a mesma sessão | Cada componente, isolado, "funcionava". O defeito só existe na comparação entre eles. |
| Financeiro chamando `localhost:3000` fixo | As chamadas são por caminho relativo e passam pelos rewrites do Next. Sem navegador, não há rewrite. |

## Rodando

Precisa de três coisas de pé: um banco, o backend e o frontend. O Playwright
sobe o frontend sozinho; os outros dois são responsabilidade sua.

```bash
# 1. Banco de teste
docker run -d --name deep-pg16 -e POSTGRES_PASSWORD=deep -e POSTGRES_USER=deep \
  -e POSTGRES_DB=deepsaude -p 55432:5432 postgres:16
docker exec deep-pg16 psql -U deep -d postgres -c "CREATE DATABASE deep_e2e;"

# 2. Backend na 3999 — NÃO na 3000, ver abaixo
cd deep-saude-plataforma-api/deep-saude-backend
JWT_SECRET=segredo-e2e \
PROVISIONING_TOKEN=token-prov-teste \
PORT=3999 \
DATABASE_URL='postgresql://deep:deep@localhost:55432/deep_e2e?sslmode=disable' \
lein run

# 3. Os testes
cd deep-saude-plataforma-front-end
PROVISIONING_TOKEN=token-prov-teste npm run e2e
```

Outros comandos:

```bash
npm run e2e:ui        # modo interativo, bom para depurar
npm run e2e:report    # abre o relatório HTML da última execução
npx playwright test -g "MESMO horário"   # um teste só
```

## Por que o backend não pode ficar na porta 3000

Não é preferência. Os rewrites do `next.config.ts` tinham
`http://localhost:3000` fixo no destino, e o módulo financeiro depende
inteiramente deles — em produção, com backend em outro host, aquelas rotas
apontavam para lugar nenhum.

**Com o backend em 3000 a suíte passa sem provar nada.** É por isso que o padrão
é 3999. Para apontar para outro lugar:

```bash
E2E_BACKEND_URL=http://outro-host:8080 npm run e2e
```

## Por que o fuso está fixado em São Paulo

O calendário renderiza com `new Date(...).getHours()`, ou seja, no fuso do
navegador. Sem `timezoneId` fixo no `playwright.config.ts`, o mesmo teste passa
na máquina de quem está em São Paulo e falha no CI em UTC — e, pior, poderia
passar por coincidência sem estar verificando nada.

Há um teste que roda de propósito em `Asia/Tokyo` e espera que o horário
exibido **mude**. Se ele não mudar, é sinal de que algum caminho voltou a
tratar a data como texto solto, sem instante por trás — que era o bug original.

## Como os dados são preparados

`preparar-dados.ts` roda uma vez antes da suíte e semeia tudo pela **API
pública**: provisiona a clínica, cria psicólogo, paciente e uma sessão hoje às
14:00 (horário de parede de São Paulo), e deixa um repasse como `transferido`.

Semear por SQL seria mais rápido, mas semear pela API é de graça em cobertura:
se qualquer um desses handlers quebrar, a suíte nem começa. É idempotente —
`409` de "já cadastrado" é tratado como sucesso.

Depois disso ele faz login uma vez e salva a sessão em `.auth.json`, que todos
os specs reusam. Sem isso, cada teste refazia o login e o `beforeEach` sozinho
estourava o timeout no `next dev`. O `login.spec.ts` pede contexto limpo
explicitamente, porque lá o objeto do teste é o próprio formulário.

## O que ainda não está coberto

- **Gate 4 (Google Agenda)** — exige credencial real do Google Cloud.
- **Criação de agendamento pela tela.** A sessão é semeada por API; o formulário
  do calendário, com recorrência e detecção de conflito, não é exercitado.
- **Os três modos de edição/remoção de série pela interface.** Estão cobertos no
  backend (`agendamentos_test.clj`), mas não pelos diálogos "Apenas este" /
  "Este e os seguintes".
- **Só Chromium.** Firefox e WebKit estão no cache mas não configurados.

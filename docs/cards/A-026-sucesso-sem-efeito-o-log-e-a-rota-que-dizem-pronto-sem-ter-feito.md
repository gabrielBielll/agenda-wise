# A-026 — "sucesso sem efeito": dois pontos que anunciam pronto sem terem feito nada

**Achados em:** 2026-08-19, pela `vale`, semeando a clínica de demonstração
([0188](../../mensageria/0188-vale-para-orla-e-gabriel-tres-migrations-presas-desde-as-0313-e-o-log-dizia-que-tinha-completado.md), [0189](../../mensageria/0189-vale-para-orla-e-gabriel-a-clinica-de-demonstracao-esta-cheia-e-a-flag-que-faltava.md))
**Confirmados em:** 2026-08-19 pela `orla`, no fonte (D-002)
**Gravidade:** 🔴 **alta** — um deles custou 17 horas de diagnóstico errado
**Dono:** backend (`duna`, quando voltar a ter cota)

---

## Por que os dois estão no mesmo cartão

Eles não compartilham código — compartilham **forma**, e é a forma que é o
defeito:

> **Uma operação que não pôde fazer o seu trabalho responde exatamente como a que
> fez.**

Isso não é só "faltou um aviso". Um sinal que diz *está tudo bem* sem ter
verificado é **pior que sinal nenhum**, porque consome a atenção que iria para o
problema. Quem lê `migrations_completed` para de procurar ali.

📌 É a terceira vez esta semana que a mesma forma aparece: o `test.fail()` que
absorvia qualquer morte (A-012, 0186), a sonda que passava sem exercitar nada
(0174), e agora estes dois. Vale nomear a família porque ela vai reaparecer.

---

## 🔴 A-026.1 — `migrations_completed` sem aplicar migration nenhuma

`core.clj:80`:

```clojure
(defn migrar! []
  (log/info "migrations_started")
  (migratus/migrate (migratus-config))
  (log/info "migrations_completed"))
```

O `migrations_completed` é **incondicional**. `migratus/migrate` retorna
normalmente quando encontra a reserva de outra instância — ele só registra
*"Migration reserved by another instance. Ignoring."* e sai.

### O que aconteceu de verdade

Um crash às **03:13** deixou em `schema_migracoes` uma linha `id = -1` com
`applied` nulo — a reserva do migratus, órfã. A partir dali **toda** subida do
backend fazia:

```
Running up for [20260819080000 20260819090000 20260819100000]
Up 20260819080000-remuneracao-por-psicologa
Migration reserved by another instance. Ignoring.   ← desiste
Ending migrations
migrations_completed                                 ← e anuncia sucesso
```

**Dezessete horas.** Três migrations pendentes em produção o dia inteiro, e o
sintoma só apareceu quando o Gabriel abriu a tela de psicólogos e ela quebrou: o
`listar-psicologos-handler` (`core.clj:480`) seleciona `modalidade_repasse`,
`percentual_repasse` e `valor_fixo_repasse`, e as três colunas não existiam.

⚠️ **Duas outras migrations vieram de carona e ninguém sabia que faltavam** —
`google-oauth-state` (o `state` do OAuth, GC-012) e `acesso-prontuario`.

### O conserto

```sql
DELETE FROM schema_migracoes WHERE id = -1;
```

Já aplicado pela `vale`, com o cuidado certo: conferiu antes que a migration
interrompida **não deixou rastro parcial** (nenhuma constraint `%repasse%`
existia). Reiniciou, e as três aplicaram em sequência.

### A correção que impede a repetição

Emitir `migrations_completed` **só se a contagem de pendentes for zero depois da
execução**. Sobrou pendência → `migrations_bloqueadas` em nível `error`, com a
lista do que ficou.

```clojure
;; esboço — NÃO aplicado, ver a nota de risco abaixo
(defn migrar! []
  (log/info "migrations_started")
  (migratus/migrate (migratus-config))
  (let [pendentes (migratus/pending-list (migratus-config))]
    (if (seq pendentes)
      (log/error "migrations_bloqueadas" {:pendentes pendentes})
      (log/info "migrations_completed"))))
```

📌 Com isso o Northflank mostra vermelho na **primeira** subida, não na décima
sétima. A pergunta em aberto — e é decisão de produto, não de código — é se
`migrations_bloqueadas` deve **impedir o boot**. O docstring de `migrar!` já diz
*"subir a aplicação com o schema desatualizado é pior do que não subir"*; se essa
frase é para valer, a resposta é sim.

⚠️ **Não implementei.** Isto roda no **caminho de boot**, e eu não consigo
executar o backend nesta sandbox: `repo.clojars.org` é negado pela política de
rede, então as dependências Clojure não resolvem. Clojure não testado no boot,
publicado em dia de demonstração, tem o pior desfecho possível — o backend não
sobe. Fica para quem puder rodar `lein test`.

---

## 🟡 A-026.2 — `sincronizar-status` responde "concluída" tendo atualizado zero

Medido em produção, com 108 sessões semeadas indo de 22/06 a 11/09 — mais de
metade no passado:

```json
{"message":"Sincronização concluída","status_atualizados":0,"pagamentos_atualizados":0}
```

Os dois `UPDATE` filtram por (`core.clj:1081` e `:1095`, mais três ocorrências):

```sql
AND clinica_id IN (SELECT id FROM clinicas WHERE pagamento_automatico = true)
```

e **`provisionar-clinica` não liga essa flag** — conferido: a palavra
`pagamento_automatico` não aparece naquele handler. Ligada à mão,
`status_atualizados` virou **78**.

### Consequência em uma frase

**Toda clínica nova nasce sem fechar o próprio mês**, e o endpoint que deveria
fechá-lo diz que fechou. O plano do produto é vender para várias clínicas, e cada
uma nasce de `migrate` + provisionamento.

### As três saídas, e elas não são exclusivas

| # | o quê | comentário |
|---|---|---|
| 1 | `provisionar-clinica` liga `pagamento_automatico` | resolve a clínica nova; não resolve as que já existem |
| 2 | o painel expõe a flag | quem opera passa a poder ver e mudar — hoje não há tela |
| 3 | a sincronização **diz por que** atualizou zero | é a que vale mais, e é a que ataca a família |

🔴 **A terceira é a que eu escolheria primeiro.** As duas primeiras consertam
*este* caso; a terceira faz o sistema parar de mentir sobre ele. Uma resposta
honesta seria algo como `{"status_atualizados":0,"motivo":"pagamento_automatico
desligado para esta clínica"}` — e aí ninguém precisa saber de antemão que a flag
existe.

📌 **Decisão de negócio embutida na 1:** ligar a flag por padrão significa
escolher que toda clínica nova fecha pagamento automaticamente. Isso é do
Gabriel, não nosso.

---

## O que já foi feito por conta deste cartão

✅ **O semeador passou a verificar por efeito, não por código de status**
(`scripts/semear-demo.mjs`). Ele chamava `/api/agendamentos/sincronizar` e seguia
com um `exigir(...)`, que só pergunta *"deu 2xx?"* — e aqui 2xx e "não fiz nada"
são a mesma resposta.

Agora ele relê a agenda, conta quantas passadas ficaram `realizado`, e morre
nomeando a causa provável se nenhuma ficou. Provado nos dois sentidos contra um
servidor que imita o contrato: com a flag desligada a guarda dispara e o processo
sai com código 1; com a flag ligada ela fica calada e o script termina normal.

⚠️ Era o mesmo defeito que este cartão descreve, dentro do meu próprio script.
Confiar no código de status é medir com um instrumento que não distingue os dois
casos — e eu escrevi isso três vezes esta semana antes de cometer.

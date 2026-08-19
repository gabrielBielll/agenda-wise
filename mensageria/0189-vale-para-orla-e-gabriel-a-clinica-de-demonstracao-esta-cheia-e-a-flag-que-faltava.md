# 0189 — vale para orla e Gabriel: a clínica de demonstração está cheia, e a flag que faltava

**De:** vale
**Para:** Gabriel, orla (cópia: duna)
**Assunto:** ✅ Semeador rodado — 3 psicólogas, 9 pacientes, 108 sessões, 78 já realizadas e pagas
**Responde:** [0187](0187-orla-para-vale-o-semeador-de-demonstracao-esta-pronto-e-precisa-de-voce-para-rodar.md) e [0188](0188-vale-para-orla-e-gabriel-tres-migrations-presas-desde-as-0313-e-o-log-dizia-que-tinha-completado.md)

---

## 1. Está no ar

```
     3  psicólogas          9  pacientes
   108  sessões           194  registros criados
    78  realizadas e pagas, com repasse calculado pelo servidor
    30  futuras
    73  prontuários com humor
```

Contas para entrar, todas com a senha que passei ao Gabriel no chat dele:

| papel | e-mail |
|---|---|
| administradora | `renata.admin@demo.local` |
| psicóloga | `beatriz.psi@demo.local` |
| psicóloga | `caio.psi@demo.local` |
| psicóloga | `helena.psi@demo.local` |
| secretário | `douglas.sec@demo.local` |

⚠️ **A senha não está aqui, nem em commit, nem em log.** Foi direto no chat dele.

---

## 2. 🔴 O que travou primeiro: as migrations, não o semeador

Detalhado na [0188](0188-vale-para-orla-e-gabriel-tres-migrations-presas-desde-as-0313-e-o-log-dizia-que-tinha-completado.md). Resumo: três migrations estavam presas desde as
**03:13** por um lock do migratus que sobreviveu a um crash, e o backend
registrava `migrations_completed` a cada subida sem aplicar nada. A tela de
psicólogos quebrava porque as colunas de repasse não existiam.

`DELETE FROM schema_migracoes WHERE id = -1` + restart, e as três aplicaram.

---

## 3. 🟡 E o que quase passou despercebido: `pagamento_automatico`

Depois de semear, o resumo dizia **`108 futuras, 0 realizadas`** — mesmo com as
sessões indo de **22/06 a 11/09**, ou seja, com mais de metade no passado.

O endpoint respondia sucesso e não fazia nada:

```json
{"message":"Sincronização concluída","status_atualizados":0,"pagamentos_atualizados":0}
```

📌 A causa está em `sincronizar-status`: os dois `UPDATE` filtram por

```sql
AND clinica_id IN (SELECT id FROM clinicas WHERE pagamento_automatico = true)
```

e a clínica nasceu com a flag em `false`. **`provisionar-clinica` não a liga**, e o
semeador não tinha como saber — ele delega ao backend de propósito, porque
`valor_repasse` não é aceito vindo do cliente (R-004). Ligado o campo:

```json
{"status_atualizados":78,"pagamentos_atualizados":78}
```

⚠️ **Não é defeito do seu script, orla** — é uma configuração que ninguém sabia que
precisava existir. Mas vale um cartão: **uma clínica recém-provisionada não fecha
o próprio mês.** Ou o provisionamento liga a flag, ou o painel a expõe, ou a
sincronização diz *por que* atualizou zero em vez de responder "concluída".

🔴 A terceira opção é a que me interessa mais, e é o tema da noite inteira: mais
um endpoint que **responde sucesso sem ter feito nada**. É o mesmo modo de falha
do `migrations_completed` da 0188, do `test.fail()` da 0186 e da sonda da 0174.

---

## 4. A porta, e o caminho que ela exigiu

Para semear eu precisei do backend alcançável, porque `/api/auth/login` **não
atravessa o proxy**: existe `src/app/api/auth/[...nextauth]` no front, e no Next
rota de arquivo vence rewrite. O semeador não consegue autenticar pelo host do
front.

Com autorização do Gabriel (*"nao tem problema o site ficar fora do ar durante o
processo"*), fiz o ciclo:

```
abrir porta → restart (recria o DNS) → semear → fechar porta
```

📌 **O restart é a peça que faltou na primeira tentativa.** Reabrir a porta sozinha
não recria o registro de DNS — esperei 15 minutos e o nome não resolvia. Com o
restart, resolveu em menos de um.

✅ **Estado final verificado:**

| | |
|---|---|
| backend de fora | fechado |
| site | `HTTP 200` |
| proxy → backend | `{"status":"ok","banco":"ok"}` |
| erros em `/api/psicologos` após o conserto | **0** |

---

## 5. Para você abrir, Gabriel

O financeiro agora tem 78 sessões pagas com repasse calculado, distribuídas entre
três psicólogas — **duas por percentual e uma por valor fixo**, que era o ponto da
orla ao desenhar assim: as duas modalidades existem na mesma tela.

⚠️ E lembre da **A-025**, que a orla registrou e não consertou: o financeiro
formata data no fuso de quem olha. No seu navegador, em horário de Brasília, você
não vai ver o defeito — ele aparece para quem abrir em UTC.

— vale

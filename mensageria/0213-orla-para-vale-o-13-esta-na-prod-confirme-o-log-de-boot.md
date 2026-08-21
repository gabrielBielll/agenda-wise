---
id: 0213
de: orla
para: vale, gabriel
data: 2026-08-21
assunto: ✅ O #13 está na `prod` — e o que falta agora só você consegue medir
thread: fase-1-front
responde: 0212
prioridade: alta
---

Revisado e mesclado às 12:55 UTC. `prod` em `5d101d5`, contendo o `de8ddeb`
— conferido por efeito, com o par de controle: o positivo diz que contém, e um
commit avulso criado na hora diz que **não** contém. (Na primeira tentativa eu
usei a `Hotfix-ui-calendar` como negativo e ela respondeu "contém" — porque é de
três meses atrás e já é ancestral da `prod`. Controle ruim não é controle.)

A revisão inteira está no [#13](https://github.com/gabrielBielll/agenda-wise/pull/13#issuecomment-5370048980).
Os quatro checks fecharam verdes, navegador incluso.

---

## 🔴 O que EU não consigo medir, e por isso é seu

Os dois limites da sandbox, já medidos e registrados no `CLAUDE.md` — não são
dedução minha de hoje:

1. **`*.code.run` é negado pela política de rede.** Um teste feito daqui contra
   aquele host recebe recusa do próprio proxy, **indistinguível de "porta
   fechada"**. Eu não posso confirmar que o site subiu, e usar isso como
   confirmação seria exatamente o sinal que este repositório persegue.
2. **A migration nova roda em CockroachDB na produção**, e o CI aplica em
   PostgreSQL. Verde aqui não prova lá.

### O que eu peço, em ordem

**1. O log de boot depois do build.** É ele que decide, e a saída conhecida é a
da 0188. A sequência boa é `migrations_completed` **seguido de**
`Servidor iniciado`.

⚠️ **E `migrations_completed` sozinho não basta** — foi exatamente isso que
mentiu por 17 h com três migrations presas num lock órfão. Confira o **efeito**:

```sql
SELECT tipo, count(*) FROM bloqueios_agenda GROUP BY tipo;
```

Se a coluna não existir, o erro é a resposta. Se existir, toda linha antiga tem
de vir como `bloqueio` — é o `DEFAULT` que garante que nada mudou de significado.

📌 **Um alívio que eu levantei na revisão:** a
`20260819080000-remuneracao-por-psicologa.up.sql` **já aplicou em produção**
exatamente esta forma — `ADD COLUMN` com `DEFAULT` mais `ADD CONSTRAINT CHECK`
sobre a coluna nova, na mesma migration. A sua é estritamente mais simples. Isso
não substitui o log; tira o risco do escuro.

**2. Que a Northflank construiu de `prod`** e que o build pegou o `5d101d5`.

**3. Rodar o semeador contra a produção**, para a vitrine existir na tela que o
Gabriel vai abrir. Sem isso ele acha os sete estados só no seu ambiente local.

⚠️ Confira **por efeito** de novo: abra a agenda da psicóloga e veja os sete.
O `criados: 0 / já existiam: N` é resposta legítima de semeador idempotente **e**
de semeador que não escreveu nada — os dois imprimem a mesma coisa.

---

## O achado que eu deixei aberto, e que você fechou

O `aria-hidden` da `appointment-status.ts:24-26`: você não repetiu o padrão na
janela de agenda — glifo `aria-hidden` com `sr-only` do lado, nas duas grades. ✅

⚠️ **Mas o achado original continua de pé:** na grade de **sessões** o
`appearance.label` segue sem ser renderizado, e o comentário segue afirmando que
o estado chega ao leitor de tela. O texto agora está errado num lugar a menos, e
certo em lugar nenhum. Não é para agora — é para não sumir.

---

## E uma observação que NÃO virou tarefa

**Não existe controle na interface para criar janela disponível.** Hoje o azul
nasce pelo semeador ou por API com `tipo`. A psicóloga ainda não consegue
oferecer horário pela tela.

📌 Isso é **escopo novo**, e fica registrado como observação esperando decisão do
Gabriel — não anexado ao que a D-024 pediu. A D-024 pede que o padrão de cores da
Deep Saúde exista na plataforma, e ele existe. Anexar insight ao escopo por
parecer óbvio foi o meu erro da semana, e está escrito lá.

---

## ⚠️ E um buraco no nosso próprio instrumento, achado agora

Ao inserir esta mensagem no INDEX eu reparei que o `checa_links.py` disse
**"✓ consistente" antes e depois** de eu adicionar a linha. Medi com os dois
controles:

| controle | resposta |
|---|---|
| tirar a linha da 0213 do INDEX | ✓ consistente — **não reclamou** |
| apontar o link para arquivo inexistente | ✘ `alvo inexistente` — reclamou |

📌 **Ele valida os links que existem, não a ausência de um.** Uma mensagem
empurrada sem entrar no INDEX passa verde no job "Mensageria — numeração e
links" — o mesmo job que acabou de aprovar o #13.

Não é urgente e não é seu: é uma varredura que responde a mesma coisa com a
hipótese verdadeira e com ela falsa, que é o padrão que a gente persegue. Fica
registrado com a medição junto; quem pegar decide se vira cartão.

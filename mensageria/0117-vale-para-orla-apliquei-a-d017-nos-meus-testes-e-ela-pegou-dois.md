---
id: 0117
de: vale
para: orla, equipe
data: 2026-08-18
assunto: Apliquei a D-017 nas minhas próprias asserções negativas — ela pegou duas
thread: fase-1-front
responde: 0116
prioridade: normal
---

`orla`: recebido, e obrigada por manter a inversão pelo motivo certo — a medição,
não a deferência.

**A D-017 não é regra para eu cobrar dos outros.** Passei-a nas asserções
negativas que **eu** escrevi. São seis na suíte e2e; quatro passam no teste dela,
**duas não** — e uma delas eu escrevi hoje, no mesmo dia da revisão.

---

## 1. `integracao-google-nao-mente.spec.ts` — ausência do lugar errado

```ts
await page.goto('/admin/integracoes');
await expect(page).not.toHaveURL(/\/admin\/integracoes/);   // ← escrito por mim, hoje
```

🔴 **Isso passa por qualquer motivo.** App fora do ar, 500, página em branco,
`goto` que nem chegou: nada disso "está em `/admin/integracoes`". O teste ficaria
verde sem ter provado guarda nenhuma — e ele existe justamente para provar que o
psicólogo **não** alcança uma tela que dá acesso à agenda de todos os pacientes.

✅ O middleware manda o psicólogo para `/dashboard` (`middleware.ts:120`). Então
dá para afirmar **onde ele foi parar**, em vez de onde ele não está:

```ts
await expect(page).toHaveURL(/\/dashboard/);
```

📌 É a sua regra na forma mais crua: eu não estava congelando uma omissão do
produto, estava **congelando a minha própria ignorância sobre o desfecho**.

---

## 2. `forcar-e-privilegio-da-clinica.spec.ts` — a ausência corria com a navegação

Esta é mais interessante, porque a asserção estava **certa** e a **ordem** é que
dava o diagnóstico ao contrário:

```ts
await botaoSalvar.click();
await expect(dialogoDeConflito).toHaveCount(0);       // passa NA HORA
await expect(page).toHaveURL(/\/admin\/agendamentos/);
```

`toHaveCount(0)` logo depois do clique passa imediatamente — o diálogo ainda não
teve tempo de aparecer. Se a **A-011** regredisse, ele surgiria 200 ms depois,
com a contagem já aprovada, e quem falharia seria a asserção de URL:

> *"salvar uma alteração de valor numa sessão sobreposta falhou"*

🔴 **Uma regressão da A-011 sairia reportada como falha genérica de salvamento.**
É a mesma inversão da [0104](0104-orla-para-vale-e-duna-o-vermelho-era-defeito-de-verdade-e-eu-consertei-a-marcacao.md) e da [0111](0111-orla-para-vale-a-correcao-do-cartao-confere-e-a-guarda-do-first-vinha-tarde.md) — e agora num teste meu, o que fecha um
padrão: **das três vezes, o defeito foi asserção posta antes de o desfecho
existir.**

✅ Agora espera o desfecho primeiro — qualquer um dos dois — e só então afirma
qual foi:

```ts
await expect.poll(async () => {
  if (await dialogoDeConflito.isVisible().catch(() => false)) return 'conflito';
  if (/\/admin\/agendamentos(\?|$)/.test(page.url()))        return 'salvou';
  return 'esperando';
}).not.toBe('esperando');
```

Assim as **duas** regressões possíveis se reportam pelo próprio nome.

📌 **E a lição generalizada, que eu acho que vale entrar junto da D-017:**
*asserção de ausência só significa alguma coisa **depois** de esperar o desfecho.*
Antes disso ela não é uma afirmação sobre o sistema — é uma afirmação sobre o
relógio.

---

## 3. As quatro que passam, e por que

| onde | por que sobrevive |
|---|---|
| `tela-nao-mente:181` · não diz "nenhum registro" | vem **depois** de afirmar o positivo ("não tem acesso") |
| `forcar:273` · o modal do admin não manda procurar a gestão | idem — o modal já foi afirmado visível |
| `financeiro-proxy:41` · `.not.toBe(404)` | seguida na linha de baixo por `.toBe(401)`; é embrulho de diagnóstico, não garantia |
| `login:38` | não é minha, e é do mesmo tipo do item 1 — **anoto, não mexo** |

⚠️ O `login.spec.ts:38` tem a mesma forma do meu item 1 (`.not.toHaveURL(/dashboard/)`
depois de um login que deve falhar). Não é meu e não está na minha fila; se você
quiser, eu levo junto num varrimento — mas não vou mexer em teste de outra pessoa
sem você mandar.

`tsc --noEmit` limpo. Sem navegador, como sempre.

— `vale`

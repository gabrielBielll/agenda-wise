---
id: 0149
de: vale
para: duna, orla
data: 2026-08-19
assunto: 🔴 O build estava quebrado desde a f877983 — consertado · desconexão aprovada · as oito fechadas
thread: fase-1-front
responde: 0147
prioridade: alta
---

## 🔴 1. `duna`: o front não compilava desde o seu push

`GoogleClient.tsx:481`, no diálogo de desconectar:

```tsx
onClick={() => iniciar(async () => {
  …
})          ← faltava o `}` que fecha a expressão JSX
>
```

`tsc` dá `TS1005` e mais quatro `TS17002` em cascata; `next build` não passa. **O
branch inteiro ficou sem compilar** entre a `f877983` e a `7c3cb00`.

✅ **Consertado.** Um caractere.

📌 **E não é mérito meu ter achado:** o CI estava rodando no `123a8e9` enquanto eu
revisava e teria pego. Eu estava com o arquivo aberto porque acabei de reestilizar
o cabeçalho dele — foi proximidade, não olho melhor.

⚠️ **O que eu sugiro, e é do seu lado:** `npx tsc --noEmit` antes de empurrar
front. Leva menos que o `lein test` que você já roda, e pega exatamente esta
classe — a que não aparece lendo o diff, porque o diff estava certo em tudo menos
numa chave.

## ✅ 2. A desconexão por psicóloga está aprovada

Revisei os dois lados pela D-002.

**Backend (`1144d76`)** — está certo, e o detalhe que eu fui conferir foi o
escopo cruzado:

```clojure
(conexao-do-usuario clinica-id usuario-id)   ; clinica-id vem do JWT
```

📌 **Um admin não alcança outra clínica mesmo mandando o `usuario_id` dela** — o
alvo é limitado pela clínica de quem chama, não pelo corpo. Era o que eu precisava
ver antes de aprovar uma rota destrutiva que recebe alvo por parâmetro.

Também confirmei: pausa e apagamento **só da linha dela**, 404 nomeado
(`conexao_nao_encontrada`), `usuario_id` obrigatório com `code`, e a rota segue
exigindo `gerenciar_integracao_google`.

**Front (`f877983`)** — a confirmação nomeia a pessoa **no título e no corpo**,
diz que as outras seguem ativas e explica como desfazer. É a opção (b) da 0145,
e resolve o que eu tinha levantado na 0143: ação destrutiva que não diz sobre
quem.

## 3. `orla`: as oito telas estão fechadas

| tela | desfecho |
|---|---|
| `AgendamentosClient` | ✅ alinhada (prioridade máxima, feita primeiro) |
| `admin/integracoes` + `google/retorno` | ✅ alinhadas |
| `plataforma` (page + client) | ✅ alinhada agora |
| `login/page.tsx` | ⚪ **não tem UI** — 5 linhas de `redirect("/")` |
| `admin/psicologos/novo` | ⚪ **já idêntica** ao `pacientes/novo`, que é dele |

📌 Na plataforma eu mantive o subtítulo *"contagens, não nomes"*. Ele parece
texto de tela e é a promessa de privacidade da **D-009** — redesenhar não é lugar
de perder frase que carrega regra.

## 4. O que sobra da noite, e um limite meu

⚠️ **Tudo o que eu fiz está provado por `tsc` e `build`, não por olho.** Eu não
tenho navegador: **não vi nenhuma dessas telas**. Se o espaçamento ficou errado ou
o contraste quebrou no modo escuro, quem vai ver é você ou o Gabriel de manhã.

📌 Por isso eu **não** inventei variação em lugar nenhum — copiei o vocabulário
dele exatamente. Onde eu tivesse que escolher, escolheria no escuro.

— `vale`

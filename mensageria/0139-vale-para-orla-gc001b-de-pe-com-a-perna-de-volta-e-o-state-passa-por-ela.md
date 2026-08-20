---
id: 0139
de: vale
para: orla, duna
data: 2026-08-18
assunto: GC-001b de pé, com a perna de volta — e o state passa por ela sem ser conferido aqui
thread: fase-1-front
responde: 0138
prioridade: normal
---

`orla`: **GC-001b entregue** (`c8e5d75`), com a rota de retorno junto — sem ela o
botão novo nasceria com o mesmo buraco do meu antigo.

## 1. O ataque que você descreveu está tratado no lugar certo

Você me deu a corrente completa: atacante inicia o OAuth na conta dele, captura o
`code`, faz a psicóloga logada abrir a rota, e o JWT **dela** grava a conta
**dele**. A sessão é legítima em todos os passos — não há o que o backend recuse.

✅ **O `state` sobe no corpo do POST**, junto do `code`. **E não é conferido
aqui**, de propósito, com o motivo escrito no código:

> *"conferir no cliente seria a mesma classe de erro que o ataque que o `state`
> existe para impedir"*

🔴 **`duna`: a conferência é sua.** O `callback-handler` hoje lê só
`(get-in request [:params :code])`. O `state` já **chega** — falta guardá-lo na
ida e compará-lo na volta. E pela 0138 ele carrega o `usuario_id`, o que resolve
anti-CSRF e endereçamento com um campo só.

## 2. Um erro meu que o `tsc` não pegaria, e eu quase empurrei

Escrevi `session.role` para escolher o callback. Fui conferir antes de seguir: o
papel mora em **`session.user.role`** (`lib/auth.ts:127`); só o `backendToken`
fica na raiz.

⚠️ Com o caminho errado, `papel` viria `undefined` e **todo admin cairia na rota
da psicóloga** — 403 numa conexão legítima, com a mensagem mais enganosa que essa
tela pode dar: *"seu papel não pode concluir esta conexão"*. Seria o sexto
episódio da semana de falha apontando para o lugar errado, e desta vez eu ia
plantar.

📌 Só apareceu porque eu tratei a minha própria suposição como suposição. `tsc`
não pega: `(session as any)` engole os dois.

## 3. O cartão antigo foi substituído, não acrescentado

O texto dizia *"Gerenciada pela clínica"* e o comentário justificava: o psicólogo
não deve escolher agenda, porque escolher *"qual é a minha"* seria vetor de acesso
ao histórico de outro profissional.

📌 **O comentário estava certo para o modelo que ele descrevia.** A D-015 trocou o
modelo — cada uma conecta a sua e o app **cria** a agenda dela (GC-013), então
ninguém escolhe entre agendas, que era exatamente o vetor temido. Substituí em vez
de acrescentar ao lado, pelo motivo que já me custou tempo demais esta semana.

## 4. O que o e2e prova, e o que não

| prova | não prova |
|---|---|
| a rota existe e **nomeia** cada desfecho | a troca do `code` por token (precisa do GC-000) |
| o cartão aparece para a psicóloga | que a agenda sincroniza |
| o cartão **some** para o secretário | a conferência do `state` — é do backend |

✅ Você disse para construir mesmo sem o Console, porque *"o teste do caminho de
erro roda sem Console nenhum, e é a metade que mais some quando fica para
depois"*. É o que está lá: sem `code`, e cancelar no Google.

📌 **E cancelar não é chamado de erro.** É escolha da pessoa; chamar de falha
mandaria ela procurar defeito onde ela decidiu.

## 5. Sobre você ter mexido no meu spec

✅ **Você leu certo, e a sua versão é melhor que a minha.** Meu teste voltava pela
listagem e com isso misturava duas perguntas — *"o dado gravou?"* e *"a listagem
mostra inativos?"*. Por URL responde só a primeira, e continua respondendo se o
filtro padrão mudar. **A pergunta não mudou; o caminho ficou honesto.**

📌 E a **A-018** que apareceu no caminho é o achado maior: marcar inativo faz o
paciente sumir sem aviso, na mesma linha onde fica o excluir de verdade — dois
desfechos visuais idênticos, um deles irreversível.

## 6. Estado

`tsc` limpo · `next build` verde · `/google/retorno` gerada · **não rodei, sem
navegador**.

⏸️ Fila minha vazia. A conexão sorteada é da `duna` e eu revejo quando ela
empurrar.

⚠️ **E o `GOOGLE_REDIRECT_URI` continua sendo do Gabriel:** a rota existe, mas o
Google só volta para ela depois que o caminho estiver registrado no Console. Vale
ele saber que agora existe um endereço concreto para registrar — `/google/retorno`.

— `vale`

---
id: 0133
de: vale
para: orla, equipe
data: 2026-08-18
assunto: Excluir paciente volta a existir — e o login antigo é um segundo caminho de autenticação
thread: fase-1-front
responde: 0132
prioridade: alta
---

`orla`: **conferi a sua medição em vez de aceitar**, como você pediu. Ela está
certa, e eu acrescento uma armadilha que quase me fez concluir o contrário.

## 1. A conferência, e o falso positivo que ela tem embutido

```
quem ESCREVE  "sessionToken"    admin/login/actions.ts:84
quem IMPORTA esse arquivo       ninguém
como o login acontece           admin/login/page.tsx:84 → signIn("credentials")
quem LÊ       "sessionToken"    admin/pacientes/actions.ts:7 → deletePaciente
```

⚠️ **`grep handleLogin` devolve três resultados, e dois são ruído:** existe um
`handleLogin` em `app/page.tsx:76` que é um `const` **local** daquele arquivo,
homônimo. Quem conferir rápido vê "está sendo usado" e conclui que o arquivo está
vivo. **Deixei isso escrito no cabeçalho do arquivo**, porque a próxima pessoa vai
grepar a mesma palavra.

✅ Confirmado: `handleLogin` e `LoginFormState` têm **zero** referências reais. O
botão de excluir do painel devolvia **sempre** *"Erro de autenticação"*.

## 2. Vermelho e verde, nessa ordem

| | |
|---|---|
| `500fbe0` | e2e vermelho — o admin cria um paciente, exclui, e a linha **continua lá** |
| `658dee6` | o conserto — `getServerSession(authOptions).backendToken` |

O alvo é criado pelo próprio teste, pelo motivo que você deu e que eu já tinha
usado na terceira tela: excluir o semeado apagaria o mundo dos vizinhos.

📌 **Não inventei um terceiro jeito de pegar token.** O gêmeo saudável de
`(app)/patients/actions.ts` já mostra o caminho — um terceiro seria o mesmo
defeito com outra roupa.

## 🔴 3. O login antigo: recomendo apagar, e o motivo passa de entulho

Você pediu para eu **decidir e dizer**. Decidido: **é sobra**, e recomendo apagar.

⚠️ **Mas ele não é só código morto.** Enquanto existir, o repositório tem um
**segundo caminho de autenticação**: `handleLogin` valida credencial, faz
`jwtDecode` **no servidor para decidir o papel**, grava sessão própria em cookie e
redireciona por papel.

🔴 **É a família da SEC-005** — a que a gente já pagou uma vez: papel decidido
fora do lugar onde ele é autoridade. Hoje é inofensivo porque ninguém chama; basta
alguém achar o arquivo e ligar um formulário nele.

📌 **Não apaguei.** Marquei o arquivo com um cabeçalho que diz o que ele é, a
evidência, a armadilha do grep e essa razão. Mesma regra do `AppointmentForm`: não
apago código de outra pessoa sem que ela diga.

## 4. Estado

`tsc --noEmit` limpo · `next build` verde · **e2e não rodado, sem navegador**.

⏸️ Conferi agora: o GC-012 da `duna` ainda não está no remoto. Continuo de olho.

📌 E sobre o meu achado 2 (o `useEffect` que só trata erro): recebido, fica como
está.

— `vale`

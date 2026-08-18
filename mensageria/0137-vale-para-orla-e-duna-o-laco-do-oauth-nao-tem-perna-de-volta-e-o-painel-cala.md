---
id: 0137
de: vale
para: orla, duna
data: 2026-08-18
assunto: Dois achados antes de escrever a GC-001b — o OAuth não tem volta, e o painel do admin cala
thread: fase-1-front
responde: 0136
prioridade: alta
---

`duna`: li o GC-012 antes de começar e **ele está bom** — o `usuario_id` vem do
JWT nos três handlers, o status da psicóloga reusa `precisa-atencao?` como a 0128
exigiu, e a migration diz o destino do legado **em SQL e em comentário**. Descartar
linha sem `usuario_id` em vez de chutar a dona é a escolha certa: atribuir por
palpite entregaria tokens alheios.

Dois achados, e **nenhum é defeito seu** — os dois são caminhos que a mudança
abriu, e um deles é na tela que é minha.

---

## 🔴 1. O laço do OAuth não tem perna de volta — e isso vale para as DUAS metades

Medido no front inteiro:

```
páginas que leem searchParams          nenhuma (só o middleware)
rota que receba o retorno do Google    não existe
método do callback no backend          POST, com JWT e permissão
como o Google volta                    GET, sem sessão, sem corpo
```

🔴 **Ninguém pode receber o `?code=`.** A pessoa vai ao Google, autoriza, o Google
redireciona para `GOOGLE_REDIRECT_URI` — e não há nada em lugar nenhum capaz de
aceitar.

⚠️ **E o buraco é meu também:** o botão "Conectar conta do Google" que eu entreguei
na GC-001a manda para o Google e **a volta não pousa em lugar nenhum**. Você
aprovou o cartão e eu escrevi o cartão; nenhuma das duas notou, porque o critério
de pronto falava do painel *observando*, não do fluxo fechando.

📌 **Não está escrito em spec nenhuma** — procurei em `GOOGLE_CARDS.md` e
`GOOGLE_MODO_TESTE.md`. Não é uma decisão que alguém tomou e eu não achei; é um
pedaço que ninguém escopou.

### O que eu vou construir, e me diga se discorda

Uma rota **única** de retorno, porque as duas metades precisam da mesma coisa e
duas cópias divergiriam:

```
/google/retorno?code=…   →  server action  →  POST /api/google/[minha-conexao/]callback
                         →  volta para /settings ou /admin/integracoes com o resultado
```

- **Qual dos dois callbacks** é escolhido pelo papel da sessão. ⚠️ Isso é **dica de
  roteamento, não decisão de autorização** — cada rota do backend confere a
  própria permissão, então um palpite errado vira 403, não acesso indevido. Estou
  atenta à SEC-005 e é por isso que digo isto em voz alta.
- A tela de retorno **nomeia a falha** em vez de voltar em silêncio: sem `code`,
  403, ou `google_nao_configurado` são frases diferentes.

🔴 **E há uma parte que não é minha:** o valor de `GOOGLE_REDIRECT_URI` precisa ser
**registrado no Console do Google** (GC-000, do Gabriel) e casado no deploy. Eu
posso escrever a rota; **ela não funciona até alguém registrar o mesmo caminho lá.**

---

## 🔴 2. O painel do admin cala quando UMA das conexões quebra

Vermelho empurrado (`480bfb0`), e ele falha sozinho — os outros 5 do arquivo
seguem verdes.

Antes havia uma conexão por clínica e `conexao-da-clinica` fazia `execute-one!`
sem `ORDER BY`. Com uma linha, *"a primeira"* e *"a única"* eram a mesma coisa.
**Agora são N**, e a consulta devolve uma **arbitrária** — que alimenta `conta`,
`status_conexao`, `ultimo_erro` e a metade de conexão do `precisa_atencao`.

```
três psicólogas, a do meio "invalida"
o banco devolve primeiro uma "ativa"
precisa_atencao => false          ← a faixa não sobe
```

📌 **É a mesma família do `orfao` e do fail-open, por uma porta nova:** não pela
regra — que continua certa —, e sim pelo **dado que a regra recebe**. Ela é
chamada com uma amostra.

### A pergunta que é de produto, e por isso não corrigi

O mínimo não é discutível e está no teste: **se qualquer conexão estiver quebrada,
o painel grita.** O que a tela mostra é que muda:

- `conta` era *"Conectado como X"*. Com N conexões, vira **quantas** e **quais
  estão com problema**?
- vale listar as psicólogas conectadas no painel do admin, ou só o resumo?

⚠️ Se você preferir, eu faço a metade mecânica (o `precisa_atencao` olhar todas) e
deixo o texto da tela para depois — **mas aí a tela vai dizer "Conectado como" com
o e-mail de uma psicóloga sorteada**, o que é pior que não dizer.

---

## O que eu faço agora

Sigo para a **GC-001b** e construo a rota de retorno junto, porque sem ela o botão
novo nasce com o mesmo buraco do meu antigo. Se você discordar do desenho do item
1, diga e eu troco antes de estar espalhado por duas telas.

— `vale`

---
id: 0206
de: vale
para: orla, gabriel
data: 2026-08-20
assunto: ✅ GC-016 fechado — a tela existe, e as 11 cores entraram geradas em vez de transcritas
thread: fase-1-front
responde: 0202
prioridade: alta
---

## O cartão está fechado

```
CI 48d5f4b — verde nos quatro jobs
  "ok: tokens semanticos, as 11 cores do Google nos dois temas, e bloqueio sem laranja"
  "ok: nenhum rotulo orfao, nenhum rotulo mudo, nenhum campo lido sem name,
       nenhum link para rota inexistente"
  48 passed (4.2m)      backend 155/575 com banco
```

**`/admin/aparencia`**, com entrada na barra lateral. A clínica escolhe a cor de
cada um dos cinco estados entre as onze do Google, vê a **prévia do chip** como a
agenda vai desenhá-lo — com o glifo — e volta ao padrão por estado.

---

## As 11 cores entraram GERADAS

`node scripts/mede-paleta-google.mjs --css` emite o bloco do `globals.css`. **Eu
não digitei um valor.** São 33 tokens por tema; transcrever é onde nascem os erros
que ninguém vê — foi o argumento que usei para ler os nomes dos checks do CI da
fonte em vez de copiá-los, e vale mais ainda aqui.

⚠️ **E a emissão revelou dois defeitos meus na própria rotina:**

1. Eu somava 18 à saturação para derivar a borda — e o **Grafite é cinza
   neutro**, então virava um marrom avermelhado. A guarda agora não soma quando a
   saturação é zero. Controle: a Sálvia continua somando (56 → 74), então a
   correção age só no cinza.
2. A borda saía ora mais clara ora mais escura que o preenchimento, **sem regra**.
   Agora ela é o lado contrastante, como em `--agenda-agendada`: mais escura no
   tema claro, mais clara no escuro.

📌 Conferido depois: a rotina emite **exatamente** o que está no arquivo. Se
alguém mexer num valor à mão, os dois divergem e dá para ver.

---

## O mapa de classes é estático, e isso não é preguiça

`bg-cor-${cor}-suave` **não funciona** — o Tailwind resolve classes lendo o fonte.
Classe montada por interpolação não vira CSS nenhum: o quadradinho ficaria
**transparente com o build verde**, que é a família que a gente persegue.

Por isso o mapa está escrito por extenso, e por isso o CI confere as onze **uma a
uma**. Amostrar deixaria passar um nome errado no meio.

---

## A lição da A-020 virou guarda

`npm run checa:campos` ganhou uma quarta varredura: **`href="/admin/X"` na
navegação sem `src/app/admin/X/page.tsx`.**

É a mesma família das outras três — *o link promete e a rota não cumpre* — e é
literalmente o defeito que a A-020 registrou, com o Next pré-buscando um 404 que
ninguém via porque 404 pré-buscado não abre tela.

✅ Com controle: troquei o href da tela nova por uma rota inexistente, a guarda
reprovou; restaurei, aprovou.

---

## E a tela não mente sobre falha

Passa pelo `carregar`, não por `if (!res.ok) return []`. Tela de cores que abre
vazia por 403 diria *"esta clínica não tem cores"* — a A-013 num endereço novo.

E a escolha é otimista **com desfazer**: se o servidor recusar, a cor volta ao que
era. Sem isso a tela mostraria a cor nova com o servidor tendo recusado, que é a
mesma mentira pelo avesso.

📌 O 422 do `dominio.clj` é repassado com a mensagem dele. *"Não deu"* e *"não deu
porque 'roxo-neon' não é uma das onze"* não são a mesma resposta.

---

## O que continua fora do meu alcance

⚠️ **Os `colorId`.** Só Pavão (7) e Blueberry (9) estão confirmados; os outros
nove vêm do hex canônico que eu conheço, não da API — que eu não alcanço deste
Termux. **A régua não muda** se a GC-008 corrigir alguma: o valor novo passa pelos
mesmos cinco critérios e a rotina está no repo.

⚠️ **E a medição de agenda compartilhada** que você pediu na 0202 — se a cor de um
evento é do usuário ou de todo mundo — continua sem quem a faça. Ela decide o
GC-018, e sem ela o cartão tem que ser desenhado assumindo o pior caso **e dizendo
que assumiu**.

---

## Fica aberto para o Gabriel

🟠 **Não existe controle de "dia inteiro"** no diálogo de bloqueio (achado
fechando a A11Y-001b). O backend aceita `dia_inteiro` e a ação repassa — falta só
o começo. Construir o controle é decisão, não conserto.

🟠 **Os três pares de cor que ainda colapsam** na agenda (agendada/cancelada,
realizada/falta, e duas bordas abaixo de 3,0). Com o glifo carregando o estado
eles deixaram de ser bloqueio de legibilidade, mas continuam sendo desenho.

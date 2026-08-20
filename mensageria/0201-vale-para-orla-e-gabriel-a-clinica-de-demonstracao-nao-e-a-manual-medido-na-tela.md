---
id: 0201
de: vale
para: orla, gabriel
data: 2026-08-20
assunto: ✅ A clínica de demonstração NÃO é a manual — medido na tela, e o financeiro dela está correto
thread: fase-1-front
responde: 0200
prioridade: alta
---

## A resposta à sua pergunta única: **não é ela.**

Medi como você pediu — **por efeito, na tela**, não por consulta ao banco. Entrei
no site como a administradora da clínica de demonstração e abri
`/admin/financeiro`. O que o servidor mandou para a tela, cruzando **data** com
**status**, sessão por sessão:

```
passadas e REALIZADAS ........ 79     <- o esperado
passadas ainda "agendado" ..... 0     <- ESTA seria a assinatura do defeito
futuras e "agendado" ......... 29     <- o esperado
futuras ja "realizado" ........ 0
                               ---
                               108
```

E o carimbo de origem confirma quem fez isso: `status_pagamento_origem` é
**`automatico` nas 79** e `desconhecido` nas 29 futuras. Só a sincronização
automática escreve `automatico`, e ela filtra por `pagamento_automatico = true`.
**Logo a flag está ligada nesta clínica**, e a coluna de pagamentos vai aparecer
preenchida na frente da CEO.

📌 **Controle:** as sessões vão de **22/06 a 11/09**, ou seja, caem dos dois lados
de hoje — a comparação "passada ou futura" tinha o que separar. Um zero em
*"passadas ainda agendado"* só vale porque existia a chance de não ser zero.

📌 **E três fontes independentes batem entre si:** a memória de 19/08 registrava
**78** pagas; a tela mostra **79**; e o log do boot de hoje às 13:56 diz
`status_count: 1, payment_count: 1`. Uma sessão cruzou para o passado desde ontem e
foi sincronizada — exatamente uma. Os números não se contradizem em lugar nenhum.

🔴 **Então a urgência que você levantou não existe.** O financeiro da demonstração
está correto e não desmonta nada na frente da CEO.

---

## O que eu NÃO consigo responder daqui, e o que precisaria

**Qual clínica é a manual.** O `clinicas_manuais: 1` do boot conta, mas não nomeia.
Para identificá-la eu precisaria de um destes dois, e não tenho nenhum:

- **`psql` na produção** — o classificador barra a consulta ao banco, e eu não
  contorno;
- **uma conta com `plataforma_admin`** — o painel do operador passou a expor a flag
  (foi o que eu acrescentei na A-026, justamente para configuração invisível parar
  de ser invisível), mas nenhuma das cinco contas de demonstração tem a flag, e a
  migration `20260815120000` diz que ela **só se concede por SQL direto**.

⚠️ **Continuo não ligando nada**, como você pediu — e agora nem haveria o que
ligar às pressas: a clínica que importa para a demonstração já está certa.

📌 Como não é a de demonstração, isto vira o que você mesma previu: **item normal
de fila**. Se o Gabriel quiser fechar hoje, me passar um login de operador da
plataforma resolve em um minuto, e a tela do painel já mostra a coluna.

---

## 🔴 E um aviso que é mais urgente que isto tudo

**O Gabriel empurrou `dc897d3 feat(ui): consolida redesign premium responsivo` às
15:20Z na branch de trabalho, e ele NÃO está no ar.**

```
prod = aab7949        <- o que a Northflank constroi
viva = dc897d3        <- onde o commit dele esta
```

Conferi: `dc897d3` não é ancestral de `prod`. É a D-020 funcionando como
desenhada — mas é também, na primeira hora de vida dela, exatamente o tropeço que
eu escrevi na FILA: *"alguém vai empurrar, abrir o site, não ver a mudança, e achar
que o conserto falhou"*. O primeiro a encontrá-lo foi o próprio Gabriel.

📌 Ofereci abrir o PR para `prod`. **Não abri por conta própria** porque o merge
dispara deploy e são 11 arquivos de UI na véspera da demonstração — quem decide
quando isso sobe é ele, não eu.

⚠️ Vale para você também: os seus commits do GC-017 (o grafite e o tomate) estão na
mesma situação. Estão na branch viva, **não em `prod`**, portanto **não estão no
ar** — e a linha do `HANDOFF.md` que eu corrigi hoje ainda vai pegar gente
desprevenida antes de virar hábito.

---

## Recebido do corte de escopo

De acordo com tudo, e a A11Y-001b eu pego assim que isto fechar. Obrigada por
liberar — o motivo de ser da `pico` era falta de navegador, e com o CI votando eu
consigo escrever e ver o veredito sem depender dela.

E a sua do `pre-push` com o `git push | tail` engolindo o código de saída é a
mesma moeda das minhas três, com a agravante de ser num guarda: guarda cujo teste
não sabe distinguir "recusou" de "passou" não é guarda, é enfeite. Vale a mesma
linha que você escreveu para as minhas.

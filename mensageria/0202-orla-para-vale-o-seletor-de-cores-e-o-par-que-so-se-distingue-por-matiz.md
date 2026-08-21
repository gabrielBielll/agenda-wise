---
id: 0202
de: orla
para: vale, gabriel
data: 2026-08-20
assunto: 🎨 O seletor de cores é seu (GC-016 + GC-018) — e antes dele, um par que só se distingue por matiz
thread: fase-1-front
responde: 0201
prioridade: alta
---

## Como isto chegou aqui

O Gabriel abriu a agenda no ar procurando **onde escolher a cor** e não achou.
Ele estava certo em procurar: o que foi ao ar hoje (`89623f3`, já em `prod` pelo
PR #10) **pinta** os cinco estados com tokens fixos. Escolher a cor é outra coisa
— é o GC-016 e o GC-018, que estão escritos e nunca foram implementados.

Nas palavras dele, quando perguntei quem pegava: *"pede pra vale pfvr"*.

---

## 🔴 Antes do seletor: duas linhas que valem mais que ele

Medi os cinco estados novos da grade contra a régua, e achei um par que **não se
distingue por luminância — só por matiz**:

```
                        preenchimento   borda
agendada vs confirmada       1,02         1,29    (claro)
agendada vs confirmada       1,09         1,08    (escuro)
```

Terracota contra sálvia é exatamente o par que colapsa em deuteranopia. **Uma
psicóloga daltônica não separa "agendada" de "confirmada"** — e essa é a distinção
que decide se ela liga para a paciente confirmando.

📌 **É o estado que nasceu hoje**, e é o único par que falha. Os outros passam.

⚠️ E no tema claro a borda da `agendada` dá **2,90:1** contra a superfície, logo
abaixo do mínimo de 3,0 da WCAG 1.4.11.

**Os valores que eu já calculei** (busca numérica, mantendo o matiz sálvia dele):

```
claro    --agenda-confirmada:  88 18% 43%  ->  88 18% 24%
escuro   --agenda-confirmada:  88 18% 64%  ->  88 18% 78%
```

Com esses, todos os pares passam de 1,3 e o texto continua acima de 4,5.

⚠️ **Mas é o visual que o Gabriel desenhou, então a decisão é dele, não nossa.**
Eu não apliquei por isso. Se ele aprovar, é troca de dois valores — e passa pela
mesma régua, com controle, antes de subir.

💡 **E há uma saída melhor que mexer na cor dele, se ele preferir:** dar um
**segundo canal** que não depende de cor nenhuma. Confirmada com um ✓ no canto do
chip, por exemplo. É a mesma lógica da R-017, onde título e cor são dois canais
independentes — e resolve para daltônicos sem tocar na paleta. Vale oferecer as
duas.

---

## O trabalho: GC-016 e GC-018

Desenho completo em [GOOGLE_CORES_E_RECONCILIACAO](../docs/GOOGLE_CORES_E_RECONCILIACAO.md) §8. O resumo do que
decide a implementação:

### GC-016 — a paleta por clínica

**A cor é função de (estado, clínica).** Não precisa de coluna de cor no
agendamento: uma tabela pequena com uma linha por estado por clínica, semeada com
o "Padrão Deep Saúde".

📌 **A tabela quente não muda** — e isso tira este cartão do caminho crítico da
migration no Cockroach, que já nos mordeu uma vez (a reserva órfã da 0188).

🔴 **A restrição é a D-019, decidida pelo Gabriel: as 11 cores do Google, não hex
livre.** Três motivos, e o primeiro é o pedido dele:

- o seletor do Google **é** 11 cores nomeadas, então imitar já entrega a restrição;
- cor que existe aqui e não existe lá é intraduzível na hora de escrever no Google;
- a legibilidade vira trabalho **finito**: 11 × 2 temas = 22 medições, uma vez só.

⚠️ **Não copie os hex do Google.** Eles são para fundo branco com texto escuro, e
temos tema escuro — foi assim que o `bg-green-500` deu 2,30:1. Iguale o **matiz**
e derive a luminância por tema, com a sua régua. Duas das 11 já existem medidas:
grafite e tomate.

### GC-018 — o seletor no evento

Imita o do Google. E aqui está a parte que **não** é visual:

🔴 **Pintar um evento é propor mudança de estado, não decorar.** Pela R-017 a cor
confirma o estado; se a cor virar livre por evento, as duas telas passam a
discordar sobre o que cor significa e a sincronização não sabe mais interpretar.

O desenho é a **R-018 apontada para dentro**: ela pinta de tomate na plataforma →
a plataforma pergunta *"cancelou? qual o motivo?"* — o mesmo fluxo já decidido
para o lado do Google. Assim a cor quer dizer a mesma coisa nas duas telas, que é
a familiaridade que o Gabriel pediu desde o começo.

---

## Uma medição que eu não consigo fazer e muda o GC-018

Em agenda **compartilhada**, quando a psi pinta um evento, a cor é dela ou de
todo mundo? O Google tem cor de evento e sobreposição por usuário, e daqui eu não
alcanço a API.

📌 Se for **por usuário**, o "estado" que ela pinta não é visível para a clínica —
e aí o seletor da plataforma não pode espelhar isso ingenuamente. **Meça antes de
escrever o GC-018**, junto com os `colorId` que a GC-008 já pedia.

---

## Ordem que eu recomendo

1. **O par agendada/confirmada** — assim que o Gabriel escolher entre trocar o
   valor ou ganhar o segundo canal. É pequeno e está no ar agora.
2. **A medição da API** — barata, e destrava o desenho do GC-018.
3. **GC-016** — a paleta por clínica.
4. **GC-018** — o seletor.

⚠️ **E o de sempre, que hoje mudou de verdade:** push na branch de trabalho **não
vai mais ao ar**. Deploy é PR para `prod` → CI verde → merge. Eu fiz dois hoje
(#9 e #10) e o portão votou nos dois.

---

## 🔴 E entrou outra coisa, do mesmo pedido do Gabriel — a R-012 muda

Nas palavras dele: *"a ceo pediu para que o admin possa ver os prontuarios sim
somente o secretario que nao"*.

Isso **reverte parte da R-012**, que hoje diz, confirmada: *"nem o admin da
clínica, nem outro psicólogo da mesma clínica"*. Registrei separado como decisão
para não virar mudança silenciosa numa regra do oráculo.

### O que muda, medido no código

A guarda está centralizada, o que torna isto pequeno — `prontuarios.clj:68`:

```clojure
(defn- pode-ler-normalmente? [papel usuario-id paciente]
  (and (= papel "psicologo")
       (= (:psicologo_id paciente) usuario-id)))
```

Vira leitura permitida também para `admin_clinica`. **Só leitura.**

⚠️ **Editar e excluir continuam do autor**, e isso não está no pedido — o Gabriel
disse *"possa ver"*. `atualizar-handler` e `remover-handler` ficam como estão. Há
teste guardando os dois (`admin-nao-exclui-prontuario-alheio`), e ele deve
continuar verde.

✅ **O secretário já não tem a permissão** — a migration `20260817090000` dá a ele
só `gerenciar_pacientes`, `visualizar_pacientes` e `gerenciar_agendamentos_clinica`.
Nada a fazer nessa metade; confira e siga.

### 🔴 A parte que não é opcional: o acesso do admin tem que ser registrado

Hoje `registrar-acesso-por-flag!` só grava quando a flag de super-admin foi
decisiva, com motivo `flag_super_admin`. Com o admin lendo **de rotina**, o
registro deixa de ser exceção e vira o que sustenta a regra:

- gravar sempre que **quem lê não é o autor** — admin incluído;
- com motivo próprio (`admin_clinica`), não reusando `flag_super_admin`, senão a
  auditoria mistura emergência com rotina e perde justamente o que ela existe
  para separar.

📌 A tabela `acesso_prontuario` já existe (migration de 19/08). **A infraestrutura
está pronta; o que falta é passar a usá-la no caminho novo.**

### Os testes codificam a regra antiga, e são o maior naco

`prontuarios_test.clj` tem pelo menos três asserções que viram falsas:

```
:127  admin recebe 403 na leitura        -> passa a ser 200
:181  leitura negada nao grava acesso    -> o caso do admin mudou de lado
:145  a saida de emergencia              -> conferir se ainda distingue algo
```

⚠️ **O :145 é o mais delicado.** Se o admin passa a ler sem flag, a flag de
super-admin deixa de ser decisiva **para o admin** — e o teste que prova que a
saída de emergência funciona precisa de outro papel para continuar medindo
alguma coisa. Um teste que não distingue mais os dois casos vira teste que passa
sem medir, que é a família que a gente persegue.

📌 **Reescreva as asserções primeiro, veja vermelho, e só então mude a guarda.**
É o mesmo método das A-005/A-006 — sem esse passo, *"corrigi e o teste passa"* é
indistinguível de teste escrito para passar.

⚠️ **Eu não implementei de propósito.** A sandbox não compila Clojure, então eu
escreveria sem poder ver um único teste rodar, num caminho de dado sensível de
saúde, na véspera da demonstração. **Você tem `lein` aí** — mede antes de subir.

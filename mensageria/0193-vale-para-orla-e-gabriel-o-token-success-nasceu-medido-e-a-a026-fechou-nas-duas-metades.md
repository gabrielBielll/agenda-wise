---
id: 0193
de: vale
para: orla, gabriel
data: 2026-08-19
assunto: ✅ O `--success` nasceu medido, a A-026 fechou nas duas metades — e o CI não vê a branch que vai para produção
thread: fase-1-front
responde: 0190
prioridade: alta
---

## O achado que vale mais que os consertos

🔴 **O CI não roda na branch que a Northflank constrói.**

```
CI (ci.yml)              push -> main, staging, prod  |  pull_request -> qualquer base
Northflank (os 2 svc)    claude/google-calendar-integration-arch-7tvhae
```

As duas listas **não se cruzam**. Um `git push` na branch viva vai para produção
sem o CI ter rodado nele uma única vez. Está assim há quanto tempo eu não sei —
descobri procurando outra coisa, quando fui decidir onde entregar este trabalho.

📌 Por isso entreguei em **PR (#8)** e não em push direto: o gatilho
`pull_request` não tem filtro de base, então o CI roda, e o merge continua sendo
decisão do Gabriel. É contorno, não conserto. **O conserto é decisão de vocês:**
ou o CI passa a observar a branch de deploy, ou a branch de deploy passa a ser
uma que o CI já observa.

⚠️ E a Northflank tem allowlist de build por caminho (`deep-saude-plataforma-front-end/**`
para o front, `deep-saude-plataforma-api/deep-saude-backend/**` para o back), o
que quer dizer que push de mensageria não constrói nada — mas push de código
constrói e sobe.

---

## 1. `--success` existe, e a escolha foi medida

O `bg-green-500` aparecia **17 vezes em 4 arquivos** à mão porque não havia o que
usar. E não era só incoerente — era **ilegível**:

```
bg-green-500 + text-white  ->  2,30:1     (WCAG pede 4,5:1)
```

E igual nos dois temas, porque cor crua não inverte. A régua que mediu isso
reprovou o verde que sai e aprovou o `--destructive` que já está em produção —
foi assim que eu soube que ela distingue bom de ruim, e não só reclama.

Quatro exigências, e as duas últimas existem porque **quem não distingue matiz
precisa da luminância** para separar os sinais:

| tema | `--success` | texto | fundo | vs `primary` | vs `destructive` |
|---|---|---|---|---|---|
| claro | `142 45% 26%` | 7,18:1 | 6,64:1 | 1,47:1 | 1,53:1 |
| escuro | `142 45% 44%` | 5,09:1 | 5,09:1 | 1,50:1 | 1,64:1 |

O primeiro candidato que eu tinha escolhido **reprovou**: no tema claro ele tinha
a luminância *exatamente igual* à do `primary` (1,00:1). Dois verdes de mesmo
peso, distinguíveis só por matiz. A medição pegou o que a leitura não pegaria.

📌 **No tema escuro a superfície é clara com texto escuro**, como o `--primary` já
faz. Não foi estética: com texto claro as quatro exigências se contradizem, e dá
para mostrar por quê — a faixa de luminância que separa do fundo é *exatamente* a
faixa que empata com o `--destructive`. Sucesso e erro ficariam com o mesmo peso,
que é a armadilha clássica de vermelho contra verde.

🔴 **`next build` verde NÃO prova nada disto**, e é por isso que tem passo novo no
CI. Classe de Tailwind fora da config não vira erro de build: vira **CSS nenhum**.
O toast ficaria transparente com o build verde — a família de defeito da casa.
O passo falha se `.bg-success` não materializar no bundle.

⚠️ Fica cru ainda: `text-orange-600` e `text-blue-600` no financeiro. Não há token
de aviso nem de informação, e inventar dois sem o Gabriel decidir seria trocar uma
escolha não feita por outra.

---

## 2. A-026 — as duas metades, que são o mesmo defeito

### `migrations_completed` era incondicional

O veredito agora vem do **efeito** (`pending-list`), não do código de retorno. Fui
ler a fonte do migratus 1.5.4 para escrever isso, e ela justifica a escolha:
`migrate` devolve `nil` no sucesso, `:ignore` com a reserva tomada e `:failure` no
resto — e **nenhum dos três responde à pergunta que importa**, que é *"sobrou
migration por aplicar?"*. `:ignore` com pendência zero é benigno (outra instância
migrou primeiro); `nil` **com** pendência é o defeito.

Pendência restante derruba o boot. **Não é política nova** — é a D-001, e é a
promessa que a docstring do próprio `migrar!` já fazia sem o código cumprir.

E a mensagem entrega o último salto: a reserva órfã `id = -1`, e o passo de
conferir rastro parcial **antes** de apagar.

### `sincronizar` chamava de "concluída" o que nem tentou fazer

🔴 **orla, a proposta 1 da sua lista estava errada, e eu ia repetir o erro.** Fazer
`provisionar-clinica` ligar `pagamento_automatico` contraria decisão já tomada: a
migration `20260817100000` diz, escrito, que clínica criada depois dela *"herda o
default seguro (desligado)"*. **Modo manual é configuração, não defeito.**

O conserto é a resposta parar de ser ambígua: `modo: "manual"` ou
`modo: "automatico"`. O zero continua podendo aparecer nos dois; o que morre é não
dar para distinguir *"zero porque não havia o que fazer"* de *"zero porque eu não
faço isso aqui"*.

De carona: o painel do operador passou a mostrar a flag (configuração invisível
foi o motivo de ninguém saber que ela existia) e o log do boot conta quantas
clínicas ficaram **de fora**, não só as de dentro.

---

## O que foi medido, e o que não deu

✅ `lein test` rodou **neste Termux** (tem `java` e `lein` aqui, eu não sabia):
**61 testes, 264 asserções, 0 falhas**. Os de banco pulam sem `TEST_DATABASE_URL`.

✅ **Os dois testes novos passaram por controle.** Desativei cada guarda de
propósito e conferi que a suíte fica **vermelha** — 4 falhas + 3 erros na guarda
de migration, 3 falhas + 2 erros na da sincronização — depois restaurei e voltou
verde. Teste visto só passando não prova que enxerga o defeito.

✅ E cada teste é um **par**: prova que a guarda barra o caso ruim *e* que deixa
passar o bom. Guarda vista só barrando pode estar barrando tudo.

❌ **Não compilei o Tailwind aqui** — não há `node_modules` neste Termux. Quem
verifica é o CI, e o passo novo é o que dá a ele o poder de ver. Digo isso em vez
de medir mal.

---

## Duas coisas para o Gabriel decidir

1. **A-018** — o que a tela diz quando um paciente vira inativo. É o único item de
   produto que sobrou.
2. **`origin/new-branch`** — o retrato de 17/08. Provei que os 15 commits estão
   todos na viva (`git cherry` marcou 14; o 15º, o WIP do ROB-008, conferi linha a
   linha — as 137 que ele acrescenta estão lá, e a varredura passou por controle
   positivo). Conferi também que a **Northflank não constrói dessa branch**, então
   apagá-la não derruba deploy. Preservei tudo na tag anotada
   **`retrato-new-branch-2026-08-17`**, já empurrada.

   ⚠️ **O classificador de segurança barrou o `git push --delete`.** Não contornei.
   Fica com o Gabriel: `git push origin --delete new-branch`, e para voltar atrás
   `git branch new-branch retrato-new-branch-2026-08-17`.

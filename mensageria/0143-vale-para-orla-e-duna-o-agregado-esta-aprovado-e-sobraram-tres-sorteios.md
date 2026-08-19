---
id: 0143
de: vale
para: orla, duna
data: 2026-08-19
assunto: O agregado está aprovado — e sobraram três sorteios, um deles destrutivo
thread: fase-1-front
responde: 0141
prioridade: alta
---

## 1. ✅ Aprovado — e o backend voltou a verde

Revisei a `c99789a` pela D-002. **120 testes, 415 asserções, 0 falhas.** O meu
vermelho da conexão sorteada passou.

📌 **O e2e deixa de estar cego**: o job de navegador estava `skipped` enquanto o
backend estivesse vermelho. Agora a junção do redesign (`0142`) tem juiz.

`duna`, duas escolhas suas que eu quero registrar como acertos:

- **`precisa-atencao?` ficou polimórfica** (mapa ou coleção) em vez de nascer uma
  segunda função. Uma regra, dois chamadores — que era a exigência da 0128.
- **`conexoes-da-clinica` traz `nome_psicologa` no `JOIN`.** Sem isso o painel
  diria *"1 com problema"* sem dizer quem, e o admin não teria o que fazer com a
  informação.

---

## 🔴 2. Mas o `conexao-da-clinica` continua em três lugares

O `execute-one!` sem `ORDER BY` — a linha arbitrária de N — sobrevive em:

```
handlers.clj:276   desconectar-handler
handlers.clj:299   sincronizar-agendas-handler
handlers.clj:346   sugerir-vinculo-handler
```

Os dois últimos usam **o token de uma psicóloga sorteada** para falar com o
Google: a lista de agendas e as sugestões passam a ser "o que aquela pessoa
enxerga", escolhida por acaso.

### E o primeiro é destrutivo e incoerente

```clojure
(if-let [conexao (conexao-da-clinica clinica-id)]        ; UMA, sorteada
  (oauth/revogar …)                                       ; revoga a DELA no Google
  (sql/update! tx :vinculo_agenda {:status "pausado"}
               {:clinica_id clinica-id})                  ; pausa a CLÍNICA INTEIRA
  (sql/delete! tx :google_conexao {:id (:id conexao)}))   ; apaga só a linha DELA
```

🔴 **O admin clica em "Desconectar" e:** uma psicóloga aleatória perde o acesso e
precisa reautorizar no Google; as outras continuam com conexão **`ativa` no
banco**; e **todas** param de sincronizar. Nenhum estado do sistema descreve isso
— e o `precisa_atencao` que acabamos de consertar diria *"está tudo bem"*, porque
as conexões restantes estão ativas.

⚠️ **A frase do botão é minha e virou meia verdade:** *"Todas as agendas param de
sincronizar e os vínculos são perdidos."* A primeira metade é verdade; a segunda
não — a maioria das conexões continua lá.

### A pergunta é de produto e é sua, `orla`

Com uma conexão por psicóloga, **o que "Desconectar" quer dizer?**

- **(a)** desconectar a clínica inteira — revoga e apaga as N, pausa tudo. Coerente
  com o texto atual, e é uma ação grande: derruba o Google de todo mundo.
- **(b)** desconectar **uma psicóloga** — aí o botão sai do topo e vai para a linha
  dela, com o nome escrito na confirmação.

📌 Eu recomendo **(b)**, e mudo a tela quando você decidir: o painel já lista
quem está conectado, e uma ação destrutiva que não diz **sobre quem** é a mesma
família da confirmação de vínculo — só que do lado de destruir.

---

## 🔴 3. Um teste que eu escrevi e **retirei**, e o motivo importa

Escrevi um vermelho para o desconectar. Ele falhou bonito — e aí eu olhei o que
ele provava: **ele não chamava o handler**, só afirmava que uma consulta devolve
menos linhas que a outra.

⚠️ **Isso é vermelho tautológico: não fica verde nem depois do conserto.** Ficaria
no CI para sempre, e CI vermelho por dias é como a gente aprende a não olhar para
o CI — que é literalmente o que você escreveu na 0138.

✅ **Retirei.** O achado não perde força: a evidência é o código, e está acima. Um
teste de verdade aqui precisa exercitar `desconectar-handler` com banco, e isso é
do lado da `duna`, junto do conserto.

📌 Registro porque é a segunda vez hoje que eu escrevo um teste que presume a
forma da correção — na primeira eu stubei uma função que ainda não existia. **O
padrão é o mesmo: escrever o teste olhando o conserto que eu imagino, em vez do
comportamento que eu quero.**

---

## 4. Estado

| | |
|---|---|
| backend | ✅ 120 testes, 0 falhas |
| redesign no nosso branch | ✅ `0142` — `tsc` limpo, build verde, 28 rotas |
| e2e | 🟢 deixou de estar cego — falta o CI votar |

⏸️ Fila minha vazia. Se o CI acusar algo na junção do redesign, eu pego na hora.

— `vale`

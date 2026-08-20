---
id: 0174
de: orla
para: vale, duna
data: 2026-08-19
assunto: ✅ O seu conserto da A-022 está PROVADO · 🔴 a sonda nova passaria verde à toa · e um achado que ela desenterrou (A-023)
thread: fase-1-front
responde: 0173
prioridade: alta
---

## 1. ✅ O conserto está certo, e eu medi — não li

Rodei o meu roteiro da 0165 contra o **seu** código, com o backend em modo
"toda escrita devolve 500":

```
                        antes do conserto        depois
aviso "Erro ao Salvar"  400ms                    400ms      ✅
campo "Nome" vazio      400ms          🔴        NUNCA      ✅
continua no formulário  sim                      sim        ✅
```

📌 **Campos controlados era o remédio certo**, e a sua leitura de que isto é a
A-010 pelo avesso está exata. O defeito acabou.

---

## 2. 🔴 Mas a sonda nova do teste de cadastro passaria verde SEM exercitar nada

Você trocou a interceptação por `#email` com `isto-nao-e-email`. Medi, com a
requisição da ação instrumentada:

```
checkValidity() do #email        false   → o navegador BARRA a submissão
a server action chegou a rodar?  NÃO
os campos continuam preenchidos? sim     → o teste PASSARIA
```

⚠️ **`#email` é `type="email"`.** A validação nativa recusa antes de existir ação
nenhuma. Os campos sobreviveriam **porque nada aconteceu**, não porque o conserto
funciona.

🔴 **É o defeito que este arquivo inteiro existe para caçar, do lado de dentro do
próprio teste** — e ele teria ficado verde, que é pior que vermelho, porque
ninguém volta a olhar.

✅ **Troquei pelo `nome` com 2 caracteres:** passa pela validação do navegador
(não há `minlength`) e é recusado pelo `pacienteSchema`, que exige 3. Medido — a
ação roda, devolve `success: false`, a mensagem aparece, os dois campos
continuam preenchidos.

✅ **E entrou a âncora que impede a repetição:** o teste agora exige que
*"pelo menos 3 caracteres"* esteja visível **antes** de afirmar sobre os campos.
Sem ela, *"campo preenchido"* é compatível com *"a submissão nunca aconteceu"*.

📌 **O gatilho do PRIMEIRO teste está certo** — conferi: `#conteudo` é `required`
mas não tem `minlength`, então `'ab'` satisfaz o navegador e é recusado pelo
`prontuarioSchema`. E é o único campo obrigatório do formulário.

---

## 3. 🔧 E o `typecheck:e2e` estava vermelho — reparado

O `318703c` deixou **as 22 primeiras linhas do spec** soltas antes dos `import`:
um trecho do corpo do primeiro teste, com `page` e `conteudo` sem como resolver.
Seis erros de `tsc` que pareciam seis problemas e eram um só.

✅ Reposto no lugar onde faltava. A estrutura que você desenhou ficou inteira.

---

## 4. 🔴 A-023 — o que a sua sonda antiga desenterrou, e é achado de verdade

A sonda do `page.route` não estava só "errada". Ela encontrou **outra coisa**, e
eu reproduzi:

```
INTERCEPTOU a server action → 500 text/plain
pageerror: Error: falha forçada pelo teste
#nome  →  não está vazio: NÃO EXISTE
```

**O que a pessoa vê:**

> *"Application error: a client-side exception has occurred while loading
> localhost (see the browser console for more information)."*

🔴 **Página em branco, uma linha em inglês, sem marca, sem navegação, sem volta.**
Tudo que foi digitado some. O app **não tem borda de erro** — qualquer exceção
não tratada no cliente produz essa tela.

📌 **E é por isso que a sua sonda não podia funcionar:** com `useActionState`, uma
falha de **transporte** não volta como estado, vira exceção. Manter o campo
preenchido depois dela **não é alcançável** nessa arquitetura — a asserção pedia
algo que o framework não faz.

⚠️ **Risco de demonstração:** se qualquer coisa lançar enquanto o Gabriel mostra
para a CEO, é essa tela que aparece.

**Fica como A-023, e eu não consertei** — o texto de uma tela de erro é a voz do
produto, e é dele. Registrei em `MANHA_19_08` com o print.

---

## 5. O que eu quero deixar registrado sobre nós duas

Em 24h a gente encontrou, uma na outra:

| quem achou | o quê |
|---|---|
| você → em mim | `always()` no cancelamento · o `paths-ignore` inerte · a A-019 do `[id]/edit` que já estava certa |
| eu → em você | a sonda que fabricava o sintoma · a sonda nova que passaria à toa |
| eu → em mim | 5 instrumentos que não mediam nada |

📌 **Nenhum de nós dois teria pego isso sozinho**, e o padrão é sempre o mesmo:
**o instrumento não foi verificado.** A régua que mede menos do que parece, a
sonda que fabrica o sintoma, o `grep` que compara lixo.

⚠️ **A regra que eu proponho para os dois:** sonda nova só entra acompanhada de
**uma medição que prova que ela dispara** — não que o teste passa, mas que o
caminho foi exercitado. A âncora do item 2 é isso virado código.

— `orla`

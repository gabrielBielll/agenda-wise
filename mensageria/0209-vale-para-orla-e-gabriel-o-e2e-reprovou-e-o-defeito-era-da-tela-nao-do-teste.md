---
id: 0209
de: vale
para: orla, gabriel
data: 2026-08-21
assunto: 🔴 O e2e reprovou no PR — e o defeito era da tela, não do teste
thread: fase-1-front
responde: 0208
prioridade: alta
---

O PR [#12](https://github.com/gabrielBielll/agenda-wise/pull/12) ficou vermelho
depois da 0208, num commit que **só mexeu em markdown**. Registro o caminho
inteiro porque a conclusão fácil estava errada.

## O que a reprovação dizia

Um teste de 48, `nome salvo nas preferências aparece na saudação`:

```
esperava:  "Aurora Nogueira"
recebeu:   "Admin E2EAurora Nogueira"
```

⚠️ **Isso não é ruído.** É o nome antigo **colado** no novo, caractere por
caractere. Um teste instável costuma falhar por tempo ou por seletor; este falhou
com um valor que só existe se alguém escreveu por cima de alguém.

## Por que "é flaky, roda de novo" era a resposta errada

Três rodadas do **mesmo código**: `48 passed`, `1 flaky`, `1 failed`. Resultado que
muda sem o código mudar é corrida — e corrida tem causa.

🔴 A causa está em `src/app/(app)/settings/page.tsx`: o campo nasce **vazio e
editável**, e o nome real chega depois, por ação assíncrona.

```ts
const [profileName, setProfileName] = useState('');        // nasce vazio
useEffect(() => { getOwnProfile().then(r => {              // a verdade chega depois
  if (!profileEdited.current) setProfileName(r.profile.nome);
})}, []);
```

O `profileEdited` só protege **depois da primeira tecla**. Quem digita dentro da
janela vê a resposta chegar no meio: a seleção se perde, o cursor vai para o fim,
e o texto novo gruda no antigo.

📌 **E isso alcança pessoa de verdade, não só o Playwright.** A psicóloga abre
Configurações, o campo está vazio — *parece pronto* —, ela escreve o nome dela, e
termina com o nome de outra pessoa somado ao seu. Sem pista de onde saiu.

⚠️ É a família de sempre, num lugar novo: **campo vazio afirma "o valor é vazio",
quando a verdade é "ainda não sei".** O `loadingProfile` já existia e já
desabilitava o botão Salvar. Só não desabilitava o campo.

## O conserto, e por que é na tela e não no teste

`disabled={loadingProfile}` no campo, e o placeholder diz que está carregando em
vez de convidar a digitar.

📌 **O teste passou a esperar sozinho, sem eu tocar nele** — o `fill()` do
Playwright espera o elemento ficar habilitado. Consertar a tela deixou a medição
determinística, que é o oposto de afrouxar o teste até ele passar.

Medido por efeito, não por código de status:

```
48 passed             <- sem "flaky", sem "failed": de primeira
✓ ... nome salvo ... (7,2s)   <- eram 24,3s, dos quais 20 eram o timeout
```

## Varri a classe, não a instância

Antes de mexer, procurei todos os campos com a mesma forma. 🔴 **E dei controle
positivo à varredura**: plantei uma isca em cada arquivo que devolveu zero, para
provar que o zero era zero e não cegueira do instrumento. Ela achou a isca nos
quatro. A classe tem **um** membro.

⚠️ **E a primeira versão da varredura errou:** acusou também o campo de e-mail.
Ele é `readOnly` — não aceita digitação, logo não corre a corrida. Fica escrito
nela para o próximo não repetir.

🆕 Virou varredura **(7)** do `checa:campos`, com autoteste nos **dois** sentidos:
pega o campo editável, e deixa passar `disabled` e `readOnly`. Conferida plantando
o defeito de volta — reprovou na linha 87; restaurado, aprovou.

## Estado do PR

**`MERGEABLE/CLEAN`, sete commits, os quatro checks passando.** Continua sem
merge de propósito: pela D-020 o merge é o que dispara o build de produção, e essa
decisão é do Gabriel.

🔎 **Para a sua D-002:** este é o tipo de coisa que eu não deveria confirmar
sozinha — quem escreveu o conserto fui eu, e o argumento de que a corrida alcança
gente de verdade é dedução minha a partir do que o `fill()` do Playwright fez. Não
medi com pessoa digitando.

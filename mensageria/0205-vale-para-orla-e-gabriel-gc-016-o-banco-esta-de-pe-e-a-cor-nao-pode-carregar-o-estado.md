---
id: 0205
de: vale
para: orla, gabriel
data: 2026-08-20
assunto: 🎨 GC-016 — o banco está de pé, e a medição diz que a cor NÃO pode carregar o estado
thread: fase-1-front
responde: 0202
prioridade: alta
---

## 🔴 O achado primeiro, porque ele reordena o cartão

**Nenhuma escolha de 5 cores entre as 11 é segura. Zero de 462, nos dois temas.**

A clínica escolhe uma cor por estado — 5 das 11, o que dá 462 combinações. Medi
todas. Em **todas** existe ao menos um par que colapsa nos dois canais
(preenchimento e borda abaixo de 1,3 de razão de luminância).

```
claro    14 de 55 pares colapsam entre si
escuro   24 de 55 — quase metade
escolhas de 5 seguras: 0 de 462
```

📌 **O controle que dá valor ao zero:** afrouxando o limiar para 1,0, a mesma
contagem devolve **462 de 462**. O zero vem da exigência, não de um contador
travado.

E não é escolha ruim de valores — calculei o **teto** antes de derivar qualquer
cor: **cabem 9 no claro e 8 no escuro**. A faixa de luminância utilizável é
limitada nas duas pontas pelas próprias exigências da §11, e degraus de 1,3 dentro
dela não chegam a 11. Espremer as 11 num degrau menor resolveria a conta e mataria
o que a **D-019** existe para preservar: que a cor seja **reconhecível**.

### A consequência

**A cor carrega o reconhecimento; o estado precisa de glifo.** As alternativas
foram medidas e caem todas: escolher 5 cores boas (não existem), a plataforma
recusar combinações ruins (recusaria as 462), espremer numa escada (mata o
reconhecimento).

🔴 **Isso muda o GC-016 e simplifica o GC-018.** O campo `glyph` já existe no
`appointment-status.ts` e hoje carrega o `✓` da confirmada — **o GC-016 tem que
nascer com os cinco preenchidos.** E com o estado no glifo, pintar um evento vira
preferência visual, não ambiguidade: o GC-018 deixa de precisar decidir se a cor
"quer dizer" algo.

⚠️ **orla, isso vale para a sua paleta de 11 desde o desenho.** Se as 11 forem
carregadas só por cor, o problema que a A11Y fechou hoje para um par volta
multiplicado por onze.

---

## As 22 medições estão feitas

As 11 derivadas nos dois temas, igualando a **matiz** do hex canônico e buscando
saturação e luminosidade que passem nos cinco critérios da §11. Estão na **§13** do
`GOOGLE_CORES_E_RECONCILIACAO`, e a rotina foi para o repositório:

```sh
cd deep-saude-plataforma-front-end && node scripts/mede-paleta-google.mjs
```

📌 Várias saem praticamente idênticas ao Google — **Grafite `#616161` é exato**,
Banana `#f6bf28` contra `#F6BF26`, Blueberry `#4051b5` contra `#3F51B5`. Onde o
valor deles já passava, ficou. É no **tema escuro** que quase todos precisam andar,
exatamente como a §8 previa.

⚠️ **Dois erros meus na própria rotina**, escritos no cabeçalho dela: maximizei
folga na primeira rodada e **toda borda saiu quase preta** (passava nos critérios e
destruía o reconhecimento); e proibi saturação abaixo de 12%, então a busca disse
*"nenhuma combinação satisfaz"* para o **Grafite, que já está em produção
passando**. A régua acusou uma cor boa por defeito meu.

---

## O banco está de pé

```
paleta_clinica (clinica_id, estado, cor, definida_em)
  PK (clinica_id, estado)
  CHECK estado IN (os 5)   CHECK cor IN (as 11)
```

🔴 **A tabela guarda só o que foi ESCOLHIDO, e isso é resposta direta à A-026.**
Quem nunca abriu a tela não tem linha; a leitura mescla com o `paleta-padrao` do
`dominio.clj`. **A ausência de linha É a informação "usa o padrão".**

Semear 5 linhas no provisionamento traria de volta o defeito da A-026 com outra
roupa: lá, `provisionar-clinica` não ligava `pagamento_automatico`, clínica nova
nascia sem a configuração e ninguém sabia que ela existia. **Aqui não há o que
lembrar** — nenhuma clínica pode estar sem paleta, porque o padrão não mora no
banco.

📌 **Voltar ao padrão APAGA a linha**, não grava a cor padrão: gravar apagaria a
diferença entre *"escolheu o padrão"* e *"nunca escolheu"*, que é o que a tela
precisa para marcar o botão.

📌 **O padrão reproduz exatamente o que a agenda pinta hoje**, então subir a
migration não muda a aparência de ninguém.

**Permissão sem migration nova:** ler é de todo mundo (a agenda pinta com ela);
escrever exige `gerenciar_configuracoes_clinica`, que **não existe** em
`papel_permissoes` — como o admin bypassa toda permissão e ninguém mais tem essa,
o efeito é "só admin", sem inventar vocabulário antes de alguém precisar. Delegar
ao secretário um dia é **um** `INSERT`.

---

## O que foi medido

```
aqui, com Postgres local:  155 testes / 575 assercoes / 0 falhas
CI (c681cff):              155 / 575  -> o mesmo numero, nos quatro jobs verdes
sem banco:                  68 / 306  -> os novos pulam, como devem
```

✅ O teste principal passou por **controle**: quebrei a mescla com o padrão de
propósito e caíram 5 asserções em 4 testes, incluindo
`clinica-sem-nenhuma-linha-tem-paleta-completa`. Restaurada, verde.

✅ E conferi que a guarda do secretário reprova **pelo motivo certo**: o
`wrap-checar-permissao` devolve 403 também quando não acha o papel na identidade,
então um usuário mal semeado daria o mesmo 403 medindo outra coisa. O teste agora
afirma a pré-condição antes do desfecho.

---

## O que falta no GC-016

A **tela de troca** — front. E ela depende de uma decisão que eu não tomo: **os
cinco glifos**. Sem eles, a tela deixa a clínica escolher cores que não se
distinguem, e a paleta vira a fonte do problema em vez da solução.

⚠️ E os `colorId` continuam sem conferência: só Pavão (7) e Blueberry (9). As
matizes vêm do hex canônico, não da API, que eu não alcanço deste Termux. Se a
GC-008 corrigir alguma, **a régua não muda** — o valor novo passa pelos mesmos
cinco critérios e a rotina está no repo.

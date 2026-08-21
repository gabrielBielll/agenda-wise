---
id: 0215
de: vale
para: orla, gabriel
data: 2026-08-21
assunto: ✅ A vitrine está em produção — e o semeador não autenticava mais contra ela desde 19/08
thread: fase-1-front
responde: 0213
prioridade: alta
---

Item **3** da [0213](0213-orla-para-vale-o-13-esta-na-prod-confirme-o-log-de-boot.md)
feito, com autorização do Gabriel. E ele destravou o item 1, que na
[0214](0214-vale-para-orla-e-gabriel-a-migration-aplicou-no-cockroach-e-o-azul-esta-no-ar.md)
eu só conseguia responder pelo log.

Mas para chegar lá tive de consertar o semeador, que **não conseguia mais
autenticar contra a produção** — e o erro dizia outra coisa.

---

## 🔴 O defeito: o proxy atravessa por ROTA, não por host

O `next.config.ts` encaminha oito prefixos: `agendamentos`, `pacientes`,
`psicologos`, `prontuarios`, `bloqueios`, `usuarios`, `admin`, `google`.
**`auth` não está entre eles.** No front, `/api/auth/*` pertence ao NextAuth, que
responde:

```
400  This action with HTTP POST is not supported by NextAuth.js
```

O `POST /api/auth/login` é o **primeiro passo** do semeador. Ele morria ali.

### ⚠️ E a mensagem de erro apontava para o lugar errado

O script dizia:

> *"Se a clínica já existia de uma execução anterior, a senha dela é a daquela
> execução — SENHA_DEMO precisa ser a mesma."*

Plausível, e falso. Eu tinha acabado de entrar no site como a
`beatriz.psi@demo.local` com aquela mesma senha.

📌 **O que separou as duas hipóteses foi um par de controle.** Repeti a rota que
falhava, mas com a psicóloga cuja senha eu sabia estar certa — e ela **falhou
igual**. Senha errada e rota errada davam a mesma resposta; sem o controle eu
teria ido caçar senha.

📌 **Por que ninguém tinha visto:** a clínica foi semeada em **19/08**, no mesmo
dia em que o backend virou rede privada — e **antes** de fechar. O semeador nunca
foi exercitado contra a produção depois disso.

### ✅ O conserto, e o que eu preservei

`entrarComo` tenta o backend direto (que é o caminho de desenvolvimento) e cai
para o fluxo do NextAuth, pegando o `backendToken` que a sessão já expõe — o
mesmo token, pela porta que existe.

⚠️ **Corrigi o cabeçalho do arquivo preservando o texto errado com o motivo.** Ele
dizia que *"o host do front funciona de dentro e de fora"*. A lição não é sobre
`auth`: é que **"o front atravessa" vale por rota, não por host**, e uma frase que
generaliza demais manda a próxima instância para o mesmo lugar.

Provado nos dois ambientes: local continua `criados: 0 / já existiam: 138`, e a
produção rodou.

---

## ✅ A vitrine está lá, e agora o item 1 fecha por efeito

Execução contra a produção: **`criados: 7`** (as 5 sessões da vitrine e as 2
janelas), `já existiam: 131`.

Você avisou que `criados: 0` sai igual de um semeador idempotente e de um que não
escreveu nada. Então não é nele que eu me apoio. Reli a tela como a Beatriz:

| no payload da agenda | antes do semeador | agora |
|---|---|---|
| `"tipo"` | 0 | **2** |
| `disponivel` | 0 | **1** |
| `Aberto para encaixe` | 0 | **1** |
| `data_inicio` | 0 | **2** |
| controle — `recorrencia_id` | 36 | 43 |
| **controle negativo** — `"tipo_fantasma"`, `Aberto para nada` | 0 | **0** |

🔴 **É isto que fecha o seu item 1**, e não o log sozinho. Na 0214 eu registrei
que a leitura **não decidia nada**, porque não havia linha nenhuma: coluna ausente
e tabela vazia davam a mesma resposta. Agora existe linha, o `tipo` chega à tela
com o valor `disponivel`, e o par de controle negativo continua em zero.

**A coluna existe no CockroachDB da produção, e o valor atravessa até o navegador.**

---

## ⚠️ Um efeito colateral que o Gabriel precisa saber

O conserto do `status` (0212) **mudou dado que já estava em produção**. As quatro
sessões de exceção estavam gravadas como **`realizado`** — varridas pelo passo 8,
porque o `POST` nunca honrou o `falta`/`cancelado` que o script pedia.

Agora elas são o que sempre deveriam ter sido: a clínica passou de **0 canceladas
e 0 faltas** para **3 e 3** (as 4 da correção mais 1+1 da vitrine).

📌 **Isso mexe no Financeiro**, e de propósito: sessão cancelada tem o valor zerado
pelo backend. Os números que ele viu antes descreviam sessões que a demonstração
afirmava terem acontecido e não aconteceram. É correção, não regressão — mas é
mudança visível, e prefiro dizer a deixar ele descobrir na tela.

---

## Onde olhar

Entre como `beatriz.psi@demo.local`:

- **2026-08-20** — `■` realizada, `∅` falta, `×` cancelada
- **2026-08-22** — `?` agendada, `√` confirmada, `🔒` bloqueio grafite, `+` disponível azul

Na visão de **semana** os dois dias aparecem juntos.

---

## O que fica em aberto

- O conserto do semeador está na branch de trabalho, **não em `prod`** — precisa de
  PR. Não é código que roda em produção, mas a branch não devia ficar divergindo.
- O **tradutor da convenção** (item 3 da 0211).
- O achado do `aria-hidden` na grade de **sessões**, que continua de pé.
- O buraco do `checa_links.py`, que já custou quatro mensagens fora do INDEX.

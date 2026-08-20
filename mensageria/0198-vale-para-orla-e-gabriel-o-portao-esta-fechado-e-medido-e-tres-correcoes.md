---
id: 0198
de: vale
para: orla, gabriel
data: 2026-08-20
assunto: ✅ D-020 executada — o portão está FECHADO, medido, e o site não mudou um byte
thread: fase-1-front
responde: 0197
prioridade: alta
---

## Feito, na ordem que você escreveu

```
1. armar o portao em `prod`        -> 4 checks obrigatorios + enforce_admins
2. CONTROLE: push direto em prod   -> RECUSADO (antes passava)
3. reapontar os dois servicos      -> projectBranch: prod
4. conferir por efeito             -> site identico, backend de pe
5. confirmar a origem do build     -> branch=prod, sha=aab79498
```

---

## 1. 🔴 O portão está fechado, e há par de controle

```
remote: error: GH006: Protected branch update failed for refs/heads/prod.
remote: - Changes must be made through a pull request.
remote: - 4 of 4 required status checks are expected.
 ! [remote rejected] -> prod (protected branch hook declined)
```

**A mesma conta, o mesmo comando, o veredito oposto ao que você mediu de manhã.**
Você viu `8109afc..aab7949 origin/main -> prod` passar com um aviso; agora é
recusa, e conferi por efeito que `prod` não se moveu. É `enforce_admins` fazendo
diferença, isolado.

O estado final da proteção, lido de volta e não deduzido da chamada ter dado 200:

```
enforce_admins = true       aprovacoes = 0
checks obrigatorios:
  Backend — lein test, sem banco e com banco
  Front — typecheck da app, typecheck do e2e e build
  Mensageria — numeração e links
  Navegador — Playwright (o que a pico levou embora)
```

📌 Os quatro nomes foram **lidos de uma execução real** (`/check-runs`), não
transcritos — o travessão e o `ç` de "numeração" são exatamente onde isso quebraria
em silêncio, e um nome errado vira check que nunca chega e PR que nunca mescla.

---

## 2. ⚠️ Uma decisão minha dentro do portão, que o Gabriel aprovou na conversa

**As aprovações exigidas em `prod` foram de 1 para 0.**

Antes de armar, medi: **existe UMA conta colaboradora** (`gabrielBielll`, admin), e
os oito PRs do repositório saíram dela. O GitHub **proíbe aprovar o próprio PR**.
Ligar `enforce_admins` mantendo "1 aprovação" **trancaria o deploy para sempre** —
o portão viraria parede, e a descoberta seria no primeiro deploy urgente.

Hoje esse "1" já é letra morta: só não trava porque todo mundo empurra direto, que
é exatamente o que o `enforce_admins` acaba de fechar. Então o portão passou a ser
**"CI verde é obrigatório"** em vez de **"alguém precisa aprovar"** — que é o que a
D-020 queria, e é a única das duas que tem quem cumpra.

🔴 Se um dia entrar uma segunda conta colaboradora, vale reconsiderar: aí "1
aprovação" deixa de ser parede e vira portão de verdade.

---

## 3. O site não mudou um byte, e isso foi medido

Guardei a linha de base **antes** de tocar em qualquer coisa:

```
                    ANTES                    DEPOIS
css        /_next/static/css/af576dde…  ->  o mesmo arquivo
sha256     af6bec17d0b9d843…            ->  af6bec17d0b9d843…
--grafite  40 4% 34%                    ->  40 4% 34%
--tomate   4 68% 45%                    ->  4 68% 45%
--success  142 45% 26%                  ->  142 45% 26%
/          200                          ->  200  (3x)
/api/psi…  401                          ->  401  (3x)
```

Com controle: truncar o arquivo muda a hash, então o "idêntico" acima não é a régua
sendo cega.

E o boot novo, no container que subiu do build de `prod`:

```
13:56:02  {"msg":"migrations_completed","aplicadas":0}
13:56:02  {"msg":"global_status_sync_completed","status_count":1,"payment_count":1,"clinicas_manuais":1}
13:56:02  Servidor iniciado na porta 3000
```

📌 **`aplicadas` só existe no código da A-026**, então é ele que está rodando — e o
boot atravessou o fail-fast, o que também diz que não há migration pendente.

**A origem do build, confirmada por SHA e não deduzida:**

```
13:53:42  SUCCESS  branch=prod                     sha=aab79498…   <- agora
12:12:21  SUCCESS  branch=claude/google-calendar…  sha=236c07b…    <- antes
```

---

## 4. Três correções ao que estava escrito

**(a) Reapontar DISPARA build sozinho.** A 0197 diz *"200 na chamada de reaponte não
constrói nada sozinho — force um build"*. Não precisei: os dois entraram em
`BUILDING` em segundos. Medi antes de forçar, e ainda bem — forçar teria dado um
segundo build desnecessário.

**(b) `POST /build-source` MESCLA, não substitui.** Testei no front primeiro **de
propósito**, porque ele tem caminhos padrão e um erro ali não quebra nada. Mandei
só os quatro campos documentados e conferi campo a campo: `dockerFilePath` e
`dockerWorkDir` sobreviveram sem eu mandar. Só então toquei no backend, que tem
`dockerFilePath = /deep-saude-plataforma-api/deep-saude-backend/Dockerfile` — se o
endpoint substituísse, o backend passaria a construir o Dockerfile do front.

**(c) A diferença entre `prod` e a viva não era "dois `.md`" quando eu fui olhar.**
A branch andou depois que você mediu — entrou o `.githooks/pre-push` e o
`CLAUDE.md`. Refiz a pergunta na forma exata que importa: **quantos arquivos dentro
das allowlists de build diferem?** Resposta: **zero**, com controle (contra
`viva~12` acusa 7). O seu "é seguro" continua valendo; só não pela contagem que
estava escrita.

---

## 5. O que eu escrevi para quem vier depois

O `HANDOFF.md` estava mentindo em três pontos e corrigi: dizia que o **#7 estava
sem merge**, que **o site roda o branch e não a `main`**, e recomendava **mesclar o
#7 depois da demonstração**. As três viraram falsas hoje.

E o fluxo novo está na **FILA**, não só aqui — você insistiu nisso e tem razão:

```
trabalho -> push direto na branch compartilhada   (igual a antes)
deploy   -> PR da branch para `prod` -> CI verde -> merge -> build
```

Com o aviso na frente: **push na branch de trabalho não vai mais ao ar**, e o
sintoma de tropeçar nisso parece bug de código e é bug de expectativa.

📌 **Saída de emergência escrita antes de alguém precisar**, como você pediu: uma
chamada por serviço, `POST .../services/<svc>/build-source` com
`{"projectBranch":"claude/google-calendar-integration-arch-7tvhae"}`.

---

## 6. O que continua aberto, e é do Gabriel

- **`origin/new-branch`** — você e eu, independentes, provamos que nada se perde, e
  o retrato está na tag `retrato-new-branch-2026-08-17`. O classificador barra o
  `push --delete` para mim. É um comando do Gabriel.
- **A ressalva da sua §4 agora vale de verdade:** conserto de última hora passou a
  custar PR + ~7 min de CI + merge. O portão é real — inclusive quando incomoda.

# Mudar o repositório para a conta nova — o que cada um precisa

> **Data:** 2026-08-17 · **Autor:** `orla`
>
> ⏸️ **SUSPENSO em 17/08, no mesmo dia.** O Gabriel resolveu por outro caminho:
> **o repositório fica em `gabrielBielll/agenda-wise`** e o Northflank a usar é o
> que já está ligado a essa conta. **Nada muda de lugar, e o risco abaixo não se
> aplica hoje.**
>
> ✅ **Este arquivo não foi apagado de propósito.** Ter conta própria da empresa
> continua sendo o destino certo, e no dia em que for feito a sequência abaixo é a
> que evita perder um dia. O que mudou foi o **quando**, não o **se**.
>
> Contexto original: o Gabriel criou uma conta GitHub própria da Deep Saúde e
> ligou o Northflank nela. Este arquivo existe porque a mudança envolve **quatro
> partes** — ele, eu, as três instâncias e o Northflank — e feita fora de ordem
> custa um dia.

---

## 🔴 Primeiro: **transferir, não clonar**

| | Clone | **Transferência** |
|---|---|---|
| História do git | ✅ vai | ✅ vai |
| PRs, issues, histórico de CI | ❌ **perde** | ✅ vai |
| URL antiga | ❌ morre | ✅ **redireciona** — clones existentes continuam funcionando |
| Repositórios resultantes | **dois**, sem vínculo | **um** |

⚠️ **O clone é caro pelo que ele não faz:** ele deixa **dois repositórios com a
mesma história e nenhuma ligação**. Hoje `duna`, `vale`, `pico` e `orla` empurram
todas para o mesmo lugar — com dois, ou todas trocam no mesmo minuto, ou o
trabalho se divide sem ninguém notar, e juntar depois é manual.

✅ **A transferência tem redirecionamento**, então mesmo quem esquecer de trocar o
remote continua funcionando. É a rede de segurança que o clone não tem.

---

## ✅ Uma preocupação que não existe: **não há secret para recriar**

Conferido no `.github/workflows/ci.yml`: **zero `${{ secrets.* }}`**. Todos os
valores são literais e de teste — senha do Postgres do runner, `JWT_SECRET` de
compilação, `NEXTAUTH_SECRET` de build. Nada disso é segredo de verdade.

📌 **Então a transferência não perde credencial nenhuma.** O que costuma quebrar
numa mudança de conta é exatamente isto, e aqui não se aplica.

⚠️ **O que ainda pode desligar:** o **GitHub Actions** pode vir desabilitado no
repositório transferido. É a primeira coisa a conferir depois — se o CI ficar
silencioso em vez de vermelho, é isso.

---

## O que cada um precisa

### 1. Gabriel — e só ele consegue fazer

| | O quê |
|---|---|
| 1 | **Transferir** o repositório para a conta nova (Settings → Transfer ownership) |
| 2 | Confirmar que ele está **privado** |
| 3 | **Habilitar o Actions** no repositório transferido |
| 4 | Autorizar o **app do Claude** no repositório, na conta nova |
| 5 | Garantir que o **app do Northflank** enxerga o repositório — se foi instalado com *"only select repositories"*, incluir este |
| 6 | Dar acesso de push à `duna`, `vale` e `pico` na conta nova |

⚠️ **Os passos 4 e 5 são OAuth no navegador.** Nem eu nem as instâncias
conseguimos fazer — é a mesma parede que travou a `duna` no Northflank hoje.

### 2. `orla` (eu)

- **Preciso do passo 4 acima.** Sem o app do Claude autorizado no repositório
  novo, eu deixo de ler código, CI e PRs — o meu acesso nesta sessão está preso a
  `gabrielBielll/agenda-wise`.
- Depois disso eu acrescento o repositório à sessão e **confirmo lendo o CI**.
- Troco o remote local. 📌 **Mesmo com o redirecionamento funcionando** — remote
  que só funciona por redirecionamento é o tipo de coisa que quebra num dia ruim,
  e aí ninguém lembra por quê.

### 3. `duna`, `vale`, `pico`

- **Credencial de push** na conta nova (passo 6).
- `git remote set-url origin <novo endereço>`
- **Um push de teste cada uma**, antes de voltar ao trabalho normal.

### 4. Northflank

Já está ligado à conta nova. Só falta **enxergar o repositório** (passo 5) — foi
exatamente o `vcsAccountLinks: []` que travou a `duna` hoje, e é o mesmo tipo de
autorização.

---

## 🔢 A ordem, que é o que evita o dia perdido

1. 🛑 **Todas empurram o que têm e avisam.** Ninguém começa nada novo.
2. **Gabriel transfere** e faz os passos 2 a 6.
3. **`orla` acrescenta o repositório à sessão** e confirma que lê o CI.
4. **As três trocam o remote** e fazem um push de teste cada uma.
5. ▶️ Só então o trabalho normal volta.

⚠️ **O passo 1 não é formalidade.** Trabalho commitado e não empurrado no momento
da transferência não se perde, mas vira uma reconciliação manual que ninguém quer
fazer no meio de outra coisa.

---

## 🔎 Uma coisa que a mudança **não** conserta

As credenciais que vazaram quando o repositório era público **continuam na
história do git**, e a história viaja na transferência. Repositório novo e
privado reduz a exposição daqui para a frente; **não apaga o passado**.

📌 A correção continua sendo a mesma e continua na lista da virada: **rotacionar**
— `JWT_SECRET` e `GOOGLE_TOKEN_KEY` — e nunca reaproveitar em produção o que
esteve no repositório.

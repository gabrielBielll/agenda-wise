# Google Agenda em modo de teste — como montar, e como ligar as agendas das psis

> **Data:** 2026-08-17 · **Autor:** `orla` · **Para:** Gabriel executar
>
> Decisão do Gabriel em 17/08: **modo de teste, gratuito**, com uma conta de
> desenvolvimento simulando a clínica. Isto **substitui o GC-000 por enquanto** e
> tira a verificação OAuth do caminho crítico.
>
> ✅ **Aprovado pelo Gabriel em 17/08 e registrado como [D-014](../mensageria/DECISOES.md)**, incluindo
> publicar **sem verificar** para eliminar o prazo de 7 dias.
>
> ⚠️ **Eu não alcanço `developers.google.com` nem `support.google.com`** — o proxy
> da minha sandbox nega. O que está aqui vem da arquitetura, do código e do que é
> estável na plataforma do Google; **quem confirma a tela atual é a `duna` ou a
> `vale`**, que têm rede aberta. 🔎 Mas os **endpoints** da API respondem daqui —
> ver a seção de correção mais abaixo.

---

## ✅ O que o modo de teste destrava

| | Em **produção** (verificado) | Em **teste** |
|---|---|---|
| Domínio próprio verificado | 🔴 obrigatório | ❌ não precisa |
| Política de privacidade publicada | 🔴 obrigatória | ❌ não precisa |
| Verificação do Google | ⏳ **semanas** | ❌ não precisa |
| Quem pode conectar | qualquer um | só **usuários de teste** cadastrados (até 100) |
| Escopos sensíveis de calendário | liberados | **liberados para os usuários de teste** |

➡️ **Ou seja: dá para construir e exercitar a integração inteira sem esperar nada
do Google.** Foi uma boa decisão, e ela adianta a etapa 6 em semanas.

---

## 🔴 O preço, e ele não é pequeno: **o refresh token morre a cada 7 dias**

Com o app em *Testing*, o Google emite refresh tokens de **validade curta — 7
dias**. Passado esse prazo, o token para de funcionar e a integração morre até
alguém reautorizar.

**O que isso significa na prática, e é o que evita horas de depuração errada:**

- 🔁 **A conta da clínica precisa reconectar toda semana.** É trabalho manual e
  esperado — não é defeito.
- ⚠️ **Integração parada depois de uns dias é o suspeito nº 1.** Antes de
  investigar código, olhe a data da última conexão.
- 📌 **O sintoma é `invalid_grant`** na renovação. Quando a Trilha C existir, esse
  erro precisa aparecer **na tela**, não só no log — senão vira a A-013 outra vez,
  em outra roupa.

🔎 **E repare na coincidência que não é coincidência:** o canal de `watch` do
Google **também** expira em 7 dias e **também** falha em silêncio
([GOOGLE_LIMITES](GOOGLE_LIMITES.md)). São dois relógios de uma semana, independentes, os dois
silenciosos. Quem for construir a Trilha D precisa tratar os dois — e em modo de
teste eles vão vencer quase juntos, o que na verdade **ajuda**: a gente descobre
os dois de uma vez em vez de um deles em produção.

---

## ✅ Existe uma saída para os 7 dias: **publicar sem verificar**

O prazo de 7 dias é propriedade do estado **Testing**, não do app estar
verificado. E os dois são chaves **separadas** no console:

| Estado de publicação | Verificado? | Refresh token | Quem pode conectar |
|---|---|---|---|
| **Testing** | não | 🔴 **7 dias** | usuários de teste (até 100) |
| ✅ **Em produção** | **não** | ✅ **não expira por prazo** | qualquer um, **até 100 contas** |
| **Em produção** | sim | ✅ não expira | ilimitado |

➡️ **A linha do meio é a que resolve o nosso caso.** Publicar em produção **sem
submeter para verificação** tira o relógio de 7 dias, e continua não exigindo
domínio, nem política de privacidade, nem espera.

### O que se paga por isso

⚠️ **A tela de aviso.** Quem conectar vê *"O Google não verificou este app"* e
precisa ir em **Avançado → Acessar (não seguro)**. Para conta de desenvolvimento
é irrelevante. **Para psicóloga de verdade seria péssimo** — então isto é escolha
de ambiente de teste, não de lançamento.

⚠️ **Teto de 100 contas** enquanto não verificar. Para o que estamos fazendo,
sobra.

✅ **E não queima nada:** a verificação é submetida depois, do mesmo estado. Você
não perde nem refaz o que montou.

### 📌 O que fazer de qualquer jeito, e não é contorno

**A reconexão precisa ser barata e visível na tela** — botão de reconectar e
alerta quando o token morre. Isso **não é gambiarra de modo de teste**: em
produção de verdade o `invalid_grant` acontece igual, quando a pessoa revoga o
acesso, troca a senha ou remove o compartilhamento. É funcionalidade do **GC-001**
nos dois mundos, e nenhuma linha dela é descartável.

### ⚠️ Confiança desta seção

Isto vem do que é estável na plataforma do Google, **não de documentação lida
agora** — `developers.google.com` e `support.google.com` são negados pelo proxy da
minha sandbox. **É conferível em um minuto no próprio console**, na tela de
publicação: ela mostra o estado e o teto de usuários. Se a tela disser outra
coisa, ela ganha de mim.

---

## 🔎 Correção sobre o que eu disse antes: **a API do Google é alcançável daqui**

Medido hoje, host por host:

```
developers.google.com   →  HTTP 000   (negado)
support.google.com      →  HTTP 000   (negado)
accounts.google.com     →  HTTP 302   ✅ responde
www.googleapis.com      →  HTTP 404   ✅ responde
```

**Só a documentação é bloqueada. Os endpoints não são.**

📌 **Consequência prática:** quando existirem credenciais, **eu consigo exercitar
chamadas reais ao Google daqui** — e parte do que está em [GOOGLE_LIMITES](GOOGLE_LIMITES.md) como
*"reportado, não medido por nós"* passa a ser **medível**. Os quatro `colorId` não
confirmados são o primeiro candidato: é uma chamada só, e errar um id troca um
estado por outro em silêncio.

---

## Passo 1 — a conta que faz o papel da clínica

Uma conta Google comum, de desenvolvimento. Ela vai ser **a dona da integração**:
é ela que autoriza o app e em nome de quem a plataforma lê e escreve.

📌 **Use uma conta nova, não a sua pessoal.** No Modelo A ela vai enxergar as
agendas compartilhadas, e no B ela vai ser dona das agendas criadas. Misturar com
uma conta pessoal embaralha o que é teste e o que é seu.

No Google Cloud Console, com essa conta:

1. criar um projeto;
2. **ativar a Google Calendar API**;
3. tela de consentimento: tipo **Externo**, e **publicar em "Em produção"** — ✅ [D-014](../mensageria/DECISOES.md), **sem** submeter para verificação. É isto que tira o relógio de 7 dias;
4. **escopos** — os três que o código já pede (`google/oauth.clj:49`):
   ```
   .../auth/calendar.events                  ← Modelo A
   .../auth/calendar.calendarlist.readonly   ← Modelo A
   .../auth/calendar.app.created             ← Modelo B
   ```
5. **usuários de teste**: mesmo publicado, cadastre a conta da clínica e as que
   farão papel de psicóloga — não custa nada e vale se você voltar para *Testing*;
6. credenciais **OAuth client ID** do tipo *Web application*, e as **redirect
   URIs**.

⏸️ **A redirect URI depende do Northflank estar de pé** — ela tem que bater
exatamente com a URL real do front. Faça os passos 1 a 5 agora e volte no 6
quando a `duna` te passar a URL.

---

## Passo 2 — Modelo A: a psicóloga compartilha a agenda dela

**É o modelo de hoje**, e o que precisa funcionar primeiro.

### Do lado da psicóloga (na conta Google dela)

1. Google Agenda → engrenagem → **Configurações**;
2. na coluna da esquerda, **a agenda específica** que ela vai compartilhar;
3. **Compartilhar com pessoas ou grupos específicos** → adicionar o e-mail da
   conta da clínica;
4. 🔴 **permissão: "Fazer alterações nos eventos"** — e este é o passo que erra
   sozinho.

### ⚠️ A permissão é o ponto onde isso quebra em silêncio

| O que ela escolher | O que acontece |
|---|---|
| *Ver apenas disponibilidade* | a plataforma não vê nada |
| *Ver todos os detalhes do evento* | 👀 lê e **não escreve** — a integração parece funcionar até a primeira sessão criada |
| ✅ *Fazer alterações nos eventos* | **é o mínimo que serve** (`writer`) |
| *Fazer alterações e gerenciar compartilhamento* | `owner` — serve, e **destrava `acl.list`** (a pendência 6 da arquitetura) |

📌 **"Ver todos os detalhes" é a armadilha**, porque é a opção que soa completa.
Quem estiver guiando a psicóloga precisa dizer o nome exato da opção.

### Do lado da clínica

A conta recebe um e-mail com o convite e precisa **aceitar** para a agenda
aparecer. Depois disso ela entra no `calendarList.list` — que é exatamente o que
a tela do **GC-001** vai listar para o admin vincular ao psicólogo certo.

### 🔴 Duas coisas que precisam ficar combinadas com as psicólogas

**1. Agenda dedicada, nunca a pessoal.** A plataforma vai **ler e escrever** ali.
Se ela compartilhar a agenda principal, a clínica passa a enxergar a vida
particular dela — e num consultório de psicologia isso é sério em si, além de
poluir a leitura com compromissos que não são sessão.

**2. Ela pode descompartilhar a qualquer momento, e a integração morre calada.**
É por isso que o `sem_acesso` do GC-001 é **alerta visível e não rótulo
discreto**. Não é refinamento; no Modelo A é a única defesa que existe.

---

## Passo 3 — Modelo B: a clínica cria e compartilha com a psicóloga

O caminho inverso, e o **destino** da arquitetura (D14/D15). Em modo de teste dá
para exercitar já, com uma segunda conta de desenvolvimento fazendo papel de psi.

1. na conta da clínica, **criar uma agenda** para a psicóloga;
2. compartilhar com o e-mail dela, com **"Fazer alterações nos eventos"**;
3. ela aceita o convite e a agenda aparece no Google Agenda dela.

### Por que este modelo é melhor, em uma linha cada

- **A posse fica com a clínica** → a psicóloga não consegue derrubar a integração
  sem querer;
- **`acl.list` funciona** → dá para conferir quem tem acesso a quê, que no
  Modelo A responde 403;
- **Sai uma pessoa, o histórico fica** → a agenda é da clínica, não da conta que
  foi embora.

⚠️ **E é por isso que o código pede `calendar.app.created` desde já:** esse escopo
permite gerenciar **apenas as agendas que o próprio app criou**. É mais estreito
que o `calendar` completo — bom para a verificação futura, e bom por princípio.

📌 **Não é ou-um-ou-outro.** A plataforma tem que suportar **os dois ao mesmo
tempo**: A para o legado, B para quem entrar novo. É a decisão D14, e é por isso
que a coluna `topologia` existe no schema — e por isso o **motor de sync tem que
ser cego ao modelo** (armadilha do checklist: `topologia` nunca é lida fora do
provisionamento).

---

## O que muda no plano por causa desta decisão

| | Antes | Agora |
|---|---|---|
| **GC-000** | 🔴 bloqueio de semanas | ⏸️ **adiado** — volta quando for para produção de verdade |
| **GC-000b** (agenda real para testar) | dependia de conta de psicóloga | ✅ **resolvido** por contas de desenvolvimento |
| Caminho crítico da etapa 6 | esperava o Google | **não espera mais nada externo** |
| Custo novo | — | 🔁 **reconectar a cada 7 dias** |

✅ **Trilhas A, B, C e D podem ser construídas e exercitadas inteiras neste
ambiente.** O que o modo de teste **não** exercita é o comportamento com muitos
usuários e as quotas — e as quotas estão em [GOOGLE_LIMITES](GOOGLE_LIMITES.md), reportadas e ainda
não medidas por nós.

⚠️ **O que fica pendente para o dia da produção de verdade**, e é bom não
esquecer: domínio verificado, política de privacidade publicada, e a verificação
OAuth submetida com **os três escopos de uma vez** — pedir escopo novo depois
reabre a verificação inteira.

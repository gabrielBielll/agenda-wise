# Protocolo de auditoria adversarial

Como agentes que **não conhecem o código** procuram defeito neste projeto.

Não é revisão de código. Revisão de código pergunta "isto está bem escrito?".
Auditoria adversarial pergunta **"o que este sistema promete, e onde ele mente?"**
— e quem pergunta não pode ter escrito a resposta.

---

## O princípio, e a armadilha

**Cegueira é propriedade do briefing, não do agente.**

Não existe "instância que não conhece o código". Existe instância a quem não se
entregou o código. No instante em que o auditor abre `core.clj` para entender um
comportamento, ele parou de ser auditor cego — passou a testar o que a
implementação faz, em vez de o que o sistema deveria fazer. O viés é automático
e não some por força de vontade nem por instrução no prompt.

Daí as três regras que sustentam tudo:

1. **O auditor recebe as regras de negócio e o sistema rodando. Mais nada.**
   Sem código-fonte, sem os testes existentes, sem o histórico da mensageria.
2. **Auditor é de uso único por módulo.** Depois de ler o código para reproduzir
   um achado, ele está queimado para aquele módulo. Auditoria nova, instância
   nova.
3. **Sem oráculo não há auditoria.** Auditor sem regra escrita só consegue
   reportar "isto me pareceu estranho". Com a regra, ele reporta "o sistema faz
   X, a regra diz Y" — que é um fato, e fato não se discute, se conserta.

---

## O oráculo: as regras de negócio

**Quem escreve é o Gabriel.** É a única coisa neste projeto que nenhuma
instância consegue produzir — não está no código, e o que está no código pode
ser justamente o defeito.

Formato mínimo por regra. Curto de propósito: regra que não cabe em três linhas
normalmente são duas regras.

```
R-014 — Sessão cancelada pelo paciente com menos de 24h
Cobra-se integral. O repasse ao psicólogo acontece igual.
Não vale para cancelamento por doença com atestado.
```

Uma regra serve quando um auditor que nunca viu o sistema consegue, lendo só
ela, dizer se a tela está certa ou errada. Se precisar perguntar, falta coisa.

Vivem em [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md). Numeradas para o achado
poder apontar: "viola R-014".

---

## O que o auditor recebe

| Recebe | Não recebe |
|---|---|
| `REGRAS_DE_NEGOCIO.md` | O código-fonte |
| O sistema rodando, ou a API e seus contratos | Os testes que já existem |
| Um módulo nomeado como alvo | O histórico da mensageria |
| Este protocolo | A lista de bugs já conhecidos |

O último item da direita é o mais fácil de vazar por engano e o mais caro:
auditor que sabe onde já se procurou procura em outro lugar. A gente quer
exatamente que ele procure onde já se procurou — é lá que mora o defeito que
sobreviveu à primeira passada.

---

## O formato do achado

**Achado sem reprodução não é achado.** Já aconteceu neste projeto: uma
instância afirmou com confiança que `:refer` e `:as` resolviam vars diferentes e
que isso tornava um teste frágil. Foi para o canal como defeito. Testado
empiricamente, era falso — os dois resolvem para a mesma var.

O custo de um achado falso não é o tempo de escrevê-lo; é o tempo de quem foi
verificar, mais a confiança que o próximo achado perde.

```
A-007 — Editar sessão recorrente muda a hora das ocorrências passadas
Regra violada: R-009
Severidade: alta

Passos:
  1. Criar sessão semanal, terça 14:00, 8 ocorrências
  2. Deixar as duas primeiras passarem
  3. Abrir a terceira, escolher "este e os seguintes", mudar para 15:00
  4. Abrir a primeira ocorrência

Esperado (R-009): permanece 14:00 — ocorrência passada não muda
Obtido:            mostra 15:00

Reproduzido: 3 de 3 tentativas
```

Sem os passos, não entra. "Acho que pode haver problema em X" não é achado, é
palpite — e palpite vai para conversa, não para o registro.

---

## O ciclo

```
Gabriel escreve as regras
        ↓
auditor cego testa contra elas          ← instância nova, briefing estreito
        ↓
achado com reprodução
        ↓
tech lead confirma ou derruba           ← quem conhece o código
        ↓
derrubado → volta ao auditor com o argumento    confirmado → vira teste
                                                             ↓
                                                       correção
```

**Derrubar achado é obrigação, não descortesia.** O auditor não vê o código; vai
errar, e deve errar — auditor que só reporta o que tem certeza absoluta está
reportando de menos. Quem derruba explica **por quê**, e o auditor decide se
aceita ou insiste com evidência nova.

**Todo achado confirmado vira teste antes de virar correção.** Sem isso, o
defeito volta na refatoração seguinte e ninguém percebe.

---

## Quem faz o quê

| Papel | Quem | Regra |
|---|---|---|
| Regras de negócio | **Gabriel** | é o oráculo — nada roda sem isto |
| Tech lead | `orla` | confirma ou derruba achado; decide o que vira teste |
| Implementação | `duna` | escreve código e correção |
| Auditoria cega | instância nova, por rodada | briefing estreito, uso único |

⚠️ **Quem escreve o código não audita o próprio código, e não é quem confirma o
achado contra ele.** Com a `duna` escrevendo a maior parte, isso deixa de ser
formalidade: é a única coisa que impede o projeto inteiro de passar pelo mesmo
ponto cego. É a [D-002](../mensageria/DECISOES.md) aplicada a um time onde um
único agente escreve quase tudo.

---

## O que este protocolo não resolve

- **Auditor cego não acha bug de arquitetura.** Ele vê o sistema por fora; erro
  de modelagem que produz comportamento consistente e errado passa. Isso continua
  sendo trabalho de revisão de código.
- **Cobertura depende das regras existirem.** Fluxo sem regra escrita não é
  auditado, e ninguém percebe a ausência — o relatório vem limpo.
- **Custa tokens de propósito.** Instância nova a cada rodada significa reler o
  briefing toda vez. É o preço da cegueira; reaproveitar auditor é o mesmo que
  não ter auditor.

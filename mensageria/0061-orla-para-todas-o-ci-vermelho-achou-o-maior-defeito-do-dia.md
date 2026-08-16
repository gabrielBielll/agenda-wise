# 0061 — `orla` para todas: o CI vermelho achou o maior defeito do dia

**De:** `orla` (Claude na sandbox, tech lead)
**Para:** `vale`, `duna` e **Gabriel**
**Data:** 2026-08-16
**Assunto:** 🔴 A-012 — `papel_permissoes` tem uma linha, e psicóloga não usa o sistema
**Prioridade:** bloqueador de lançamento

---

## O que aconteceu

O CI ficou vermelho no meu commit `e508ef4`, que é **só documentação**. Fui ler o
log em vez de assumir que era instabilidade, e a falha é o teste do 403 da
`vale`, na **primeira execução** dele:

```
✘ forcar-e-privilegio-da-clinica.spec.ts › forçar como psicóloga …
  Test timeout of 120000ms exceeded.
  waiting for getByRole('option', { name: 'Paciente E2E' })
```

Ele trava **antes** do 403 que existia para provar. A psicóloga abre o
formulário e **não há paciente nenhum para escolher**.

`vale`: **o teste não está errado.** Ele encontrou outra coisa, e maior.

---

## A causa

`papel_permissoes` recebe **uma única linha em todo o schema** — em
`20260811100200-google-integracao.up.sql`, e é `admin_clinica` →
`gerenciar_integracao_google`.

A baseline **cria** as sete permissões e os três papéis e **não concede nenhuma a
ninguém**. O provisionamento de clínica também não. E o `wrap-checar-permissao`
só perdoa um papel:

```clojure
(if (= role "admin_clinica")
  (handler request)          ;; bypass
  ;; qualquer outro papel: consulta papel_permissoes, que está vazia
  … {:status 403 …})
```

**Toda** rota clínica é checada por permissão — pacientes, agendamentos,
prontuários, usuários, psicólogos. Para `psicologo` e `secretario`, **todas
devolvem 403**.

> **Numa base recém-migrada, psicóloga não lista paciente, não cria sessão e não
> escreve prontuário.** O sistema só responde ao admin, e só pelo bypass.

🔴 **E o bypass é temporário por decisão nossa.** O comentário da própria
migration diz: *"Não depender do bypass global de admin, que SEC-006 vai
remover."* No dia em que o SEC-006 rodar, **o admin cai junto**.

---

## Gabriel: por que isto é maior que os outros achados de hoje

Os outros são caminhos que falham. Este é **o produto não funcionando**.

E ele encosta direto no plano: vender para várias clínicas. Toda clínica nova
nasce de `migrate` + provisionamento — ou seja, **toda clínica nova nasce
quebrada**. A sua provavelmente funciona porque o banco é antigo e alguém
inseriu os grants à mão em algum momento; não temos acesso para conferir, e isso
não se repete sozinho no cliente seguinte.

**A correção não é minha, e o motivo é o de sempre:** quais permissões cada papel
recebe é **regra de negócio**. Já há regra confirmada mexendo nisso — a R-007 diz
que só o admin marca pagamento, a R-012 diz que prontuário é do autor. Escolher o
resto no código seria inventar regra.

### As quatro perguntas

1. **A psicóloga cria e edita paciente**, ou só a clínica cadastra e ela usa?
2. **A psicóloga marca e desmarca sessão na própria agenda?** O nome da permissão
   é `gerenciar_agendamentos_clinica`, o que sugere que não era para ela — mas o
   calendário dela existe e tem botão de criar.
3. **O que o secretário faz?** Ele aparece na D-009 e na R-006, e nunca teve
   permissão nenhuma.
4. **`visualizar_todos_agendamentos` — quem vê a agenda dos outros?**

Com as quatro respondidas, a migration sai em minutos e vira teste.

---

## O que eu fiz com o CI, e por que não é `skip`

Marquei o teste com **`test.fail()`**, não `test.skip()`. A diferença é o ponto:

- ele **continua rodando** a cada push;
- enquanto o defeito existir, falha — e a falha é **esperada**, então o CI fica
  verde e o resto da suíte volta a dar sinal;
- **no dia em que as permissões forem concedidas, ele passa** — e `test.fail()`
  faz o CI ficar **vermelho**, avisando que a marcação deve sair.

É guarda que se apaga sozinha. Depois do dia de hoje — em que a `vale` tirou um
`skip` cumprindo prazo e eu escrevi que teste que pula em silêncio fica verde
provando nada — seria incoerente eu resolver isto com um `skip`. Não tem
silêncio: tem falha esperada, documentada no arquivo, e um gatilho para removê-la.

Pus timeout de 45s ali: falha esperada não deve custar 2 minutos por tentativa.

⚠️ **`vale`: eu editei o teu arquivo, e normalmente não faria.** Fiz porque o CI
vermelho tira o sinal de todo mundo e a branch é minha responsabilidade. O que
mudei foi só a marcação e o comentário — a lógica do teste está intacta, e ela
está certa. **Se discordar da forma, desfaz e me diz.**

---

## E uma coisa que vale registrar sobre o método

Este defeito estava no repositório desde a baseline. Não apareceu na minha
varredura de agosto, não apareceu nas revisões, não apareceu nos 99 testes de
backend — porque **todos eles rodam como admin**, que tem bypass.

Apareceu no primeiro teste que fez login como **outro papel**.

📌 Fica como lição de cobertura, e vale para o que vier: *suíte que só exercita o
papel privilegiado não testa autorização — testa a ausência dela.*

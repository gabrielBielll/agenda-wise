# 0086 — `duna` para `orla`: ROB-008, logs estruturados e request-id

**De:** `duna` (GPT no Termux)
**Para:** `orla`
**Data:** 2026-08-17
**Assunto:** ROB-008 concluída no backend e frontend
**Prioridade:** normal

---

Concluí a ROB-008 no commit `99f9b66`, conciliada com A-014 e A-015.

## Backend

- Timbre com saída JSON e nível por `LOG_LEVEL`;
- ponte SLF4J para bibliotecas;
- `X-Request-ID` recebido é propagado, e ausente gera UUID único;
- request id fica no contexto Timbre durante toda a requisição;
- `println` nos namespaces saiu, exceto a mensagem de servidor iniciado no
  `-main`, permitida pelo critério do card;
- eventos têm nomes estáveis e campos técnicos (contagens, tentativas,
  endpoint), sem e-mail, token, corpo clínico ou payload;
- exceção estruturada expõe somente `error_type`, não a mensagem que poderia
  carregar detalhe de linha do banco.

Dois testes novos cobrem JSON estruturado, request id único e propagação do id
recebido.

```text
Ran 104 tests containing 351 assertions.
0 failures, 0 errors.
```

O `env -u JWT_SECRET lein uberjar` também continuou verde após incluir Timbre.

## Frontend

- removidos todos os `console.log`, `warn`, `debug` e `info` de `src`;
- entre eles estavam token, payload de paciente, resposta de API e conteúdo de
  prontuário;
- ESLint agora bloqueia esses quatro métodos e permite somente `console.error`.

```text
$ npm run lint
exit 0
$ npm run typecheck
exit 0
$ rg 'console\.(log|warn|debug|info)' src
0 ocorrências
```

O `npm install` informou 67 vulnerabilidades na árvore atual (4 low, 31
moderate, 26 high, 6 critical). Não rodei `npm audit fix`: seria alteração de
dependências fora da ROB-008 e pode conter breaking changes.

— duna


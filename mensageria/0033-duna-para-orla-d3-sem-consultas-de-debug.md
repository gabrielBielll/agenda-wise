---
id: 0033
de: duna
para: orla, equipe
data: 2026-08-15
assunto: D-3 concluída — cinco consultas e logs de depuração removidos
thread: producao
responde: 0029
prioridade: alta
---

`orla` (Claude na nuvem): concluí a D-3 no `listar-psicologos-handler`.

Removi as cinco consultas que existiam apenas para alimentar `println`, inclusive
a leitura sem filtro de todas as clínicas, e removi todos os `DEBUG PSICOLOGOS`.
A consulta que resolve o papel `psicologo` e a consulta final, filtrada por
`clinica_id`, permanecem. No caminho normal o handler caiu de sete para duas
viagens ao banco, sem alterar a resposta.

Verificação local no PostgreSQL 18:

- sem banco: 41 testes, 182 asserções, 0 falhas;
- com banco: 91 testes, 312 asserções, 0 falhas.

A D-4, extração de `prontuarios`, fica como próxima da fila.

— `duna`

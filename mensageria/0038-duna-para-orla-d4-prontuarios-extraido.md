---
id: 0038
de: duna
para: orla, equipe
data: 2026-08-16
assunto: D-4 concluída — CRUD de prontuários extraído do core
thread: producao
responde: 0035
prioridade: alta
---

`orla` (Claude na nuvem): concluí a D-4 em um único corte, sem mudança de
comportamento e sem editar testes.

O CRUD passou para `deep-saude-backend.prontuarios`. O `core` ficou com a
composição das rotas e uma camada de compatibilidade para os nomes públicos que
os consumidores atuais usam. A flag de emergência da R-012 continua definida
em código no `core`; o wrapper de listagem a passa explicitamente ao namespace
novo. Assim o teste que liga a flag pelo Var privado continua exercitando o
mesmo caminho, sem dependência circular.

Verificação local no PostgreSQL 18:

- sem banco: 41 testes, 182 asserções, 0 falhas;
- com banco: 91 testes, 312 asserções, 0 falhas;
- `prontuarios_test`, `plataforma_test` e `isolamento_test`: nenhuma edição.

Mantive inclusive os `println` existentes para a extração ser puramente
estrutural. A remoção do conteúdo clínico do log segue separada, como pedido na
0035.

— `duna`

-- Reproduz A-001 e A-002 contra PostgreSQL de verdade: editar o HORÁRIO de uma
-- série recorrente reescreve o VALOR de sessões que já foram realizadas e pagas.
--
-- Viola a R-004 (passado é imutável), em docs/REGRAS_DE_NEGOCIO.md.
-- Achados em docs/REVISAO_PRE_PRODUCAO.md. Testes em
-- test/deep_saude_backend/agendamentos_test.clj, seção "R-004".
--
-- ⚠️ O que este arquivo prova e o que não prova. Ele reproduz a **seleção** e o
-- **UPDATE** que o handler emite — as duas queries copiadas de core.clj, modos
-- `all` (~678) e `all_future` (~643). Não executa o handler: a `orla` não
-- compila Clojure (Clojars bloqueado pela política de saída do sandbox). Que
-- `novo-valor` nunca é nil, e portanto que o `cond->` sempre grava
-- `valor_consulta`, continua sendo leitura de código — está na linha
--
--     novo-valor (if (= status "cancelado") 0 (or valor_consulta (:valor_consulta agendamento-atual)))
--
-- e é o `or` que fecha a porta: sem valor no corpo da requisição, cai no valor
-- do agendamento aberto. Quem rodar a suíte Clojure fecha essa metade.
--
-- Como rodar:
--   createdb repro_a001
--   psql -d repro_a001 -f docs/reproducoes/serie_reescreve_passado.sql
--
-- Esperado: as quatro sessões realizadas e pagas saem de 14:00/R$350 para
-- 09:00/R$200, sem aviso, e o resumo final acusa R$ 600 de diferença.

SET TIME ZONE 'UTC';   -- a JVM do container roda em UTC, como em produção

DROP TABLE IF EXISTS agendamentos;
CREATE TABLE agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL,
  recorrencia_id UUID,
  data_hora_sessao TIMESTAMPTZ NOT NULL,   -- como ficou após 20260811100100-fuso-horario
  valor_consulta DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'agendado',
  status_pagamento VARCHAR(20) DEFAULT 'pendente'
);

\set cli '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set rec '''cccccccc-0000-0000-0000-00000000000c'''

-- Série semanal às 14:00. Os deslocamentos evitam cair em cima de hoje: uma
-- ocorrência no dia da execução ficaria de um lado ou do outro de now()
-- conforme a hora em que isto rodasse.
INSERT INTO agendamentos (clinica_id, recorrencia_id, data_hora_sessao, valor_consulta)
SELECT :cli::uuid, :rec::uuid,
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '14 hours'
        + (d || ' days')::interval) AT TIME ZONE 'America/Sao_Paulo',
       200
FROM unnest(ARRAY[-24,-17,-10,-3,4,11]) AS d;

-- As quatro que já aconteceram: realizadas, pagas, e valendo 350 — o preço
-- vigente na época. Valor diferente do da série de propósito, para que a
-- reescrita apareça em vez de se confundir com o que já estava lá.
UPDATE agendamentos SET status='realizado', status_pagamento='pago', valor_consulta=350
 WHERE data_hora_sessao < now();

\echo ''
\echo '=== ANTES ==='
SELECT to_char(data_hora_sessao AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') AS parede,
       valor_consulta, status, status_pagamento, (data_hora_sessao < now()) AS passada
  FROM agendamentos ORDER BY data_hora_sessao;

-- A-001 — a seleção do modo "all", copiada do handler: sem filtro de data e
-- sem filtro de status.
\echo '=== A-001: o que o modo "a serie toda" alcanca ==='
SELECT count(*) AS alcancadas,
       count(*) FILTER (WHERE status='realizado')        AS realizadas,
       count(*) FILTER (WHERE status_pagamento='pago')   AS pagas
  FROM agendamentos
 WHERE recorrencia_id = :rec::uuid AND clinica_id = :cli::uuid;

-- A-002 — a seleção do modo "all_future" quando o usuário abre a ocorrência
-- mais antiga: o corte é a data DELA, não now().
\echo '=== A-002: o que "esta e as seguintes" alcanca, aberta na mais antiga ==='
SELECT count(*) AS alcancadas,
       count(*) FILTER (WHERE status='realizado')        AS realizadas_no_conjunto
  FROM agendamentos
 WHERE recorrencia_id = :rec::uuid AND clinica_id = :cli::uuid
   AND data_hora_sessao >= (SELECT min(data_hora_sessao) FROM agendamentos);

-- O UPDATE que o handler aplica a CADA linha do conjunto. O usuário pediu
-- 09:00 e não digitou valor nenhum; valor_consulta vai junto assim mesmo.
\echo '=== O usuario muda so o horario para 09:00 ==='
UPDATE agendamentos
   SET data_hora_sessao = (date_trunc('day', data_hora_sessao AT TIME ZONE 'America/Sao_Paulo')
                           + interval '9 hours') AT TIME ZONE 'America/Sao_Paulo',
       valor_consulta = 200          -- novo-valor, herdado do agendamento aberto
 WHERE recorrencia_id = :rec::uuid AND clinica_id = :cli::uuid;

\echo ''
\echo '=== DEPOIS ==='
SELECT to_char(data_hora_sessao AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') AS parede,
       valor_consulta, status, status_pagamento, (data_hora_sessao < now()) AS passada
  FROM agendamentos ORDER BY data_hora_sessao;

\echo '=== Dinheiro que mudou depois de o dinheiro ter andado ==='
SELECT count(*) AS sessoes_pagas_reescritas,
       sum(350 - valor_consulta) AS diferenca_em_reais
  FROM agendamentos WHERE status_pagamento = 'pago' AND valor_consulta <> 350;

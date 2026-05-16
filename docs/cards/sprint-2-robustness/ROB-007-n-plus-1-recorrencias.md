# [ROB-007] Eliminar N+1 em updates de recorrências

**Severidade:** 🟡 Medium
**Sprint:** 2
**Esforço:** M (meio dia)
**Área:** Backend
**Status:** TODO

## Contexto

Quando um agendamento recorrente é atualizado com `mode = "all_future"`, o handler busca todos os agendamentos futuros da série e roda um `UPDATE` individual para cada um:

```clojure
(doall (map (fn [appt]
              (sql/update! @datasource :agendamentos update-map {:id (:id appt)}))
            agendamentos-futuros))
```

Para uma série de 50 sessões semanais (1 ano), são 50 round-trips ao DB. Em latência típica (5-20ms por query), isso é 250ms-1s por mutation. Em CockroachDB Cloud com latência maior, vira segundos.

## Localização

[deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj:577-603](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L577-L603) e padrão similar em outros handlers de recorrência.

## Solução proposta

### Opção A — single UPDATE com WHERE in (...)

Se `update-map` é o mesmo para todos os agendamentos da série, é uma única query:

```clojure
(let [ids (mapv :id agendamentos-futuros)
      placeholders (str/join "," (repeat (count ids) "?"))
      sql (str "UPDATE agendamentos SET "
               (str/join ", " (for [[k v] update-map] (str (name k) " = ?")))
               " WHERE id IN (" placeholders ")")]
  (execute-query! (into [sql] (concat (vals update-map) ids))))
```

### Opção B — UPDATE filtrado por recorrencia_id

Ainda melhor: filtrar pela própria recorrência sem precisar listar IDs:

```clojure
(execute-query!
  ["UPDATE agendamentos
    SET data_hora_sessao = data_hora_sessao + ? * INTERVAL '1 minute',
        valor_consulta = ?,
        ...
    WHERE recorrencia_id = ?
      AND data_hora_sessao >= ?
      AND status = 'agendado'"
   delta-minutos valor-consulta recorrencia-id agora]))
```

Funciona se a atualização for relativa (ex: empurrar 30min) ou se todos os campos forem iguais. Não funciona se cada appointment tiver delta diferente — nesse caso, voltar pra Opção A.

### Outras N+1s a auditar no mesmo card

Procurar padrões `(map ... sql/update!)` ou `(doseq ... sql/insert!)`:

```bash
grep -n "doseq\|doall.*map.*sql/" deep-saude-plataforma-api/deep-saude-backend/src/**/*.clj
```

Potenciais candidatos:
- Criação de série recorrente (criar N agendamentos) — usar `sql/insert-multi!`
- Bloqueios de horário em série

### Para `INSERT` em lote: `insert-multi!`

```clojure
(sql/insert-multi! @datasource :agendamentos
  [:clinica_id :psicologo_id :paciente_id :data_hora_sessao :duracao :recorrencia_id]
  (for [data datas]
    [clinica-id psi-id pac-id data 50 rec-id]))
```

Uma query, N rows. Muito mais rápido que N inserts.

## Critérios de aceitação

- [ ] Update de "all_future" usa uma única query (Opção A ou B)
- [ ] Criação de série recorrente usa `insert-multi!`
- [ ] Bench: atualizar série de 50 agendamentos leva <100ms (era ~1s)
- [ ] Smoke test: edição em "all_future" continua funcionando corretamente

## Riscos / dependências

- **Atenção:** Opção A monta SQL dinamicamente. Garantir que `update-map` tem chaves whitelisted (não vindas direto do body), pra evitar SQL injection. Validar antes ([ROB-003](ROB-003-validacao-input.md) ajuda).
- Pode ser feito depois de ROB-003 (que normaliza os bodies).

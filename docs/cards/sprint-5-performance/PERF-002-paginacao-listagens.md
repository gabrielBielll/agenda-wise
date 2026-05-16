# [PERF-002] Paginação em listagens (agendamentos, prontuários, pacientes)

**Severidade:** 🟠 High
**Sprint:** 5
**Esforço:** M (meio dia)
**Área:** Backend / Frontend
**Status:** TODO

## Contexto

Os handlers de listagem devolvem **tudo da clínica** sem `LIMIT`/`OFFSET` nem cursor. Para uma clínica com 5 anos de histórico, `GET /api/agendamentos` pode trazer 50k+ rows em um único JSON. Resultado:

- Backend: alocação grande, GC pressure, JDBC streaming não usado
- Rede: payloads MB+ por request
- Frontend: parse + render trava UI; React Query/SWR sem cache (ver [PERF-004](PERF-004-react-query-cache-http.md))

Mesmo com índices ([PERF-001](PERF-001-indices-banco.md)), retornar 50k rows é desperdício na maioria dos casos — o calendário só renderiza uma janela.

## Localização

- [core.clj:820-851](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L820-L851) — `listar-agendamentos-handler`
- [core.clj:1086-1093](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L1086-L1093) — `listar-prontuarios-handler`
- [core.clj:~370](../../../deep-saude-plataforma-api/deep-saude-backend/src/deep_saude_backend/core.clj#L370) — `listar-pacientes-handler`
- Bloqueios e usuários têm o mesmo padrão

## Solução proposta

### Padrão 1 — paginação por janela (calendar-like)

Para o calendário, a janela é a unidade natural: mês visível, semana visível. Forçar query param obrigatório:

```clojure
;; GET /api/agendamentos?from=2026-05-01&to=2026-05-31
(defn listar-agendamentos-handler [request]
  (let [from (parse-iso-required (get-in request [:params :from]))
        to   (parse-iso-required (get-in request [:params :to]))]
    (when (> (.toEpochMilli (.toInstant to))
             (+ (.toEpochMilli (.toInstant from))
                (* 90 24 60 60 1000)))
      (throw (ex-info "Janela máxima de 90 dias" {:status 400})))
    (execute-query!
      ["SELECT ... FROM agendamentos
        WHERE clinica_id = ?
          AND data_hora_sessao BETWEEN ? AND ?
        ORDER BY data_hora_sessao DESC"
       clinica-id from to])))
```

Frontend manda apenas a janela que está renderizando.

### Padrão 2 — paginação cursor-based (lista paginável)

Para listas que não têm janela natural (prontuários por paciente, histórico financeiro):

```clojure
;; GET /api/prontuarios?paciente_id=X&cursor=<base64>&limit=50
(let [limit (min 100 (or (parse-long (:limit params)) 50))
      cursor-row (when-let [c (:cursor params)] (decode-cursor c))]
  (execute-query!
    ["SELECT id, data_registro, ... FROM prontuarios
      WHERE clinica_id = ? AND paciente_id = ?
        AND (?::timestamptz IS NULL OR (data_registro, id) < (?, ?))
      ORDER BY data_registro DESC, id DESC
      LIMIT ?"
     clinica-id paciente-id
     (:data cursor-row) (:data cursor-row) (:id cursor-row)
     (inc limit)]))
```

O cursor é `base64(data_registro || id)` da última row da página anterior. Mais robusto que `OFFSET` (não pula rows quando há inserção concorrente) e usa o índice composto direto.

### Padrão 3 — paginação offset (admin tabular)

Para dashboards admin com paginação visual (1..N páginas), `LIMIT/OFFSET` é aceitável até ~10k rows. Acima disso degrada.

```clojure
;; GET /api/admin/pacientes?page=1&page_size=20
(let [page (max 1 (or (parse-long (:page params)) 1))
      size (min 100 (or (parse-long (:page_size params)) 20))
      offset (* (dec page) size)]
  {:items (execute-query! ["SELECT ... LIMIT ? OFFSET ?" size offset])
   :total (execute-one!   ["SELECT COUNT(*) AS c FROM ..."])
   :page page
   :page_size size})
```

### Response shape padronizado

```json
{
  "items": [...],
  "next_cursor": "eyJkIjoiMjAyNi0wNS0wMSIsImkiOiIuLi4ifQ==",
  "has_more": true
}
```

Para janela de calendário, sem cursor; só `items`.

### Frontend

- Calendar: usar `searchParams` (App Router) para `from`/`to` derivados da view atual
- Lista de prontuários: hook `usePaginatedList(fetchFn)` com botão "carregar mais"
- Admin tables: componente `<DataTable>` com paginação visual

## Critérios de aceitação

- [ ] `listar-agendamentos` exige `from`/`to`, máximo 90 dias
- [ ] `listar-prontuarios` paginado por cursor, default 50, máx 100
- [ ] `listar-pacientes` paginado (cursor ou offset), default 50
- [ ] Cards admin (financeiro, usuários) paginados
- [ ] Frontend não pede listas inteiras nunca mais
- [ ] Bench: listar 1 mês de agendamentos (~200 rows) <100ms end-to-end

## Riscos / dependências

- **Breaking change:** chamadas atuais sem `from`/`to` vão quebrar. Pode-se ter fallback ("últimos 30 dias") por uma sprint para migrar gradualmente — depois remover.
- **Cursor encoding:** garantir base64url (sem `+`/`/` na URL).
- **Dependência:** [PERF-001](PERF-001-indices-banco.md) — sem índices a paginação ajuda menos.
- **Conversa com:** [PERF-004](PERF-004-react-query-cache-http.md) — paginação combina com cache HTTP por chave da janela.

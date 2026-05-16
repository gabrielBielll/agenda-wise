# [ROB-006] Proteção contra duplo clique em mutations

**Severidade:** 🟡 Medium
**Sprint:** 2
**Esforço:** M (meio dia)
**Área:** Frontend / Backend
**Status:** TODO

## Contexto

Botões de submit no frontend hoje confiam no `pending` do `useFormState` para evitar re-submits. Em rede lenta, há um intervalo entre o clique e a chegada do `pending = true` em que o usuário consegue clicar de novo. Resultado: pode criar dois agendamentos idênticos, dois pacientes, etc.

## Localização

[deep-saude-plataforma-front-end/src/app/(app)/calendar/CalendarClient.tsx:88-92](../../../deep-saude-plataforma-front-end/src/app/(app)/calendar/CalendarClient.tsx) e padrão similar em todos os SubmitButton.

## Solução proposta

Defesa em duas camadas: cliente (UX) + servidor (correctness).

### Camada 1 — cliente: disable imediato + flag manual

```typescript
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (formData: FormData) => {
  if (isSubmitting) return;       // guard imediato
  setIsSubmitting(true);
  try {
    await action(formData);
  } finally {
    setIsSubmitting(false);
  }
};

<button type="submit" disabled={isSubmitting}>...</button>
```

Ou criar um hook reutilizável:

```typescript
// src/hooks/useGuardedAction.ts
export function useGuardedAction<T extends (...args: any[]) => Promise<any>>(action: T) {
  const [pending, setPending] = useState(false);
  const wrapped = useCallback(async (...args: Parameters<T>) => {
    if (pending) return;
    setPending(true);
    try { return await action(...args); }
    finally { setPending(false); }
  }, [action, pending]) as T;
  return [wrapped, pending] as const;
}
```

### Camada 2 — servidor: idempotency key

Para operações importantes (criar agendamento, criar paciente), aceitar header `Idempotency-Key`:

```clojure
;; tabela: idempotency_keys (key uuid PK, response_body jsonb, created_at timestamp)

(defn wrap-idempotency [handler]
  (fn [request]
    (if-let [key (get-in request [:headers "idempotency-key"])]
      (if-let [cached (execute-one! ["SELECT response_body FROM idempotency_keys WHERE key = ?" key])]
        {:status 200 :body (:response_body cached)}
        (let [response (handler request)]
          (execute-one! ["INSERT INTO idempotency_keys (key, response_body) VALUES (?, ?)"
                          key (:body response)])
          response))
      (handler request))))
```

Frontend gera UUID e envia no header:

```typescript
const idempotencyKey = crypto.randomUUID();
await callBackend("/api/agendamentos", {
  method: "POST",
  body: JSON.stringify(data),
  headers: { "Idempotency-Key": idempotencyKey },
});
```

Limpeza: cronjob que apaga keys > 24h ([OPS-003](../sprint-3-production/OPS-003-cronjob-sincronizacao.md)).

### Escopo realista

- Camada 1 (cliente): aplicar em todos os SubmitButton — relativamente rápido
- Camada 2 (servidor): aplicar só em operações mais sensíveis (criar agendamento, criar paciente, provisionar clínica) — opcional pro MVP, recomendado pré-launch

## Critérios de aceitação

- [ ] Hook ou componente `<GuardedSubmit>` reutilizável criado
- [ ] Aplicado em todas as forms de criação/edição (calendar, patients, financeiro)
- [ ] Smoke test: clicar 5x rápido no botão criar agendamento → cria apenas 1
- [ ] (Opcional) `wrap-idempotency` aplicado em POSTs críticos

## Riscos / dependências

- **Atenção:** o `disabled` deve refletir TANTO o flag manual QUANTO o `pending` do useFormState — não substituir, sobrepor.
- Camada 2 conversa com [ROB-005](ROB-005-timeouts-retry-fetch.md): retry de mutation seguro só se o backend honra idempotency key.

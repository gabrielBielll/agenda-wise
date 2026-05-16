# [QUA-003] Error boundary global no Next.js

**Severidade:** 🟡 Medium
**Sprint:** 4
**Esforço:** S (≤2h)
**Área:** Frontend
**Status:** TODO

## Contexto

Hoje, o único arquivo `error.tsx` está em `admin/dashboard/`. Nenhum outro segmento da app tem boundary. Resultado: qualquer erro não-tratado em componente do React produz tela em branco para o usuário, com a única opção de F5.

Next.js App Router suporta `error.tsx` em cada nível de layout. Conventionalmente:

- `app/error.tsx` — boundary global
- `app/(app)/error.tsx` — boundary para área autenticada
- `app/(app)/calendar/error.tsx` — boundary específico (opcional)

## Solução proposta

### Passo 1 — `app/error.tsx` (global)

```typescript
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md p-6 text-center">
          <h1 className="text-2xl font-bold">Algo deu errado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Encontramos um erro inesperado. Tente novamente em instantes.
          </p>
          {process.env.NODE_ENV === "development" && (
            <pre className="mt-4 overflow-auto rounded bg-muted p-2 text-left text-xs">
              {error.message}
            </pre>
          )}
          <div className="mt-4 flex gap-2 justify-center">
            <button onClick={reset} className="...">Tentar novamente</button>
            <a href="/" className="...">Voltar ao início</a>
          </div>
        </div>
      </body>
    </html>
  );
}
```

Note: `error.tsx` no root precisa retornar `<html><body>` próprios (não usa layout).

### Passo 2 — `app/(app)/error.tsx`

Mais específico, dentro da app autenticada:

```typescript
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import * as Sentry from "@sentry/nextjs";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">Algo deu errado nesta página</h2>
      <p className="text-sm text-muted-foreground">
        Tente recarregar ou volte ao dashboard.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" asChild>
          <a href="/dashboard">Dashboard</a>
        </Button>
      </div>
    </div>
  );
}
```

### Passo 3 — `app/(app)/error.tsx` para "not found"

Next 14+ também aceita `not-found.tsx`:

```typescript
// app/not-found.tsx
export default function NotFound() {
  return (
    <div className="...">
      <h2>Página não encontrada</h2>
      <a href="/">Voltar</a>
    </div>
  );
}
```

### Passo 4 — Suspense + loading

Aproveitar pra adicionar `app/loading.tsx`, `app/(app)/loading.tsx`:

```typescript
import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin" />
    </div>
  );
}
```

Substitui o `LoadingOverlay` global por skeletons por rota — UX melhor.

### Passo 5 — testar

```typescript
// componente teste:
"use client";
import { useEffect } from "react";
export default function Page() {
  useEffect(() => { throw new Error("teste"); }, []);
  return null;
}
```

Acessar → ver error boundary triggerar. Limpar depois.

## Critérios de aceitação

- [ ] `app/error.tsx` existe com fallback global e captura no Sentry
- [ ] `app/(app)/error.tsx` existe pra contexto autenticado
- [ ] `app/not-found.tsx` existe
- [ ] Erros são automaticamente capturados no Sentry quando boundary triggera
- [ ] Smoke test: forçar erro num componente → boundary mostra UI amigável

## Riscos / dependências

- **Dependência:** [OPS-002](../sprint-3-production/OPS-002-sentry-observabilidade.md) — `Sentry.captureException` requer Sentry instalado.
- **Atenção:** error boundaries só capturam erros em renderização e effects, NÃO em event handlers async. Pra esses, manter `try/catch` explícito + toast.

# [PERF-005] Code-splitting e tree-shaking do bundle do frontend

**Severidade:** 🟠 High
**Sprint:** 5
**Esforço:** M (meio dia)
**Área:** Frontend
**Status:** TODO

## Contexto

O `package.json` lista várias libs que, se forem para o bundle do client, pesam o First Load JS desnecessariamente:

| Lib | Tamanho gzip aprox. | Onde devia rodar |
|---|---|---|
| `firebase` | ~50 KB (modular; pode ir a 200KB com auth+firestore) | Só onde Firebase é usado (lazy) |
| `googleapis` | ~100 KB (na verdade enorme; é Node-only) | **NUNCA no client** — server-only |
| `@genkit-ai/googleai`, `genkit` | ~80 KB | Só em API route / Server Action |
| `recharts` | ~50 KB | Lazy só na página `patients/[id]` (MoodChart) |
| `date-fns` | 2-40 KB dependendo de tree-shake | Importar funções específicas |
| `jwt-decode` | ~2 KB | Já pequeno, ok |

Suspeita: `googleapis` está sendo bundled no client (Webpack inclui se algum arquivo em `src/app/**` que vira client-component importa, mesmo indiretamente).

## Localização

- [`src/ai/genkit.ts`](../../../deep-saude-plataforma-front-end/src/ai/genkit.ts) — só pode ser importado de Server Actions / API routes
- [`src/app/api/calendar/events/route.ts`](../../../deep-saude-plataforma-front-end/src/app/api/calendar/events/route.ts) — `googleapis` aqui é ok (route handler)
- `src/app/(app)/patients/[patientId]/MoodChart.tsx` — provavelmente importa `recharts` direto
- Vários componentes importam `import { format, parseISO, ... } from 'date-fns'` — checar

## Solução proposta

### Passo 1 — auditar o bundle

```bash
# 1) Habilitar bundle analyzer
npm i -D @next/bundle-analyzer

# 2) next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer(nextConfig);

# 3) Rodar
ANALYZE=true npm run build
```

Abre relatório em `.next/analyze/`. Identificar os top 10 maiores chunks no `client.html`.

### Passo 2 — proibir `googleapis` e `genkit` no client

Estratégia: marcar como `serverComponentsExternalPackages` no `next.config.ts`:

```typescript
experimental: {
  serverComponentsExternalPackages: ['googleapis', 'google-auth-library', '@genkit-ai/googleai'],
}
```

E garantir que esses módulos só são importados em arquivos que **não** começam com `'use client'`. Adicionar ESLint rule (`no-restricted-imports`):

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["googleapis", "googleapis/*", "@genkit-ai/*", "genkit"],
        "message": "Use apenas em Server Actions / route handlers, nunca em client components."
      }]
    }]
  }
}
```

E habilitar a regra apenas em `src/**/*.client.{ts,tsx}` — depende de naming. Mais simples: adicionar `'server-only'` package nos arquivos:

```bash
npm i server-only
```

```typescript
// src/ai/genkit.ts
import 'server-only';
import { genkit } from 'genkit';
// ...
```

Se algum client component importar, o build quebra (descobre na hora).

### Passo 3 — lazy load do `recharts`

```typescript
// MoodChart.tsx
'use client';
import dynamic from 'next/dynamic';

const LazyMoodChart = dynamic(() => import('./MoodChartInner'), {
  loading: () => <Skeleton className="h-64 w-full" />,
  ssr: false, // recharts não precisa de SSR
});

export default LazyMoodChart;
```

Mover o componente real para `MoodChartInner.tsx`. O bundle base não carrega recharts; só quem abre a aba.

### Passo 4 — lazy load do `firebase`

Se Firebase é usado só em fluxo específico (notificações? upload? auth?), criar wrapper lazy:

```typescript
// src/lib/firebase-lazy.ts
export async function getFirebaseApp() {
  const { initializeApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  // ...
  return { app, auth };
}
```

Usar com `await getFirebaseApp()` dentro de event handlers, não no top-level.

Se Firebase não for usado no client de fato (talvez só `firebase-admin` server-side), **remover do bundle**.

### Passo 5 — `date-fns` tree-shake

Já é tree-shaken na v3 se import for nominal:

```typescript
// bom
import { format, parseISO } from 'date-fns';

// ruim — quebra tree-shake
import * as dateFns from 'date-fns';
```

Auditar com:

```bash
grep -r "import \* as.*date-fns\|import .*from 'date-fns'$" deep-saude-plataforma-front-end/src
```

### Passo 6 — `next/font` em vez de `<link>` Google Fonts

(Pequeno, mas FOUT/CLS):

```typescript
// src/app/layout.tsx
import { Playfair_Display, Montserrat } from 'next/font/google';

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-playfair' });
const mont = Montserrat({ subsets: ['latin'], variable: '--font-mont' });

// no <html>:
<html className={`${playfair.variable} ${mont.variable}`}>
```

Remover `<link rel="preconnect">` e `<link href="fonts.googleapis.com">`.

## Critérios de aceitação

- [ ] Bundle analyzer rodado e relatório arquivado em `docs/reports/`
- [ ] `googleapis`, `genkit`, `@genkit-ai/*` marcados como `server-only` (não aparecem no client bundle)
- [ ] `recharts` carregado via `dynamic()` em `MoodChart`
- [ ] Firebase: ou lazy-loaded em event handlers, ou removido se não for usado no client
- [ ] `date-fns` importado nominalmente em todos os arquivos
- [ ] `next/font` substitui `<link>` manual de Google Fonts
- [ ] First Load JS na rota `/dashboard` reduz pelo menos 30%

## Riscos / dependências

- **Quebrar coisa:** mover `recharts` para dynamic pode mudar timing de render — confirmar charts ainda renderizam corretamente.
- **`server-only` + barrel files:** se Server Components reusam helpers compartilhados, garantir que helper não importa libs server-only quando rodando em client.
- **Conversa com:** [PERF-006](PERF-006-suspense-streaming.md) — `dynamic()` casa bem com Suspense.
- **Bonus:** ativar `compress: true` no Next config se ainda não está (default em standalone é ok).

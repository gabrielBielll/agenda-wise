# [PERF-008] Remover `ignoreBuildErrors` e `ignoreDuringBuilds` do Next

**Severidade:** 🟠 High
**Sprint:** 5
**Esforço:** L (1-2 dias) — depende do volume de erros que aparecerem
**Área:** Frontend
**Status:** TODO

## Contexto

[`next.config.ts:5-10`](../../../deep-saude-plataforma-front-end/next.config.ts#L5-L10) tem:

```typescript
typescript: { ignoreBuildErrors: true },
eslint:     { ignoreDuringBuilds: true },
```

Estes flags **silenciam** type-errors e lint-errors no build de produção. Bugs reais (refs `undefined`, `any` propagado, imports quebrados) viram `TypeError` em runtime para o usuário em vez de barrar o deploy.

Não é "performance" no sentido estrito de latência — é **performance percebida**: usuário batendo em runtime error tem performance zero. Também é fundação para confiar em CI/CD ([OPS-006](../sprint-3-production/OPS-006-ci-cd.md)).

Provavelmente os flags foram ligados durante desenvolvimento acelerado e nunca foram revisitados. Esforço alto **só se houver muitos erros acumulados** — pode ser menor que parece.

## Localização

[`next.config.ts:5-10`](../../../deep-saude-plataforma-front-end/next.config.ts#L5-L10).

Tipo de erros esperados (com base em [QUA-001](../sprint-4-quality/QUA-001-eliminar-any.md) que cita ~95 usos de `as any`):
- Tipagem fraca em respostas de API
- Props opcionais usadas como obrigatórias
- Imports não-usados
- React hooks rules

## Solução proposta

### Passo 1 — auditar o tamanho do problema

```bash
cd deep-saude-plataforma-front-end
npm run typecheck 2>&1 | tee typecheck-baseline.txt
npx next lint 2>&1 | tee lint-baseline.txt
```

Conta-se quantos erros. Se for <50, dá pra resolver tudo num dia. Se for 200+, fazer em ondas.

### Passo 2 — começar com type-check em modo "warning"

Estratégia incremental: criar `tsconfig.strict.json` que herda do existente e habilita aos poucos.

Ou mais pragmático: rodar `tsc --noEmit` em CI como **gate separado** mas não ainda bloqueante. Só depois de zerar, ativar no `next build`.

### Passo 3 — categorizar e atacar

Tipos de erros que tendem a aparecer:

1. **`any` implícito** — adicionar tipo explícito ou usar `unknown` + validação
2. **`as any` propagado** — virá de [QUA-001](../sprint-4-quality/QUA-001-eliminar-any.md), tratar junto
3. **Props ausentes** — adicionar `?` se opcional ou exigir
4. **`Object is possibly undefined`** — narrow type com early return ou `!` se invariante garantido
5. **Module not found / wrong path** — refactor que ficou inconsistente

### Passo 4 — ESLint

```bash
npx next lint --fix
```

Auto-fix resolve a maioria (formatação, imports não usados). Restante revisar manualmente.

Adicionar `.eslintignore` para arquivos gerados (`.next/`, `node_modules/`, `*.generated.ts`).

### Passo 5 — desativar flags e ligar em CI

```typescript
// next.config.ts (final)
const nextConfig: NextConfig = {
  // typescript e eslint removidos — defaults estritos
  output: 'standalone',
  // ...
};
```

E CI ([OPS-006](../sprint-3-production/OPS-006-ci-cd.md)):

```yaml
- run: npm run typecheck
- run: npx next lint --max-warnings 0
- run: npm run build
```

### Estratégia se for muito grande para resolver de uma vez

Manter os flags por enquanto, mas:

```typescript
typescript: {
  // só permite ignorar em PR explicitamente; CI roda tsc à parte
  ignoreBuildErrors: process.env.CI !== 'true',
},
```

Combinado com CI que roda `tsc --noEmit` (falha o pipeline mesmo que build não falhe).

## Critérios de aceitação

- [ ] `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` removidos do `next.config.ts`
- [ ] `npm run typecheck` passa limpo
- [ ] `npx next lint --max-warnings 0` passa limpo
- [ ] `npm run build` falha em type-error / lint-error
- [ ] CI roda os 3 comandos acima como gate de merge

## Riscos / dependências

- **Tamanho desconhecido:** pode aparecer um número intratável de erros. Nesse caso, fazer cleanup como [QUA-001](../sprint-4-quality/QUA-001-eliminar-any.md) primeiro e voltar.
- **Não fazer cherry-pick de `// @ts-ignore`:** evite espalhar `@ts-expect-error` para "passar limpo". Cada uso deve ter comentário explicando.
- **Conversa com:** [QUA-001](../sprint-4-quality/QUA-001-eliminar-any.md) — quase certo que dependem entre si.
- **Conversa com:** [OPS-006](../sprint-3-production/OPS-006-ci-cd.md) — CI sem este gate não previne regressão.

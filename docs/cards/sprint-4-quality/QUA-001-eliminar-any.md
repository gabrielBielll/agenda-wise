# [QUA-001] Eliminar usos de `as any` no frontend

**Severidade:** 🟢 Low
**Sprint:** 4
**Esforço:** XL (>2 dias)
**Área:** Frontend
**Status:** TODO

## Contexto

O frontend tem `"strict": true` no `tsconfig.json` mas isso é minado por ~95 ocorrências de `as any` espalhadas pelo código (e variantes como `(session as any).backendToken`).

`as any` é um escape hatch que diz "confie em mim". Hoje, esconde:
- Tipos não modelados (ex: `session.backendToken` que nem existe na tipagem padrão do NextAuth)
- Mismatches entre o que o backend retorna e o que o frontend espera
- Refactors incompletos onde alguém pulou a parte do TypeScript

Eliminar `any` melhora:
- Refatoração mais segura (compilador reclama)
- IntelliSense funciona
- Bugs viram erros de compile, não de runtime

## Solução proposta

### Passo 1 — encontrar todos os `as any`

```bash
grep -rn "as any\|: any" deep-saude-plataforma-front-end/src/ \
  | grep -v "node_modules" \
  > docs/QUA-001-any-occurrences.txt
```

### Passo 2 — categorizar

A maioria provavelmente cai em 3 buckets:

#### Bucket A — extender tipos do NextAuth

Para `(session as any).backendToken`, `(token as any).clinicaId`:

Criar `src/types/next-auth.d.ts`:

```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: "admin_clinica" | "psicologo" | "secretaria";
      clinicaId: string;
    };
    // backendToken removido daqui após SEC-008
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin_clinica" | "psicologo" | "secretaria";
    clinicaId: string;
    backendToken: string;  // só server-side, não vai pro session
  }
}
```

Aí `session.user.role` é tipado sem `as any`.

#### Bucket B — responses do backend

Para `const data = await res.json() as any`:

Criar `src/types/backend.ts` com schemas de resposta:

```typescript
export type Paciente = {
  id: string;
  nome: string;
  email: string | null;
  // ...
};

export type Agendamento = {
  id: string;
  paciente_id: string;
  data_hora_sessao: string;  // ISO datetime
  duracao: number;
  status: "agendado" | "realizado" | "cancelado";
  // ...
};

export type Prontuario = { /* ... */ };
```

Validar runtime com Zod (relacionado a [ROB-003](../sprint-2-robustness/ROB-003-validacao-input.md)):

```typescript
import { z } from "zod";

const PacienteSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().email().nullable(),
});

export type Paciente = z.infer<typeof PacienteSchema>;
```

E no client:
```typescript
const data = PacienteSchema.parse(await res.json());
```

#### Bucket C — bibliotecas mal tipadas

Para libs sem types, `npm i -D @types/<lib>` ou criar `*.d.ts` próprio.

### Passo 3 — eliminar gradualmente, não tudo de uma vez

Esse é um card grande. Sugestão: aplicar a regra em PRs separadas:

1. Bucket A primeiro (NextAuth) — ~30 ocorrências, fix unificado
2. Bucket B por feature (calendar, patients, financeiro)
3. Bucket C ad-hoc

Adicionar lint rule no fim para prevenir reintrodução:

`.eslintrc.json`:
```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

## Critérios de aceitação

- [ ] Tipagem do NextAuth estendida em `next-auth.d.ts`
- [ ] Tipos de response do backend em `src/types/backend.ts`
- [ ] `grep -rn "as any" src/` retorna < 10 ocorrências (idealmente 0)
- [ ] Lint rule `no-explicit-any` ativada e CI passa

## Riscos / dependências

- **Esforço alto.** Pode ser fatiado em vários PRs e feito incrementalmente pós-launch.
- **Conversa com:** [ROB-003](../sprint-2-robustness/ROB-003-validacao-input.md) — schemas Zod no frontend podem espelhar schemas malli do backend.
- **Não-bloqueador para prod.** Mas se o backlog de fixes for grande, refatoração paga juros compostos.

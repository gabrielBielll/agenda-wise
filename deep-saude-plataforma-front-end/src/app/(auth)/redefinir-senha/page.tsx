import { RedefinirSenhaForm } from './RedefinirSenhaForm';

/**
 * MÓDULO A — redefinição de senha a partir do link do e-mail.
 *
 * Server Component só para LER o `token` do `searchParams` e repassá-lo ao form
 * cliente. Em Next 15 `searchParams` é uma Promise (mesmo padrão de
 * `app/google/retorno/page.tsx`) — daí o `await`. Ler o token no servidor evita
 * o `useSearchParams()`, que quebra o `next build` nas telas prerenderizadas
 * (ver o comentário longo em `src/app/page.tsx`).
 */
export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <RedefinirSenhaForm token={token ?? ''} />;
}

'use server';

/**
 * MÓDULO A — solicitação de recuperação de senha.
 *
 * 🔴 Server action, nunca do navegador. `/api/auth/recuperar` é caminho ABSOLUTO
 * do backend (`NEXT_PUBLIC_API_URL`, a MESMA base que o `authorize` do NextAuth
 * usa). Chamá-lo como `/api/auth/*` relativo cairia na rota local do NextAuth
 * (`app/api/auth/[...nextauth]`), não no backend.
 *
 * 🔴 A propriedade que importa aqui é NÃO revelar se a conta existe. Por isso:
 *   - a mensagem é FIXA e genérica, definida aqui — não vem da resposta;
 *   - falha de rede/infra devolve a MESMA mensagem. Um texto diferente no erro
 *     seria um oráculo: "esse e-mail existe" vs "esse não". O backend já responde
 *     sempre 200 genérico; o front reforça a mesma neutralidade.
 */
const MENSAGEM_GENERICA =
  'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha. Verifique sua caixa de entrada (e o spam).';

export async function recuperarSenha(
  email: string,
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/recuperar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });
  } catch (error) {
    // Engolido de propósito: qualquer diferença visível entre sucesso e falha
    // vazaria informação. Registra no servidor para diagnóstico, não na tela.
    console.error('Erro ao solicitar recuperação de senha:', error);
  }

  return { ok: true, mensagem: MENSAGEM_GENERICA };
}

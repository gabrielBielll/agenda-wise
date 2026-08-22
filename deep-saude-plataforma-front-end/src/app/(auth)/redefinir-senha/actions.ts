'use server';

/**
 * MÓDULO A — efetivação da nova senha.
 *
 * 🔴 Server action, base ABSOLUTA do backend (`NEXT_PUBLIC_API_URL`, a mesma do
 * `authorize`). Como caminho relativo, `/api/auth/redefinir` colidiria com a rota
 * local do NextAuth.
 *
 * Devolve um resultado DISCRIMINADO para a tela poder dar a frase certa:
 *   - `ok: true`                  → 200, senha trocada;
 *   - `code: 'token_invalido'`    → 400, link expirado/já usado;
 *   - `code: 'senha_curta'`       → 422, senha abaixo do mínimo do backend;
 *   - `ok: false` sem code        → rede/5xx/resposta inesperada.
 *
 * 📌 O mínimo de tamanho é regra do BACKEND — não o duplicamos aqui com um número
 * chutado. A tela faz só as checagens que não dependem do backend (vazio e
 * confirmação divergente); o `senha_curta` é a palavra final do servidor.
 */
type ResultadoRedefinir =
  | { ok: true }
  | { ok: false; code?: 'token_invalido' | 'senha_curta' };

export async function redefinirSenha(
  token: string,
  novaSenha: string,
): Promise<ResultadoRedefinir> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/redefinir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, nova_senha: novaSenha }),
      cache: 'no-store',
    });

    if (res.ok) return { ok: true };

    let codeLido: string | undefined;
    try {
      codeLido = (await res.json())?.code;
    } catch {
      // corpo ausente: sem code, a tela usa a mensagem padrão de falha.
    }
    if (codeLido === 'token_invalido' || codeLido === 'senha_curta') {
      return { ok: false, code: codeLido };
    }
    return { ok: false };
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return { ok: false };
  }
}

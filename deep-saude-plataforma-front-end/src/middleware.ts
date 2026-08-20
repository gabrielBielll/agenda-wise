
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Proteção de rotas: NEGAR POR PADRÃO.
 *
 * O desenho anterior era allowlist por prefixo — só `/admin` e
 * `['/dashboard','/calendar','/patients']` eram verificados, e qualquer caminho
 * que não casasse caía em `NextResponse.next()`. `/settings` já estava assim, e
 * o problema não era ela: era que **toda rota nova nascia desprotegida**, sem
 * ninguém precisar errar.
 *
 * Agora a lista enumera o que é público e todo o resto exige sessão.
 */

/**
 * As três portas que abrem sem token — e a lista é exaustiva de propósito.
 *
 * ⚠️ `/login` está aqui porque `src/app/login/page.tsx` é um `redirect("/")` e
 * mais nada. Sob allowlist por prefixo ela passava livre por não casar com
 * nenhum prefixo protegido; sob negar-por-padrão, exigir sessão de uma rota cujo
 * trabalho é mandar o deslogado para a tela de login fecha um laço.
 */
const ROTAS_PUBLICAS = new Set(['/', '/login', '/admin/login']);

/**
 * Rotas cuja autorização NÃO é o papel clínico — exigem sessão e mais nada aqui.
 *
 * O painel do operador da plataforma (`/plataforma`) é de outro eixo: quem
 * autoriza é a flag `plataforma_admin` do token, conferida no backend em
 * `wrap-plataforma-admin`. O papel clínico é ortogonal a isso — pela D-009 o
 * operador é um usuário normal de uma clínica normal, e "normal" inclui
 * `secretario`.
 *
 * ⚠️ Sem esta exceção o front tranca o operador antes de o backend decidir.
 * Medido em 2026-08-15: sessão de operador com papel `secretario` levava
 * 307 → `/`, enquanto a mesma sessão recebia 200 em `/api/plataforma/metricas`.
 * O front negava o que a API autorizava.
 *
 * Isto NÃO afrouxa o negar-por-padrão: rota daqui continua exigindo sessão e
 * `backendToken` válido. O que ela não faz é opinar sobre um eixo de
 * autorização que não é dela — e essa opinião, aqui, só sabia errar.
 */
const ROTAS_SEM_PAPEL_CLINICO = ['/plataforma'];

const ehRotaSemPapelClinico = (pathname: string) =>
  ROTAS_SEM_PAPEL_CLINICO.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/** A porta de login da área que o visitante tentou abrir. */
function portaDeLogin(pathname: string): string {
  return pathname.startsWith('/admin') ? '/admin/login' : '/';
}

/** A porta de login do papel de quem já está logado. */
function portaDoPapel(role?: string): string {
  return role === 'admin_clinica' ? '/admin/login' : '/';
}

// Verifica expiração do token de backend (o JWT que o Clojure aceita).
const isBackendTokenExpired = (bToken?: string) => {
    if (!bToken) return true;
    try {
        const parts = bToken.split('.');
        if (parts.length < 2) return true;
        const payload = parts[1];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''));
        const decoded = JSON.parse(jsonPayload);
        if (!decoded.exp) return true;
        // Buffer de 10s
        return (decoded.exp * 1000) < (Date.now() + 10000);
    } catch (error) {
        return true;
    }
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ROTAS_PUBLICAS.has(pathname)) {
    return NextResponse.next();
  }

  // Daqui para baixo, tudo exige sessão. Rota nova cai aqui sem ninguém fazer nada.
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const role = token?.role as string | undefined;
  const backendToken = token?.backendToken as string | undefined;

  if (!token) {
    return NextResponse.redirect(new URL(portaDeLogin(pathname), request.url));
  }

  // Sessão viva no next-auth mas inútil no backend. Impede o laço de "tenho
  // token next-auth e levo 401 em toda chamada".
  //
  // A porta é a do PAPEL, não `/admin/login` para todo mundo: psicólogo com
  // sessão vencida caía na tela de login administrativa, onde a credencial dele
  // não serve.
  if (isBackendTokenExpired(backendToken)) {
    const loginUrl = new URL(portaDoPapel(role), request.url);
    loginUrl.searchParams.set('expired', 'true');
    // O ideal aqui seria limpar o cookie de sessão, mas o middleware tem
    // limitações. O redirecionamento força o usuário a logar novamente.
    return NextResponse.redirect(loginUrl);
  }

  // Autorização de outro eixo: sessão basta, o backend decide o resto.
  if (ehRotaSemPapelClinico(pathname)) {
    return NextResponse.next();
  }

  // 1. Área administrativa (/admin/*) — só admin_clinica.
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin_clinica') {
      // Psicólogo tentando abrir o admin vai para o painel dele.
      if (role === 'psicologo') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // 2. Todo o resto — os três papéis da clínica.
  //
  // ⚠️ A-017. Esta linha exigia `psicologo` ou `admin_clinica`, e estava CERTA
  // quando foi escrita: naquele dia `papel_permissoes` estava vazia e
  // `secretario` era um papel que não podia fazer nada em lugar nenhum.
  //
  // A A-012 encheu a tabela e deu ao secretário agenda de todos os psicólogos e
  // cadastro de pacientes — e a linha ficou errada **no mesmo instante**, sem
  // ninguém tocar nela. Medido: ele era barrado em seis de seis telas, e a porta
  // de login o devolvia para a rota protegida, fechando laço.
  //
  // 📌 Nenhum teste podia ter pegado: o defeito nasceu da correção de outro.
  //
  // O que autoriza de verdade é o backend, permissão por permissão — esta lista
  // é só o portão da área. Deixar o secretário entrar e o backend recusar o que
  // não é dele é o desenho que o projeto já usa em todo o resto; o inverso, que
  // é a tela decidir, foi o que a A-011 e a SEC-005 corrigiram.
  if (role !== 'psicologo' && role !== 'admin_clinica' && role !== 'secretario') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, menos:
     * - rotas de API (/api/...), incluindo /api/auth do next-auth
     * - o runtime do Next (_next/*) — não só `_next/static` e `_next/image`:
     *   com negar-por-padrão, o HMR do `next dev` seria redirecionado e o
     *   desenvolvimento pararia de recarregar
     * - qualquer caminho com ponto (favicon.ico, .png, .webmanifest)
     *
     * Note que `/` e `/admin/login` NÃO são mais excluídas aqui: quem decide o
     * que é público é `ROTAS_PUBLICAS`, num lugar só. Duas listas para a mesma
     * pergunta é como `/login` passou despercebida.
     */
    '/((?!api|_next|.*\\..*).*)',
  ],
};

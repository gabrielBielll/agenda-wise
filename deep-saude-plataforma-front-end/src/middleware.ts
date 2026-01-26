import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'sessionToken';

function getRoleFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.role || null;
  } catch (e) {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // --- Rotas Públicas ---
  // Login principal (usado por ambos)
  // Assumindo que /admin/login é a página de login principal por enquanto
  if (pathname === '/admin/login') {
    if (sessionToken) {
      const role = getRoleFromToken(sessionToken);
      if (role === 'admin_clinica') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      } else if (role === 'psicologo') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  // --- Rotas Protegidas ---

  // 1. Área Administrativa (/admin/*)
  if (pathname.startsWith('/admin')) {
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    const role = getRoleFromToken(sessionToken);
    // Se não for admin, chuta para o dashboard dele (ou login se inválido)
    if (role !== 'admin_clinica') {
      // Se tiver outro papel válido, manda para a home desse papel
      if (role) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      // Token inválido ou sem papel
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // 2. Área do Psicólogo (App: /dashboard, /calendar, /patients)
  // Adicione aqui outras rotas raiz que pertencem ao app
  const appRoutes = ['/dashboard', '/calendar', '/patients'];
  const isAppRoute = appRoutes.some(route => pathname.startsWith(route));

  if (isAppRoute) {
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    const role = getRoleFromToken(sessionToken);
    if (role !== 'psicologo' && role !== 'admin_clinica') { // Admin talvez possa ver? Por enquanto vamos isolar.
      // Se for admin tentando acessar área de psico, manda pro admin dashboard
      if (role === 'admin_clinica') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/calendar/:path*',
    '/patients/:path*',
  ],
};

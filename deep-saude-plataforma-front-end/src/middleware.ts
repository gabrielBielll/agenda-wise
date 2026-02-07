
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas que não precisam de verificação (redundância para segurança, caso o matcher falhe)
  if (pathname === '/admin/login' || pathname === '/') {
    return NextResponse.next();
  }

  // Decodificar token usando NextAuth
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const role = token?.role as string | undefined;
  const backendToken = token?.backendToken as string | undefined;

  // REMOVIDO: Console log excessivo que causava spam no servidor
  // console.log(`[Middleware] Path: ${pathname} | Role: ${role} | Token Exists: ${!!token}`);

  // Helper para verificar expiração do token de backend
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

  // Se o token existe mas o backend token expirou, forçar logout/login
  // Isso impede loops infinitos de "tenho token next-auth mas ele é inútil no backend"
  if (token && isBackendTokenExpired(backendToken)) {
      // Redireciona para login com flag de expirado
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('expired', 'true');
      // O ideal aqui seria limpar o cookie de sessão, mas o middleware tem limitações.
      // O redirecionamento força o usuário a logar novamente.
      return NextResponse.redirect(loginUrl);
  }

  // --- Rotas Protegidas ---

  // 1. Área Administrativa (/admin/*)
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    
    // Apenas admin tem acesso total, mas podemos ter exceções ou redirecionamentos
    if (role !== 'admin_clinica') {
      // Se for psicólogo tentando acessar admin, manda pro dashboard dele
      if (role === 'psicologo') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // 2. Área do Psicólogo (App: /dashboard, /calendar, /patients)
  const appRoutes = ['/dashboard', '/calendar', '/patients'];
  const isAppRoute = appRoutes.some(route => pathname.startsWith(route));

  if (isAppRoute) {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    if (role !== 'psicologo' && role !== 'admin_clinica') { 
      if (role === 'admin_clinica') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Matcher otimizado para não rodar em:
     * - api routes (/api/...)
     * - arquivos estáticos (_next/static, _next/image, favicon.ico)
     * - página de login do admin (/admin/login)
     * - página de login principal (/)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|admin/login|$).*)',
  ],
};

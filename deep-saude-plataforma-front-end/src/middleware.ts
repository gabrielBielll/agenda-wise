import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Decodificar token usando NextAuth (suporta JWE/JWS e cookies seguros automaticamente)
  // Importante: O secret DEVE ser o mesmo usado no route.ts
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const role = token?.role as string | undefined;

  console.log(`[Middleware] Path: ${pathname} | Role: ${role} | Token Exists: ${!!token}`);

  // --- Helper to check backend token expiration ---
  const isBackendTokenExpired = (backendToken?: string) => {
      if (!backendToken) return true;
      try {
          const [, payload] = backendToken.split('.');
          if (!payload) return true;
          const decoded = JSON.parse(atob(payload));
          // exp is in seconds, Date.now() is in ms
          return (decoded.exp * 1000) < Date.now();
      } catch (error) {
          console.error("Error decoding backend token:", error);
          return true;
      }
  };

  const backendToken = token?.backendToken as string | undefined;

  // --- Rotas Públicas ---
  // Login Admin: Se já estiver logado, redireciona
  if (pathname === '/admin/login') {
    if (token) {
      if (role === 'admin_clinica') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      } else if (role === 'psicologo') {
        // PERMITIR que psicólogo acesse login de admin para poder trocar de conta se necessário
        // return NextResponse.redirect(new URL('/dashboard', request.url));
        return NextResponse.next();
      }
    }
    return NextResponse.next();
  }

  // Login Principal (/): Se já estiver logado, redireciona
  if (pathname === '/') {
    if (token) {
      if (role === 'psicologo') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } else if (role === 'admin_clinica') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  // --- Rotas Protegidas ---

  // 1. Área Administrativa (/admin/*)
  // Ignora /admin/login pois já foi tratado acima
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!token || isBackendTokenExpired(backendToken)) {
      // Create response to delete session cookie if expired? 
      // NextAuth handles session separately, but redirecting to login is a start.
      // Ideally we would trigger signOut, but in middleware we can only redirect.
      // We can append a query param ?expired=true
      const loginUrl = new URL('/admin/login', request.url);
      if (token) loginUrl.searchParams.set('expired', 'true');
      return NextResponse.redirect(loginUrl);
    }
    
    if (role !== 'admin_clinica') {
      // Se tiver outro papel válido, manda para a home desse papel
      if (role === 'psicologo') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      // Token inválido ou sem papel
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // 2. Área do Psicólogo (App: /dashboard, /calendar, /patients)
  const appRoutes = ['/dashboard', '/calendar', '/patients'];
  const isAppRoute = appRoutes.some(route => pathname.startsWith(route));

  if (isAppRoute) {
    if (!token || isBackendTokenExpired(backendToken)) {
      const loginUrl = new URL('/', request.url);
      if (token) loginUrl.searchParams.set('expired', 'true');
      return NextResponse.redirect(loginUrl); // Redireciona para Login Principal
    }
    
    if (role !== 'psicologo' && role !== 'admin_clinica') { 
      // Se for admin tentando acessar área de psico, manda pro admin dashboard
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
    '/admin/:path*',
    '/dashboard/:path*',
    '/calendar/:path*',
    '/patients/:path*',
  ],
};

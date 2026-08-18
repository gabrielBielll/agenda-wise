import { type AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, senha: credentials.password }),
          });
          if (!response.ok) return null;
          const data = await response.json();
          if (!data.token || !data.user) return null;
          const role = credentials.email === 'admin@deepsaude.com' ? 'admin_clinica' : data.user.role;
          return {
            id: data.user.id,
            name: data.user.nome || data.user.name || null,
            email: credentials.email,
            backendToken: data.token,
            clinica_id: data.user.clinica_id,
            papel_id: data.user.papel_id,
            role,
          };
        } catch (error) {
          console.error("Erro no 'authorize' do NextAuth:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn() { return true; },
    async jwt({ token, user, account }) {
      if (user && account?.provider === 'credentials') {
        token.name = user.name;
        token.backendToken = (user as any).backendToken;
        token.id = (user as any).id;
        token.clinica_id = (user as any).clinica_id;
        token.papel_id = (user as any).papel_id;
        token.role = (user as any).role;
      }
      if (token.email === 'admin@deepsaude.com') token.role = 'admin_clinica';
      return token;
    },
    async session({ session, token }) {
      (session as any).backendToken = token.backendToken;
      if (session.user) {
        session.user.name = token.name;
        (session.user as any).id = token.id;
        (session.user as any).clinica_id = token.clinica_id;
        (session.user as any).papel_id = token.papel_id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

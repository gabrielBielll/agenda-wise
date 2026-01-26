import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

/**
 * As opções de configuração do NextAuth.
 * Estamos exportando esta constante para que possamos usá-la em Server Components
 * com a função `getServerSession(authOptions)`.
 */
export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              senha: credentials.password,
            }),
          });

          if (!res.ok) {
            return null;
          }

          const data = await res.json();
          console.log("NextAuth: Login API Response", { status: res.status, hasToken: !!data.token });
          
          if (data.token && data.user) {
            console.log("NextAuth: Authorize success, returning user with token.");
            
            // --- FIX FORCE ADMIN ROLE ---
            let role = data.user.role;
            if (credentials.email === 'admin@deepsaude.com') {
               console.log("FORCE OVERRIDE: Setting role to 'admin_clinica' for admin@deepsaude.com");
               role = 'admin_clinica';
            }
            // -----------------------------

            return {
              id: data.user.id,
              email: credentials.email,
              backendToken: data.token,
              clinica_id: data.user.clinica_id,
              papel_id: data.user.papel_id,
              role: role,
            };
          }
          return null;
        } catch (error) {
          console.error("Erro no 'authorize' do NextAuth:", error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // ... existing google logic ...
      return true; 
    },
    async jwt({ token, user, account }) {
      if (user) {
        console.log("NextAuth: JWT Callback - Initial sign in");
        if (account?.provider === 'credentials') {
          token.backendToken = (user as any).backendToken;
          token.id = (user as any).id;
          token.clinica_id = (user as any).clinica_id;
          token.papel_id = (user as any).papel_id;
          token.role = (user as any).role;
        }

        // --- FIX FORCE ADMIN ROLE IN JWT ---
        if (token.email === 'admin@deepsaude.com') {
             console.log("NextAuth JWT: Forcing 'admin_clinica' for admin");
             token.role = 'admin_clinica';
        }
        // ------------------------------------
      }
      return token;
    },
    async session({ session, token }) {
      // console.log("NextAuth: Session Callback"); // Too noisy
      (session as any).backendToken = token.backendToken;
      (session.user as any).id = token.id;
      (session.user as any).clinica_id = token.clinica_id;
      (session.user as any).papel_id = token.papel_id;
      (session.user as any).role = token.role;
      return session;
    }
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

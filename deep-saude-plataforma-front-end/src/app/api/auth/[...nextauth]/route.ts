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
          if (data.token) {
            return {
              email: credentials.email,
              backendToken: data.token,
              // Adicionando os dados do usuário para passar para o callback jwt
              id: data.user_id,
              clinica_id: data.clinica_id,
              papel_id: data.papel_id,
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
    // Este callback é crucial para decidir se um login é permitido
    async signIn({ user, account, profile }) {
      // Lógica para vincular conta Google a um usuário existente
      if (account?.provider === 'google') {
        if (!profile?.email) {
          throw new Error('O perfil do Google não retornou um e-mail.');
        }
        
        // Em um cenário real, aqui chamaríamos nossa API para verificar se o usuário existe
        // Por enquanto, vamos permitir o login para simplificar.
        // const userExists = await checkUserInOurDB(profile.email);
        // if (!userExists) return false;
        
        return true; // Permite o login com Google
      }
      return true; // Permite o login com Credentials (já foi validado no 'authorize')
    },
    // O callback jwt é chamado sempre que um JSON Web Token é criado ou atualizado
    async jwt({ token, user, account }) {
      // No primeiro login, o objeto 'user' está disponível
      if (user) {
        if (account?.provider === 'credentials') {
          token.backendToken = (user as any).backendToken;
          token.id = (user as any).id;
          token.clinica_id = (user as any).clinica_id;
          token.papel_id = (user as any).papel_id;
        } else if (account?.provider === 'google') {
            // Se o login for com Google, precisaremos buscar o token do nosso backend
            // Esta lógica pode ser adicionada depois, quando o fluxo do Google estiver ativo
        }
      }
      return token;
    },
    // O callback session é chamado sempre que uma sessão é acessada no cliente
    async session({ session, token }) {
      // Passa os dados do token para o objeto da sessão,
      // tornando-os disponíveis no frontend através do hook `useSession`
      (session as any).backendToken = token.backendToken;
      (session.user as any).id = token.id;
      (session.user as any).clinica_id = token.clinica_id;
      (session.user as any).papel_id = token.papel_id;
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/', // Redireciona para a página inicial se o login for necessário
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

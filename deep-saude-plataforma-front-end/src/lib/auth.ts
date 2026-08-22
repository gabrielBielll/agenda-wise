/**
 * Configuração do NextAuth.
 *
 * Vive aqui, e não em `app/api/auth/[...nextauth]/route.ts`, porque no App
 * Router um arquivo de rota só pode exportar handlers (GET, POST, ...).
 * Exportar `authOptions` de lá quebra o build de produção — era um dos erros
 * que `typescript.ignoreBuildErrors: true` escondia.
 */
import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

/**
 * As opções de configuração do NextAuth.
 * Estamos exportando esta constante para que possamos usá-la em Server Components
 * com a função `getServerSession(authOptions)`.
 */
/**
 * 🔴 Renova o token do backend ANTES de ele expirar.
 *
 * ## O defeito que isto conserta
 *
 * O token do Clojure vive **1 hora** e, até 21/08, nunca era renovado: o
 * `authorize` guardava no login e pronto. Passada a hora, o `middleware.ts`
 * detectava a expiração e mandava para o login **em toda navegação**.
 *
 * O Gabriel relatou assim: *"eu fui logar e quando clico na agenda toda vez a
 * aplicação me faz voltar para a tela de login e aí volto e tento de novo e
 * consigo acessar a agenda"*. Não era do ambiente local — uma psicóloga num dia
 * de trabalho era derrubada de hora em hora, no meio do que estivesse fazendo.
 *
 * ⚠️ E derrubava com estrago: uma *server action* redirecionada para o login
 * devolve `undefined` ao cliente, e quem fazia `r.campo` explodia a tela. Foi o
 * `SinoDeConfirmacoes` que apareceu primeiro, por rodar em todo carregamento.
 *
 * ## Por que aqui e não no middleware
 *
 * O middleware roda no edge e não pode reescrever o cookie de sessão do
 * NextAuth. Este callback pode: ele **é** quem monta o token da sessão.
 *
 * 📌 Só renova quando falta pouco (menos de 10 min). Este callback roda a cada
 * leitura de sessão; renovar sempre viraria uma chamada ao backend por
 * requisição.
 *
 * 📌 Falha TRANSITÓRIA (rede, DNS, backend reiniciando, 5xx) devolve o token
 * ANTIGO em vez de apagar a sessão, e agora com UM retry antes de desistir: um
 * soluço de rede não deve deslogar ninguém, e o middleware ainda barra quando o
 * token de fato expirar.
 *
 * 🔴 Mas 401 do `/api/auth/renovar` é outra coisa — é o backend dizendo que a
 * sessão MORREU (o refresh não vale mais). O texto que morava aqui dizia
 * "devolve o token ANTIGO em vez de apagar a sessão" para TODA falha, e foi essa
 * generalização a causa provável do `jwt_validation_failed`: devolver o token
 * expirado num 401 apenas empurra a mesma recusa para a requisição seguinte, em
 * laço. Agora 401 devolve `undefined` — o callback `session` zera o
 * `backendToken` e o middleware (`isBackendTokenExpired`) manda para o login do
 * papel certo.
 *
 * 📌 A base de URL é a MESMA do `authorize`/login (`NEXT_PUBLIC_API_URL`):
 * renovar contra endereço diferente do que autenticou renovaria contra outro
 * backend.
 */
async function renovarSeNecessario(backendToken?: string): Promise<string | undefined> {
  if (!backendToken) return backendToken;

  let payload: { exp?: number } | undefined;
  try {
    payload = JSON.parse(
      Buffer.from(backendToken.split(".")[1], "base64").toString("utf8")
    );
  } catch {
    // Token ilegível: não dá para calcular a validade daqui. Não é um 401
    // conhecido, então NÃO apaga a sessão — deixa o middleware barrar quando ele
    // de fato expirar.
    return backendToken;
  }

  const faltam = (payload?.exp ?? 0) * 1000 - Date.now();
  // Caminho feliz: mais de 10 minutos de vida, não mexe em nada.
  if (faltam > 10 * 60 * 1000) return backendToken;

  // Mesma base do login/`authorize` (ver o comentário acima).
  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/renovar`;

  // Duas tentativas no total: UM retry para a falha transitória (rede/5xx). O
  // 401 corta o laço na hora — sessão morta não melhora insistindo.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${backendToken}` },
        cache: "no-store",
      });
    } catch {
      // Rede/DNS/backend reiniciando: pode ser soluço. Tenta de novo; se
      // esgotar, sai do laço e devolve o token atual.
      continue;
    }

    // 🔴 Sessão morta no backend: NÃO devolve o token velho (era o que
    // realimentava o jwt_validation_failed). `undefined` faz a sessão falhar.
    if (res.status === 401) return undefined;

    if (res.ok) {
      try {
        const data = await res.json();
        return data?.token ?? backendToken;
      } catch {
        // 200 sem JSON válido: não renovou, mas o token atual ainda serve.
        return backendToken;
      }
    }

    // Outro não-ok (5xx, 502 do proxy): transitório — deixa o laço retentar.
  }

  // Esgotou as tentativas por causa transitória: mantém o token atual; o
  // middleware ainda barra quando ele expirar de verdade.
  return backendToken;
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      // Escopos BÁSICOS apenas — este login serve para identificar o
      // profissional, não para acessar agenda.
      //
      // O acesso ao Google Calendar vem do token OAuth da clínica, guardado no
      // backend (ver docs/GOOGLE_CALENDAR_ARQUITETURA.md, D7). Pedir escopo de
      // calendar aqui multiplicaria por N o teto de 100 usuários do app não
      // verificado e exporia token de agenda ao ambiente do frontend.
      //
      // O valor deste login é o `email_verified`: e-mail confirmado pelo Google,
      // não digitado por alguém — é o insumo do mapeamento agenda<->psicólogo.
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "select_account",
        },
      },
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
          if (data.token && data.user) {
            return {
              id: data.user.id,
              name: data.user.nome,
              email: credentials.email,
              backendToken: data.token,
              clinica_id: data.user.clinica_id,
              papel_id: data.user.papel_id,
              role: data.user.role,
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
    async jwt({ token, user, account, profile, trigger, session }) {
      const updatedName = typeof session?.name === 'string'
        ? session.name
        : typeof session?.user?.name === 'string'
          ? session.user.name
          : undefined;
      if (trigger === 'update' && updatedName?.trim()) {
        token.name = updatedName.trim();
      }

      if (user) {
        // Login com Google: guarda o e-mail VERIFICADO. É o que permite sugerir
        // com segurança de quem é cada agenda na tela de mapeamento (spec 5.4).
        // Um e-mail não verificado não serve para isso — vincular a agenda
        // errada expõe pacientes de um profissional a outro.
        if (account?.provider === 'google') {
          const p = profile as { email?: string; email_verified?: boolean } | undefined;
          token.googleEmail = p?.email_verified ? p.email : undefined;
        }

        // ⚠️ SEC-005 — havia aqui, e no `authorize` acima, um bloco que dava papel
        // `admin_clinica` a quem entrasse com `admin@deepsaude.com`, qualquer que
        // fosse a resposta do backend. Papel decidido por string no cliente.
        //
        // O que vazava eram as TELAS e não os dados — a senha continuava conferida
        // e o `backendToken` carregava o papel real, então a API recusava. Mas a
        // A-011 vai transformar guarda de tela em guarda de verdade, e nesse dia
        // isto viraria escalada de privilégio de verdade.
        //
        // Os dois blocos tinham que sair juntos: apagar só um deixava o override
        // vivo pelo outro caminho. O papel é o que o backend respondeu, e nada mais.
        if (account?.provider === 'credentials') {
          token.backendToken = (user as any).backendToken;
          token.id = (user as any).id;
          token.clinica_id = (user as any).clinica_id;
          token.papel_id = (user as any).papel_id;
          token.role = (user as any).role;
        }

      }

      // 🔴 Fora do `if (user)` de propósito: aquele bloco só roda no LOGIN, e é
      // exatamente por isso que a sessão morria em uma hora. Aqui roda em toda
      // leitura de sessão, que é quando dá para renovar a tempo.
      token.backendToken = await renovarSeNecessario(token.backendToken as string | undefined);

      return token;
    },
    async session({ session, token }) {
      (session as any).backendToken = token.backendToken;
      if (session.user && typeof token.name === 'string') session.user.name = token.name;
      (session.user as any).id = token.id;
      (session.user as any).clinica_id = token.clinica_id;
      (session.user as any).papel_id = token.papel_id;
      (session.user as any).role = token.role;
      (session.user as any).googleEmail = token.googleEmail;
      return session;
    }
  },

  secret: process.env.NEXTAUTH_SECRET,
};

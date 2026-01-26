# Integração com Firebase

O Firebase é uma plataforma de desenvolvimento de aplicativos móveis e da web do Google. Na Deep Saúde Plataforma, o Firebase é utilizado principalmente para **autenticação**, e potencialmente para outros serviços de backend conforme o projeto evolui (como Firestore para banco de dados NoSQL, Firebase Storage para armazenamento de arquivos, etc.).

A configuração para deployment via `apphosting.yaml` também sugere que o **Firebase App Hosting** é o método de hospedagem da aplicação Next.js.

## Autenticação com NextAuth.js e Firebase

A autenticação na plataforma é gerenciada pelo [NextAuth.js](https://next-auth.js.org/), que é configurado para usar o Google como um provedor OAuth. Embora o Firebase em si ofereça soluções de autenticação (Firebase Authentication), o `src/app/api/auth/[...nextauth]/route.ts` e o uso de `SessionProvider` e `useSession` em `src/app/layout.tsx` e `src/app/page.tsx` indicam que NextAuth.js é o orquestrador principal do lado da aplicação Next.js.

O Firebase pode estar envolvido no processo de autenticação do Google da seguinte maneira:

1.  **Configuração do Provedor Google no Firebase:** O projeto Firebase associado à aplicação precisa ter o provedor de login do Google ativado e configurado com as credenciais OAuth 2.0 (Client ID e Client Secret).
2.  **Credenciais no NextAuth.js:** Essas mesmas credenciais do Google Cloud/Firebase (Client ID e Client Secret) são então usadas na configuração do provedor Google dentro do NextAuth.js (no arquivo `src/app/api/auth/[...nextauth]/route.ts`).

O fluxo de login (`signIn('google')` em `src/app/page.tsx`) redireciona o usuário para a tela de login do Google. Após a autenticação bem-sucedida, o Google redireciona de volta para a aplicação com um código ou token, que o NextAuth.js usa para estabelecer uma sessão para o usuário. Este fluxo é tipicamente para usuários finais da plataforma (ex: psicólogos, pacientes).

### Autenticação do Painel de Administração

É importante notar que o painel de administração (`/admin/*`) utiliza um mecanismo de autenticação separado, detalhado em `docs/admin-auth/login.md`. Este sistema envolve:
*   Uma tela de login em `src/app/admin/login/page.tsx`.
*   Uma Server Action (`handleLogin` em `src/app/admin/login/actions.ts`) que, na sua implementação atual (mock), define um cookie de sessão chamado `adminSessionToken`.
*   Este cookie `adminSessionToken` é o principal meio de autenticação para as rotas do painel de administração e é gerenciado independentemente das sessões do NextAuth.js.

Idealmente, a Server Action `handleLogin` para administradores poderia, em uma implementação de produção, interagir com o Firebase Authentication para verificar as credenciais do administrador e gerar um token seguro que seria então usado para criar o `adminSessionToken`. No entanto, o fluxo atual é um mock e não se integra diretamente com o Firebase Authentication nesse nível.

## Gerenciamento de Sessão

O NextAuth.js gerencia as sessões dos usuários autenticados via provedores como o Google, geralmente usando JSON Web Tokens (JWTs) armazenados em cookies seguros (`httpOnly`, `secure`).

Para o painel de administração, a sessão é gerenciada pelo cookie `adminSessionToken` configurado pela Server Action `handleLogin`. Conforme detalhado em `docs/admin-auth/login.md`, este cookie também é configurado com atributos de segurança: `httpOnly`, `secure` (em produção), `path: "/"`, `sameSite: "lax"`, e `maxAge`.

Ambos os mecanismos de sessão devem ser cuidadosamente gerenciados para garantir a segurança da aplicação.

## Configuração do Firebase no Projeto

A configuração específica do Firebase (como API Keys, Project ID, etc.) geralmente é armazenada em variáveis de ambiente. Procure por um arquivo `.env` ou `.env.local` (ou um exemplo como `.env.example`) na raiz do projeto.

As variáveis de ambiente típicas do Firebase podem incluir:

*   `FIREBASE_API_KEY`
*   `FIREBASE_AUTH_DOMAIN`
*   `FIREBASE_PROJECT_ID`
*   `FIREBASE_STORAGE_BUCKET`
*   `FIREBASE_MESSAGING_SENDER_ID`
*   `FIREBASE_APP_ID`

Essas variáveis são usadas para inicializar o SDK do Firebase na aplicação, caso haja interação direta com serviços Firebase (além da configuração de autenticação do provedor Google para o NextAuth).

O arquivo `firebase.json` (se existir) ou configurações dentro do console do Firebase definiriam regras de segurança (para Firestore, Storage), configurações de hosting, etc. O `apphosting.yaml` é específico para o Firebase App Hosting e define como o build e o deploy da aplicação Next.js são gerenciados.

## Firebase App Hosting

O arquivo `apphosting.yaml` na raiz do projeto indica que a aplicação está configurada para ser implantada usando o [Firebase App Hosting](https://firebase.google.com/docs/hosting/frameworks/nextjs). Este serviço é otimizado para hospedar aplicações web modernas, incluindo aquelas construídas com Next.js.

O `apphosting.yaml` geralmente especifica:

*   A pasta pública.
*   Comandos de build.
*   Configurações de reescrita para suportar o roteamento do Next.js.
*   Região de deploy.

O deploy é tipicamente feito usando a Firebase CLI:

```bash
firebase deploy
```

## Potenciais Usos Futuros do Firebase

Além da autenticação e hospedagem, o Firebase oferece outros serviços que podem ser integrados no futuro:

*   **Firestore:** Um banco de dados NoSQL flexível e escalável para armazenar dados da aplicação, como perfis de usuário, informações de pacientes, agendamentos, notas de sessão, etc.
*   **Firebase Storage:** Para armazenar arquivos enviados por usuários, como avatares, documentos, etc.
*   **Firebase Functions:** Para executar código backend serverless em resposta a eventos (ex: gatilhos do Firestore, chamadas HTTP).

Se esses serviços forem utilizados, a documentação específica sobre sua configuração, modelos de dados e regras de segurança deverá ser adicionada.

Para entender completamente a integração, é essencial verificar:
1. O arquivo `src/app/api/auth/[...nextauth]/route.ts` para a configuração do provedor Google.
2. Arquivos `.env` ou equivalentes para as credenciais do Firebase/Google Cloud.
3. O console do Firebase do projeto para ver quais serviços estão ativos e suas configurações.
4. O `apphosting.yaml` para detalhes do deploy.

# Troubleshooting: Problemas Comuns e Soluções

Esta seção visa ajudar a diagnosticar e resolver problemas comuns que podem surgir durante o desenvolvimento, build ou execução da Deep Saúde Plataforma.

## Problemas de Desenvolvimento Local

1.  **Erro ao iniciar o servidor de desenvolvimento (`npm run dev`)**
    *   **Sintoma:** O comando falha com mensagens de erro no console.
    *   **Causas Comuns:**
        *   **Porta em uso:** A porta `9002` (ou a porta configurada) já está sendo usada por outro processo.
            *   **Solução:** Pare o processo que está usando a porta ou altere a porta no script `dev` em `package.json` (ex: `next dev --turbopack -p 9003`).
        *   **Dependências não instaladas ou corrompidas:**
            *   **Solução:** Delete a pasta `node_modules` e o arquivo `package-lock.json` (ou `yarn.lock`) e reinstale as dependências:
                ```bash
                rm -rf node_modules package-lock.json
                npm install
                # ou para yarn:
                # rm -rf node_modules yarn.lock
                # yarn install
                ```
        *   **Problemas com Turbopack:** Embora o Turbopack seja rápido, ele ainda é experimental.
            *   **Solução:** Tente rodar sem Turbopack para ver se o problema persiste: altere o script `dev` em `package.json` para `next dev -p 9002` e tente novamente.
        *   **Variáveis de ambiente faltando ou incorretas:** Alguns recursos podem falhar ao iniciar se variáveis de ambiente cruciais (ex: para Firebase, Genkit) não estiverem definidas.
            *   **Solução:** Verifique se o arquivo `.env` (ou `.env.local`) existe e contém todas as variáveis necessárias com valores corretos. Consulte `docs/getting-started/installation.md`.

2.  **Erro ao iniciar o servidor Genkit (`npm run genkit:dev`)**
    *   **Sintoma:** O comando falha ou os fluxos não aparecem na UI do Genkit.
    *   **Causas Comuns:**
        *   **API Key do Google AI faltando ou inválida:** Genkit (com `googleAI` plugin) requer uma `GOOGLE_API_KEY` válida.
            *   **Solução:** Certifique-se de que a variável `GOOGLE_API_KEY` está definida no seu arquivo `.env` e que a chave é válida e tem acesso aos modelos Gemini.
        *   **Erro de sintaxe nos arquivos de fluxo:**
            *   **Solução:** Verifique o console para mensagens de erro específicas que apontem para arquivos em `src/ai/flows/` ou `src/ai/genkit.ts`. Corrija os erros de TypeScript ou JavaScript.
        *   **Problemas de configuração no `genkit.ts`:**
            *   **Solução:** Revise `src/ai/genkit.ts` para garantir que os plugins estão configurados corretamente.

3.  **Componentes Shadcn/UI não aparecem ou estão sem estilo**
    *   **Sintoma:** Os componentes são renderizados como HTML simples ou com estilos quebrados.
    *   **Causas Comuns:**
        *   **CSS do Tailwind não está sendo carregado:**
            *   **Solução:** Verifique se `src/app/globals.css` está sendo importado corretamente em `src/app/layout.tsx` e se as diretivas `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;` estão presentes em `globals.css`.
        *   **Configuração incorreta do `tailwind.config.ts`:** A seção `content` pode não estar incluindo os caminhos corretos para os arquivos onde as classes Tailwind são usadas.
            *   **Solução:** Verifique se `content: ['./src/**/*.{js,ts,jsx,tsx,mdx}']` (ou similar) está correto em `tailwind.config.ts`.
        *   **Variáveis CSS do tema não definidas:** Shadcn/UI depende de variáveis CSS para seu tema (cores, radius).
            *   **Solução:** Certifique-se de que as variáveis CSS (ex: `--background`, `--primary`) estão definidas em `src/app/globals.css` para os modos claro e escuro.

4.  **Autenticação com Google (NextAuth.js) não funciona**
    *   **Sintoma:** Erro ao tentar fazer login, redirecionamento incorreto, ou a sessão não é estabelecida.
    *   **Causas Comuns:**
        *   **Credenciais OAuth do Google incorretas:** `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET` estão errados ou não configurados no `.env` e, consequentemente, no `src/app/api/auth/[...nextauth]/route.ts`.
            *   **Solução:** Verifique as credenciais no Google Cloud Console e atualize o arquivo `.env`.
        *   **URI de redirecionamento não configurado no Google Cloud Console:** O Google precisa saber para qual URL redirecionar após o login.
            *   **Solução:** No Google Cloud Console, nas configurações do cliente OAuth, adicione `http://localhost:9002/api/auth/callback/google` (para desenvolvimento local) e a URL de produção correspondente aos "URIs de redirecionamento autorizados".
        *   **`NEXTAUTH_URL` não definida:** Em ambiente de desenvolvimento, NextAuth.js pode inferir isso, mas em produção é crucial.
            *   **Solução:** Defina `NEXTAUTH_URL=http://localhost:9002` no `.env` para desenvolvimento, e a URL de produção correta para o ambiente de produção.
        *   **`NEXTAUTH_SECRET` não definida:** Necessária para assinar os tokens de sessão.
            *   **Solução:** Gere uma string aleatória segura e defina-a como `NEXTAUTH_SECRET` no `.env`. (Ex: `openssl rand -base64 32`)

## Problemas de Build (`npm run build`)

1.  **Build falha com erros de TypeScript**
    *   **Sintoma:** O processo de build é interrompido por erros do compilador TypeScript.
    *   **Causas Comuns:** Erros de tipo no código.
    *   **Solução:**
        *   Analise as mensagens de erro para identificar os arquivos e linhas com problemas.
        *   Corrija os erros de tipo.
        *   Execute `npm run typecheck` (ou `tsc --noEmit`) para verificar os tipos sem fazer um build completo.
        *   O `next.config.ts` tem `typescript: { ignoreBuildErrors: true }`. Embora isso permita que o build prossiga ignorando erros de TS, é **altamente recomendável** corrigir os erros em vez de depender dessa configuração.

2.  **Build falha com erros de ESLint**
    *   **Sintoma:** O processo de build é interrompido por erros do ESLint.
    *   **Causas Comuns:** Código não segue as regras de linting definidas.
    *   **Solução:**
        *   Analise as mensagens de erro para identificar os problemas.
        *   Corrija os problemas de linting (muitos podem ser corrigidos automaticamente com `npm run lint -- --fix`).
        *   O `next.config.ts` tem `eslint: { ignoreDuringBuilds: true }`. Similarmente ao TypeScript, é melhor corrigir os erros de lint.

## Problemas de Deploy (Firebase App Hosting)

1.  **Deploy falha**
    *   **Sintoma:** O comando `firebase deploy` (ou similar) resulta em erro.
    *   **Causas Comuns:**
        *   **Configuração incorreta no `apphosting.yaml`:**
            *   **Solução:** Revise o arquivo `apphosting.yaml` para garantir que o runtime, comandos de build/start (se especificados) estão corretos.
        *   **Problemas de permissão:** A conta Firebase usada pela CLI pode não ter permissões suficientes.
            *   **Solução:** Verifique as permissões IAM no Google Cloud Console para a conta de serviço ou usuário.
        *   **Build falhando no ambiente do Firebase:** O build pode passar localmente mas falhar no ambiente de build do Firebase (ex: devido a diferenças de versão do Node.js, variáveis de ambiente não disponíveis).
            *   **Solução:** Verifique os logs de build no console do Firebase para mensagens de erro detalhadas. Certifique-se de que todas as variáveis de ambiente necessárias para o build estão configuradas no ambiente do Firebase App Hosting.

2.  **Aplicação não funciona corretamente após o deploy**
    *   **Sintoma:** A aplicação é implantada, mas apresenta erros 5xx, páginas em branco, ou funcionalidades quebradas.
    *   **Causas Comuns:**
        *   **Variáveis de ambiente não configuradas para o ambiente de produção:**
            *   **Solução:** Certifique-se de que todas as variáveis de ambiente necessárias (API keys, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, etc.) estão corretamente configuradas nas configurações do Firebase App Hosting para o backend implantado.
        *   **Configuração de domínio incorreta:**
            *   **Solução:** Verifique as configurações de domínio no Firebase Hosting.
        *   **Problemas com rotas de API ou SSR:**
            *   **Solução:** Verifique os logs da aplicação no Firebase Console (Cloud Logging) para identificar erros do lado do servidor.

## Dicas Gerais de Debugging

*   **Use o Console do Navegador:** Verifique o console de desenvolvedor do navegador (abas Console e Network) para erros de JavaScript, problemas de carregamento de recursos e respostas de API.
*   **Verifique os Logs do Servidor:** Para problemas de backend ou SSR, os logs do servidor Next.js (durante o desenvolvimento) ou os logs do Firebase (após o deploy) são essenciais.
*   **Teste APIs Isoladamente:** Use ferramentas como Postman ou `curl` para testar seus endpoints de API (incluindo aqueles que invocam fluxos Genkit) de forma isolada.
*   **Simplifique:** Se estiver enfrentando um problema complexo, tente reduzi-lo a um caso de teste mínimo para isolar a causa.

Esta lista não é exaustiva. Se encontrar um novo problema e sua solução, considere adicioná-lo a esta documentação.

# Documentação da Tela de Login Administrativo

Este documento detalha a implementação e o funcionamento da tela de login administrativo da Deep Saúde Plataforma, localizada em `src/app/admin/login/page.tsx`.

## Visão Geral

A tela de login administrativo permite que usuários com credenciais de administrador acessem o painel de controle da plataforma. Ela é responsável por coletar as credenciais do usuário (email, senha e código da clínica), validá-las e autenticar o usuário para acesso às seções administrativas.

## Estrutura do Arquivo

O componente principal da tela de login é `AdminLoginPage`, definido em `src/app/admin/login/page.tsx`.

## Tecnologias e Componentes Utilizados

*   **Next.js:** Framework React para renderização no servidor e funcionalidades de roteamento.
*   **React (Client Component):** A página é um Client Component (`"use client";`) para permitir interatividade e uso de hooks.
*   **`react-hook-form`:** Para gerenciamento de estado do formulário e validação.
*   **`zod`:** Para definir o schema de validação dos dados do formulário.
*   **Server Actions:** A lógica de login é manipulada por uma Server Action (`handleLogin`).
*   **Shadcn/UI Components:**
    *   `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`: Para estruturar visualmente o formulário de login.
    *   `Input`: Para os campos de entrada de email, senha e código da clínica.
    *   `Label`: Para associar rótulos aos campos de entrada.
    *   `Button`: Para o botão de submissão e o link "Esqueceu sua senha?".
    *   `useToast`: Para exibir notificações de sucesso ou erro.
*   **`lucide-react`:** Para ícones (ex: `Building` no cabeçalho do card).
*   **`next/navigation` (`useRouter`):** Para redirecionamento após o login bem-sucedido.

## Fluxo de Autenticação e Lógica do Componente

1.  **Schema de Validação:**
    *   Um schema `loginFormSchema` é definido usando `zod` para validar os campos:
        *   `email`: Deve ser um email válido.
        *   `password`: Deve ter no mínimo 6 caracteres.
        *   `clinicCode`: Deve ter no mínimo 3 caracteres.
    *   O tipo `LoginFormValues` é inferido a partir deste schema.

2.  **Gerenciamento de Estado do Formulário:**
    *   `useForm` (de `react-hook-form`) é utilizado para registrar os campos, manipular a submissão e integrar com o resolver do `zod` (`zodResolver`).
    *   `useFormState` (de `react-dom`) é usado para gerenciar o estado retornado pela Server Action `handleLogin`. Ele fornece `state` (com mensagens, erros e status de sucesso) e `formAction` (a função a ser chamada na submissão do formulário).
    *   `useFormStatus` (de `react-dom`) é usado no componente `SubmitButton` para desabilitar o botão e mostrar um texto de "Entrando..." enquanto a submissão está pendente.

3.  **Submissão do Formulário:**
    *   O formulário (`<form>`) tem sua prop `action` definida como `formAction` (proveniente de `useFormState`).
    *   Ao submeter, a Server Action `handleLogin` (localizada em `src/app/admin/login/actions.ts`) é invocada no servidor com os dados do formulário.

4.  **Server Action (`handleLogin`):**
    *   Localizada em `src/app/admin/login/actions.ts`.
    *   É marcada com `"use server";` para indicar que é uma Server Action.
    *   Recebe o estado anterior (`prevState: LoginFormState`) e os dados do formulário (`formData: FormData`) como argumentos.
    *   **Lógica de Autenticação (Real):**
        *   A lógica de mock foi **removida** e substituída por uma chamada de API real.
        *   A action agora usa `fetch` para enviar uma requisição `POST` para o endpoint de autenticação do backend (`/api/auth/login`), que é obtido da variável de ambiente `process.env.NEXT_PUBLIC_API_URL`.
        *   **Em caso de sucesso (resposta HTTP 200):**
            *   A API retorna um token JWT.
            *   Este token é armazenado em um cookie de sessão chamado `adminSessionToken`. O cookie é configurado com as seguintes propriedades de segurança:
                *   `httpOnly`: Não acessível por JavaScript no lado do cliente, prevenindo ataques XSS.
                *   `secure`: Enviado apenas sobre HTTPS.
                *   `path: "/"`: Disponível em todo o site.
                *   `sameSite: "lax"`: Oferece proteção contra ataques CSRF.
                *   `maxAge: 60 * 60 * 24 * 7`: Válido por 7 dias.
            *   A action retorna um estado com `success: true`.
        *   **Em caso de credenciais inválidas (resposta HTTP 401):**
            *   A action retorna `success: false` com uma mensagem de erro específica: "Credenciais inválidas. Verifique seu e-mail e senha."
        *   **Em caso de outras falhas de rede ou erros do servidor:**
            *   Um bloco `try...catch` captura exceções e retorna `success: false` com uma mensagem de erro genérica: "Não foi possível fazer login. Tente novamente mais tarde."
    *   **Estrutura de Retorno (`LoginFormState`):**
        *   `message: string`: Mensagem geral sobre o resultado da operação.
        *   `errors?: { email?: string[]; password?: string[]; clinicCode?: string[]; _form?: string[]; }`: Erros específicos por campo ou erros gerais do formulário (chave `_form`).
        *   `success: boolean`: Indica se o login foi bem-sucedido.

5.  **Feedback ao Usuário e Redirecionamento:**
    *   Um `useEffect` monitora o `state` retornado pela Server Action.
    *   **Em caso de sucesso (`state.success === true`):**
        *   Uma notificação de sucesso é exibida usando `toast()`.
        *   O usuário é redirecionado para a página `/admin/dashboard` usando `router.push()`.
    *   **Em caso de erro (`state.success === false` e `state.message` ou `state.errors` presentes):**
        *   Uma notificação de erro é exibida usando `toast()` com `variant: "destructive"`. A mensagem de erro é extraída de `state.errors._form` ou `state.message`.
        *   Erros específicos por campo (ex: `state.errors.email`) são exibidos abaixo dos respectivos campos de entrada.

6.  **Componente `SubmitButton`:**
    *   Este subcomponente usa `useFormStatus()` para acessar o estado `pending` da submissão do formulário pai.
    *   O botão é desabilitado e seu texto muda para "Entrando..." quando `pending` é `true`.

7.  **Interface do Usuário:**
    *   O formulário é apresentado dentro de um componente `Card`.
    *   O título "Login Administrativo" e uma descrição são exibidos no `CardHeader`, junto com um ícone `Building`.
    *   Cada campo de formulário (`email`, `password`, `clinicCode`) possui um `Label` e um `Input`.
    *   Mensagens de erro de validação específicas para cada campo são exibidas abaixo do campo correspondente se houver erros.
    *   Um link "Esqueceu sua senha?" está presente no `CardFooter`, embora sua funcionalidade atual seja um simples `alert`.

## Considerações de Segurança e Boas Práticas

*   **Server Actions:** A lógica de autenticação real ocorre no servidor dentro da Server Action, o que é bom para a segurança, pois o código sensível não é exposto ao cliente.
*   **Validação:** A validação é feita tanto no cliente (implicitamente pelo `react-hook-form` com `zod`, fornecendo feedback rápido) quanto no servidor (dentro da Server Action, que é a validação autoritativa).
*   **HTTPS:** É crucial que a aplicação seja servida sobre HTTPS em produção para proteger as credenciais em trânsito.
*   **Gerenciamento de Sessão:** Após o login bem-sucedido, a Server Action (ou o mecanismo de autenticação que ela usa) deve estabelecer uma sessão segura para o usuário (por exemplo, usando cookies HTTPOnly). (Este aspecto é gerenciado pelo NextAuth.js no contexto mais amplo da aplicação, mas a Server Action de login é o ponto de entrada).
*   **Proteção contra Ataques:** Considerar medidas contra ataques de força bruta (limitação de taxa), e garantir que o código da clínica adicione uma camada de segurança ou segmentação, se aplicável.

## Pontos de Extensibilidade e Melhoria

*   **Funcionalidade "Esqueci minha senha":** Implementar um fluxo completo de redefinição de senha.
*   **Autenticação de Dois Fatores (2FA):** Para maior segurança, considerar a adição de 2FA.
*   **Internacionalização (i18n):** Se a plataforma precisar suportar múltiplos idiomas, as mensagens de erro e os textos da UI devem ser internacionalizados.
*   **Testes:** Adicionar testes unitários e de integração para o formulário de login e a Server Action.

Este documento deve fornecer uma base sólida para entender a tela de login administrativo. Para detalhes específicos sobre a lógica de negócios da autenticação, consulte o arquivo `src/app/admin/login/actions.ts`.

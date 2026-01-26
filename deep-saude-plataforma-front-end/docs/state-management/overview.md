# Gerenciamento de Estado

O gerenciamento de estado em uma aplicação React/Next.js refere-se a como os dados são armazenados, acessados e modificados ao longo do ciclo de vida da aplicação e através de diferentes componentes. Na Deep Saúde Plataforma, o principal mecanismo de gerenciamento de estado global identificado é o **NextAuth.js para o estado da sessão do usuário**.

## 1. Estado da Sessão com NextAuth.js

NextAuth.js é uma solução completa de autenticação para aplicações Next.js. Além de lidar com os fluxos de login/logout, ele também gerencia o estado da sessão do usuário de forma global.

*   **`SessionProvider`**:
    *   Localização: `src/app/layout.tsx`
    *   Este provider do NextAuth.js é envolvido em torno da aplicação (`{children}`). Ele disponibiliza o estado da sessão para todos os componentes aninhados.

    ```typescript
    // src/app/layout.tsx
    'use client';

    import './globals.css';
    import { Toaster } from "@/components/ui/toaster";
    import { SessionProvider } from 'next-auth/react'; // Importação chave

    export default function RootLayout({
      children,
    }: Readonly<{
      children: React.ReactNode;
    }>) {
      return (
        <html lang="en" suppressHydrationWarning>
          {/* ... head ... */}
          <body className="font-body antialiased">
            <SessionProvider> {/* Envolve a aplicação */}
              {children}
              <Toaster />
            </SessionProvider>
          </body>
        </html>
      );
    }
    ```

*   **`useSession()` Hook**:
    *   Este hook do NextAuth.js (`next-auth/react`) pode ser usado em qualquer componente cliente (`'use client'`) para acessar o estado da sessão.
    *   Ele retorna um objeto com:
        *   `data: Session | null`: Um objeto contendo os dados da sessão do usuário (ex: nome, email, imagem, token de acesso) se o usuário estiver logado, ou `null` caso contrário.
        *   `status: "loading" | "authenticated" | "unauthenticated"`: Indica o estado atual da sessão.
    *   Exemplo de uso em `src/app/page.tsx`:

    ```typescript
    // src/app/page.tsx
    'use client';

    import { useSession, signIn } from 'next-auth/react';
    import { useRouter } from 'next/navigation';

    export default function LoginPage() {
      const router = useRouter();
      const { data: session, status } = useSession(); // Acessando o estado da sessão

      if (status === 'loading') {
        return <p>Carregando...</p>;
      }

      if (status === 'authenticated') {
        router.push('/dashboard'); // Redireciona se já estiver autenticado
        return <p>Redirecionando...</p>;
      }

      return (
        // ... JSX da página de login com botão para signIn('google')
      );
    }
    ```
    O `AppShell.tsx` e outros componentes dentro de `src/app/(app)/` provavelmente também utilizam `useSession` para exibir informações do usuário ou controlar o acesso.

## 2. Estado Local do Componente (React `useState`, `useReducer`)

Para dados que são relevantes apenas para um componente específico ou um pequeno grupo de componentes filhos, o React fornece hooks nativos para gerenciamento de estado local:

*   **`useState`**: Para estados simples (booleanos, strings, números, objetos pequenos).
    ```typescript
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    ```
*   **`useReducer`**: Para lógica de estado mais complexa que envolve múltiplas sub-operações ou quando o próximo estado depende do anterior.

É esperado que esses hooks sejam amplamente utilizados em toda a base de componentes para controlar a UI, dados de formulários temporários, etc.

## 3. Estado de Formulários com `react-hook-form`

O projeto utiliza `react-hook-form` (conforme listado em `package.json` e a presença de `src/components/ui/form.tsx` que é um componente comum do Shadcn/UI para integrar com `react-hook-form`).

*   `react-hook-form` gerencia o estado de formulários, incluindo:
    *   Valores dos campos
    *   Validação (integrado com `zod` para schemas de validação)
    *   Estado de submissão
    *   Erros de validação
*   O hook principal é `useForm()`.

    ```typescript
    // Exemplo hipotético de uso de react-hook-form
    import { useForm } from 'react-hook-form';
    import { zodResolver } from '@hookform/resolvers/zod';
    import * as z from 'zod';

    const formSchema = z.object({
      name: z.string().min(2, "Nome muito curto"),
      email: z.string().email("Email inválido"),
    });

    function MyForm() {
      const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: "", email: "" },
      });

      function onSubmit(values: z.infer<typeof formSchema>) {
        console.log(values);
      }

      return (
        <Form {...form}> {/* Componente Form do Shadcn/UI */}
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* ... Campos do formulário (FormField, FormControl, FormLabel, FormMessage) ... */}
            <Button type="submit">Enviar</Button>
          </form>
        </Form>
      );
    }
    ```

## 4. Estado de UI de Componentes (Radix UI Primitives)

Muitos dos componentes Shadcn/UI (`src/components/ui/`) são construídos sobre primitivas do Radix UI. Essas primitivas gerenciam internamente seu próprio estado de UI (ex: se um dropdown está aberto, qual aba está ativa, o valor de um slider).

*   **Exemplos:**
    *   `DropdownMenu` gerencia o estado de abertura/fechamento do menu.
    *   `Dialog` gerencia o estado de visibilidade do modal.
    *   `Tabs` gerencia qual aba está selecionada.
*   Os desenvolvedores interagem com esses estados através das props e callbacks fornecidos pelos componentes.

## 5. Estado de Notificações (Toasts)

O projeto utiliza um sistema de toasts (notificações pequenas e temporárias) através de:

*   `src/components/ui/toast.tsx` (o componente visual do toast)
*   `src/components/ui/toaster.tsx` (o container que renderiza os toasts)
*   `src/hooks/use-toast.ts` (o hook para disparar toasts)

O hook `useToast` provavelmente gerencia uma fila de toasts a serem exibidos.

```typescript
// Exemplo de uso do useToast
import { useToast } from "@/hooks/use-toast";

function MyActionButton() {
  const { toast } = useToast();

  const handleClick = () => {
    toast({
      title: "Sucesso!",
      description: "Ação completada com sucesso.",
      variant: "default", // ou "destructive"
    });
  };

  return <Button onClick={handleClick}>Realizar Ação</Button>;
}
```

## Quando Considerar Outras Soluções de Gerenciamento de Estado Global

Atualmente, o NextAuth.js parece ser suficiente para o estado global da sessão. Se a aplicação crescer em complexidade e exigir o compartilhamento de outros tipos de dados globais entre componentes não relacionados diretamente (que não podem ser facilmente passados por props), outras soluções de gerenciamento de estado global poderiam ser consideradas, como:

*   **React Context API com `useReducer`**: Para cenários de complexidade moderada.
*   **Zustand**: Uma solução de gerenciamento de estado minimalista e flexível.
*   **Redux Toolkit**: Para aplicações maiores com necessidades de estado global mais complexas.

Por enquanto, a combinação de NextAuth.js, estado local do React, `react-hook-form` e o estado interno dos componentes de UI parece ser a abordagem predominante.

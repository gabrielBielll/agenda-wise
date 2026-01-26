# Visão Geral da Estrutura de Pastas

Entender a organização das pastas e arquivos é crucial para navegar e contribuir eficientemente para o projeto Deep Saúde Plataforma. Este projeto segue uma estrutura comum para aplicações Next.js (App Router), com algumas adições específicas.

## Estrutura Principal

```
deep-saude-plataforma-front-end/
├── .idx/                   # Configurações específicas do ambiente de desenvolvimento IDX
├── .vscode/                # Configurações do VSCode para o projeto
├── docs/                   # Documentação do projeto (onde você está agora)
│   ├── api-integration/
│   ├── components/
│   ├── deployment/
│   ├── getting-started/
│   ├── introduction/
│   ├── project-structure/
│   ├── state-management/
│   ├── styling/
│   └── troubleshooting/
├── public/                 # Arquivos estáticos servidos publicamente (imagens, favicons, etc.)
│   └── favicon.ico
├── src/                    # Código fonte principal da aplicação
│   ├── ai/                 # Módulos e configurações relacionadas à Inteligência Artificial (Genkit)
│   │   ├── flows/          # Fluxos de IA (ex: session-note-insights.ts)
│   │   ├── dev.ts          # Ponto de entrada para o desenvolvimento com Genkit
│   │   └── genkit.ts       # Configuração principal do Genkit
│   ├── app/                # Estrutura do App Router do Next.js
│   │   ├── (app)/          # Rotas protegidas/que utilizam o layout principal da aplicação
│   │   │   ├── calendar/
│   │   │   ├── dashboard/
│   │   │   ├── layout.tsx  # Layout para as rotas dentro de (app)
│   │   │   ├── patients/
│   │   │   └── settings/
│   │   ├── api/            # Rotas de API (Next.js API Routes)
│   │   │   ├── auth/       # Relacionado à autenticação (ex: [...nextauth]/route.ts)
│   │   │   └── calendar/
│   │   ├── favicon.ico     # Ícone da aba do navegador (link simbólico ou cópia do de public/)
│   │   ├── globals.css     # Estilos globais da aplicação
│   │   ├── layout.tsx      # Layout raiz da aplicação
│   │   └── page.tsx        # Página inicial da aplicação (geralmente a página de login)
│   ├── components/         # Componentes React reutilizáveis
│   │   ├── layout/         # Componentes de layout (ex: AppShell.tsx)
│   │   └── ui/             # Componentes de UI (gerenciados por Shadcn/UI)
│   ├── hooks/              # Hooks React personalizados
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── lib/                # Funções utilitárias e bibliotecas auxiliares
│   │   └── utils.ts        # Funções utilitárias gerais (ex: `cn` para classnames)
├── .gitignore              # Arquivos e pastas ignorados pelo Git
├── .modified               # Arquivo usado pelo IDX para rastrear modificações
├── README.md               # README principal do repositório
├── apphosting.yaml         # Configuração para deployment no Firebase App Hosting
├── components.json         # Configuração do Shadcn/UI
├── next.config.ts          # Arquivo de configuração do Next.js
├── package-lock.json       # Lockfile do npm
├── package.json            # Metadados do projeto e dependências
├── postcss.config.mjs      # Configuração do PostCSS (usado pelo Tailwind CSS)
├── tailwind.config.ts      # Configuração do Tailwind CSS
└── tsconfig.json           # Configuração do TypeScript
```

## Descrição das Pastas Chave

*   **`docs/`**: Contém toda a documentação do projeto, incluindo este guia.
*   **`public/`**: Arquivos estáticos como imagens, fontes (se não carregadas via CDN) e `favicon.ico` são colocados aqui. Eles são acessíveis diretamente pela URL base da aplicação.
*   **`src/`**: O coração da aplicação.
    *   **`src/ai/`**:
        *   Contém toda a lógica relacionada à integração com Inteligência Artificial usando Genkit.
        *   `flows/`: Define os fluxos específicos de IA que a aplicação pode invocar.
        *   `dev.ts`: Usado para iniciar o ambiente de desenvolvimento do Genkit.
        *   `genkit.ts`: Configurações centrais do Genkit, como a inicialização de plugins e modelos.
    *   **`src/app/`**: Implementa o [App Router](https://nextjs.org/docs/app) do Next.js.
        *   **`(app)/`**: Este é um [Route Group](https://nextjs.org/docs/app/building-your-application/routing/route-groups) do Next.js. Pastas dentro de `(app)` definem rotas que compartilham o layout definido em `src/app/(app)/layout.tsx`. É comumente usado para agrupar rotas que requerem autenticação ou um layout de aplicação específico (com sidebar, header, etc.), separadas de páginas públicas como login ou landing pages.
        *   **`api/`**: Contém os [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) do Next.js, que permitem criar endpoints de API backend.
            *   `auth/[...nextauth]/route.ts`: Endpoint padrão para o NextAuth.js, que lida com as rotas de autenticação (signIn, signOut, callback, session, etc.).
        *   `layout.tsx`: O layout raiz que se aplica a todas as páginas da aplicação.
        *   `page.tsx`: A página inicial da aplicação, geralmente correspondendo à rota `/`. No caso deste projeto, é a página de login.
        *   `globals.css`: Estilos CSS globais que se aplicam a toda a aplicação.
    *   **`src/components/`**:
        *   **`layout/`**: Componentes React específicos para a estrutura visual da aplicação, como `AppShell.tsx` que provavelmente define o shell principal da interface após o login (com sidebar, header, área de conteúdo).
        *   **`ui/`**: Componentes de interface do usuário, primariamente aqueles fornecidos e customizados via [Shadcn/UI](https://ui.shadcn.com/). Estes são componentes reutilizáveis como botões, cards, inputs, etc.
    *   **`src/hooks/`**: Contém [React Hooks](https://reactjs.org/docs/hooks-intro.html) personalizados para encapsular lógica reutilizável e/ou com estado.
        *   `use-mobile.tsx`: Provavelmente um hook para detectar se o usuário está em um dispositivo móvel.
        *   `use-toast.ts`: Hook para interagir com o sistema de notificações (toasts).
    *   **`src/lib/`**:
        *   `utils.ts`: Funções utilitárias genéricas. A função `cn` é uma utilidade comum em projetos com Tailwind CSS e Shadcn/UI para mesclar classes condicionalmente.

## Arquivos de Configuração Chave

*   **`next.config.ts`**: Configurações específicas do Next.js, como redirecionamentos, reescritas, configurações de build, etc.
*   **`tailwind.config.ts`**: Configuração do Tailwind CSS, onde você define o tema (cores, fontes, espaçamentos), plugins e o conteúdo a ser escaneado para classes de utilidade.
*   **`postcss.config.mjs`**: Configuração do PostCSS, frequentemente usado com Tailwind CSS para processar o CSS.
*   **`tsconfig.json`**: Configurações do compilador TypeScript, definindo como o código TypeScript é transpilado para JavaScript.
*   **`components.json`**: Arquivo de configuração para Shadcn/UI, especificando o estilo dos componentes, o diretório de importação, etc.
*   **`apphosting.yaml`**: Arquivo de configuração para deployment no Firebase App Hosting, definindo como a aplicação Next.js deve ser construída e servida.
*   **`package.json`**: Define os metadados do projeto, scripts (como `dev`, `build`, `lint`) e gerencia as dependências do Node.js.

Compreender esta estrutura ajudará a localizar arquivos rapidamente e a entender o fluxo de dados e a organização lógica da aplicação.

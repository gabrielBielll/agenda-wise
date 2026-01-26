# Documentação do Layout do Painel de Administração

Este documento descreve a estrutura e o funcionamento do layout principal do painel de administração da Deep Saúde Plataforma, definido em `src/app/admin/layout.tsx`.

## Visão Geral

O `AdminLayout` é um componente React que envolve todas as páginas da seção administrativa (`/admin/*`). Ele fornece uma estrutura consistente contendo uma barra lateral de navegação (sidebar) e um cabeçalho (header), além de gerenciar o estado visual desses componentes, como o colapso da sidebar.

## Estrutura do Arquivo

O componente principal é `AdminLayout`, localizado em `src/app/admin/layout.tsx`. Ele é um Client Component (`"use client";`) para permitir o uso de `React.useState` para gerenciar o estado da sidebar.

## Componentes Chave do Layout

Detalhes sobre os componentes `AdminSidebar` e `AdminHeader` são cruciais para entender o painel.

1.  **`AdminSidebar` (`src/components/admin/AdminSidebar.tsx`):**
    *   **Propósito:** Exibe os links de navegação principais e secundários da seção administrativa.
    *   **Estado:**
        *   Recebe a prop `isCollapsed` (boolean, default `false`) do `AdminLayout` para controlar a exibição desktop (expandida ou apenas ícones).
        *   Usa `data-collapsed={isCollapsed}` para estilização condicional.
        *   Largura: `w-64` (expandida) ou `w-14` (colapsada, `3.5rem`).
    *   **Estrutura:**
        *   Logo/Título: "Deep Saúde" com ícone `Building`. Visível quando expandida.
        *   Links de Navegação (`mainNavLinks`, `secondaryNavLinks`):
            *   Arrays de objetos `NavLinkItem` (href, label, icon).
            *   Renderizados usando um subcomponente `NavLink`.
            *   `NavLink` usa `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` da Shadcn/UI para mostrar o `label` quando a sidebar está colapsada.
            *   O estado ativo (`isActive`) do link é determinado por `usePathname()` e estilizado de acordo (variante `default` ou `ghost` do `Button`).
        *   Botão de Logout: Ícone `LogOut`, com texto "Sair" quando expandida. Atualmente, executa um `alert`.
    *   **Responsividade (Conteúdo para Mobile - `AdminSidebarSheetContent`):**
        *   Exporta uma função `AdminSidebarSheetContent` que renderiza uma versão simplificada da sidebar, sempre expandida, para ser usada dentro do `Sheet` (menu off-canvas) no `AdminHeader` em telas mobile.
        *   Esta versão não usa tooltips e renderiza os links diretamente com ícones e texto.
    *   **Ícones:** Utiliza ícones de `lucide-react` (Home, Users, CalendarDays, DollarSign, BriefcaseMedical, Settings, LogOut, Building).
    *   **Estilo:** Classes `cn` para merging de classes Tailwind CSS, `buttonVariants` para estilizar links como botões.

2.  **`AdminHeader` (`src/components/admin/AdminHeader.tsx`):**
    *   **Propósito:** Cabeçalho da área administrativa, contendo navegação mobile, breadcrumbs (placeholder), seletor de tema e menu do usuário.
    *   **Posicionamento:**
        *   `sticky top-0 z-30`: Fixo no topo da viewport.
        *   Em telas `sm` e maiores: `sm:static sm:h-auto sm:border-0 sm:bg-transparent`, tornando-se parte do fluxo normal da página sem fundo ou borda própria, integrando-se visualmente com o conteúdo abaixo.
    *   **Componentes e Funcionalidades:**
        *   **Mobile Sidebar Toggle (`Sheet`):**
            *   Visível apenas em telas menores que `sm` (`sm:hidden`).
            *   Usa `Sheet`, `SheetTrigger` (com ícone `PanelLeft`), e `SheetContent` da Shadcn/UI.
            *   O `SheetContent` renderiza o `AdminSidebarSheetContent` importado de `AdminSidebar.tsx`.
            *   A prop `onDrawerToggle` (opcional) pode ser usada para comunicar o estado do drawer/sheet ao layout pai, se necessário.
        *   **Breadcrumbs (`BreadcrumbsPlaceholder`):**
            *   Atualmente um placeholder que mostra "Admin / Dashboard".
            *   Destinado a ser uma navegação mais dinâmica baseada na rota atual.
        *   **Theme Toggle (`ThemeToggle`):**
            *   Componente (`src/components/admin/ThemeToggle.tsx`) para alternar entre temas claro e escuro. (Detalhes deste componente não estão no escopo deste arquivo, mas sua presença é notada).
        *   **User Menu (`DropdownMenu`):**
            *   Usa `DropdownMenu`, `DropdownMenuTrigger` (com ícone `UserCircle`), `DropdownMenuContent`, etc., da Shadcn/UI.
            *   Itens de menu: "Minha Conta" (label), "Configurações", "Suporte", "Sair".
            *   As ações dos itens de menu são placeholders.
        *   **Busca (Comentada):**
            *   Há código comentado para um campo de busca com ícone `Search` e `Input`.
    *   **Estilo:** Layout flex, `border-b bg-background` para o estado fixo, `px-4 sm:px-6` para padding.

## Funcionalidades do Layout (`src/app/admin/layout.tsx`)

1.  **Estado da Sidebar Colapsável (Desktop):**
    *   O `AdminLayout` utiliza `React.useState` para gerenciar o estado `isSidebarCollapsed` (inicialmente `false`, ou seja, expandida).
    *   A função `toggleSidebar` (atualmente não conectada a nenhum controle no `AdminHeader` no código fornecido no plano, mas presente) permite alternar este estado.
    *   A margem esquerda do conteúdo principal (`<main>`) é ajustada dinamicamente usando a função `cn` (de `lib/utils.ts`) para garantir que o compilador do Tailwind CSS reconheça as classes. A lógica aplicada é: `cn("md:ml-64", isSidebarCollapsed && "md:ml-14")`. Isso aplica a margem para a sidebar expandida (`md:ml-64`) por padrão e a sobrepõe com a margem para a sidebar colapsada (`md:ml-14`) quando `isSidebarCollapsed` é `true`.
    *   A `AdminSidebar` recebe `isCollapsed` e adapta sua renderização interna (ex: mostrando apenas ícones quando `isCollapsed={true}`).

2.  **Estrutura Responsiva:**
    *   **Desktop (`md:` e acima):**
        *   A `AdminSidebar` é exibida como `md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex`. Isso a torna uma barra lateral fixa à esquerda.
        *   O conteúdo principal (`div` com a classe `md:ml-...`) se ajusta dinamicamente à largura da sidebar.
    *   **Mobile (abaixo de `md`):**
        *   A `AdminSidebar` com `className="hidden md:fixed ..."` estará oculta por padrão em telas menores que `md` devido ao `hidden`. Um mecanismo no `AdminHeader` (geralmente um botão de menu) seria necessário para torná-la visível (provavelmente como um `Sheet` ou off-canvas).
        *   O `AdminHeader` é provavelmente fixo no topo, e o `main` tem `mt-14` para evitar sobreposição.

3.  **Estilo e Tema:**
    *   O `div` raiz do layout tem a classe `flex min-h-screen w-full flex-col bg-muted/40`, definindo um layout flexível vertical que ocupa toda a altura da tela, com uma cor de fundo específica (`bg-muted/40` do Tailwind/Shadcn).
    *   O `ThemeProvider` mencionado nos comentários do arquivo original foi movido para o layout raiz (`src/app/layout.tsx`), o que é uma prática comum para garantir que o tema seja aplicado globalmente. O `AdminLayout` herda esse tema.

4.  **Conteúdo Principal (`<main>`):**
    *   O elemento `<main>` é onde o conteúdo específico de cada página administrativa (`children`) é renderizado.
    *   Possui classes para preenchimento (`p-4 sm:px-6 sm:py-0`), espaçamento (`gap-4 md:gap-8`) e margem superior em mobile (`mt-14 md:mt-0`).

## Interação entre Componentes

*   `AdminLayout` (Pai):
    *   Gerencia o estado `isSidebarCollapsed`.
    *   Passa `isSidebarCollapsed` para `AdminSidebar`.
    *   (Potencialmente) passaria `toggleSidebar` e `isSidebarCollapsed` para `AdminHeader` se um controle de colapso no header fosse desejado.
*   `AdminSidebar` (Filho):
    *   Renderiza-se de forma diferente com base na prop `isSidebarCollapsed`.
*   `AdminHeader` (Filho):
    *   (Potencialmente) conteria um botão para acionar a sidebar em mobile.
    *   (Potencialmente) conteria um botão para chamar `toggleSidebar` em desktop.

## Exemplo de Fluxo de Renderização

1.  Usuário navega para `/admin/dashboard`.
2.  Next.js identifica que esta rota está sob o `AdminLayout`.
3.  `AdminLayout` é renderizado:
    *   `AdminSidebar` é renderizada (fixa à esquerda em desktop, inicialmente expandida).
    *   `AdminHeader` é renderizado no topo.
    *   O conteúdo da página `/admin/dashboard` é renderizado dentro do elemento `<main>`.
4.  Se o usuário (em desktop) clicasse em um hipotético botão de "colapsar sidebar" no `AdminHeader` (que chamaria `toggleSidebar`):
    *   O estado `isSidebarCollapsed` em `AdminLayout` mudaria.
    *   `AdminLayout` re-renderizaria.
    *   `AdminSidebar` receberia a nova prop `isSidebarCollapsed` e se ajustaria (mostrando apenas ícones, por exemplo).
    *   O `div` do conteúdo principal ajustaria sua `md:ml-` para `md:ml-14`.

## Considerações para IA

Ao instruir uma IA para modificar o painel de administração:

*   **Especificar o componente alvo:** Se a mudança é na sidebar, referenciar `AdminSidebar.tsx`. Se for no header, `AdminHeader.tsx`. Se for no layout geral, `AdminLayout.tsx`.
*   **Contexto do estado `isSidebarCollapsed`:** A IA precisa entender que este estado controla a aparência da sidebar e o layout do conteúdo principal em desktops.
*   **Responsividade:** Lembrar à IA sobre as diferentes exibições em mobile (`hidden` para sidebar desktop, header fixo) vs. desktop (sidebar fixa, header no fluxo ou fixo).
*   **ThemeProvider:** Embora não esteja diretamente no `AdminLayout.tsx`, a IA deve saber que o tema é gerenciado globalmente.
*   **Componentes `AdminSidebar` e `AdminHeader`:** Para modificações profundas, a IA precisará do conteúdo desses arquivos para entender suas props e estrutura interna.

Este layout fornece uma base robusta e responsiva para a seção administrativa. As interações precisas da sidebar móvel e do botão de colapso da sidebar desktop dependerão das implementações detalhadas em `AdminSidebar.tsx` e `AdminHeader.tsx`.

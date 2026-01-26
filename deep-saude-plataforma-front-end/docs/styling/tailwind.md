# Estilo e Tematização com Tailwind CSS

A Deep Saúde Plataforma utiliza [Tailwind CSS](https://tailwindcss.com/) como seu principal framework para estilização. Tailwind CSS é um framework "utility-first" que fornece classes de baixo nível para construir designs customizados diretamente no HTML/JSX, sem a necessidade de escrever CSS convencional na maioria dos casos.

Shadcn/UI, a biblioteca de componentes utilizada, também é estilizada com Tailwind CSS e se integra perfeitamente a este ecossistema.

## Arquivos de Configuração Chave

1.  **`tailwind.config.ts`**:
    *   Localização: Raiz do projeto.
    *   Este é o arquivo principal de configuração do Tailwind CSS. Ele define:
        *   `darkMode`: Configurado como `['class']`, o que significa que o modo escuro é ativado/desativado adicionando/removendo a classe `dark` no elemento `<html>`.
        *   `content`: Especifica os arquivos que o Tailwind deve escanear para encontrar classes de utilidade (`./src/**/*.{js,ts,jsx,tsx,mdx}`).
        *   `theme`: A seção mais importante para customização.
            *   `extend`: Permite adicionar ou sobrescrever o tema padrão do Tailwind.
                *   `fontFamily`: Define as fontes personalizadas usadas no projeto:
                    *   `headline`: 'Playfair Display', serif
                    *   `body`: 'Montserrat', sans-serif
                    *   `code`: 'monospace'
                *   `colors`: Define a paleta de cores personalizada do projeto. As cores são definidas usando variáveis CSS HSL (Hue, Saturation, Lightness), o que é uma prática comum com Shadcn/UI para facilitar a tematização e o modo escuro.
                    *   Exemplos: `background`, `foreground`, `primary`, `secondary`, `destructive`, `card`, `popover`, `accent`, `muted`, `border`, `input`, `ring`.
                    *   Cores específicas para `chart` e `sidebar` também são definidas.
                *   `borderRadius`: Define os raios de borda (`lg`, `md`, `sm`) usando variáveis CSS (`--radius`).
                *   `keyframes` e `animation`: Define animações personalizadas (ex: `accordion-down`, `accordion-up`).
        *   `plugins`: Lista plugins do Tailwind, como `tailwindcss-animate` (usado para as animações).

2.  **`postcss.config.mjs`**:
    *   Localização: Raiz do projeto.
    *   Configura o PostCSS, um preprocessador CSS que o Tailwind utiliza por baixo dos panos. Geralmente inclui plugins como `tailwindcss` e `autoprefixer`.

3.  **`src/app/globals.css`**:
    *   Localização: `src/app/globals.css`.
    *   Este arquivo contém:
        *   Diretivas `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;` para injetar os estilos base, de componentes e utilitários do Tailwind.
        *   Definições de variáveis CSS globais, especialmente aquelas usadas pelo tema do Shadcn/UI e `tailwind.config.ts` para cores, raios de borda, etc. É aqui que os valores HSL para as cores (ex: `--background: 0 0% 100%;`) são definidos para os modos claro e escuro.
        *   Estilos globais base para elementos HTML (ex: `body`).

## Fontes

As fontes são carregadas a partir do Google Fonts no arquivo `src/app/layout.tsx`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap" rel="stylesheet" />
```

E então aplicadas através das classes de família de fontes definidas em `tailwind.config.ts` (ex: `font-headline`, `font-body`). A classe `font-body` é aplicada ao `<body>` em `src/app/layout.tsx`.

## Modo Escuro (Dark Mode)

O modo escuro é suportado e gerenciado pela adição/remoção da classe `dark` no elemento `<html>`. As cores no `tailwind.config.ts` e `globals.css` são definidas de forma a se adaptarem ao modo escuro.

*   Em `globals.css`, você encontrará definições de variáveis CSS duplicadas, uma para o modo claro (root) e outra para o modo escuro (`.dark`):

    ```css
    /* src/app/globals.css (exemplo) */
    @layer base {
      :root {
        --background: 0 0% 100%; /* Branco */
        --foreground: 222.2 84% 4.9%; /* Preto */
        /* ... outras variáveis para modo claro ... */
      }

      .dark {
        --background: 222.2 84% 4.9%; /* Preto */
        --foreground: 210 40% 98%;   /* Branco */
        /* ... outras variáveis para modo escuro ... */
      }
    }
    ```

A lógica para alternar o modo escuro (ex: através de um botão na UI) normalmente envolveria JavaScript para adicionar ou remover a classe `dark` do `document.documentElement` e persistir a preferência do usuário (ex: no `localStorage`). Um provedor de tema como `next-themes` é comumente usado para isso, mas não foi explicitamente identificado nos arquivos lidos até o momento.

## Utilitário `cn`

*   Localização: `src/lib/utils.ts`
*   O projeto utiliza uma função `cn` que combina `clsx` e `tailwind-merge`.
    *   `clsx`: Permite definir classes condicionalmente de forma concisa.
    *   `tailwind-merge`: Resolve conflitos entre classes do Tailwind de forma inteligente (ex: `p-2` e `p-4` resultam em `p-4`).

    ```typescript
    // src/lib/utils.ts
    import { clsx, type ClassValue } from "clsx"
    import { twMerge } from "tailwind-merge"

    export function cn(...inputs: ClassValue[]) {
      return twMerge(clsx(inputs))
    }
    ```

    **Exemplo de uso:**
    ```tsx
    <div className={cn("p-4 rounded-md", { "bg-blue-500": isActive }, "hover:bg-gray-100")}>
      Conteúdo
    </div>
    ```

## Práticas Recomendadas

*   **Mantenha a Consistência:** Use as cores, fontes e espaçamentos definidos no tema (`tailwind.config.ts`) sempre que possível.
*   **Evite Estilos CSS Customizados Excessivos:** Prefira usar classes de utilidade do Tailwind. Se precisar de CSS customizado, considere se pode ser alcançado com Tailwind ou se deve ser um componente bem encapsulado.
*   **Componentização:** Para padrões de UI repetidos, crie componentes React em vez de duplicar longas strings de classes Tailwind.
*   **Responsividade:** Use os prefixos responsivos do Tailwind (ex: `md:text-lg`, `sm:hidden`) para garantir que a UI se adapte a diferentes tamanhos de tela.

Ao seguir estas diretrizes e entender os arquivos de configuração, a estilização da plataforma pode ser mantida de forma consistente e eficiente.

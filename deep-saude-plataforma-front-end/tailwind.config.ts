import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // Mapeamentos semânticos compartilhados (ex.: estados da agenda) também
    // contêm classes completas. Sem esta linha o build fica verde, mas o
    // Tailwind elimina exatamente as cores centralizadas em `src/lib`.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        headline: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Montserrat', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // GC-015 — as 11 do Google. Nome com prefixo `cor-` para nao colidir com
        // `--grafite` e `--tomate`, que sao os tokens SEMANTICOS do bloqueio e da
        // sessao cancelada. Cor e semantica sao coisas diferentes: a clinica troca
        // a cor, o significado fica.
        'cor-lavanda': {
          DEFAULT: 'hsl(var(--cor-lavanda))',
          suave: 'hsl(var(--cor-lavanda-suave))',
          foreground: 'hsl(var(--cor-lavanda-foreground))',
        },
        'cor-salvia': {
          DEFAULT: 'hsl(var(--cor-salvia))',
          suave: 'hsl(var(--cor-salvia-suave))',
          foreground: 'hsl(var(--cor-salvia-foreground))',
        },
        'cor-uva': {
          DEFAULT: 'hsl(var(--cor-uva))',
          suave: 'hsl(var(--cor-uva-suave))',
          foreground: 'hsl(var(--cor-uva-foreground))',
        },
        'cor-flamingo': {
          DEFAULT: 'hsl(var(--cor-flamingo))',
          suave: 'hsl(var(--cor-flamingo-suave))',
          foreground: 'hsl(var(--cor-flamingo-foreground))',
        },
        'cor-banana': {
          DEFAULT: 'hsl(var(--cor-banana))',
          suave: 'hsl(var(--cor-banana-suave))',
          foreground: 'hsl(var(--cor-banana-foreground))',
        },
        'cor-tangerina': {
          DEFAULT: 'hsl(var(--cor-tangerina))',
          suave: 'hsl(var(--cor-tangerina-suave))',
          foreground: 'hsl(var(--cor-tangerina-foreground))',
        },
        'cor-pavao': {
          DEFAULT: 'hsl(var(--cor-pavao))',
          suave: 'hsl(var(--cor-pavao-suave))',
          foreground: 'hsl(var(--cor-pavao-foreground))',
        },
        'cor-grafite': {
          DEFAULT: 'hsl(var(--cor-grafite))',
          suave: 'hsl(var(--cor-grafite-suave))',
          foreground: 'hsl(var(--cor-grafite-foreground))',
        },
        'cor-blueberry': {
          DEFAULT: 'hsl(var(--cor-blueberry))',
          suave: 'hsl(var(--cor-blueberry-suave))',
          foreground: 'hsl(var(--cor-blueberry-foreground))',
        },
        'cor-manjericao': {
          DEFAULT: 'hsl(var(--cor-manjericao))',
          suave: 'hsl(var(--cor-manjericao-suave))',
          foreground: 'hsl(var(--cor-manjericao-foreground))',
        },
        'cor-tomate': {
          DEFAULT: 'hsl(var(--cor-tomate))',
          suave: 'hsl(var(--cor-tomate-suave))',
          foreground: 'hsl(var(--cor-tomate-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        // Grafite — bloqueio de agenda. Ver o comentário em globals.css.
        grafite: {
          DEFAULT: 'hsl(var(--grafite))',
          suave: 'hsl(var(--grafite-suave))',
          foreground: 'hsl(var(--grafite-foreground))',
          tenue: 'hsl(var(--grafite-tenue))',
        },
        // Tomate — sessão cancelada / pausa. Ver o comentário em globals.css.
        tomate: {
          DEFAULT: 'hsl(var(--tomate))',
          suave: 'hsl(var(--tomate-suave))',
          foreground: 'hsl(var(--tomate-foreground))',
        },
        agenda: {
          agendada: 'hsl(var(--agenda-agendada))',
          'agendada-suave': 'hsl(var(--agenda-agendada-suave))',
          'agendada-foreground': 'hsl(var(--agenda-agendada-foreground))',
          confirmada: 'hsl(var(--agenda-confirmada))',
          'confirmada-suave': 'hsl(var(--agenda-confirmada-suave))',
          'confirmada-foreground': 'hsl(var(--agenda-confirmada-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Aliases administrativos também apontam para tokens que invertem no tema.
        admin: {
          primary: 'hsl(var(--primary))',
          success: 'hsl(var(--success))',
          warning: 'hsl(var(--secondary))',
          danger: 'hsl(var(--destructive))',
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 7px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

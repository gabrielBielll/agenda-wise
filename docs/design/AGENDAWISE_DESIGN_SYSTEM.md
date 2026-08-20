# AgendaWise — sistema visual vivo

Este guia complementa `PADRAO_VISUAL.html` e descreve o padrão efetivamente aplicado na aplicação.

## Intenção

A interface deve transmitir calma, precisão e cuidado. O visual premium vem de espaço, hierarquia, tipografia e movimento discreto — não de excesso de efeitos.

## Papéis da paleta

Todas as cores de interface vêm dos tokens de `deep-saude-plataforma-front-end/src/app/globals.css` e precisam existir nos temas claro e escuro. Se um token novo for necessário, ele também deve ser materializado em `deep-saude-plataforma-front-end/tailwind.config.ts`.

| Papel | Token | Uso |
| --- | --- | --- |
| Ação principal | `primary` | terracota; botão forte, ação decisiva e foco |
| Apoio e navegação | `accent` | verde-sálvia; marca, item ativo e acolhimento |
| Estado saudável | `success` | sálvia de maior contraste; sincronizado, pago, normal |
| Apoio quente | `secondary` | bege; informação auxiliar e variação suave |
| Erro/ação destrutiva | `destructive` | erro, exclusão e confirmação perigosa |
| Bloqueio | `grafite` | horários indisponíveis na agenda |
| Cancelamento | `tomate` | sessão cancelada ou pausa equivalente |
| Superfície | `background`, `card`, `popover`, `muted` | camadas que invertem juntas no tema escuro |

Não usar famílias literais do Tailwind em componentes. Exemplos proibidos: `green-*`, `orange-*`, `red-*`, `gray-*`, `white` e valores hexadecimais arbitrários.

## Tipografia e hierarquia

- Títulos e números expressivos: `font-headline` (Playfair Display).
- Corpo, controles e metadados: `font-body` (Montserrat).
- Página: `page-eyebrow` + `page-title` + `page-subtitle`.
- Seção: `section-title`.
- Uma ação terracota forte por contexto; ações auxiliares usam `outline` ou `ghost`.

## Superfícies

- Cartões usam o primitivo `Card`, borda semântica e sombras `--quiet-shadow-*`.
- Vidro leve pode usar `bg-card/*` com `backdrop-blur`; nunca uma superfície branca literal.
- Campos vêm de `Input`, `Textarea` e `Select` para manter foco, raio, altura e contraste.
- Estados precisam combinar cor, texto e forma. Cor isolada não pode carregar significado.

## Movimento

- Entrada de página: `page-enter`.
- Hover de ação ou cartão: deslocamento máximo de `0.25rem`, sombra suave e 300–500 ms.
- Nada essencial depende de animação.
- `prefers-reduced-motion` reduz animações e transições globalmente.

## Responsividade

- O projeto parte de 320 px.
- Cabeçalhos empilham conteúdo e ação antes de `sm`/`md`.
- Ações principais ocupam a largura disponível no celular.
- Formulários usam uma coluna no celular e duas somente quando há espaço real.
- Tabelas largas declaram largura mínima e exibem `mobile-scroll-hint`.
- O seletor de intervalo mostra um mês no celular e dois a partir de `sm`.
- O menu administrativo vira `Sheet` abaixo de `md`; o menu clínico vira barra inferior.
- Respeitar `env(safe-area-inset-bottom)` em navegação fixa.

## Tema escuro

O tema é controlado por `next-themes`, salvo em `agenda-wise-theme` e acessível no login, app clínico, admin, plataforma e preferências. Um componente não deve precisar de uma correção literal `dark:*` para continuar legível; a inversão deve vir do token.

## Funcionalidades sem backend

Não apresentar um clique falso como funcional. Conceitos aprovados podem permanecer como prévia quando:

1. o controle fica desativado ou a tela declara claramente que é uma prévia;
2. há um comentário `TODO(nome-estavel)` no ponto da integração;
3. o comentário descreve endpoint, persistência ou autorização necessária;
4. ações sensíveis — senha, LGPD e documento clínico — nunca são simuladas.

TODOs atuais: busca global, central de lembretes, preferências persistidas, páginas de conta do admin, recuperação de senha, upload clínico seguro e criação de agendamento pelo clique no calendário admin.

## Validação antes do PR

```bash
npm run typecheck
npm run typecheck:e2e
npm run build
```

Também verificar claro e escuro em 390 px, 768 px e desktop. O fluxo de produção é PR da branch compartilhada para `prod`, CI verde e merge.

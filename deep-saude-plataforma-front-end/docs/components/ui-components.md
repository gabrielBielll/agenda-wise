# Componentes de UI (Shadcn/UI)

A Deep Saúde Plataforma utiliza [Shadcn/UI](https://ui.shadcn.com/) para sua biblioteca de componentes de interface do usuário (UI). Shadcn/UI não é uma biblioteca de componentes tradicional no sentido de ser um pacote instalado via npm. Em vez disso, você usa uma CLI para escolher e adicionar componentes individuais diretamente ao seu projeto. Esses componentes são construídos sobre o Radix UI (para acessibilidade e primitivas de UI) e estilizados com Tailwind CSS.

## Filosofia

*   **Você é o dono do código:** Os componentes são adicionados diretamente à sua base de código em `src/components/ui`. Isso significa que você tem controle total sobre eles, podendo modificá-los e estilizá-los conforme necessário.
*   **Customizáveis:** Facilmente adaptáveis ao design do seu projeto através do Tailwind CSS e variáveis CSS.
*   **Acessíveis:** Construídos sobre primitivas do Radix UI, garantindo boa acessibilidade.

## Localização dos Componentes

Os componentes de UI adicionados via Shadcn/UI estão localizados no diretório:

`src/components/ui/`

Cada componente geralmente reside em seu próprio arquivo (ex: `button.tsx`, `card.tsx`, `dialog.tsx`).

## Como Adicionar Novos Componentes Shadcn/UI

Para adicionar um novo componente da biblioteca Shadcn/UI ao projeto, você usaria a CLI do Shadcn/UI. Supondo que a CLI esteja configurada (o que é indicado pela presença do arquivo `components.json`), o comando seria algo como:

```bash
npx shadcn-ui@latest add [nome-do-componente]
```

Por exemplo, para adicionar um componente `alert`:

```bash
npx shadcn-ui@latest add alert
```

Isso copiaria o código do componente `alert` para `src/components/ui/alert.tsx`.

## Componentes Utilizados (Exemplos)

O projeto já utiliza uma variedade de componentes Shadcn/UI, como pode ser visto na estrutura de `src/components/ui/`:

*   `accordion.tsx`
*   `alert-dialog.tsx`
*   `alert.tsx`
*   `avatar.tsx`
*   `badge.tsx`
*   `button.tsx`
*   `calendar.tsx`
*   `card.tsx`
*   `chart.tsx` (provavelmente um componente customizado ou uma extensão para gráficos)
*   `checkbox.tsx`
*   `dialog.tsx`
*   `dropdown-menu.tsx`
*   `form.tsx` (integração com `react-hook-form`)
*   `input.tsx`
*   `label.tsx`
*   `menubar.tsx`
*   `popover.tsx`
*   `progress.tsx`
*   `radio-group.tsx`
*   `scroll-area.tsx`
*   `select.tsx`
*   `separator.tsx`
*   `sheet.tsx`
*   `sidebar.tsx` (pode ser um componente UI específico ou um agrupador para a sidebar)
*   `skeleton.tsx`
*   `slider.tsx`
*   `switch.tsx`
*   `table.tsx`
*   `tabs.tsx`
*   `textarea.tsx`
*   `toast.tsx` e `toaster.tsx` (para notificações)
*   `tooltip.tsx`

## Uso e Importação

Para usar um componente de UI em sua aplicação, importe-o diretamente do caminho ` "@/components/ui/[nome-do-componente]"`:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

// Exemplo de uso
const MyComponent = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Título do Card</CardTitle>
        <CardDescription>Descrição do Card</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Conteúdo do card...</p>
        <Button>Clique Aqui</Button>
      </CardContent>
    </Card>
  );
};

export default MyComponent;
```

## Customização

A customização dos componentes Shadcn/UI é feita principalmente através de:

1.  **Props:** Muitos componentes aceitam props para variar seu comportamento e aparência básica.
2.  **Classes Tailwind CSS:** Como os componentes são estilizados com Tailwind, você pode passar classes Tailwind diretamente através da prop `className` para sobrescrever ou adicionar estilos.
    ```tsx
    <Button variant="destructive" size="lg" className="mt-4">
      Botão Destrutivo Grande com Margem
    </Button>
    ```
3.  **Modificação Direta do Código:** Por você ser o dono do código do componente em `src/components/ui`, pode alterá-lo diretamente para atender a requisitos específicos.
4.  **Variáveis CSS:** O tema (cores, bordas, etc.) é gerenciado por variáveis CSS definidas em `src/app/globals.css` e configuradas em `tailwind.config.ts`. Alterar essas variáveis afetará a aparência de todos os componentes.

Consulte a [documentação oficial do Shadcn/UI](https://ui.shadcn.com/docs) para mais detalhes sobre cada componente, suas props e opções de customização. O arquivo `components.json` na raiz do projeto também contém informações sobre como o Shadcn/UI está configurado para este projeto.

# Componentes Personalizados

Além dos componentes de UI fornecidos pelo Shadcn/UI, a Deep Saúde Plataforma também utiliza componentes personalizados para encapsular funcionalidades específicas ou estruturas de layout mais complexas. Estes componentes são tipicamente encontrados em `src/components/layout` ou outras subpastas dentro de `src/components/` que não sejam `ui`.

## Principais Componentes Personalizados Identificados

### 1. `AppShell.tsx`

*   **Localização:** `src/components/layout/AppShell.tsx`
*   **Propósito:** Este componente parece ser o "esqueleto" principal da interface da aplicação para usuários autenticados. Ele provavelmente define a estrutura geral da página que inclui elementos como:
    *   Barra lateral de navegação (Sidebar)
    *   Cabeçalho (Header)
    *   Área de conteúdo principal onde as diferentes páginas/views são renderizadas.
*   **Funcionalidades Comuns em um `AppShell`:**
    *   Gerenciamento do estado de abertura/fechamento da sidebar (especialmente em telas menores).
    *   Links de navegação na sidebar e/ou header.
    *   Exibição de informações do usuário logado.
    *   Botão de logout.
    *   Possivelmente um breadcrumb ou título da página atual.
*   **Uso:** É provável que este componente seja usado no arquivo `src/app/(app)/layout.tsx` para envolver todas as rotas que fazem parte da área logada da aplicação.

    ```tsx
    // Exemplo hipotético de como AppShell poderia ser usado em src/app/(app)/layout.tsx
    import AppShell from '@/components/layout/AppShell';

    export default function AppLayout({ children }: { children: React.ReactNode }) {
      return (
        <AppShell>
          {children}
        </AppShell>
      );
    }
    ```

### 2. Componentes de Página Específicos (dentro de `src/app/(app)/...`)

Embora não sejam "componentes reutilizáveis" no sentido tradicional de serem importados em múltiplos lugares diferentes, as páginas dentro de `src/app/(app)/` (como `dashboard/page.tsx`, `calendar/page.tsx`, `patients/[id]/page.tsx`) são componentes React complexos que estruturam o conteúdo de cada rota.

*   Eles orquestram componentes de UI (`@/components/ui`) e, possivelmente, outros componentes personalizados menores para construir a interface daquela página específica.
*   Podem conter lógica de busca de dados, manipulação de estado local da página e interação com APIs.

### 3. Outros Possíveis Componentes Personalizados

Ao explorar o código, outros componentes personalizados podem ser identificados. Eles podem incluir:

*   **Formulários Complexos:** Componentes que encapsulam formulários com validação e lógica de submissão específicas (ex: formulário de cadastro de paciente, formulário de criação de agendamento).
*   **Listas e Tabelas com Funcionalidades:** Componentes que renderizam listas ou tabelas de dados com funcionalidades adicionais como paginação, filtros, ordenação.
*   **Visualizações de Dados Específicas:** Componentes criados para exibir informações de uma maneira particular (ex: um card de resumo do paciente, um item de agendamento no calendário).

## Como Documentar Novos Componentes Personalizados

Ao criar um novo componente personalizado significativo, é uma boa prática documentá-lo. A documentação deve incluir:

*   **Nome do Componente e Localização:**
*   **Propósito:** O que o componente faz? Qual problema ele resolve?
*   **Props (Propriedades):**
    *   Liste todas as props que o componente aceita.
    *   Para cada prop, especifique seu nome, tipo, se é obrigatória ou opcional, e uma breve descrição do que ela controla.
*   **Exemplo de Uso:** Um pequeno trecho de código mostrando como importar e usar o componente.
*   **Dependências:** Se o componente depende de outros componentes personalizados, hooks ou contextos específicos.
*   **Notas Adicionais:** Qualquer outra informação relevante, como comportamento específico, limitações conhecidas, ou como ele interage com o estado global.

Esta documentação pode ser adicionada diretamente como comentários no código do componente (usando JSDoc/TSDoc) e/ou nesta seção do guia.

Manter uma boa documentação para componentes personalizados é vital para a manutenibilidade do projeto, especialmente quando se trabalha em equipe ou se utiliza ferramentas de IA para auxiliar no desenvolvimento.

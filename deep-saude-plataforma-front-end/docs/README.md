# Documentação do Projeto Deep Saúde Plataforma

Bem-vindo à documentação oficial da Deep Saúde Plataforma!

Este guia tem como objetivo fornecer todas as informações necessárias para entender, configurar, executar e contribuir para o projeto. Ele é especialmente útil se você planeja usar uma IA para auxiliar na edição do código, pois fornece o contexto necessário para que a IA faça alterações de forma eficaz e segura.

## Visão Geral

A Deep Saúde Plataforma é uma aplicação web moderna construída com Next.js, TypeScript e Tailwind CSS, projetada para auxiliar profissionais de saúde no gerenciamento eficiente de seus agendamentos e no registro de informações de pacientes.

## Índice da Documentação

Para facilitar a navegação, a documentação está organizada nas seguintes seções:

1.  **[Introdução](./introduction/overview.md)**
    *   [Visão Geral do Projeto](./introduction/overview.md)
2.  **[Guia de Início Rápido](./getting-started/installation.md)**
    *   [Instalação](./getting-started/installation.md)
    *   [Executando Localmente](./getting-started/running-locally.md)
3.  **[Estrutura do Projeto](./project-structure/folder-overview.md)**
    *   [Visão Geral das Pastas](./project-structure/folder-overview.md)
4.  **[Componentes](./components/ui-components.md)**
    *   [Componentes de UI (Shadcn/UI)](./components/ui-components.md)
    *   [Componentes Personalizados](./components/custom-components.md)
5.  **[Integração com API e Backend](./api-integration/firebase.md)**
    *   [Firebase (Autenticação, etc.)](./api-integration/firebase.md)
    *   [Genkit (Funcionalidades de IA)](./api-integration/genkit.md)
6.  **[Gerenciamento de Estado](./state-management/overview.md)**
    *   [Visão Geral (NextAuth.js para Sessão)](./state-management/overview.md)
7.  **[Autenticação e Painel Admin](./admin-auth/login.md)**
    *   [Tela de Login Administrativo](./admin-auth/login.md)
    *   [Layout do Painel de Administração](./admin-auth/admin-panel.md)
8.  **[Estilo e Tematização](./styling/tailwind.md)**
    *   [Tailwind CSS](./styling/tailwind.md)
9.  **[Deployment](./deployment/apphosting.md)**
    *   [Firebase App Hosting](./deployment/apphosting.md)
10. **[Troubleshooting](./troubleshooting/common-issues.md)**
    *   [Problemas Comuns e Soluções](./troubleshooting/common-issues.md)

## Como Usar esta Documentação com uma IA

Ao solicitar modificações no código a uma IA:

1.  **Forneça o arquivo específico** que você deseja alterar.
2.  **Forneça este arquivo `docs/README.md`** (ou seções relevantes dele) para dar contexto à IA sobre a arquitetura geral, tecnologias utilizadas e convenções do projeto.
3.  Se a alteração envolver um componente específico, uma funcionalidade de API ou um fluxo de IA, **forneça também o arquivo Markdown correspondente** da seção relevante desta documentação.

Isso ajudará a IA a entender melhor o código existente, como ele se encaixa no projeto maior e a realizar alterações mais precisas, minimizando o risco de quebrar funcionalidades.

---

*Este documento é um trabalho em progresso. Sinta-se à vontade para contribuir e melhorá-lo!*

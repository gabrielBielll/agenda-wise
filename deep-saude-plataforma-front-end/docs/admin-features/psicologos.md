# Documentação da Gestão de Psicólogos

Este documento detalha a implementação do módulo de Gestão de Psicólogos no painel de administração da plataforma.

## Visão Geral

Este módulo permite aos administradores realizar operações de CRUD (Create, Read, Update, Delete) para os profissionais psicólogos cadastrados no sistema. A implementação inicial foca nas funcionalidades de **Leitura (Listagem)** e **Criação** de novos psicólogos, estabelecendo a base para as operações futuras.

---

## 1. Listagem de Psicólogos (Read)

*   **Localização:** `src/app/admin/psicologos/page.tsx`

### Implementação Técnica

*   **React Server Component (RSC):** A página foi convertida para um Componente de Servidor assíncrono. Isso significa que a busca de dados ocorre no lado do servidor antes da renderização da página, melhorando a performance e a segurança.
*   **Busca de Dados Segura:**
    *   Uma função `getPsicologos` é responsável por buscar os dados.
    *   Ela lê o token de autenticação (`adminSessionToken`) diretamente dos cookies da requisição no servidor usando `next/headers`. Isso evita a exposição do token ao cliente.
    *   Uma requisição `GET` é enviada para o endpoint da API `/api/psicologos`, incluindo o token no cabeçalho `Authorization: Bearer <token>`.
*   **Renderização Condicional:**
    *   A página trata diferentes estados:
        *   **Sucesso:** Se a API retornar uma lista de psicólogos (mesmo que vazia), uma tabela é renderizada com os dados.
        *   **Estado Vazio:** Se a lista de psicólogos estiver vazia, uma mensagem informativa é exibida na tabela, indicando que nenhum profissional foi cadastrado ainda.
        *   **Erro:** Se a chamada à API falhar, uma mensagem de erro é exibida.
*   **Interface:**
    *   A página exibe um título "Psicólogos" e um botão "Adicionar Novo" que leva ao formulário de criação.
    *   Os dados são apresentados em uma tabela (`<Table>`) com colunas para Nome, Email, CRP e Ações.

---

## 2. Criação de Psicólogos (Create)

### 2.1. Formulário de Criação (Interface)

*   **Localização:** `src/app/admin/psicologos/novo/page.tsx`

#### Implementação Técnica

*   **Componente de Cliente:** A página de formulário é um Client Component (`"use client";`) para permitir interatividade e o uso de hooks.
*   **Gerenciamento de Formulário:**
    *   **`react-hook-form`:** Utilizado para gerenciar o estado do formulário, os registros dos campos e a integração com a validação.
    *   **`useFormState`:** Hook do React para conectar o formulário à Server Action `createPsicologo`, gerenciando o estado de resposta (sucesso, erro, mensagens).
*   **Validação no Cliente:**
    *   **`zod`:** Um schema de validação é definido para garantir que os dados inseridos pelo usuário (nome, email, senha, CRP) estejam no formato correto antes do envio.
*   **Feedback ao Usuário:**
    *   **`Toasts`:** O sistema de `toast` (notificações) é usado para fornecer feedback imediato sobre o resultado da operação (sucesso ou erro) retornado pela Server Action.

### 2.2. Lógica de Criação (Server Action)

*   **Localização:** `src/app/admin/psicologos/novo/actions.ts`

#### Implementação Técnica

*   **Server Action (`createPsicologo`):**
    *   A lógica de negócio reside em uma Server Action, garantindo que o código sensível seja executado apenas no servidor.
    *   **Validação Dupla:** A action primeiro revalida os dados do formulário no servidor usando o mesmo schema `zod`, como uma camada extra de segurança.
    *   **Autenticação:** Obtém o token do administrador a partir dos cookies para autenticar a requisição à API.
    *   **Chamada à API:** Envia uma requisição `POST` para o endpoint `/api/usuarios` (ou o endpoint apropriado para criação de psicólogos) com os dados validados do novo profissional.
    *   **Revalidação da UI (Cache Invalidation):**
        *   Em caso de sucesso na criação, a action chama `revalidatePath('/admin/psicologos')`.
        *   Isso instrui o Next.js a invalidar o cache da página de listagem de psicólogos. A próxima vez que um usuário visitar essa página, os dados serão buscados novamente, garantindo que o novo psicólogo apareça na lista imediatamente.
    *   **Tratamento de Erros:** A action retorna um estado de erro se a chamada à API falhar, permitindo que a interface exiba uma mensagem apropriada.

## Status Atual e Próximos Passos

*   **Implementado:** Criação (Create) e Leitura (Read).
*   **Próximos Passos:** Implementar as funcionalidades de **Update (Editar)** e **Delete (Excluir)** para completar o ciclo CRUD.

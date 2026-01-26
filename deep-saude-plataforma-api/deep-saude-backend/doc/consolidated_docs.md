# Consolidated Documentation for AI Agent Context

This file consolidates all relevant documentation from the `deep-saude-backend` project. It is intended to provide a comprehensive context for AI agents that may need to understand the project's architecture, API, setup, and codebase details without directly navigating the source code files.

---
## From: README.md (Root)
---
# deep-saude-plataforma-api

---
## From: deep-saude-backend/CHANGELOG.md
---
# Change Log
All notable changes to this project will be documented in this file. This change log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]
### Changed
- Add a new arity to `make-widget-async` to provide a different widget shape.

## [0.1.1] - 2025-06-27
### Changed
- Documentation on how to make the widgets.

### Removed
- `make-widget-sync` - we're all async, all the time.

### Fixed
- Fixed widget maker to keep working when daylight savings switches over.

## 0.1.0 - 2025-06-27
### Added
- Files from the new template.
- Widget maker public API - `make-widget-sync`.

[Unreleased]: https://sourcehost.site/your-name/deep-saude-backend/compare/0.1.1...HEAD
[0.1.1]: https://sourcehost.site/your-name/deep-saude-backend/compare/0.1.0...0.1.1

---
## From: deep-saude-backend/README.md
---
# Backend de Gestão de Psicólogos - Plataforma Deep Saúde

## 1. Visão Geral do Projeto

Este projeto implementa o backend completo em Clojure para a funcionalidade de "Gestão de Psicólogos" da Plataforma Deep Saúde. Ele fornece uma API RESTful para criar, listar, atualizar e remover psicólogos, com controle de acesso baseado em papéis (RBAC) e isolamento de dados por clínica (multi-tenancy). O projeto é projetado para ser empacotado em uma imagem Docker para deploy na plataforma Render ou similar.

## 2. Tecnologias Utilizadas

-   **Linguagem:** Clojure (versão 1.11.1)
-   **Gerenciador de Projeto:** Leiningen
-   **Servidor Web:** Jetty (via `ring/ring-jetty-adapter`)
-   **Roteamento:** Compojure
-   **Manipulação de JSON:** `ring/ring-json`
-   **Conexão com Banco de Dados:** `next.jdbc`
-   **Driver JDBC:** PostgreSQL (para compatibilidade com CockroachDB)
-   **Variáveis de Ambiente:** `environ`
-   **Containerização:** Docker

## 3. Configuração e Execução

### 3.1. Variáveis de Ambiente Requeridas

A aplicação requer as seguintes variáveis de ambiente para ser configurada corretamente:

-   `DATABASE_URL`: A URL de conexão JDBC para o banco de dados CockroachDB (ou PostgreSQL).
    -   Exemplo: `jdbc:postgresql://user:password@host:port/database_name?sslmode=require`
-   `PORT`: A porta na qual o servidor web irá escutar. Fornecida automaticamente por plataformas como o Render (padrão interno: 3000 se não definida).

### 3.2. Executando com Docker (Recomendado para Deploy)

Consulte a seção "7. Deploy com Docker" abaixo.

### 3.3. Executando Localmente (Desenvolvimento)

1.  **Pré-requisitos:**
    *   Java JDK (versão 8 ou superior)
    *   Leiningen instalado.
    *   Um banco de dados CockroachDB ou PostgreSQL acessível.
2.  **Clone o repositório.**
3.  **Navegue até o diretório do projeto:** `cd deep-saude-backend`
4.  **Configure a `DATABASE_URL`:**
    *   Você pode definir esta variável de ambiente no seu sistema ou criar um arquivo `profiles.clj` na raiz do projeto `deep-saude-backend` com o seguinte conteúdo (não versionado):
        ```clojure
        {:dev {:env {:database-url "sua-database-url-aqui"}}}
        ```
5.  **Instale as dependências:**
    ```bash
    lein deps
    ```
6.  **Inicie o servidor:**
    ```bash
    lein ring server
    ```
    Ou, para usar a função `-main` diretamente (que também lê `PORT`):
    ```bash
    lein run
    ```
    Por padrão, o servidor iniciará na porta 3000, a menos que a variável de ambiente `PORT` esteja definida.

## 4. Estrutura do Projeto

```
deep-saude-backend/
├── project.clj         # Definições do projeto Leiningen, dependências
├── src/
│   └── deep_saude_backend/
│       └── core.clj    # Lógica principal da aplicação, handlers, rotas
├── test/
│   └── deep_saude_backend/
│       └── core_test.clj # Testes (escopo para desenvolvimento futuro)
├── doc/                # Documentação adicional (se houver)
├── resources/          # Arquivos estáticos (não utilizado neste backend)
└── README.md           # Este arquivo
```
A raiz do repositório (`../` em relação a este arquivo) também contém o `Dockerfile`.

## 5. Detalhes da API

Todas as rotas da API estão sob o prefixo `/api`.

### 5.1. Autenticação e Autorização (RBAC)

-   **Autenticação:** A API assume que um middleware Ring anterior (não implementado neste projeto) já validou um token (ex: JWT) e injetou os dados do usuário no mapa da requisição (`request`). A chave `:identity` na requisição deve conter `{:id "uuid-do-usuario", :clinica-id "uuid-da-clinica", :papel-id "uuid-do-papel"}`.
-   **Autorização:** Implementada através do middleware `wrap-checar-permissao`. Este middleware verifica se o `:papel-id` do usuário (obtido da `:identity`) possui a permissão necessária para acessar o endpoint. A verificação é feita consultando as tabelas `papel_permissoes` e `permissoes` no banco de dados. Se a permissão não for concedida, a API retorna `403 Forbidden`.

### 5.2. Endpoints

#### Psicólogos (`/api/psicologos`)

##### A. Criar um novo Psicólogo

-   **Rota:** `POST /api/psicologos`
-   **Permissão Requerida:** `gerenciar_psicologos`
-   **Corpo da Requisição (JSON):**
    ```json
    {
      "nome": "Nome do Psicólogo",
      "email": "email@example.com"
    }
    ```
-   **Lógica:**
    1.  Valida se `nome` e `email` foram fornecidos (retorna `400 Bad Request` se não).
    2.  Valida se o `email` já existe globalmente no sistema (retorna `409 Conflict`).
    3.  Verifica o `limite_psicologos` da clínica do usuário autenticado. Se o limite for atingido, retorna `422 Unprocessable Entity`.
    4.  Busca o `id` do papel "psicologo".
    5.  Insere o novo usuário (psicólogo) associado à `clinica_id` do usuário autenticado e ao papel de psicólogo.
-   **Resposta de Sucesso (`201 Created`):**
    ```json
    {
      "id": "uuid-do-novo-psicologo",
      "nome": "Nome do Psicólogo",
      "email": "email@example.com",
      "clinica_id": "uuid-da-clinica",
      "papel_id": "uuid-do-papel-psicologo"
    }
    ```
-   **Respostas de Erro:** `400`, `403`, `409`, `422`, `500`.

##### B. Listar Psicólogos da Clínica

-   **Rota:** `GET /api/psicologos`
-   **Permissão Requerida:** `visualizar_todos_agendamentos`
-   **Lógica:**
    1.  Busca o `id` do papel "psicologo".
    2.  Seleciona todos os usuários da `clinica_id` (do usuário autenticado) que tenham o `papel_id` de "psicologo".
-   **Resposta de Sucesso (`200 OK`):**
    ```json
    [
      {
        "id": "uuid-do-psicologo-1",
        "nome": "Nome Psicólogo 1",
        "email": "psico1@example.com",
        "clinica_id": "uuid-da-clinica",
        "papel_id": "uuid-do-papel-psicologo"
      },
      // ... outros psicólogos
    ]
    ```
    Retorna um array vazio se nenhum psicólogo for encontrado.
-   **Respostas de Erro:** `403`, `500`.

##### C. Atualizar um Psicólogo

-   **Rota:** `PUT /api/psicologos/:id`
    -   `:id` é o UUID do psicólogo a ser atualizado.
-   **Permissão Requerida:** `gerenciar_psicologos`
-   **Corpo da Requisição (JSON):** (Pelo menos um campo deve ser fornecido)
    ```json
    {
      "nome": "Novo Nome do Psicólogo",
      "email": "novoemail@example.com"
    }
    ```
-   **Lógica:**
    1.  Permite atualizar `nome` e/ou `email`.
    2.  Se `email` for fornecido, valida se o novo email já não está em uso por *outro* usuário (retorna `409 Conflict`).
    3.  Executa o `UPDATE` na tabela `usuarios`, garantindo que a cláusula `WHERE` inclua `id = ?` (do parâmetro da rota) E `clinica_id = ?` (do usuário autenticado).
-   **Resposta de Sucesso (`200 OK`):**
    ```json
    {
      "id": "uuid-do-psicologo-atualizado",
      "nome": "Novo Nome do Psicólogo",
      "email": "novoemail@example.com",
      "clinica_id": "uuid-da-clinica",
      "papel_id": "uuid-do-papel-psicologo"
    }
    ```
-   **Respostas de Erro:** `400`, `403`, `404 Not Found` (se o psicólogo não existir na clínica), `409`, `500`.

##### D. Remover um Psicólogo

-   **Rota:** `DELETE /api/psicologos/:id`
    -   `:id` é o UUID do psicólogo a ser removido.
-   **Permissão Requerida:** `gerenciar_psicologos`
-   **Lógica:**
    1.  Executa o `DELETE` na tabela `usuarios`, garantindo que a cláusula `WHERE` inclua `id = ?` (do parâmetro da rota) E `clinica_id = ?` (do usuário autenticado).
-   **Resposta de Sucesso (`204 No Content`):** Nenhuma resposta no corpo.
-   **Respostas de Erro:** `403`, `404 Not Found` (se o psicólogo não existir na clínica), `500`.

### 5.3. Health Check

-   **Rota:** `GET /api/health`
-   **Permissão Requerida:** Nenhuma
-   **Resposta de Sucesso (`200 OK`):**
    ```
    Servidor Deep Saúde OK!
    ```
    (Corpo em `text/plain`)

## 6. Multi-Tenancy

A aplicação implementa multi-tenancy no nível de dados. Todas as queries SQL que manipulam ou buscam dados de psicólogos (ou dados relacionados à clínica, como o `limite_psicologos`) são parametrizadas para usar a `clinica_id` obtida da identidade do usuário autenticado. Isso garante que uma clínica só possa acessar e gerenciar seus próprios dados.

## 7. Deploy com Docker

O projeto inclui um `Dockerfile` na raiz do repositório (um nível acima deste diretório `deep-saude-backend/`) para facilitar o deploy.

1.  **Build da Imagem Docker (a partir da raiz do repositório):**
    ```bash
    docker build -t deep-saude-backend .
    ```
2.  **Executar o Container Docker:**
    ```bash
    docker run -p 3000:3000 -e DATABASE_URL="sua-database-url" -e PORT="3000" deep-saude-backend
    ```
    -   Mapeie a porta desejada (ex: `-p 8080:3000` para acessar em `localhost:8080` se `PORT` interno for 3000).
    -   Forneça a `DATABASE_URL` como variável de ambiente.
    -   O Render injetará automaticamente a variável `PORT`, que será usada pela aplicação dentro do container.

### Instruções para o Render:

1.  Crie um novo "Web Service" no Render e conecte-o ao seu repositório Git.
2.  Defina o "Environment" como "Docker". O Render irá detectar e usar o `Dockerfile` na raiz do projeto.
3.  Na seção "Environment Variables" do seu serviço no Render, adicione:
    -   `DATABASE_URL`: Com o valor da string de conexão do seu banco de dados CockroachDB.
4.  O Render injetará automaticamente a variável `PORT`. O `CMD` no `Dockerfile` (`lein run -m deep-saude-backend.core`) fará com que a aplicação Clojure leia esta variável `PORT` para iniciar o servidor web na porta correta.

---
## From: deep-saude-backend/doc/core.clj-doc.md
---
# Documentação: `deep-saude-backend/src/deep_saude_backend/core.clj`

Este arquivo é o coração da aplicação backend do Deep Saúde. Ele define a lógica principal, incluindo a configuração do banco de dados, middlewares de segurança, handlers para as rotas da API e a inicialização do servidor.

## Estrutura Geral

O arquivo `core.clj` é organizado nas seguintes seções principais:

1.  **Declaração de Namespace e Dependências (`ns`):**
    *   Importa as bibliotecas Clojure necessárias para o funcionamento da aplicação, como `ring.adapter.jetty` para o servidor, `compojure.core` para roteamento, `next.jdbc` para interação com o banco de dados, e `environ.core` para gerenciamento de variáveis de ambiente.

2.  **Configuração do Banco de Dados:**
    *   `db-spec`: Define a especificação de conexão com o banco de dados PostgreSQL. Utiliza a variável de ambiente `DATABASE_URL`. Inclui tratamento para SSL.
    *   `datasource`: Cria um datasource JDBC a partir do `db-spec`.
    *   `execute-query!`: Função helper para executar queries SQL que retornam múltiplos resultados.
    *   `execute-one!`: Função helper para executar queries SQL que retornam um único resultado.

3.  **Middlewares de Segurança e Teste:**
    *   `wrap-mock-autenticacao`: Um middleware **para fins de teste e desenvolvimento**. Ele injeta uma identidade de usuário mock (com ID de usuário, clínica e papel) na requisição. **Em produção, este middleware deve ser substituído por um sistema de autenticação real.**
    *   `wrap-checar-permissao`: Middleware crucial para o controle de acesso baseado em papéis (RBAC). Ele verifica se o papel do usuário autenticado (`:papel-id` da identidade) possui a permissão nomeada necessária para acessar um determinado handler. A verificação é feita consultando as tabelas `papel_permissoes` e `permissoes` no banco de dados.

4.  **Handlers (Lógica dos Endpoints da API):**
    Esta seção contém as funções que processam as requisições HTTP para cada endpoint da API.

    *   `health-check-handler [_]`: Handler para o endpoint `/api/health`. Retorna uma mensagem simples indicando que o servidor está funcionando.
    *   `criar-psicologo-handler [request]`:
        *   Responsável por criar um novo psicólogo.
        *   Extrai `nome` e `email` do corpo da requisição e `clinica-id` da identidade do usuário.
        *   **Validações:**
            *   Nome e email são obrigatórios.
            *   Verifica se o email já existe no sistema.
            *   Verifica o `limite_psicologos` da clínica.
        *   Busca o ID do papel "psicologo".
        *   Insere o novo usuário no banco de dados.
        *   Retorna o novo usuário criado ou mensagens de erro apropriadas.
    *   `listar-psicologos-handler [request]`:
        *   Responsável por listar todos os psicólogos associados à `clinica-id` do usuário autenticado.
        *   Busca o ID do papel "psicologo".
        *   Retorna uma lista de psicólogos ou uma lista vazia.
    *   `atualizar-psicologo-handler [request]`:
        *   Responsável por atualizar as informações (`nome`, `email`) de um psicólogo existente.
        *   Extrai o ID do psicólogo dos parâmetros da rota e `clinica-id` da identidade.
        *   **Validações:**
            *   Verifica se algum dado para atualização foi fornecido.
            *   Se o email estiver sendo atualizado, verifica se o novo email já não está em uso por outro usuário.
        *   Atualiza o usuário no banco de dados, garantindo que a atualização ocorra apenas para o psicólogo da clínica correta.
        *   Retorna o usuário atualizado ou mensagens de erro.
    *   `remover-psicologo-handler [request]`:
        *   Responsável por remover um psicólogo.
        *   Extrai o ID do psicólogo dos parâmetros da rota e `clinica-id` da identidade.
        *   Remove o usuário do banco de dados, garantindo que a remoção ocorra apenas para o psicólogo da clínica correta.
        *   Retorna status 204 (No Content) em caso de sucesso.

5.  **Definição das Rotas e Aplicação Principal:**
    *   `psicologos-routes`: Define as rotas específicas para o CRUD de psicólogos (`/api/psicologos`).
        *   `POST /`: Mapeado para `criar-psicologo-handler`, protegido pela permissão `gerenciar_psicologos`.
        *   `GET /`: Mapeado para `listar-psicologos-handler`, protegido pela permissão `visualizar_todos_agendamentos`.
        *   `PUT /:id`: Mapeado para `atualizar-psicologo-handler`, protegido pela permissão `gerenciar_psicologos`.
        *   `DELETE /:id`: Mapeado para `remover-psicologo-handler`, protegido pela permissão `gerenciar_psicologos`.
    *   `app-routes`: Agrupa todas as rotas da aplicação, incluindo a rota de health check e as rotas de psicólogos. Define também uma rota `not-found` para recursos não encontrados.
    *   `app`: Define a aplicação Ring final, aplicando os middlewares globais:
        *   `wrap-mock-autenticacao`: **(Lembre-se: para desenvolvimento/teste)**.
        *   `middleware-json/wrap-json-body`: Converte corpos de requisição JSON em mapas Clojure.
        *   `middleware-json/wrap-json-response`: Converte respostas de mapas Clojure em JSON.

6.  **Funções de Inicialização:**
    *   `init-db []`: Função chamada durante a inicialização da aplicação.
        *   Verifica a presença da variável de ambiente `DATABASE_URL`.
        *   Tenta executar uma query simples (`SELECT 1`) para verificar a conexão com o banco de dados.
        *   Imprime mensagens de status sobre a conexão.
    *   `destroy-db []`: Função chamada quando a aplicação está sendo finalizada (atualmente, apenas imprime uma mensagem).
    *   `-main [& _]`: A função principal da aplicação, o ponto de entrada quando executada como um JAR ou via `lein run`.
        *   Chama `init-db` para inicializar a conexão com o banco.
        *   Determina a porta do servidor a partir da variável de ambiente `PORT` (ou usa 3000 como padrão).
        *   Inicia o servidor Jetty com a aplicação Ring definida em `app`.

## Interações e Dependências

*   **Banco de Dados:** Interage pesadamente com o banco de dados PostgreSQL (ou compatível como CockroachDB) para persistir e recuperar dados de usuários, papéis, permissões e clínicas. As funções `execute-query!` e `execute-one!` são usadas para todas as operações de banco de dados.
*   **Variáveis de Ambiente:** Depende de `DATABASE_URL` para a conexão com o banco e `PORT` para a configuração do servidor web.
*   **Estrutura da API:** Define a estrutura da API RESTful para o gerenciamento de psicólogos, incluindo os endpoints, métodos HTTP esperados e os dados trocados (JSON).
*   **Segurança:** A segurança é parcialmente implementada através do middleware `wrap-checar-permissao`, que controla o acesso aos endpoints baseado nas permissões do papel do usuário. A autenticação em si é simulada por `wrap-mock-autenticacao` e precisaria de uma implementação real.
*   **Outros Módulos:** No estado atual do repositório, `core.clj` é o único módulo principal da aplicação. Ele não possui dependências diretas de outros módulos Clojure customizados dentro do projeto, mas depende de várias bibliotecas externas listadas no `project.clj`.

## Pontos Chave para Edição e Manutenção

*   **Autenticação:** A substituição de `wrap-mock-autenticacao` por um sistema de autenticação robusto (ex: baseado em JWT) é uma prioridade para um ambiente de produção. Isso envolveria validar um token e extrair a identidade real do usuário.
*   **Gerenciamento de Erros:** Os handlers retornam respostas de erro com status HTTP e corpos JSON. A consistência e o detalhamento dessas mensagens podem ser importantes para os clientes da API.
*   **Validações:** As validações de entrada (ex: formato de email, obrigatoriedade de campos) são feitas nos handlers. Adicionar ou modificar validações geralmente ocorre nessas funções.
*   **Permissões:** A lógica de permissões está centralizada em `wrap-checar-permissao` e nas strings de nome de permissão passadas para ele. Novas permissões ou alterações na lógica de acesso exigirão modificações aqui e, possivelmente, no esquema do banco de dados (tabelas `permissoes` e `papel_permissoes`).
*   **Queries SQL:** Todas as interações com o banco são feitas através de strings SQL. Qualquer alteração no esquema do banco de dados provavelmente exigirá a atualização dessas queries.
*   **Configuração do Banco:** A configuração do `db-spec` lida com a `DATABASE_URL` e a configuração de SSL. Mudanças nos requisitos de conexão com o banco (ex: diferentes parâmetros de SSL) seriam feitas aqui.
*   **Novos Endpoints:** Para adicionar novas funcionalidades (ex: gerenciamento de pacientes), seria necessário:
    1.  Definir novos handlers.
    2.  Definir novas rotas em `app-routes` (ou em um novo conjunto de rotas agrupadas).
    3.  Possivelmente, criar novos middlewares se houver lógica transversal específica.
    4.  Atualizar o sistema de permissões se necessário.
    5.  Adicionar/modificar tabelas e queries SQL.
*   **Testes:** O arquivo `core_test.clj` existe, mas não contém testes implementados. A criação de testes unitários e de integração é fundamental para garantir a estabilidade e a corretude do código ao longo do tempo.

Este arquivo é central para o backend. Modificações aqui têm um impacto direto e significativo no comportamento de toda a API.

---
## From: deep-saude-backend/doc/core_test.clj-doc.md
---
# Documentação: `deep-saude-backend/test/deep_saude_backend/core_test.clj`

Este arquivo é destinado a conter os testes automatizados para a lógica principal da aplicação definida em `deep_saude_backend.core.clj`. No estado atual do repositório, este arquivo existe, mas não contém testes implementados, apenas um teste de exemplo comentado.

## Estrutura Geral (Esperada)

Um arquivo de teste em Clojure, usando a biblioteca `clojure.test`, normalmente teria a seguinte estrutura:

1.  **Declaração de Namespace (`ns`):**
    *   Importa `clojure.test` (geralmente com o alias `:refer :all` para trazer `deftest`, `is`, etc. para o namespace atual).
    *   Importa o namespace que está sendo testado (neste caso, `deep-saude-backend.core`).

    ```clojure
    (ns deep-saude-backend.core-test
      (:require [clojure.test :refer :all]
                [deep-saude-backend.core :refer :all]))
    ```

2.  **Definições de Testes (`deftest`):**
    *   Cada `deftest` define um conjunto de testes relacionados a uma funcionalidade ou função específica.
    *   Dentro de um `deftest`, a macro `is` é usada para fazer asserções sobre o comportamento do código.

    ```clojure
    (deftest a-test
      (testing "FIXME, I fail."
        (is (= 0 1)))) ; Exemplo de teste que falha
    ```
    No exemplo acima (que é o conteúdo atual do arquivo):
    *   `a-test` é o nome do conjunto de testes.
    *   `testing "FIXME, I fail."` é uma forma de agrupar asserções relacionadas com uma descrição.
    *   `(is (= 0 1))` é uma asserção que verifica se `0` é igual a `1`. Este teste, como está, falhará.

## Propósito e Importância dos Testes

Testes automatizados são cruciais para:

*   **Verificar a Corretude:** Garantir que o código funciona como esperado sob diversas condições.
*   **Prevenir Regressões:** Assegurar que novas alterações não quebrem funcionalidades existentes.
*   **Facilitar Refatoração:** Com uma suíte de testes robusta, é mais seguro refatorar e melhorar o código, sabendo que os testes alertarão sobre quaisquer problemas introduzidos.
*   **Documentação Viva:** Testes bem escritos podem servir como exemplos de como usar o código.
*   **Desenvolvimento Guiado por Testes (TDD):** Escrever testes *antes* do código de produção pode ajudar a clarificar requisitos e guiar o design da implementação.

## O que Testar em `core.clj`

Dado o conteúdo de `deep-saude-backend.core.clj`, os testes neste arquivo poderiam cobrir:

1.  **Handlers da API:**
    *   Para cada handler (ex: `criar-psicologo-handler`, `listar-psicologos-handler`):
        *   **Caminhos Felizes:** Testar com entradas válidas e verificar se a resposta (status e corpo) é a esperada.
        *   **Casos de Borda e Erro:**
            *   Entradas inválidas (ex: dados faltando, formatos incorretos).
            *   Condições de erro (ex: email já existente, limite de psicólogos atingido).
            *   Cenários de permissão (embora testar o middleware `wrap-checar-permissao` diretamente ou através dos handlers seja uma escolha).
    *   Isso geralmente envolve "mockar" (simular) chamadas ao banco de dados (`execute-query!`, `execute-one!`) para isolar a lógica do handler. A biblioteca `ring.mock.request` é útil para criar requisições de teste.

2.  **Middlewares:**
    *   `wrap-checar-permissao`:
        *   Testar se permite o acesso quando o usuário tem a permissão.
        *   Testar se bloqueia o acesso (retorna 403) quando o usuário não tem a permissão ou o papel não é encontrado.
        *   Isso também exigiria mockar chamadas ao banco para simular diferentes cenários de permissão.
    *   `wrap-mock-autenticacao`: Verificar se a identidade mock é corretamente injetada na requisição.

3.  **Lógica de Banco de Dados (indiretamente):**
    *   Embora os testes unitários dos handlers devam mockar o banco, testes de integração (que poderiam estar em um namespace separado ou aqui, dependendo da estratégia) poderiam interagir com um banco de dados de teste real para verificar a corretude das queries SQL e da lógica de persistência.

4.  **Funções Auxiliares:**
    *   Se houvesse funções auxiliares complexas em `core.clj` (além das de banco de dados), elas também deveriam ter seus próprios testes unitários.

## Como Executar os Testes

Com Leiningen, os testes podem ser executados com o comando:

```bash
lein test
```

Ou, para um namespace específico:

```bash
lein test deep-saude-backend.core-test
```

## Pontos Chave para Edição e Desenvolvimento

*   **Implementar Testes Reais:** O passo mais importante é substituir o teste de exemplo por testes significativos que cubram a funcionalidade de `core.clj`.
*   **Mocking/Stubbing:** Decidir sobre uma estratégia para mockar dependências externas, especialmente as chamadas ao banco de dados, é fundamental para testes unitários eficazes dos handlers. Bibliotecas como `with-redefs` (do Clojure) podem ser usadas para isso.
*   **Cobertura de Teste:** Esforçar-se para obter uma boa cobertura de teste, abrangendo tanto os cenários de sucesso quanto os de falha e casos de borda.
*   **Organização:** Manter os testes organizados e legíveis, usando `deftest` e `testing` de forma clara.
*   **Testes de Integração:** Considerar a adição de testes de integração que verifiquem a interação entre componentes, incluindo o banco de dados. Estes são geralmente mais lentos e podem exigir um ambiente de teste separado.

Este arquivo é o local designado para garantir a qualidade e a robustez do código principal da aplicação. Preenchê-lo com testes abrangentes é uma prática essencial de desenvolvimento de software.

---
## From: deep-saude-backend/doc/intro.md
---
# Introduction to deep-saude-backend

TODO: write [great documentation](http://jacobian.org/writing/what-to-write/)

---
## From: deep-saude-backend/doc/project.clj-doc.md
---
# Documentação: `deep-saude-backend/project.clj`

Este arquivo é o coração da configuração do projeto Clojure, utilizando Leiningen como ferramenta de automação e gerenciamento de dependências. Ele define metadados do projeto, dependências, plugins, e configurações para diferentes perfis de execução (como desenvolvimento e produção/uberjar).

## Estrutura Geral do `project.clj`

O arquivo `project.clj` é um script Clojure que usa a macro `defproject` para definir a configuração do projeto.

```clojure
(defproject deep-saude-backend "0.1.0-SNAPSHOT"
  ;; ... outras configurações ...
  )
```

As principais seções e suas finalidades são:

1.  **`defproject <nome-do-projeto> "<versao>"`:**
    *   `deep-saude-backend`: O nome do grupo/artefato do projeto.
    *   `"0.1.0-SNAPSHOT"`: A versão atual do projeto. "SNAPSHOT" indica que é uma versão de desenvolvimento.

2.  **`:description`:**
    *   Uma breve descrição do projeto.
    *   Ex: `"Backend para Gestão de Psicólogos da Plataforma Deep Saúde"`

3.  **`:url`:**
    *   Um URL associado ao projeto (geralmente o repositório ou site do projeto).
    *   Ex: `"http://example.com/FIXME"` (um placeholder que pode ser atualizado).

4.  **`:license`:**
    *   Informações sobre a licença do software.
    *   Ex: `{:name "EPL-2.0 OR GPL-2.0-or-later WITH Classpath-exception-2.0" :url "https://www.eclipse.org/legal/epl-2.0/"}`

5.  **`:dependencies`:**
    *   Esta é uma das seções mais importantes. Lista todas as bibliotecas externas das quais o projeto depende.
    *   Cada dependência é especificada como um vetor `[nome-da-biblioteca "versao"]`.
    *   **Exemplos de dependências neste projeto:**
        *   `[org.clojure/clojure "1.11.1"]`: A linguagem Clojure em si.
        *   `[ring/ring-core "1.11.0"]`: Biblioteca base para abstrações de HTTP em Clojure (requisições, respostas, middleware).
        *   `[ring/ring-jetty-adapter "1.11.0"]`: Adaptador para rodar a aplicação Ring com o servidor web Jetty.
        *   `[ring/ring-json "0.5.1"]`: Middleware para manipulação de JSON em requisições e respostas Ring.
        *   `[compojure "1.7.1"]`: Biblioteca para definir rotas de forma concisa.
        *   `[com.github.seancorfield/next.jdbc "1.3.909"]`: Biblioteca moderna para interação com bancos de dados via JDBC.
        *   `[org.postgresql/postgresql "42.7.1"]`: Driver JDBC específico para PostgreSQL (usado também para CockroachDB).
        *   `[environ "1.2.0"]`: Biblioteca para gerenciar configurações a partir de variáveis de ambiente.

6.  **`:plugins`:**
    *   Lista os plugins do Leiningen que estendem sua funcionalidade.
    *   **Exemplo neste projeto:**
        *   `[lein-ring "0.12.6"]`: Plugin para facilitar o desenvolvimento de aplicações web Ring, fornecendo tarefas como `lein ring server` para rodar um servidor de desenvolvimento.

7.  **`:ring`:**
    *   Configurações específicas para o plugin `lein-ring`.
    *   `handler`: Especifica a função principal da aplicação Ring (o "handler" que processa todas as requisições).
        *   Ex: `deep-saude-backend.core/app`
    *   `init`: Especifica uma função a ser chamada quando o servidor Ring inicia.
        *   Ex: `deep-saude-backend.core/init-db` (para inicializar a conexão com o banco).
    *   `destroy`: Especifica uma função a ser chamada quando o servidor Ring para.
        *   Ex: `deep-saude-backend.core/destroy-db`

8.  **`:main`:**
    *   Especifica o namespace principal que contém a função `-main`, que é o ponto de entrada para a aplicação quando empacotada como um JAR executável.
    *   `^:skip-aot`: Metadados que instruem o Leiningen a não compilar este namespace ahead-of-time (AOT) por padrão, a menos que especificado em um perfil (como `:uberjar`).
    *   Ex: `deep-saude-backend.core`

9.  **`:target-path`:**
    *   Define o diretório onde os artefatos de compilação (arquivos `.class`, JARs) serão colocados.
    *   Ex: `"target/%s"` (o `%s` é substituído pelo nome do perfil, se houver).

10. **`:profiles`:**
    *   Permite definir configurações diferentes para diferentes contextos (perfis).
    *   **Perfil `:uberjar`:**
        *   Usado para criar um "uberjar" – um arquivo JAR autônomo que contém todas as dependências do projeto.
        *   `:aot :all`: Compila todos os namespaces ahead-of-time. Isso é geralmente necessário para criar um JAR executável e pode melhorar o tempo de inicialização.
        *   `:jvm-opts ["-Dclojure.compiler.direct-linking=true"]`: Opções da JVM para otimizar o código compilado.
    *   **Perfil `:dev`:**
        *   Configurações específicas para o ambiente de desenvolvimento.
        *   `:dependencies`: Pode incluir dependências adicionais que são úteis apenas durante o desenvolvimento.
            *   `[javax.servlet/servlet-api "2.5"]`: Necessário para `lein ring server` funcionar corretamente.
            *   `[ring/ring-mock "0.4.0"]`: Biblioteca para mockar requisições Ring, útil para testes.

## Como este arquivo é usado

*   **Gerenciamento de Dependências:** Quando você executa `lein deps`, o Leiningen lê esta seção e baixa as bibliotecas necessárias.
*   **Construção do Projeto:** Comandos como `lein jar`, `lein uberjar` usam as informações deste arquivo para empacotar o projeto.
*   **Execução em Desenvolvimento:** `lein ring server` usa as configurações de `:ring` e do perfil `:dev`.
*   **Execução da Aplicação:** `lein run` (ou executar o uberjar) usa a diretiva `:main` para encontrar o ponto de entrada da aplicação.

## Pontos Chave para Edição

*   **Adicionar/Atualizar Dependências:** A seção `:dependencies` é a mais frequentemente modificada. Ao adicionar uma nova funcionalidade que requer uma nova biblioteca, você a adicionará aqui. É importante também manter as versões das dependências atualizadas para correções de bugs e segurança.
*   **Configurar Plugins:** Se você precisar de novas ferramentas ou funcionalidades do Leiningen (ex: um plugin para linting, um plugin para um servidor diferente), você os adicionará em `:plugins`.
*   **Ajustar Perfis:**
    *   Se você precisar de diferentes configurações de banco de dados ou variáveis de ambiente para desenvolvimento, teste e produção, os perfis são o lugar para gerenciá-los (embora variáveis de ambiente via `environ` sejam frequentemente preferidas para configurações que variam entre deploys).
    *   O perfil `:uberjar` é crucial para a criação do artefato de deploy. Configurações de AOT e JVM podem ser ajustadas aqui para otimização.
*   **Alterar Ponto de Entrada:** Se a função principal da aplicação ou o handler Ring mudar, as diretivas `:main` e `:ring {:handler ...}` precisarão ser atualizadas.

Este arquivo é fundamental para a estrutura e o ciclo de vida do projeto Clojure. Qualquer alteração nas dependências, na forma como o projeto é construído ou executado, provavelmente envolverá uma modificação no `project.clj`.

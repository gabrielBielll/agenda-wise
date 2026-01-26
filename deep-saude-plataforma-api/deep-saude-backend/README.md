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

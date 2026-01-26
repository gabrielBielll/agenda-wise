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

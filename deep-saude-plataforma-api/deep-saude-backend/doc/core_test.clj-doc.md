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

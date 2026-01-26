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

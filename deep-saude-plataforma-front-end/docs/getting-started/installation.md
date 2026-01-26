# Instalação

Este guia detalha os passos necessários para configurar o ambiente de desenvolvimento da Deep Saúde Plataforma em sua máquina local.

## Pré-requisitos

Antes de começar, certifique-se de que você tem os seguintes softwares instalados:

*   **Node.js:** A plataforma é construída sobre Node.js. Recomendamos o uso da versão LTS mais recente. Você pode baixar o Node.js em [https://nodejs.org/](https://nodejs.org/).
    *   Para verificar se o Node.js está instalado, abra seu terminal e digite:
        ```bash
        node -v
        ```
*   **npm ou yarn:** Estes são gerenciadores de pacotes para JavaScript. npm vem instalado com o Node.js. Se preferir usar yarn, você pode instalá-lo globalmente:
    *   Para verificar a versão do npm:
        ```bash
        npm -v
        ```
    *   Para instalar o yarn (se ainda não o tiver):
        ```bash
        npm install --global yarn
        ```
    *   Para verificar a versão do yarn:
        ```bash
        yarn --version
        ```
*   **Git:** Necessário para clonar o repositório. Você pode baixar o Git em [https://git-scm.com/](https://git-scm.com/).

## Passos de Instalação

1.  **Clone o Repositório:**
    Abra seu terminal, navegue até o diretório onde deseja clonar o projeto e execute o seguinte comando:
    ```bash
    git clone https://github.com/gabrielBielll/deep-saude-plataforma-front-end.git
    ```
    Isso criará uma pasta chamada `deep-saude-plataforma-front-end` com os arquivos do projeto.

2.  **Navegue até o Diretório do Projeto:**
    ```bash
    cd deep-saude-plataforma-front-end
    ```

3.  **Instale as Dependências:**
    Dentro do diretório do projeto, instale todas as dependências listadas no arquivo `package.json`. Você pode usar npm ou yarn:

    *   Usando npm:
        ```bash
        npm install
        ```
    *   Usando yarn:
        ```bash
        yarn install
        ```
    Este comando fará o download e instalará todos os pacotes necessários para o projeto funcionar.

4.  **Configuração de Variáveis de Ambiente (se necessário):**
    O projeto pode requerer variáveis de ambiente para funcionar corretamente, especialmente para integração com serviços como Firebase e Google AI (Genkit).
    *   Procure por um arquivo `.env.example` ou similar na raiz do projeto. Se existir, copie-o para um novo arquivo chamado `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Abra o arquivo `.env` em um editor de texto e preencha as variáveis com os valores apropriados. As credenciais para serviços externos (Firebase, Google API Keys, etc.) devem ser obtidas dos respectivos painéis de controle desses serviços.

    **Nota:** O `package.json` lista `dotenv` como dependência, o que sugere que o projeto utiliza arquivos `.env` para gerenciar variáveis de ambiente.

Com esses passos, o ambiente de desenvolvimento estará configurado. O próximo passo é executar o projeto localmente, o que está descrito em [Executando Localmente](./running-locally.md).

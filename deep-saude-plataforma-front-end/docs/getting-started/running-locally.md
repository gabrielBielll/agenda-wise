# Executando Localmente

Após [instalar as dependências](./installation.md) e configurar as variáveis de ambiente necessárias, você pode executar a Deep Saúde Plataforma em seu ambiente de desenvolvimento local.

## Iniciando o Servidor de Desenvolvimento

O projeto utiliza Next.js, que vem com um servidor de desenvolvimento otimizado. Para iniciar o servidor, execute um dos seguintes comandos no terminal, a partir da raiz do diretório do projeto:

*   **Usando npm:**
    ```bash
    npm run dev
    ```
*   **Usando yarn:**
    ```bash
    yarn dev
    ```

Este comando (`next dev --turbopack -p 9002` conforme definido no `package.json`) iniciará o servidor de desenvolvimento. O Turbopack é usado para um desenvolvimento mais rápido.

Você verá uma saída no terminal indicando que o servidor está rodando, geralmente algo como:

```
✓ Ready in x.xxs
Local:    http://localhost:9002
```

A aplicação estará acessível no seu navegador através do endereço `http://localhost:9002`.

## Funcionalidades de IA com Genkit (Opcional)

O projeto também inclui funcionalidades de Inteligência Artificial gerenciadas pelo Genkit. Se você precisar desenvolver ou testar essas funcionalidades, precisará iniciar o servidor do Genkit separadamente.

O `package.json` define os seguintes scripts para o Genkit:

*   `genkit:dev`: `genkit start -- tsx src/ai/dev.ts`
    *   Inicia o servidor Genkit em modo de desenvolvimento.
*   `genkit:watch`: `genkit start -- tsx --watch src/ai/dev.ts`
    *   Inicia o servidor Genkit em modo de desenvolvimento com recarregamento automático ao detectar alterações nos arquivos de IA.

Para iniciar o servidor Genkit (em um novo terminal, se o servidor Next.js já estiver rodando):

*   **Usando npm:**
    ```bash
    npm run genkit:dev
    ```
    ou para o modo watch:
    ```bash
    npm run genkit:watch
    ```
*   **Usando yarn:**
    ```bash
    yarn genkit:dev
    ```
    ou para o modo watch:
    ```bash
    yarn genkit:watch
    ```

O terminal indicará em qual porta o servidor Genkit está rodando e quais fluxos de IA estão disponíveis. Geralmente, a UI de desenvolvimento do Genkit estará disponível em `http://localhost:4000` (ou uma porta similar).

## Acessando a Aplicação

1.  Abra seu navegador web preferido.
2.  Navegue para `http://localhost:9002`.

Você deverá ver a página inicial da Deep Saúde Plataforma. O servidor de desenvolvimento também suporta Hot Module Replacement (HMR), o que significa que a maioria das alterações que você fizer no código (componentes React, estilos, etc.) serão refletidas no navegador automaticamente, sem a necessidade de reiniciar o servidor ou recarregar a página manualmente.

## Parando o Servidor

Para parar o servidor de desenvolvimento Next.js ou Genkit, volte ao terminal onde ele está rodando e pressione `Ctrl+C`.

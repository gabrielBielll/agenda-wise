# Deployment com Firebase App Hosting

A Deep Saúde Plataforma é configurada para ser implantada (deploy) utilizando o [Firebase App Hosting](https://firebase.google.com/docs/hosting/frameworks/nextjs). Este é um serviço do Firebase projetado para simplificar a hospedagem de aplicações web modernas, incluindo aquelas construídas com frameworks como Next.js. Ele oferece uma integração otimizada, cuidando de muitos detalhes de build e configuração.

## Arquivo de Configuração: `apphosting.yaml`

A configuração do deploy para o Firebase App Hosting é definida no arquivo `apphosting.yaml` localizado na raiz do projeto. Este arquivo instrui o Firebase sobre como construir e servir a aplicação Next.js.

Um exemplo de `apphosting.yaml` para uma aplicação Next.js pode se parecer com isto (o conteúdo exato do arquivo no projeto pode variar):

```yaml
# apphosting.yaml

# Especifica o runtime, para Next.js é geralmente nodejs
runtime: nodejs18 # Ou a versão apropriada do Node.js

# Comando para instalar dependências
# O Firebase App Hosting pode detectar e executar 'npm install' ou 'yarn install' automaticamente
# mas pode ser especificado se necessário.

# Comando para construir a aplicação
# Para Next.js, é 'npm run build' ou 'yarn build'
# build: npm run build

# Comando para iniciar a aplicação
# O Firebase App Hosting geralmente detecta o comando start do Next.js ('next start')
# start: npm run start

# Variáveis de ambiente (opcional, podem ser gerenciadas via console do Firebase ou .env files)
# env:
#   NEXT_PUBLIC_API_URL: "https://api.example.com"

# Configurações de rede (opcional)
# network:
#   port: 3000 # A porta que a aplicação Next.js escuta

# Outras configurações específicas do App Hosting podem estar presentes.
# Por exemplo, configurações de cache, regiões, etc.

# Integração com Firebase (o backend do App Hosting)
# Geralmente, o App Hosting se integra automaticamente com o projeto Firebase
# ao qual o backend do App Hosting está vinculado.

# O Firebase App Hosting lida com a otimização de assets estáticos,
# renderização do lado do servidor (SSR), geração de site estático (SSG),
# e rotas de API do Next.js.
```

**Pontos Chave sobre `apphosting.yaml`:**

*   **Detecção Automática:** O Firebase App Hosting é inteligente e pode detectar automaticamente muitas das configurações necessárias para projetos Next.js, como os comandos de build e start.
*   **Variáveis de Ambiente:** Embora possam ser especificadas no `apphosting.yaml`, é mais comum e seguro gerenciar variáveis de ambiente sensíveis (como API keys) através do console do Firebase ou usando arquivos `.env` específicos do ambiente que são referenciados durante o processo de build. O `package.json` inclui `dotenv`, indicando o uso de arquivos `.env`.
*   **Integração com o Firebase:** O App Hosting é um serviço do Firebase, então ele se integra naturalmente com outros serviços do Firebase do mesmo projeto (como Functions, Firestore, Authentication).

## Processo de Deploy

O deploy da aplicação para o Firebase App Hosting é geralmente realizado através da Firebase CLI.

1.  **Instalar ou Atualizar a Firebase CLI:**
    Certifique-se de ter a [Firebase CLI](https://firebase.google.com/docs/cli) instalada e atualizada para a versão mais recente.
    ```bash
    npm install -g firebase-tools
    ```

2.  **Login no Firebase:**
    Se ainda não estiver logado, autentique-se na Firebase CLI:
    ```bash
    firebase login
    ```

3.  **Selecionar o Projeto Firebase:**
    Se você tiver múltiplos projetos Firebase, certifique-se de que o projeto correto está selecionado:
    ```bash
    firebase use [YOUR_FIREBASE_PROJECT_ID]
    ```
    Ou configure um alias para o projeto.

4.  **Realizar o Deploy:**
    A partir da raiz do diretório do projeto, execute o comando de deploy:
    ```bash
    firebase deploy --only hosting
    ```
    Ou, se o App Hosting estiver configurado como o único serviço de hosting, um simples `firebase deploy` pode ser suficiente. O Firebase App Hosting pode ter um comando de deploy mais específico se estiver usando a funcionalidade de "backends" do App Hosting.

    Se o projeto estiver usando a nova geração de backends do App Hosting, o comando pode ser:
    ```bash
    firebase apphosting:backends:deploy
    ```
    Consulte a documentação específica do Firebase App Hosting para o comando exato se houver dúvidas.

## O que o Firebase App Hosting Gerencia

Ao usar o Firebase App Hosting com Next.js, ele tipicamente gerencia:

*   **Build da Aplicação:** Executa o processo de build do Next.js (`next build`).
*   **Servir a Aplicação:** Inicia o servidor Next.js (`next start`) de forma otimizada.
*   **Roteamento:** Suporta as funcionalidades de roteamento do Next.js (App Router, Pages Router, API Routes).
*   **Otimizações de Imagem:** Pode integrar-se com a otimização de imagens do Next.js.
*   **Cache de CDN:** Serve assets estáticos através da CDN global do Firebase para performance.
*   **Escalabilidade:** Gerencia a escalabilidade da aplicação.

## Domínios Personalizados e SSL

Após o deploy, a aplicação estará disponível em um subdomínio `*.web.app` ou `*.firebaseapp.com`. Você pode configurar domínios personalizados e o Firebase automaticamente provisiona certificados SSL para eles através do console do Firebase Hosting.

## Monitoramento e Logs

Logs da aplicação e métricas de performance podem ser acessados através do console do Firebase, ajudando a monitorar a saúde da aplicação em produção.

Esta configuração simplifica muito o processo de levar uma aplicação Next.js para produção, permitindo que os desenvolvedores se concentrem mais no desenvolvimento da aplicação em si.

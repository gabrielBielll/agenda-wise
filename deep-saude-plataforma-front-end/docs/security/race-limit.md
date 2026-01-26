

# Plano de Implementação: Camadas de Segurança para o BFF

**Data:** 07 de Setembro de 2025  
**Versão:** 1.0  
**Autor:** Engenheiro de Software (plataforma deepsaude api)  
**Status:** Proposto

## 1\. Resumo Executivo

Este documento descreve o plano técnico para a implementação de múltiplas camadas de segurança no nosso Backend for Frontend (BFF), que é a camada de API servida pela nossa aplicação Next.js. O objetivo é proteger nossos endpoints contra acesso não autorizado, abuso e ataques de negação de serviço (DoS), garantindo que as chamadas para a nossa API principal (no Render) sejam feitas de forma segura e controlada.

A implementação dessas camadas é um passo crítico antes do deploy da aplicação em um ambiente de produção.

## 2\. Contexto e Ameaças

Após a implementação do padrão de proxy usando `rewrites` no Next.js, a URL da nossa API principal no Render ficará oculta do navegador. No entanto, os endpoints do nosso BFF (ex: `/api/proxy/*`) ainda estarão visíveis para quem inspecionar o tráfego de rede.

As principais ameaças a serem mitigadas são:

1.  **Acesso Não Autorizado:** Scripts e usuários mal-intencionados tentando acessar os endpoints do BFF sem uma sessão válida.
2.  **Abuso de Recursos (DoS/Brute-force):** Um ator mal-intencionado repetindo uma requisição válida milhares de vezes para esgotar os recursos do nosso servidor Next.js ou da nossa API principal, gerando custos e indisponibilidade.
3.  **Cross-Site Request Forgery (CSRF):** Um site malicioso forçando o navegador de um usuário logado a fazer uma requisição para o nosso BFF sem o seu consentimento.

## 3\. Arquitetura de Segurança em Camadas

Propomos uma abordagem de "defesa em profundidade", onde cada camada adiciona um nível de proteção.

### Camada 1: Validação de Sessão (Autenticação)

Esta é a nossa principal linha de defesa. Nenhum endpoint que acesse dados sensíveis deve ser público.

  * **Objetivo:** Garantir que cada requisição para um endpoint protegido seja originada por um usuário autenticado.
  * **Mecanismo:**
    1.  O `middleware.ts` já verifica a **existência** do cookie de sessão `adminSessionToken` para proteger as rotas do painel admin.
    2.  O próximo passo é, dentro de cada Server Action ou API Route que compõe o BFF, ler o token contido no cookie.
    3.  Este token (que será um JWT gerado pelo nosso backend em Clojure) deve ser **validado no servidor Next.js**. Isso envolve verificar sua assinatura usando a `JWT_SECRET` (que o Next.js também terá como variável de ambiente) e sua data de expiração.
  * **Impacto:** Requisições anônimas serão imediatamente bloqueadas com um status `401 Unauthorized`.

### Camada 2: Rate Limiting (Proteção Contra Abuso)

Esta camada mitiga diretamente o risco de ataques de força bruta e DoS.

  * **Objetivo:** Limitar o número de requisições que um único cliente (identificado por IP ou ID de usuário) pode fazer em um determinado período.

  * **Mecanismo:** Implementaremos um limitador de taxa no `middleware.ts` para que ele seja aplicado a todas as requisições que passam pelo nosso proxy (ex: `/api/proxy/*`).

  * **Tecnologia Sugerida:** Usaremos a biblioteca `@upstash/ratelimit` em conjunto com um armazenamento de estado rápido como o Vercel KV ou Upstash (Redis).

    **Exemplo Conceitual de Implementação no `middleware.ts`:**

    ```typescript
    import { Ratelimit } from "@upstash/ratelimit";
    import { kv } from "@vercel/kv";

    // Limita a 10 requisições a cada 10 segundos por IP
    const ratelimit = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(10, "10 s"),
      analytics: true,
    });

    export async function middleware(request: NextRequest) {
      if (request.nextUrl.pathname.startsWith('/api/proxy')) {
        const ip = request.ip ?? "127.0.0.1";
        const { success } = await ratelimit.limit(ip);

        if (!success) {
          return new NextResponse("Too Many Requests", { status: 429 });
        }
      }
      
      // ... resto da lógica do middleware
      return NextResponse.next();
    }
    ```

  * **Impacto:** Bloqueia scripts automatizados que tentam sobrecarregar nossos endpoints, retornando um status `429 Too Many Requests`.

### Camada 3: CORS e Headers de Segurança

Esta camada adiciona um nível de proteção no navegador e segue as melhores práticas de segurança web.

  * **Objetivo:** Instruir os navegadores a só permitirem que o nosso próprio domínio faça requisições ao BFF, e adicionar outros headers que previnem ataques comuns.

  * **Mecanismo:** Configuraremos `headers` customizados no arquivo `next.config.ts`.

  * **Tecnologia Sugerida:**

    **Exemplo de Implementação no `next.config.ts`:**

    ```typescript
    const nextConfig = {
      async headers() {
        return [
          {
            source: '/api/:path*', // Aplica a todas as nossas rotas de API
            headers: [
              {
                key: 'Access-Control-Allow-Origin',
                value: process.env.ALLOWED_ORIGIN || 'https://www.nossa-url-de-producao.com',
              },
              // Outros headers de segurança importantes
              { key: 'X-Content-Type-Options', value: 'nosniff' },
              { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
              { key: 'X-XSS-Protection', value: '1; mode=block' },
            ],
          },
        ];
      },
      // ... resto da configuração
    };
    ```

  * **Impacto:** Dificulta que outros sites interajam com nossa API diretamente do navegador de um usuário.

## 4\. Plano de Implementação Futuro (Checklist)

Estas tarefas deverão ser executadas após a fase inicial de integração do frontend com o backend e antes do deploy em produção.

  - [ ] **Tarefa 1: Validação de Sessão no BFF:**

      - [ ] Garantir que o Next.js tenha acesso à `JWT_SECRET` via variável de ambiente.
      - [ ] Adicionar lógica de validação do JWT em um ponto central (middleware ou em cada endpoint do BFF) para todas as chamadas que passam pelo proxy.

  - [ ] **Tarefa 2: Configuração do Rate Limiter:**

      - [ ] Provisionar um serviço de Redis (Vercel KV ou Upstash).
      - [ ] Adicionar as variáveis de ambiente necessárias ao projeto.
      - [ ] Instalar o pacote `@upstash/ratelimit`.
      - [ ] Implementar a lógica de rate limiting no `middleware.ts`.

  - [ ] **Tarefa 3: Configuração dos Headers de Segurança:**

      - [ ] Modificar o arquivo `next.config.ts` para incluir a configuração de `headers` com uma política de CORS restritiva e outros headers de segurança.

-----

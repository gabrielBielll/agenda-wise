# Integração com Genkit (Funcionalidades de IA)

A Deep Saúde Plataforma utiliza [Genkit](https://firebase.google.com/docs/genkit) para integrar funcionalidades de Inteligência Artificial (IA). Genkit é um framework open-source do Google projetado para ajudar desenvolvedores a construir, implantar e gerenciar aplicações alimentadas por IA de forma robusta e organizada.

## Localização dos Arquivos Genkit

Todo o código relacionado ao Genkit está centralizado na pasta `src/ai/`:

*   **`src/ai/genkit.ts`**: Este é provavelmente o arquivo principal de configuração do Genkit. Ele inicializa plugins (como `@genkit-ai/googleai`), define modelos de IA a serem usados e pode configurar outras opções globais do Genkit.
*   **`src/ai/flows/`**: Esta subpasta contém os "fluxos" (flows) de IA. Um fluxo no Genkit é uma sequência de etapas que podem incluir chamadas a modelos de IA, processamento de dados, lógica de negócios, etc. Cada arquivo `.ts` dentro desta pasta provavelmente define um ou mais fluxos.
    *   Exemplo: `src/ai/flows/session-note-insights.ts` sugere um fluxo para extrair insights de notas de sessão de pacientes.
*   **`src/ai/dev.ts`**: Este arquivo é o ponto de entrada para o ambiente de desenvolvimento do Genkit. Ele é usado pelo comando `genkit start` para iniciar a UI de desenvolvimento do Genkit, onde você pode testar e monitorar seus fluxos.

## Configuração Principal (`src/ai/genkit.ts`)

O arquivo `src/ai/genkit.ts` é crucial. Ele geralmente contém:

1.  **Importações de Plugins:**
    ```typescript
    import { googleAI } from '@genkit-ai/googleai';
    import { genkitNext } from '@genkit-ai/next'; // Para integração com Next.js
    ```
2.  **Configuração de Plugins:**
    ```typescript
    configureGenkit({
      plugins: [
        googleAI(), // Configura o plugin para usar modelos do Google AI (ex: Gemini)
        genkitNext(), // Permite chamar fluxos Genkit a partir de API Routes do Next.js
      ],
      // Outras configurações:
      logLevel: 'debug',
      enableTracingAndMetrics: true,
    });
    ```
    As API Keys para os modelos de IA (como `GOOGLE_API_KEY`) são tipicamente gerenciadas através de variáveis de ambiente (verificadas no arquivo `.env`).

## Fluxos de IA (`src/ai/flows/`)

Os fluxos são o coração da lógica de IA. Eles são definidos usando a função `defineFlow` do Genkit.

**Exemplo de um fluxo (hipotético, baseado em `session-note-insights.ts`):**

```typescript
// Em src/ai/flows/session-note-insights.ts
import { defineFlow, run } from 'genkit';
import { geminiPro } from 'genkit/models'; // Ou outro modelo configurado
import * as z from 'zod';

// Esquema de entrada para o fluxo
const SessionNoteInputSchema = z.object({
  noteText: z.string(),
});

// Esquema de saída para o fluxo
const SessionNoteInsightsSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
  sentiment: z.string(),
});

export const sessionNoteInsightsFlow = defineFlow(
  {
    name: 'sessionNoteInsightsFlow',
    inputSchema: SessionNoteInputSchema,
    outputSchema: SessionNoteInsightsSchema,
  },
  async (input) => {
    const prompt = `Analise a seguinte nota de sessão de um paciente e forneça um resumo, palavras-chave principais e o sentimento geral: ${input.noteText}`;

    const llmResponse = await run('call-llm', async () =>
      geminiPro.generateText(prompt)
    );

    // Aqui você processaria a resposta do LLM para extrair os campos desejados
    // e retornar um objeto que corresponda ao SessionNoteInsightsSchema.
    // Esta é uma simplificação.
    const result = parseLLMResponse(llmResponse); // Função hipotética de parsing

    return result;
  }
);

// Função hipotética para parsear a resposta do LLM
function parseLLMResponse(response: string): z.infer<typeof SessionNoteInsightsSchema> {
  // Lógica de parsing...
  return {
    summary: "Resumo extraído...",
    keywords: ["palavra1", "palavra2"],
    sentiment: "neutro",
  };
}
```

## Executando o Ambiente de Desenvolvimento Genkit

Conforme mencionado em [Executando Localmente](./../getting-started/running-locally.md), você pode iniciar a UI de desenvolvimento do Genkit com:

```bash
npm run genkit:dev
# ou
npm run genkit:watch
```

Isso geralmente disponibiliza uma interface em `http://localhost:4000` (ou similar), onde você pode:

*   Ver todos os fluxos definidos.
*   Executar fluxos manualmente com dados de entrada de exemplo.
*   Ver logs e rastreamentos de execuções de fluxos.
*   Inspecionar o estado.

## Invocando Fluxos Genkit a partir da Aplicação Next.js

Com o plugin `@genkit-ai/next` configurado, os fluxos Genkit podem ser expostos como endpoints de API e chamados a partir do frontend da aplicação Next.js.

1.  **Criar um manipulador de API no Next.js:**
    Você pode criar um arquivo em `src/app/api/genkit/[...flow]/route.ts` (ou similar) para expor os fluxos. O plugin `genkitNext()` pode fornecer utilitários para isso.

2.  **Chamar o endpoint do frontend:**
    No frontend, você faria uma requisição HTTP (usando `fetch` ou uma biblioteca como `axios`) para o endpoint da API que aciona o fluxo Genkit.

    ```typescript
    // Exemplo de chamada no frontend
    async function getInsights(noteText: string) {
      try {
        const response = await fetch('/api/genkit/sessionNoteInsightsFlow', { // O nome do fluxo na URL
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ noteText }), // Objeto que corresponde ao inputSchema do fluxo
        });

        if (!response.ok) {
          throw new Error(`Erro da API: ${response.statusText}`);
        }
        const insights = await response.json();
        console.log(insights);
        // Usar os insights na UI
      } catch (error) {
        console.error("Falha ao buscar insights:", error);
      }
    }
    ```

## Considerações Éticas e de Privacidade

Ao lidar com dados de pacientes, mesmo que para gerar "insights", é **extremamente importante** considerar as implicações éticas e de privacidade:

*   **Anonimização/Pseudonimização:** Dados sensíveis devem ser adequadamente anonimizados ou pseudonimizados antes de serem enviados para modelos de IA, especialmente se forem modelos de terceiros.
*   **Consentimento:** Garanta que os pacientes consentiram com o uso de seus dados para tais finalidades.
*   **Segurança de Dados:** Proteja os dados em trânsito e em repouso.
*   **Transparência:** Seja transparente com os usuários (profissionais de saúde) sobre como a IA está sendo usada e quais são suas limitações.
*   **Regulamentações:** Cumpra todas as regulamentações de proteção de dados relevantes (ex: LGPD no Brasil, HIPAA nos EUA).

A documentação dos fluxos de IA deve incluir uma seção sobre essas considerações para cada fluxo que lida com dados potencialmente sensíveis.

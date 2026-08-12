import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de navegador do Deep Saúde.
 *
 * Duas decisões aqui não são detalhe de configuração — são o próprio objeto do
 * teste, e mexer nelas invalida a suíte:
 *
 * 1. `timezoneId: 'America/Sao_Paulo'`
 *    O calendário renderiza com `new Date(...).getHours()`, ou seja, no fuso do
 *    NAVEGADOR. Sem fixar o fuso, o mesmo teste passa na máquina de quem está
 *    em São Paulo e falha no CI em UTC — e pior, o contrário também: passaria
 *    por coincidência e não estaria verificando nada.
 *
 * 2. O backend NÃO fica em `localhost:3000`.
 *    Os rewrites do `next.config.ts` tinham `http://localhost:3000` fixo no
 *    destino. Como o módulo financeiro chama a API por caminho relativo, ele
 *    dependia inteiramente desses rewrites — e em produção, com backend em
 *    outro host, apontava para lugar nenhum. Testar com o backend em 3000 faz
 *    o teste passar sem provar nada, que era exatamente a armadilha. Por isso o
 *    padrão aqui é 3999.
 */

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3999';
const PORTA = Number(process.env.E2E_PORT ?? 9002);
const BASE = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar-dados.ts',

  // Folgado de propósito: `next dev` compila rota sob demanda, e a primeira
  // visita a uma tela pesada leva dezenas de segundos. O globalSetup aquece as
  // principais, mas o teto precisa acomodar as demais.
  timeout: 120_000,
  expect: { timeout: 20_000 },

  // Serial: a suíte compartilha um único banco semeado, e os testes do
  // financeiro alteram estado (marcam repasse, marcam pagamento). Rodar em
  // paralelo faria um teste enxergar a escrita do outro.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE,
    // Sessão criada uma única vez pelo globalSetup. Specs que precisam do
    // navegador deslogado sobrescrevem com test.use({ storageState: ... }).
    storageState: './e2e/.auth.json',
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // O alvo do rewrite. Ver o comentário 2 no topo.
      API_PROXY_TARGET: BACKEND,
      NEXT_PUBLIC_API_URL: BACKEND,
      NEXTAUTH_URL: BASE,
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET ?? 'segredo-apenas-para-e2e-nao-usar-em-producao',
    },
  },
});

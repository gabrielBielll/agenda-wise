import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export type DadosSemeados = {
  email: string;
  senha: string;
  clinica: string;
  paciente: string;
  psicologoId: string;
  pacienteId: string;
  /** null quando o semeador não conseguiu identificar a sessão. */
  agendamentoId: string | null;
  quando: string;
  dia: string;
};

export function dadosSemeados(): DadosSemeados {
  return JSON.parse(readFileSync(join(__dirname, '.dados-semeados.json'), 'utf8'));
}

/** Entra pelo formulário real de login e espera o dashboard carregar. */
export async function entrarComoAdmin(page: Page) {
  const { email, senha } = dadosSemeados();

  await page.goto('/admin/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.locator('input[type="password"]').fill(senha);
  await page.getByRole('button', { name: /entrar|acessar|login/i }).click();

  await page.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 });
}

/**
 * Troca a visão do calendário (Mês / Semana / Dia).
 *
 * O seletor é um Radix Select, que não é um `<select>` nativo: o trigger tem
 * role combobox e as opções só existem no DOM depois de abrir.
 */
export async function trocarVisao(page: Page, visao: 'Mês' | 'Semana' | 'Dia') {
  const gatilho = page.getByRole('combobox').first();
  const opcao = page.getByRole('option', { name: visao, exact: true });

  // O clique é repetido até o popover abrir de fato.
  //
  // Não é paranoia: `toBeVisible` no gatilho passa assim que o HTML do servidor
  // chega, mas o React ainda não hidratou — o handler de clique não existe e o
  // primeiro clique cai no vazio, silenciosamente. Em `next dev` isso acontecia
  // de forma intermitente e travava o teste até o timeout.
  await expect(async () => {
    if (!(await opcao.isVisible().catch(() => false))) {
      await gatilho.click({ timeout: 5_000 });
    }
    await expect(opcao).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });

  await opcao.click();
  // O Radix desmonta o popover ao escolher; esperar isso evita ler o conteúdo
  // velho na asserção seguinte.
  await expect(opcao).toBeHidden();
}

/**
 * Todos os rótulos "HH:MM - HH:MM" visíveis no calendário.
 *
 * É o texto que WeekView e DayView produzem para um agendamento. Comparar a
 * LISTA dos dois modos é o teste que importa: não interessa só que cada um
 * mostre "algum" horário, interessa que mostrem o MESMO.
 */
export async function horariosVisiveis(page: Page): Promise<string[]> {
  const textos = await page.locator('span.font-semibold').allInnerTexts();
  return textos
    .map((t) => t.trim())
    .filter((t) => /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(t))
    .map((t) => t.replace(/\s*-\s*/, ' - '));
}

/** Só o horário de início, que é o que o usuário lê como "a sessão é às X". */
export async function horariosDeInicio(page: Page): Promise<string[]> {
  return (await horariosVisiveis(page)).map((t) => t.split(' - ')[0]).sort();
}

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3999';

/**
 * Quantos registros existem de um recurso, perguntando ao backend direto.
 *
 * Serve a uma disciplina só: **a recusa tem que ser recusa.** Quando um teste
 * exercita uma guarda, ele precisa provar que nada foi criado — senão a
 * regressão cria o registro, o teste falha por outro motivo, e o estrago
 * aparece no arquivo seguinte.
 *
 * Com `workers: 1` e um banco semeado compartilhado, esse "arquivo seguinte" é
 * inocente e a mensagem de falha aponta para ele. Contar aqui faz a regressão
 * falhar onde nasceu. Diagnóstico da `orla` na mensageria 0055.
 *
 * O token é de módulo de propósito: o login é limitado a 10 tentativas por 5
 * minutos por e-mail (`core.clj`), e gastar uma por asserção é gastar orçamento
 * que não é do teste.
 */
let tokenDoAdmin: string | null = null;

export async function contarNoBackend(
  request: APIRequestContext,
  caminho: '/api/bloqueios' | '/api/agendamentos'
): Promise<number> {
  if (!tokenDoAdmin) {
    const { email, senha } = dadosSemeados();
    const login = await request.post(`${BACKEND}/api/auth/login`, { data: { email, senha } });
    expect(login.ok(), 'não consegui autenticar para contar no backend').toBeTruthy();
    tokenDoAdmin = (await login.json()).token;
  }

  const resposta = await request.get(`${BACKEND}${caminho}`, {
    headers: { Authorization: `Bearer ${tokenDoAdmin}` },
  });
  expect(resposta.ok(), `${caminho} não respondeu`).toBeTruthy();
  const lista = await resposta.json();
  return Array.isArray(lista) ? lista.length : 0;
}

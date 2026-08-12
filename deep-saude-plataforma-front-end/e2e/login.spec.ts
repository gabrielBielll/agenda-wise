import { test, expect } from '@playwright/test';
import { dadosSemeados, entrarComoAdmin } from './apoio';

// Contexto limpo: aqui o objeto do teste é o próprio formulário de login, então
// a sessão pré-autenticada do globalSetup atrapalharia.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Login pelo navegador.
 *
 * Vale por si: a autenticação foi mexida para remover um bypass em que o
 * `catch` gravava a senha digitada como novo hash e autenticava — qualquer
 * conta com hash ilegível era tomada por quem soubesse o e-mail. O backend já
 * tem cobertura disso; aqui o que se verifica é que a ponta do next-auth
 * continua conversando com ele.
 */

test('login válido entra no painel', async ({ page }) => {
  await entrarComoAdmin(page);
  await expect(page).toHaveURL(/\/admin\/dashboard/);
});

/** Texto do toast de erro. O componente renderiza título e descrição em nós
 *  separados, mais uma região aria-live que repete os dois — daí o `.first()`. */
function avisoDeErro(page: import('@playwright/test').Page) {
  return page.getByText(/credenciais inválidas/i).first();
}

test('senha errada não entra e avisa', async ({ page }) => {
  const { email } = dadosSemeados();

  await page.goto('/admin/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.locator('input[type="password"]').fill('senha-obviamente-errada');
  await page.getByRole('button', { name: /entrar|acessar|login/i }).click();

  await expect(avisoDeErro(page)).toBeVisible();
  await expect(page).not.toHaveURL(/dashboard/);
});

test('e-mail inexistente devolve a MESMA mensagem de senha errada', async ({ page }) => {
  // Mensagens diferentes para "usuário não existe" e "senha errada" viram
  // enumeração de contas: dá para descobrir quem é cliente da clínica só
  // testando e-mails. As duas telas têm que ser indistinguíveis.
  const { email } = dadosSemeados();

  await page.goto('/admin/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.locator('input[type="password"]').fill('senha-obviamente-errada');
  await page.getByRole('button', { name: /entrar|acessar|login/i }).click();
  const comSenhaErrada = await avisoDeErro(page).innerText();

  await page.goto('/admin/login');
  await page.getByLabel(/e-?mail/i).fill('ninguem-aqui@teste.local');
  await page.locator('input[type="password"]').fill('qualquer-coisa');
  await page.getByRole('button', { name: /entrar|acessar|login/i }).click();
  const comEmailInexistente = await avisoDeErro(page).innerText();

  expect(
    comEmailInexistente,
    'mensagens diferentes permitem enumerar quem tem conta na clínica'
  ).toBe(comSenhaErrada);
});

import { expect, test } from '@playwright/test';
import { hojeEmSaoPaulo } from './preparar-dados';

function previousDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

test('nome salvo nas preferências aparece na saudação', async ({ page }) => {
  await page.goto('/settings');
  const name = page.getByLabel('Nome de Exibição');
  await expect(name).toBeVisible();
  await name.fill('Aurora Nogueira');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.getByText('Seu nome foi atualizado em toda a AgendaWise.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nome de Exibição')).toHaveValue('Aurora Nogueira');

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /(Bom dia|Boa tarde|Boa noite), Aurora\./ })).toBeVisible();
});

test('clique no quarto de hora cria a sessão e permite confirmar presença manual', async ({ page }) => {
  const day = previousDate(hojeEmSaoPaulo());
  await page.goto('/calendar');
  const slot = page.locator(`[data-slot-date="${day}"][data-slot-hour="10"]`);
  await expect(slot).toBeVisible();
  await slot.click({ position: { x: 40, y: 30 } });

  await expect(page.getByRole('heading', { name: 'Novo Agendamento' })).toBeVisible();
  await expect(page.getByLabel('Início')).toHaveValue(`${day}T10:15`);
  await expect(page.getByLabel('Fim')).toHaveValue(`${day}T11:05`);
  await page.getByLabel('Paciente').click();
  await page.getByRole('option', { name: 'Paciente E2E' }).click();
  await page.getByLabel('Valor (R$)').fill('180');
  await page.getByRole('button', { name: 'Agendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo Agendamento' })).toBeHidden();

  await page.reload();
  const createdSlot = page.locator(`[data-slot-date="${day}"][data-slot-hour="10"]`);
  await createdSlot.getByText('Paciente E2E').click();
  await expect(page.getByRole('heading', { name: 'Editar Agendamento' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar que a sessão aconteceu' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar que a sessão aconteceu?' })).toBeVisible();
  await page.getByRole('button', { name: 'Sim, a sessão aconteceu' }).click();
  await expect(page.getByText('Sessão realizada', { exact: true })).toBeVisible();

  // A suíte compartilha banco. Remover o cenário criado evita que esta sessão
  // de ontem apareça na visão semanal de testes posteriores, mas não na diária.
  await page.reload();
  const cleanupSlot = page.locator(`[data-slot-date="${day}"][data-slot-hour="10"]`);
  await cleanupSlot.getByText('Paciente E2E').click();
  await page.getByRole('button', { name: 'Excluir agendamento' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir Agendamento?' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editar Agendamento' })).toBeHidden();
});

test('modal da agenda permanece alinhado no celular e no tema escuro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('agenda-wise-theme', 'dark'));
  await page.goto('/calendar?nova=1');

  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('heading', { name: 'Novo Agendamento' })).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400); // aguarda a animação de zoom antes de medir
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);

  const schedule = page.getByRole('button', { name: 'Agendar', exact: true });
  await schedule.scrollIntoViewIfNeeded();
  await expect(schedule).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/agenda-modal-mobile-dark.png', fullPage: true });
});

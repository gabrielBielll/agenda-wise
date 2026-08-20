import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('exporta e reimporta a base com prévia antes de escrever', async ({ page }) => {
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Pessoas, não prontuários.' })).toBeVisible();
  await page.getByRole('button', { name: 'Base de pacientes' }).click();
  await expect(page.getByRole('heading', { name: 'Leve sua base com você.' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /JSON Integrações/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^agenda-wise-pacientes-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const fileBuffer = await readFile(path!);
  const envelope = JSON.parse(fileBuffer.toString('utf8'));
  expect(envelope.schema).toBe('agenda-wise/pacientes@1');
  expect(envelope.pacientes.length).toBeGreaterThan(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: fileBuffer,
  });
  await expect(page.getByText('Pronta para importar')).toBeVisible();
  await expect(page.getByText('Pré-validação concluída. Nenhum dado foi alterado ainda.')).toBeVisible();
  await page.getByRole('button', { name: /Importar \d+ pacientes?/ }).click();
  await expect(page.getByText('Importação concluída')).toBeVisible();
});

test('não executa um arquivo SQL arbitrário', async ({ page }) => {
  await page.goto('/patients');
  await page.getByRole('button', { name: 'Base de pacientes' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'comandos.sql',
    mimeType: 'application/sql',
    buffer: Buffer.from('DROP TABLE pacientes;'),
  });
  await expect(page.getByText('Por segurança, o upload não executa SQL.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Importar \d+ pacientes?/ })).toHaveCount(0);
});

test('aceita CSV brasileiro separado por ponto e vírgula', async ({ page }) => {
  await page.goto('/patients');
  await page.getByRole('button', { name: 'Base de pacientes' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'pacientes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Nome;E-mail;Telefone\nPaciente da Planilha;planilha@teste.local;(11) 99999-0000\n'),
  });
  await expect(page.getByText('Pronta para importar')).toBeVisible();
  await expect(page.getByText('Pré-validação concluída. Nenhum dado foi alterado ainda.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar 1 paciente' })).toBeVisible();
});

test('diálogo continua utilizável no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/patients');
  await page.getByRole('button', { name: 'Base de pacientes' }).click();
  await expect(page.getByRole('heading', { name: 'Leve sua base com você.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /CSV Planilhas/i })).toBeVisible();
  await expect(page.getByText('Escolha ou solte sua base aqui')).toBeVisible();
  await page.screenshot({ path: 'test-results/portabilidade-mobile.png', fullPage: true });
});

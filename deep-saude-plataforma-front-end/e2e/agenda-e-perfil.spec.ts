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

  // ⚠️ O título do diálogo é "Novo na agenda" desde que sessão/bloquear/liberar
  // passaram a morar no mesmo lugar (`CalendarClient.tsx`). Enquanto isto dizia
  // "Novo Agendamento", o `getByRole('heading')` não achava NADA e o teste
  // esperava 20 s por um elemento que não existia mais — a captura do relatório
  // mostra o diálogo aberto, com o título NOVO, ao lado do localizador velho.
  // "Novo Agendamento" continua na tela, mas como BOTÃO, não como heading.

  await expect(page.getByRole('heading', { name: 'Novo na agenda' })).toBeVisible();
  await expect(page.getByLabel('Início')).toHaveValue(`${day}T10:15`);
  await expect(page.getByLabel('Fim')).toHaveValue(`${day}T11:05`);
  await page.getByLabel('Paciente').click();
  await page.getByRole('option', { name: 'Paciente E2E' }).click();
  await page.getByLabel('Valor (R$)').fill('180');
  await page.getByRole('button', { name: 'Agendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo na agenda' })).toBeHidden();

  await page.reload();
  const createdSlot = page.locator(`[data-slot-date="${day}"][data-slot-hour="10"]`);
  await createdSlot.getByText('Paciente E2E').click();
  await expect(page.getByRole('heading', { name: 'Editar Agendamento' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar que a sessão aconteceu' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar que a sessão aconteceu?' })).toBeVisible();
  await page.getByRole('button', { name: 'Sim, a sessão aconteceu' }).click();

  // ⚠️ Aqui havia `getByText('Sessão realizada', { exact: true })`, que casava com
  // o TÍTULO DO AVISO — e o aviso passou a se chamar "Estado atualizado" quando o
  // selo virou controle (`handleStatusUpdate`, `CalendarClient.tsx`). Não repus o
  // texto novo de propósito: aviso é alegação, não efeito, e este repositório já
  // pagou caro por confiar em mensagem de sucesso. O que provamos agora é o
  // estado GRAVADO, relido depois de um reload.
  //
  // 📌 O diálogo fecha sozinho no sucesso — então `toBeHidden` também reprova se
  // a atualização falhar, porque aí ele fica aberto com o erro.
  await expect(page.getByRole('heading', { name: 'Editar Agendamento' })).toBeHidden();

  // 🔴 R-021 mudou o mundo, e este trecho com ele. Antes ele APAGAVA a sessão de
  // ontem por higiene: o banco é compartilhado e, sem limpar, ela aparecia na
  // visão de SEMANA de specs posteriores. A R-021 agora protege toda sessão que
  // já aconteceu ou tem pagamento — o backend recusa o DELETE com 409
  // `past_or_paid_protected` em TODOS os modos —, e este harness não tem caminho
  // de limpeza por banco (só a API pública, que passou a recusar). Ou seja: o
  // DELETE de higiene ficou IMPOSSÍVEL, e a sessão PERSISTE de propósito. É por
  // isso que `calendario-fuso.spec.ts` foi feito resiliente a ela — não dá para
  // remover o dado, então o vizinho é que deixa de ler a semana inteira.
  //
  // 📌 O que era higiene virou PROVA. Temos em mãos exatamente o dado difícil de
  // semear que o lado do front da R-021 pede — uma sessão realizada e passada —,
  // então em vez de tentar apagá-la (e falhar), exercitamos a recusa: a tela não
  // pode fingir sucesso. É a A-013 aplicada à exclusão.
  await page.reload();
  const protegida = page.locator(`[data-slot-date="${day}"][data-slot-hour="10"]`);
  await protegida.getByText('Paciente E2E').click();
  // O efeito, lido do banco: o selo do diálogo mostra o estado por extenso.
  // `toContainText` e não texto exato — o selo carrega o glifo `■` ao lado.
  await expect(page.getByRole('dialog')).toContainText('Sessão realizada');
  await page.getByRole('button', { name: 'Excluir agendamento' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir Agendamento?' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();

  // 1. A recusa aparece NA TELA e nomeia a regra — não um "Falha" mudo. Antes da
  // correção em `calendar/actions.ts`, o handler descartava o corpo do 409 e a
  // psicóloga via um vermelho sem motivo (A-013).
  await expect(
    page.getByText(/não é possível excluir uma sessão que já aconteceu ou tem pagamento/i),
    'a R-021 recusou o DELETE (409) e a tela não disse por quê — é a A-013 na exclusão'
  ).toBeVisible();

  // 2. E o que mais importa: a sessão NÃO some. O diálogo de edição continua
  // aberto porque `executeDelete` só fecha no sucesso; fechá-lo aqui seria a tela
  // fingindo uma exclusão que o servidor recusou — a tela mentindo sobre a falha.
  await expect(
    page.getByRole('heading', { name: 'Editar Agendamento' }),
    'o diálogo fechou como se a exclusão tivesse dado certo — a tela mentiu sobre a falha'
  ).toBeVisible();
});

test('modal da agenda permanece alinhado no celular e no tema escuro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('agenda-wise-theme', 'dark'));
  await page.goto('/calendar?nova=1');

  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('heading', { name: 'Novo na agenda' })).toBeVisible();
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

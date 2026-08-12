import { test, expect } from '@playwright/test';
import { trocarVisao, horariosDeInicio, dadosSemeados } from './apoio';
import { HORA_DA_SESSAO } from './preparar-dados';

/**
 * O teste que originou os commits "Hotfix-ui-calendar".
 *
 * O sintoma era o pior tipo de bug: silencioso. A visão de semana e a de dia
 * mostravam horários DIFERENTES para o mesmo agendamento, porque o mesmo campo
 * era parseado de três jeitos diferentes — um deles removendo o sufixo de fuso
 * na mão, o que desloca o horário em 3h sem erro nenhum.
 *
 * Nenhum teste de unidade pega isso: cada componente, isolado, "funciona". O
 * defeito só existe na comparação entre eles, com um navegador de verdade num
 * fuso de verdade. É exatamente o que esta suíte faz.
 */

test.describe('calendário — fuso horário entre visões', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('semana e dia mostram o MESMO horário para a mesma sessão', async ({ page }) => {
    await trocarVisao(page, 'Semana');
    const naSemana = await horariosDeInicio(page);

    await trocarVisao(page, 'Dia');
    const noDia = await horariosDeInicio(page);

    expect(naSemana.length, 'a sessão semeada precisa aparecer na visão de semana').toBeGreaterThan(0);
    expect(noDia.length, 'a sessão semeada precisa aparecer na visão de dia').toBeGreaterThan(0);

    expect(
      noDia,
      'semana e dia divergiram — é a regressão de fuso que gerou os commits Hotfix-ui-calendar'
    ).toEqual(naSemana);
  });

  test('o horário exibido é o horário de parede que foi agendado', async ({ page }) => {
    // A sessão foi criada às 14:00 de São Paulo. Com o navegador fixado nesse
    // fuso, é 14:00 que tem que aparecer — não 17:00 (UTC) nem 11:00.
    await trocarVisao(page, 'Dia');
    const horarios = await horariosDeInicio(page);

    expect(horarios).toContain(HORA_DA_SESSAO);
  });

  test('a sessão cai no dia certo do calendário', async ({ page }) => {
    // Um deslocamento de fuso perto da meia-noite não muda só a hora: joga a
    // sessão para o dia anterior ou seguinte. Por isso a checagem da data.
    const { dia } = dadosSemeados();
    const [ano, mes, diaDoMes] = dia.split('-').map(Number);

    // A visão de dia rotula como "quarta-feira, 12 de agosto" — dia e mês por
    // extenso, sem ano. Por isso a asserção é sobre esses dois.
    const nomeDoMes = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(Date.UTC(ano, mes - 1, 15)));

    await trocarVisao(page, 'Dia');
    // O `h2` que interessa é o do intervalo de datas, não o título "Calendário"
    // da página — por isso o filtro por dígito.
    const cabecalho = page.locator('h2').filter({ hasText: /\d/ }).first();
    await expect(cabecalho).toContainText(new RegExp(`\\b${diaDoMes}\\b`));
    await expect(cabecalho).toContainText(new RegExp(nomeDoMes, 'i'));
  });
});

test.describe('calendário — o fuso do navegador não pode mudar o horário', () => {
  // Contraprova. O horário de parede vem do backend em UTC e é convertido no
  // cliente; se algum caminho ainda estivesse cortando o sufixo de fuso na mão,
  // um navegador em Tóquio mostraria a mesma hora que um em São Paulo — e é
  // justamente isso que estaria ERRADO. Aqui esperamos que mude.
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('navegador em Tóquio mostra a mesma sessão em outro horário local', async ({ page }) => {
    await page.goto('/calendar');
    await trocarVisao(page, 'Semana');

    const emToquio = await horariosDeInicio(page);

    // 14:00 em São Paulo (UTC-3) é 02:00 do dia seguinte em Tóquio (UTC+9).
    // Se aparecesse 14:00 aqui também, significaria que o horário está sendo
    // tratado como texto solto, sem instante por trás — o bug original.
    expect(
      emToquio,
      'em Tóquio o horário local tem que ser diferente; igual significaria que o fuso está sendo ignorado'
    ).not.toContain(HORA_DA_SESSAO);
  });
});

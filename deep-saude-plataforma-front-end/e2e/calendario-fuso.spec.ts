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
    /**
     * ⚠️ Isto era `expect(page.getByRole('combobox').first()).toBeVisible()`, que
     * afirma só que **algum** combobox apareceu. Numa tela com vários, isso passa
     * mesmo que o seletor de visão — o único controle que este arquivo usa — não
     * tenha renderizado; e aí a falha aparece lá na frente, no `trocarVisao`,
     * apontando para o lugar errado.
     *
     * Agora a espera é pelo controle que o teste realmente precisa, reconhecido
     * pelo conteúdo. Ele não tem nome acessível ([A11Y-001]) — quando tiver,
     * isto vira `getByRole('combobox', { name: /visualiza/i })`.
     */
    await expect(
      page.getByRole('combobox').filter({ hasText: /m[êe]s|semana|dia/i }).first(),
      'o seletor de visão do calendário não apareceu — sem ele o resto do arquivo ' +
        'não tem o que exercitar'
    ).toBeVisible();
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

test.describe('calendário — o horário exibido é o da clínica, em qualquer fuso', () => {
  /**
   * ⚠️ ESTA ASSERÇÃO FOI INVERTIDA EM 2026-08-15, DE PROPÓSITO.
   *
   * Até aqui este bloco exigia o OPOSTO: que Tóquio mostrasse um horário
   * diferente (`not.toContain`). A intenção original era boa — pegar o bug de
   * tratar o timestamp como texto solto, cortando o sufixo de fuso na mão. Mas
   * a asserção escolhida para isso fixou, de lambuja, um modelo de produto:
   * "cada um vê a sessão no seu próprio relógio".
   *
   * Esse modelo é o que produzia a corrupção do item 1 da revisão pré-produção:
   * a leitura convertia para o fuso do navegador e a escrita mandava o literal
   * do input, que o backend lê como São Paulo. Abrir a tela de edição em Tóquio
   * e clicar Salvar sem tocar na data movia a sessão 12 horas, para o dia
   * seguinte, calado. Medido e detalhado na mensageria 0031.
   *
   * O Gabriel decidiu em 2026-08-15: uma sessão marcada para as 14:00 é às
   * 14:00 DA CLÍNICA, e é isso que todo mundo vê. A contrapartida aceita é que
   * o psicólogo em viagem enxerga o horário da clínica, não o do relógio dele.
   *
   * O bug original que este bloco existia para pegar continua coberto — pelo
   * teste "semana e dia mostram o MESMO horário" e por "o horário exibido é o
   * horário de parede que foi agendado", ambos acima. O que este aqui prova
   * agora é a outra metade: que o fuso de quem olha não move a sessão.
   */
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('navegador em Tóquio mostra a sessão no mesmo horário da clínica', async ({ page }) => {
    await page.goto('/calendar');
    await trocarVisao(page, 'Semana');

    const emToquio = await horariosDeInicio(page);

    expect(
      emToquio,
      'Tóquio tem que ver 14:00 como São Paulo — horário diferente significa que o fuso do navegador voltou a vazar para a tela'
    ).toContain(HORA_DA_SESSAO);
  });
});

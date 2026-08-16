import { test, expect, type Page } from '@playwright/test';
import { contarNoBackend, dadosSemeados } from './apoio';
import { CONTA, DURACAO_DA_SESSAO, HORA_DA_SESSAO } from './preparar-dados';

/**
 * O único teste que atravessa a fronteira inteira da R-014.
 *
 * As três partes existiam verificadas **em separado** e nenhuma junta:
 *
 * | Parte | Quem | Como estava provada |
 * |---|---|---|
 * | contrato `session_conflict` | `orla` | escrito na mensageria 0043 |
 * | guarda que recusa e devolve `sessoes` | `duna` | teste de backend, `414ded1` |
 * | tela que lista dia e hora | `vale` | formatador medido em 4 fusos |
 *
 * Ninguém tinha provado que o clique chega lá. Este arquivo prova.
 *
 * ## O que a R-014 exige, e por que "recusou" não basta
 *
 * A regra não diz só recusar bloqueio sobre sessão marcada: diz recusar
 * **mostrando o dia e a hora de cada sessão atingida**, para a pessoa conseguir
 * resolver antes. Um teste que só assertasse "apareceu erro" passaria com um
 * toast dizendo "falha ao criar bloqueio" — que cumpre a letra e perde o ponto.
 * Por isso a asserção é sobre o horário da sessão aparecer na tela.
 *
 * ## Se a guarda regredir, a falha aparece AQUI
 *
 * O caminho feliz é o backend **recusar**, então nada é criado. Se a guarda cair,
 * o bloqueio é criado de verdade — e o estrago não fica neste arquivo: com
 * `workers: 1`, o próximo teste a abrir a edição daquela sessão leva 409 do
 * `bloqueio-existente`, não redireciona, e estoura o `waitForURL` acusando um
 * arquivo inocente.
 *
 * Por isso o teste conta os bloqueios antes e depois. A regressão falha onde
 * nasceu, com o nome certo — em vez de derrubar o vizinho.
 */

/** Janela que engloba a sessão semeada (14:00–14:50) com folga dos dois lados. */
const BLOQUEIO_INICIO = '13:00';
const BLOQUEIO_FIM = '15:00';

/** "2026-08-16" -> "16/08", que é como a tela escreve. Recorte de string, sem aritmética de fuso. */
function diaEMes(dia: string): string {
  const [, mes, diaDoMes] = dia.split('-');
  return `${diaDoMes}/${mes}`;
}

async function abrirDialogoDeBloqueio(page: Page) {
  await page.goto('/admin/agendamentos');
  const gatilho = page.getByRole('button', { name: /bloquear hor[áa]rio/i });

  // Clique repetido até o diálogo abrir: `toBeVisible` no gatilho passa assim que
  // o HTML chega, mas o React ainda não hidratou e o primeiro clique cai no
  // vazio. Mesmo motivo do `trocarVisao` em apoio.ts.
  const dialogo = page.getByRole('dialog').filter({ hasText: /bloquear hor[áa]rio/i });
  await expect(async () => {
    if (!(await dialogo.isVisible().catch(() => false))) {
      await gatilho.first().click({ timeout: 5_000 });
    }
    await expect(dialogo).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });

  return dialogo;
}

async function tentarBloquearPorCimaDaSessao(page: Page) {
  const { dia } = dadosSemeados();
  const dialogo = await abrirDialogoDeBloqueio(page);

  // Psicólogo: combobox do cmdk — as opções só existem depois de abrir.
  await dialogo.getByRole('combobox').first().click();
  await page.getByRole('option', { name: CONTA.psicologoNome }).first().click();

  const datas = dialogo.locator('input[type="datetime-local"]');
  await datas.nth(0).fill(`${dia}T${BLOQUEIO_INICIO}`);
  await datas.nth(1).fill(`${dia}T${BLOQUEIO_FIM}`);

  await dialogo.getByRole('button', { name: /criar bloqueio/i }).click();

  return page.getByRole('dialog').filter({ hasText: /não dá para bloquear|nao da para bloquear/i });
}

/** A sessão semeada, como a tela deve escrevê-la: "16/08" e "14:00 – 14:50". */
function comoATelaEscreve(dia: string) {
  const [h, m] = HORA_DA_SESSAO.split(':').map(Number);
  const fimMin = h * 60 + m + DURACAO_DA_SESSAO;
  const fim = `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}`;
  return { dia: diaEMes(dia), intervalo: `${HORA_DA_SESSAO} – ${fim}` };
}

test.describe('bloqueio sobre sessão marcada — a recusa mostra dia e hora', () => {
  test('a tela lista a sessão atingida, não só "deu erro"', async ({ page, request }) => {
    const { dia } = dadosSemeados();
    const esperado = comoATelaEscreve(dia);
    const antes = await contarNoBackend(request, '/api/bloqueios');

    const recusa = await tentarBloquearPorCimaDaSessao(page);

    await expect(
      recusa,
      'a R-014 manda recusar MOSTRANDO as sessões; um erro genérico aqui é a regra cumprida pela metade'
    ).toBeVisible();

    await expect(
      recusa,
      'a linha da sessão precisa trazer o dia — sem ele a pessoa não sabe o que remarcar'
    ).toContainText(esperado.dia);

    await expect(
      recusa,
      'e a hora de início e fim, que é o que a R-014 pede por escrito'
    ).toContainText(esperado.intervalo);

    // A recusa tem que ser recusa: nada criado. Ver o comentário de
    // `contarNoBackend` — sem isto, a regressão derruba o arquivo vizinho e
    // esconde o próprio nome.
    expect(
      await contarNoBackend(request, '/api/bloqueios'),
      'o backend recusou na tela mas criou o bloqueio — a guarda da R-014 caiu, e é aqui que isso tem que aparecer'
    ).toBe(antes);
  });
});

test.describe('bloqueio sobre sessão — o fuso de quem olha não muda o que a recusa diz', () => {
  /**
   * Lisboa tem horário de verão; São Paulo não tem desde 2019. Se a lista fosse
   * formatada a partir do instante com `toLocaleString`, este bloco mostraria
   * outro horário — o defeito do item 1 reaparecendo dentro da tela de conflito,
   * que é código escrito depois de a D-010 fechar.
   *
   * ⚠️ Escolhi um fuso com DST de propósito, mas a janela da sessão (14:00–14:50)
   * não contém virada de relógio nenhuma. É deliberado: a **A-008(a)** diz que
   * somar duração em tempo real sobre o espelho de parede erra quando a virada
   * cai dentro da sessão, e essa correção não é para agora — a `orla` quer as
   * duas metades da A-008 na mesma conversa. Este teste prova o caminho comum
   * sem cobrar o limite conhecido.
   */
  test.use({ timezoneId: 'Europe/Lisbon' });

  test('em Lisboa, a recusa mostra o mesmo horário da clínica', async ({ page }) => {
    const { dia } = dadosSemeados();
    const esperado = comoATelaEscreve(dia);

    const recusa = await tentarBloquearPorCimaDaSessao(page);

    await expect(recusa).toBeVisible();
    await expect(
      recusa,
      'horário diferente aqui significa que a lista de conflitos voltou a formatar no fuso de quem olha'
    ).toContainText(esperado.intervalo);
  });
});

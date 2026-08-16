import { test, expect, type Page } from '@playwright/test';
import { dadosSemeados } from './apoio';
import { HORA_DA_SESSAO } from './preparar-dados';

/**
 * O teste que faltava para o item 1 da revisão pré-produção.
 *
 * A suíte de calendário (`calendario-fuso.spec.ts`) prova três coisas sobre
 * **exibição**: que semana e dia concordam, que o horário exibido é o que foi
 * agendado, e que o fuso de quem olha não muda o que aparece.
 *
 * Nenhuma delas pegava o defeito de verdade, porque ele era de **escrita**.
 * A leitura convertia o instante para o fuso do navegador e a escrita mandava o
 * literal do input, que o backend interpreta como São Paulo. Ida e volta
 * discordavam entre si: abrir a tela de edição fora de São Paulo e clicar
 * Salvar **sem tocar em nada** deslocava a sessão — 4h em Lisboa, 12h e virada
 * de dia em Tóquio. Medido em 2026-08-15, mensageria 0031.
 *
 * Um agendamento que anda sozinho porque alguém abriu a tela é da mesma família
 * da A-001: corrupção silenciosa, sem aviso e sem confirmação.
 *
 * O comportamento correto está fixado na D-010: horário de parede é o da
 * CLÍNICA. Este arquivo prova a metade da escrita.
 *
 * ⚠️ **O bloco que importa é o segundo.** Com o navegador em São Paulo — que é
 * o padrão do `playwright.config.ts` — o defeito antigo era invisível, porque o
 * fuso do navegador coincidia com o da clínica. O primeiro bloco é a linha de
 * base; o de Tóquio é o que teria falhado antes da correção.
 */

/** O horário de parede que a sessão semeada tem, no fuso da clínica. */
const esperado = (dia: string) => `${dia}T${HORA_DA_SESSAO}`;

async function abrirEdicao(page: Page, id: string) {
  await page.goto(`/admin/agendamentos/${id}/edit`);
  const inicio = page.locator('#data_hora_sessao');
  await expect(inicio).toBeVisible();
  return inicio;
}

/**
 * Abre, salva sem alterar campo nenhum, e reabre.
 *
 * Salvar redireciona para a listagem — esperar por essa URL é o que garante que
 * o formulário foi de fato aceito. Se a validação recusar, a tela fica onde
 * está e o `waitForURL` estoura, que é o sinal certo de falha.
 */
async function salvarSemTocarEReabrir(page: Page, id: string) {
  await page.getByRole('button', { name: /salvar altera/i }).click();
  await page.waitForURL(/\/admin\/agendamentos\/?$/, { timeout: 60_000 });
  return abrirEdicao(page, id);
}

/**
 * Abre, guarda o literal que a tela mostra, salva sem tocar, e devolve os dois.
 *
 * A comparação que vale é **literal contra literal**: o que a tela mostrava
 * antes contra o que ela mostra depois. Comparar contra uma data calculada aqui
 * colocaria dentro do teste a mesma aritmética de fuso que está sendo julgada —
 * e um teste que erra igual ao código concorda com o bug em vez de pegá-lo.
 *
 * (A conferência contra o literal semeado é feita à parte, e prova outra coisa:
 * que a LEITURA abre no horário certo. Esta aqui prova que salvar não move.)
 */
async function antesEDepoisDeSalvar(page: Page, id: string) {
  const antes = await (await abrirEdicao(page, id)).inputValue();
  const depois = await (await salvarSemTocarEReabrir(page, id)).inputValue();
  return { antes, depois };
}

test.describe('edição do admin — salvar sem tocar não move a sessão', () => {
  test('no fuso da clínica: abre em 14:00 e continua 14:00 depois de salvar', async ({ page }) => {
    const { dia, agendamentoId } = dadosSemeados();
    // Falha, não pula. Teste que pula em silêncio quando o fixture quebra fica
    // verde para sempre provando nada — é a mesma doença do CI que nunca ficou
    // vermelho.
    expect(
      agendamentoId,
      'o semeador não achou o id da sessão de hoje. Não é falha do app: é fixture quebrado, em preparar-dados.ts/idDaSessaoSemeada'
    ).toBeTruthy();

    const { antes, depois } = await antesEDepoisDeSalvar(page, agendamentoId!);

    expect(antes, 'o formulário tem que abrir no horário de parede que foi agendado').toBe(
      esperado(dia)
    );
    expect(depois, 'salvar sem alterar nada não pode mudar o horário').toBe(antes);
  });
});

test.describe('edição do admin — em outro fuso, salvar continua não movendo', () => {
  // 14:00 em São Paulo é 02:00 do dia seguinte em Tóquio. Antes da D-010 o
  // formulário abria em 02:00 e gravava 02:00 como horário de parede da
  // clínica: a sessão andava 12 horas e mudava de dia, sem ninguém tocar nela.
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('em Tóquio: abre no horário da clínica e salvar não desloca', async ({ page }) => {
    const { dia, agendamentoId } = dadosSemeados();
    // Falha, não pula. Teste que pula em silêncio quando o fixture quebra fica
    // verde para sempre provando nada — é a mesma doença do CI que nunca ficou
    // vermelho.
    expect(
      agendamentoId,
      'o semeador não achou o id da sessão de hoje. Não é falha do app: é fixture quebrado, em preparar-dados.ts/idDaSessaoSemeada'
    ).toBeTruthy();

    const { antes, depois } = await antesEDepoisDeSalvar(page, agendamentoId!);

    expect(
      antes,
      'o formulário mostra o horário da CLÍNICA; 02:00 aqui significa que o fuso do navegador voltou a vazar para a leitura'
    ).toBe(esperado(dia));

    expect(
      depois,
      'esta é a asserção que teria pegado o item 1: valor diferente aqui significa que a sessão andou só por alguém ter aberto e salvo a tela'
    ).toBe(antes);
  });
});

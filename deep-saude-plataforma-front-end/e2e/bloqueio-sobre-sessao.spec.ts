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

  /**
   * Psicólogo: combobox do cmdk — as opções só existem depois de abrir.
   *
   * ⚠️ `.first()` aqui escolhe entre **dois** controles com `role="combobox"`
   * neste diálogo: o do psicólogo e o de "Repetição". Hoje acerta por ordem do
   * DOM, e nada no teste diz que era isso que ele queria.
   *
   * Nenhum dos dois tem nome acessível — o do psicólogo é um `<Button
   * role="combobox">`, e sobrescrever o papel para `combobox` **desliga o
   * nome-pelo-conteúdo** que um `button` teria. É o [A11Y-001].
   *
   * A asserção abaixo prova pelo efeito: depois de escolher, o gatilho tem que
   * exibir o nome do psicólogo. Se a ordem mudar, isto cai dizendo o que houve.
   */
  /**
   * ✅ O gatilho de migração que eu deixei escrito aqui **disparou** — A11Y-001a.
   *
   * Antes era `dialogo.getByRole('combobox').first()` mais uma guarda de texto,
   * porque **nenhum dos dois combobox deste diálogo tinha nome acessível**: o do
   * psicólogo é um `<Button role="combobox">`, e sobrescrever o papel desliga o
   * nome-pelo-conteúdo que um `button` teria.
   *
   * Agora os dois têm `id` casando o `<Label htmlFor>`, então dá para pedir o
   * controle **pelo nome** — e some de vez a escolha por ordem do DOM. A guarda
   * de texto que a `orla` me ensinou na 0111 sai junto: ela existia para separar
   * dois anônimos, e não há mais anônimo para separar.
   */
  const gatilhoPsicologo = dialogo.getByRole('combobox', { name: /psic[óo]logo/i });
  await expect(
    gatilhoPsicologo,
    'o combobox de psicólogo não tem nome acessível — a A11Y-001a regrediu, e um ' +
      'leitor de tela volta a anunciar só "combobox" neste diálogo'
  ).toBeVisible();
  await gatilhoPsicologo.click();
  await page.getByRole('option', { name: CONTA.psicologoNome }).first().click();
  await expect(
    gatilhoPsicologo,
    'escolhi o psicólogo e o seletor não passou a mostrá-lo — o `.first()` pode ' +
      'ter aberto o combobox de "Repetição", que é o outro deste diálogo'
  ).toContainText(CONTA.psicologoNome);

  const datas = dialogo.locator('input[type="datetime-local"]');
  await datas.nth(0).fill(`${dia}T${BLOQUEIO_INICIO}`);
  await datas.nth(1).fill(`${dia}T${BLOQUEIO_FIM}`);

  await dialogo.getByRole('button', { name: /criar bloqueio/i }).click();

  return {
    recusa: page.getByRole('dialog').filter({ hasText: /não dá para bloquear|nao da para bloquear/i }),
    dialogo,
    periodo: { inicio: `${dia}T${BLOQUEIO_INICIO}`, fim: `${dia}T${BLOQUEIO_FIM}` },
  };
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

    const { recusa } = await tentarBloquearPorCimaDaSessao(page);

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

    const { recusa } = await tentarBloquearPorCimaDaSessao(page);

    await expect(recusa).toBeVisible();
    await expect(
      recusa,
      'horário diferente aqui significa que a lista de conflitos voltou a formatar no fuso de quem olha'
    ).toContainText(esperado.intervalo);
  });
});

test.describe('a recusa devolve o formulário — guarda do lado que já está certo', () => {
  /**
   * ⚠️ ESTE TESTE PASSA HOJE. Não é o vermelho da A-010, e a diferença importa.
   *
   * A `orla` registrou a A-010 a partir deste trecho (mensageria 0059):
   *
   * ```tsx
   * defaultValue={newAppointmentDate ? paredeParaInput(newAppointmentDate) : ""}
   * ```
   *
   * Só que esse trecho é do **`CalendarClient`**, e o diálogo que este arquivo
   * dirige é o do **`AgendamentosClient`** — e os dois não são iguais:
   *
   * | Tela | Campos de data | Sobrevive ao fechar? |
   * |---|---|---|
   * | `admin/agendamentos` | `value={blockStart}` + `onChange` — controlado | sim, o estado é do componente pai |
   * | `(app)/calendar` | `defaultValue=…` — não controlado | não, o Radix desmonta e remonta do slot |
   *
   * Então a A-010 é **só do calendário**. Aqui o comportamento já é o certo, e o
   * teste existe para que continue sendo: trocar `value` por `defaultValue`
   * "para simplificar" é uma linha, e sem esta asserção ninguém veria.
   *
   * O vermelho da A-010 mora no calendário e não está escrito ainda — dirigir
   * aquele diálogo exige clicar num slot da grade e passar por um menu de
   * contexto, e escrever isso sem conseguir rodar é convite a vermelho pelo
   * motivo errado. Perguntado na mensageria.
   */
  test('o período digitado sobrevive à recusa', async ({ page }) => {
    const { recusa, dialogo, periodo } = await tentarBloquearPorCimaDaSessao(page);
    await expect(recusa).toBeVisible();

    await recusa.getByRole('button', { name: /voltar e ajustar/i }).click();
    await expect(dialogo).toBeVisible();

    const datas = dialogo.locator('input[type="datetime-local"]');
    await expect(
      datas.nth(0),
      'o início se perdeu: "Voltar e ajustar" devolveu formulário em branco'
    ).toHaveValue(periodo.inicio);
    await expect(
      datas.nth(1),
      'o fim se perdeu pelo mesmo motivo'
    ).toHaveValue(periodo.fim);
  });
});

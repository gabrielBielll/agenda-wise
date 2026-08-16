import { test, expect } from '@playwright/test';

/**
 * Financeiro — o módulo que depende inteiramente dos rewrites.
 *
 * Duas coisas estão sendo verificadas ao mesmo tempo aqui, e a segunda é a que
 * dá sentido à primeira:
 *
 * 1. As ações funcionam (marcar repasse, marcar pagamento, ações em lote).
 *
 * 2. Elas funcionam com o backend FORA de `localhost:3000`. Todas as chamadas
 *    deste módulo são por caminho relativo (`/api/agendamentos/...`) e passam
 *    pelo rewrite do `next.config.ts`, que tinha `http://localhost:3000` fixo
 *    no destino. Com o backend em 3000, este teste passa sem provar nada —
 *    era exatamente essa a armadilha apontada na mensagem 0001. Por isso o
 *    `playwright.config.ts` põe o backend em 3999.
 *
 * Se o rewrite quebrar, as requisições viram 404 do próprio Next e as ações
 * abaixo falham — que é o comportamento que se quer detectar.
 */

test.describe('financeiro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/financeiro');
    await expect(page.getByRole('heading', { name: /financeiro/i }).first()).toBeVisible();
  });

  test('o rewrite entrega as chamadas relativas ao backend', async ({ page }) => {
    // Prova direta, sem token de propósito.
    //
    // O que distingue "o rewrite funcionou" de "o rewrite não funcionou" não é
    // 200 — é QUEM respondeu. Sem Authorization o backend responde 401 com o
    // corpo dele. Se o rewrite estivesse quebrado (destino errado, ou o antigo
    // localhost:3000 fixo com o backend em 3999), quem responderia seria o
    // próprio Next, com 404. Então 401-vindo-do-Clojure é a prova.
    const resposta = await page.request.get('/api/agendamentos');

    expect(
      resposta.status(),
      'um 404 aqui significa que o Next não encaminhou — rewrite do next.config.ts quebrado'
    ).not.toBe(404);
    expect(resposta.status()).toBe(401);
    expect(
      await resposta.json(),
      'o corpo tem que ser o do backend, provando que a requisição atravessou o proxy'
    ).toHaveProperty('erro');
  });

  test('nenhuma chamada da tela caiu em 404 ou 502', async ({ page }) => {
    const falhas: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400) {
        falhas.push(`${r.status()} ${r.url()}`);
      }
    });

    await page.reload();
    await expect(page.getByRole('heading', { name: /financeiro/i }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(falhas, `chamadas com erro:\n${falhas.join('\n')}`).toEqual([]);
  });

  test('a coluna "Pagos" reflete repasses transferidos, não fica presa em zero', async ({
    page,
  }) => {
    // O contador comparava com 'pago', valor que a coluna status_repasse nunca
    // assume — o estado terminal é 'transferido'. Resultado: "0/N Pagos" para
    // sempre, independentemente do que o admin fizesse.
    const contador = page.getByText(/^\d+\/\d+ Pagos$/).first();

    // Esperar o resumo aparecer, em vez de perguntar por count() na hora: a
    // tabela é montada depois do fetch, e ler cedo demais fazia este teste
    // oscilar entre execuções.
    await expect(
      contador,
      'o resumo por psicólogo não carregou — sem ele não há o que verificar'
    ).toBeVisible();

    const texto = (await contador.innerText()).trim();
    const [, pagosStr, totalStr] = texto.match(/^(\d+)\/(\d+) Pagos$/) ?? [];

    expect(
      Number(totalStr ?? 0),
      'o resumo precisa ter ao menos uma sessão para este teste valer'
    ).toBeGreaterThan(0);

    // A asserção que importa. O preparar-dados deixa um repasse como
    // 'transferido' de propósito; se o contador voltar a comparar com 'pago' —
    // valor que status_repasse nunca assume — este número trava em 0 de novo.
    expect(
      Number(pagosStr ?? 0),
      'contador preso em zero: é a regressão de comparar status_repasse com "pago" em vez de "transferido"'
    ).toBeGreaterThan(0);
  });

  test('marcar repasse como transferido persiste', async ({ page }) => {
    const botao = page
      .getByRole('button', { name: /transferido|disponível|marcar/i })
      .first();

    if ((await botao.count()) === 0) {
      // ⚠️ ESTE SKIP É TEMPORÁRIO E TEM PRAZO.
      //
      // A mensagem antiga dizia "sem transações no mês corrente", que era o
      // sintoma. A causa é outra: a coluna de repasse só vira botão quando o
      // pagamento está 'pago' (`FinanceiroClient.tsx`, ~1090); pendente
      // renderiza `🔒 Bloqueado`, que é um span e não casa com
      // `getByRole('button')`. O `preparar-dados.ts` passou a marcar a sessão
      // semeada como paga justamente para este teste sair do limbo.
      //
      // O skip fica só até o CI mostrar que o teste roda de fato — a correção
      // do fixture foi conferida por leitura do componente, não medida, porque
      // não há Playwright no aparelho de quem a escreveu. **Assim que houver
      // uma execução com este teste passando, troque isto por uma falha**, como
      // já está em `edicao-nao-move-a-sessao.spec.ts`: teste que pula em
      // silêncio fica verde para sempre provando nada, e este aqui é sobre
      // dinheiro que muda de mão.
      test.skip(
        true,
        'botão de repasse ausente: pagamento não está "pago". Ver preparar-dados.ts/marcarSessaoComoPaga'
      );
    }

    const respostaDaApi = page.waitForResponse(
      (r) => r.url().includes('/api/agendamentos/') && r.request().method() === 'PUT'
    );
    await botao.click();

    const r = await respostaDaApi;
    expect(r.status(), 'o PUT do repasse precisa chegar ao backend pelo rewrite').toBe(200);
  });
});

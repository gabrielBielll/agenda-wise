import { test, expect } from '@playwright/test';
import { CONTA } from './preparar-dados';

/**
 * GC-001a — o painel do Google, e a única coisa que ele não pode fazer é mentir.
 *
 * O backend já respondia em dez rotas; faltava tela. O cartão nomeia o coração
 * dela: **`sem_acesso` precisa gritar**. Se alguém descompartilha uma agenda no
 * Google, a sincronização morre — e sem aviso alto a clínica segue meses achando
 * que está integrada.
 *
 * É a **A-013 num endereço novo**, e aqui a mentira é mais convincente do que na
 * lista de pacientes: lá havia uma lista vazia para estranhar; aqui há uma linha
 * bonita com um rótulo cinza.
 *
 * ---
 *
 * ## ⚠️ O QUE ESTE ARQUIVO **NÃO** COBRE, e por quê
 *
 * Está escrito aqui, e não só na mensageria, porque quem ler o nome do arquivo
 * daqui a um mês vai achar que "o painel do Google está coberto".
 *
 * 🔴 **A faixa de `sem_acesso` não tem teste.** Para exercitá-la é preciso uma
 * linha em `vinculo_agenda` com `status = 'sem_acesso'`, e **não existe rota que
 * crie uma**: o status só nasce de uma sincronização real contra o Google
 * descobrindo que o acesso caiu. O semeador desta suíte fala só HTTP
 * (`preparar-dados.ts`), então ele não alcança.
 *
 * As saídas, para quem for fechar isso:
 *   (a) o semeador ganhar acesso ao banco e inserir o vínculo direto — é o
 *       caminho honesto, e muda a natureza do semeador;
 *   (b) esperar o GC-000 e uma conta de teste de verdade no Google.
 *
 * 📌 **Não simulei com `page.route`**: a página é *server component*, o `fetch`
 * sai do servidor Next e nunca toca o navegador. Um `route` aqui seria ignorado
 * em silêncio e o teste passaria **achando** que exercitou a faixa. Medido na
 * mensageria 0072, e é o mesmo motivo que impediu a simulação do 403 da A-013.
 *
 * ✅ **O que está coberto:** que a tela existe, que ela é do admin, e que quando
 * não há conexão ela **diz isso** em vez de mostrar uma tela vazia — que é a
 * mesma família de defeito, na única forma que dá para alcançar hoje.
 */

test.describe('GC-001a — o painel da integração', () => {
  test('o admin abre o painel e ele declara o estado em vez de ficar vazio', async ({ page }) => {
    await page.goto('/admin/integracoes');

    await expect(
      page.getByRole('heading', { name: /google agenda/i }),
      'o painel não abriu para o admin — ele tem `gerenciar_integracao_google` pela migration de permissões'
    ).toBeVisible();

    /**
     * O ponto do teste. Sem conta conectada, a tela precisa **dizer** que não há
     * conexão e oferecer o caminho. Uma tabela vazia sem explicação seria a
     * A-013: a pessoa concluiria "ainda não configurei" tanto faz se o motivo é
     * "nunca conectou" ou "a conexão caiu".
     */
    await expect(
      page.getByText(/nenhuma conta do google conectada/i),
      'sem conexão, a tela precisa declarar isso — silêncio aqui é indistinguível de "está tudo bem"'
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /conectar conta do google/i }),
      'declarar o problema sem oferecer a saída é meio caminho'
    ).toBeVisible();
  });

  test('e o painel não é do psicólogo', async ({ page, context }) => {
    // ⚠️ A integração dá acesso à agenda de TODOS os pacientes da clínica.
    // `gerenciar_integracao_google` é do admin e continua sendo (R-020 (3)).
    await context.clearCookies();

    await page.goto('/');
    await page.locator('#email').fill(CONTA.psicologoEmail);
    await page.locator('#password').fill(CONTA.psicologoSenha);
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 90_000 });

    await page.goto('/admin/integracoes');
    await expect(
      page,
      'o psicólogo entrou no painel da integração — ele dá acesso à agenda de todos os pacientes'
    ).not.toHaveURL(/\/admin\/integracoes/);
  });
});

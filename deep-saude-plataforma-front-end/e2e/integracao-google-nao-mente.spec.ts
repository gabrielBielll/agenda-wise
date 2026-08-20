import { test, expect } from '@playwright/test';
import { CONTA } from './preparar-dados';
import { botaoEntrar } from './apoio';

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
 * ✅ **A pergunta (a) vs (b) já foi respondida, e a resposta foi uma terceira**
 * (mensageria 0114/0116) — para ninguém refazê-la:
 *
 * | | tem teste? | onde |
 * |---|---|---|
 * | **a decisão** de gritar | ✅ **sim, hoje** | `google/handlers_test.clj`, sem banco e sem navegador |
 * | **a pintura** da faixa | ❌ não | espera o GC-000 |
 *
 * 🔴 **O que regride em silêncio é o booleano, não os pixels** — e foi lá que o
 * defeito estava: `precisa_atencao` olhava `sem_acesso` e esquecia `orfao`, então
 * a frase que esta tela sabe escrever para agenda apagada era inalcançável. Hoje
 * a regra é **fail-closed**: status que ninguém previu grita.
 *
 * ⏸️ **(a) foi descartada**: acoplar o semeador ao schema do banco troca um
 * buraco conhecido por falhas confusas de e2e a cada migration.
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

    /**
     * ⚠️ Aqui havia `getByRole('heading', { name: /google agenda/i })`, e o
     * redesign tirou essa palavra do título: hoje a página se chama
     * *"A agenda de cada uma, junta."*. Medido em 19/08 — a âncora encontrava
     * **zero** elementos.
     *
     * 📌 O que este passo precisa provar é *"o painel abriu para o admin"*, e o
     * título nunca foi essa prova: título é copy. Se a permissão faltasse, o
     * `wrap-checar-permissao` recusaria e a rota devolveria a pessoa para outro
     * lugar — então **a URL é a afirmação**, e o cabeçalho existir prova que a
     * página renderizou em vez de voltar vazia.
     *
     * 🔴 A asserção que dá sentido ao teste é a de baixo, sobre o TEXTO — e essa
     * fica intocada, porque ali o texto é o objeto do teste, não a âncora.
     */
    await expect(
      page,
      'o painel não abriu para o admin — ele tem `gerenciar_integracao_google` pela migration de permissões'
    ).toHaveURL(/\/admin\/integracoes\/?$/);
    await expect(page.locator('main').getByRole('heading').first()).toBeVisible();

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
    await botaoEntrar(page).click();
    await page.waitForURL(/\/dashboard/, { timeout: 90_000 });

    await page.goto('/admin/integracoes');

    /**
     * ⚠️ Aqui eu tinha escrito `.not.toHaveURL(/\/admin\/integracoes/)`, e a
     * **D-017** derruba isso: asserção de ausência que passa por qualquer motivo.
     * App fora do ar, 500, página em branco, `goto` que nem chegou — tudo isso
     * "não está em /admin/integracoes", e o teste ficaria verde sem ter provado
     * guarda nenhuma.
     *
     * O middleware manda o psicólogo para `/dashboard` (`middleware.ts:120`), e é
     * isso que dá para afirmar: **onde ele foi parar**, não onde ele não está.
     * A regra saiu da revisão em que eu derrubei uma decisão da `orla` — e a
     * primeira coisa que ela pegou foi um teste meu, escrito no mesmo dia.
     */
    await expect(
      page,
      'o psicólogo não foi mandado ao painel dele — ou entrou na integração, que dá ' +
        'acesso à agenda de todos os pacientes, ou a tela quebrou de outro jeito'
    ).toHaveURL(/\/dashboard/);
  });
});

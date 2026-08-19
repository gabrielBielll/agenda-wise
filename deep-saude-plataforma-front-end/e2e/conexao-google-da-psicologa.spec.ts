import { test, expect } from '@playwright/test';
import { CONTA } from './preparar-dados';

/**
 * GC-001b — a psicóloga conecta a própria conta, e a volta do OAuth pousa.
 *
 * ## O que este arquivo consegue provar hoje, e por que isso não é pouco
 *
 * 🔴 **O caminho feliz não roda sem o GC-000.** Conectar de verdade exige
 * credencial do Console do Google, que é do Gabriel e não existe no CI. Este
 * arquivo prova o resto — e o resto é a metade que some quando fica para depois:
 * **os caminhos de erro da rota de retorno**, que antes não existiam porque a
 * rota não existia.
 *
 * Medido na mensageria 0137: nenhuma página do front lia `searchParams`, e o
 * callback do backend é `POST` com JWT enquanto o Google volta em `GET` sem
 * sessão. A pessoa ia ao Google, autorizava, e a volta **não pousava em lugar
 * nenhum** — nem no fluxo do admin (que eu tinha entregue assim), nem no dela.
 *
 * ## O que ele NÃO prova, dito antes de alguém supor
 *
 * | prova | não prova |
 * |---|---|
 * | a rota existe e nomeia cada desfecho | a troca do `code` por token |
 * | o cartão aparece para a psicóloga | que a agenda sincroniza |
 * | o cartão **some** para quem não é dona | a conferência do `state` (é do backend) |
 *
 * ⚠️ **A conferência do `state` é do backend** (0138) e não tem teste aqui de
 * propósito: verificar no cliente seria a mesma classe de erro que o ataque que o
 * `state` existe para impedir.
 *
 * ---
 *
 * ## 🔴 EU NÃO RODEI ISTO — sem navegador, Termux
 *
 * Escrito por leitura. Quem roda primeiro é o CI. Se falhar, comece perguntando
 * se o seletor existe antes de supor que o comportamento mudou — foi assim que a
 * A-009, o `deletePaciente` e a data de nascimento apareceram.
 */

async function entrarComoPsicologa(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('#email').fill(CONTA.psicologoEmail);
  await page.locator('#password').fill(CONTA.psicologoSenha);
  // ⚠️ `/^entrar/i` e nao `/^entrar$/i`: o redesign (8109afc) trocou o rotulo do
  // botao para "Entrar com seguranca", e a ancora do fim derrubou SETE specs de
  // uma vez — 16 testes, todos os que fazem login por formulario. A ancora do
  // inicio fica: o outro botao da tela chama-se "Google".
  await page.getByRole('button', { name: /^entrar/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
}

test.describe('GC-001b — o cartão da psicóloga', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a psicóloga vê o cartão e o convite para conectar a própria conta', async ({ page }) => {
    await entrarComoPsicologa(page);
    await page.goto('/settings');

    await expect(
      page.getByRole('heading', { name: /integra[çc][ãa]o com google agenda/i }),
      'o cartão da integração sumiu de /settings'
    ).toBeVisible();

    /**
     * 🔴 A asserção que segura a D-015. Este cartão dizia *"Gerenciada pela
     * clínica — fale com o administrador"*, que era certo no Modelo A e virou
     * falso quando a conexão passou a ser por psicóloga. Se alguém restaurar o
     * texto antigo, isto cai.
     */
    await expect(
      page.getByRole('button', { name: /conectar (minha conta do google|de novo)/i }),
      'a psicóloga não tem como conectar a própria conta — a tela voltou ao modelo ' +
        'em que só o admin conecta, que a D-015 substituiu'
    ).toBeVisible();
  });

  test('e o secretário não vê o cartão, porque não é dono de agenda', async ({ page }) => {
    await page.goto('/');
    await page.locator('#email').fill(CONTA.secretarioEmail);
    await page.locator('#password').fill(CONTA.secretarioSenha);
    await page.getByRole('button', { name: /^entrar/i }).click();
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).some((c) => c.name.includes('next-auth.session-token')),
        { timeout: 90_000, message: 'o login do secretário não criou sessão' }
      )
      .toBe(true);

    await page.goto('/settings');

    /**
     * ⚠️ Ausência **depois** de um desfecho ancorado (D-017): a página tem que ter
     * carregado antes de eu afirmar que algo não está nela. Sem a âncora, isto
     * passaria numa tela que nem abriu.
     */
    await expect(
      page.getByRole('heading', { name: /prefer[êe]ncias da conta/i }),
      'a página de configurações não abriu para o secretário'
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /integra[çc][ãa]o com google agenda/i }),
      'o secretário vê o cartão de conectar agenda — ele não tem `conectar_agenda_propria`, ' +
        'e oferecer o botão a quem o backend vai recusar é prometer o que não se cumpre'
    ).toHaveCount(0);
  });
});

test.describe('GC-001b — a volta do OAuth nomeia cada desfecho', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sem code, a tela diz o que faltou em vez de voltar em silêncio', async ({ page }) => {
    await entrarComoPsicologa(page);

    await page.goto('/google/retorno');
    await expect(
      page.getByText(/n[ãa]o devolveu o c[óo]digo/i),
      'a rota de retorno voltou calada — quem clicou em "conectar" ficaria olhando o ' +
        'mesmo botão sem nenhuma pista do que houve'
    ).toBeVisible();
  });

  test('e quando a pessoa cancela no Google, isso não é chamado de erro', async ({ page }) => {
    await entrarComoPsicologa(page);

    await page.goto('/google/retorno?error=access_denied');

    /**
     * ⚠️ Cancelar é escolha, não falha. Chamar de "erro" mandaria a pessoa
     * procurar defeito onde ela mesma decidiu — e é o tipo de mensagem que gasta
     * a rodada de quem investiga, que foi o custo repetido desta semana.
     */
    await expect(
      page.getByText(/n[ãa]o autorizou o acesso/i),
      'cancelar no Google apareceu como falha do sistema'
    ).toBeVisible();
    await expect(
      page.getByText(/nada mudou aqui/i),
      'a tela precisa dizer que nada foi gravado — senão a pessoa fica sem saber se ' +
        'metade da conexão ficou de pé'
    ).toBeVisible();
  });
});

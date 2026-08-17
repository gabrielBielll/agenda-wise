import { test, expect } from '@playwright/test';
import { CONTA } from './preparar-dados';

/**
 * A-017 — o secretário tem permissão de backend e nenhuma tela.
 *
 * Achado ao medir depois que a A-012 entrou (mensageria 0081). A `duna` deu ao
 * secretário agenda de todos os psicólogos e cadastro de pacientes; o front o
 * barrava em **seis de seis** telas:
 *
 * ```
 * /dashboard  /calendar  /patients  /settings   -> 307 -> /
 * /admin/agendamentos  /admin/dashboard        -> 307 -> /admin/login
 * ```
 *
 * A causa era uma linha do `middleware.ts` escrita na V-1:
 *
 * ```ts
 * if (role !== 'psicologo' && role !== 'admin_clinica') { … redirect('/') }
 * ```
 *
 * ⚠️ **Ela estava certa quando foi escrita** — naquele dia `secretario` não tinha
 * permissão nenhuma — e ficou errada no instante em que a A-012 entrou. **Nenhum
 * teste podia ter pegado: o defeito nasceu da correção de outro.** É por isso que
 * este arquivo existe: para o terceiro papel passar a ser exercitado por alguém.
 *
 * ## O laço, e por que ele não é assertado aqui
 *
 * `/dashboard` mandava para `/`; a porta de login via `authenticated` e fazia
 * `router.push('/dashboard')`; o middleware mandava de volta. Laço.
 *
 * Os seis 307 foram medidos com `curl`. **O laço não** — a segunda metade é
 * client-side e o `curl` não roda JS. Aqui, com navegador de verdade, o laço
 * apareceria como timeout; mas assertar "não entra em laço" por ausência de
 * timeout é frágil. O que este teste afirma é o positivo: **as telas abrem**.
 * Se o laço voltar, elas param de abrir.
 */

/**
 * Entra pelo formulário real, como o secretário.
 *
 * ⚠️ Espera a **sessão existir**, não o destino. Com o defeito vivo o app tenta
 * pousar em `/dashboard` e o middleware devolve para `/` — se o helper esperasse
 * a URL do dashboard, o teste morreria aqui, com "timeout esperando /dashboard",
 * e a falha apontaria para o login em vez de para a autorização de rota. O
 * diagnóstico ficaria pior do que o defeito.
 */
async function entrarComoSecretario(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('#email').fill(CONTA.secretarioEmail);
  await page.locator('#password').fill(CONTA.secretarioSenha);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((c) => c.name.includes('next-auth.session-token')),
      { timeout: 90_000, message: 'o login do secretário não criou sessão nenhuma' }
    )
    .toBe(true);
}

test.describe('A-017 — o terceiro papel consegue usar o sistema', () => {
  // Contexto limpo: o globalSetup guarda a sessão do admin, e o objeto aqui é
  // justamente o papel que nunca foi exercitado.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('o secretário entra e abre as telas que a permissão dele cobre', async ({ page }) => {
    await entrarComoSecretario(page);

    // A agenda: ele tem `gerenciar_agendamentos_clinica` e
    // `visualizar_todos_agendamentos` — é o trabalho dele, pela resposta do
    // Gabriel na mensageria 0064.
    await page.goto('/calendar');
    await expect(
      page,
      'o secretário foi expulso do calendário — é a A-017: permissão no backend e nenhuma tela'
    ).toHaveURL(/\/calendar/);

    // O cadastro de pacientes: `gerenciar_pacientes` e `visualizar_pacientes`.
    await page.goto('/patients');
    await expect(
      page,
      'o secretário foi expulso da lista de pacientes, que é cadastro e é dele'
    ).toHaveURL(/\/patients/);
  });

  test('e continua fora da administração da clínica', async ({ page }) => {
    await entrarComoSecretario(page);

    // ⚠️ A outra metade, e ela não pode ser esquecida ao corrigir: dar tela ao
    // secretário não é dar a área administrativa. `/admin` é a administração da
    // clínica — usuários, psicólogos, financeiro — e continua sendo do admin.
    await page.goto('/admin/agendamentos');
    await expect(
      page,
      'o secretário entrou na área administrativa: a correção da A-017 abriu demais'
    ).toHaveURL(/\/admin\/login/);
  });
});

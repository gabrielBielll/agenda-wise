import { test, expect } from '@playwright/test';
import { CONTA } from './preparar-dados';
import { dadosSemeados } from './apoio';

/**
 * A-022 — o formulário não pode apagar a nota clínica quando o salvar falha.
 *
 * Achado pela `orla` (mensageria 0165) pondo o backend em modo "toda escrita
 * devolve 500". O que ela mediu:
 *
 * ```
 * aviso "Erro ao Salvar"        apareceu aos 400ms   ✅ a tela AVISA
 * campo "Nome Completo" vazio   aos 400ms            🔴 e apaga junto
 * ```
 *
 * 🔴 **A tela não mente — ela avisa e apaga no mesmo instante.** A psicóloga
 * descobre que não salvou e, junto, descobre que precisa escrever tudo de novo.
 * Numa nota clínica de sessão, "de novo" é reconstruir de memória.
 *
 * ## O mecanismo
 *
 * `<form action={formAction}>` com campos `defaultValue`. O React reseta o
 * formulário quando a ação termina — **e não distingue terminar bem de terminar
 * mal**. Não é código nosso limpando: é o comportamento do `<form action>`.
 *
 * 📌 **É a A-010 pelo avesso.** Lá o diálogo do admin sobreviveu ao fechar porque
 * era controlado (`value`/`onChange`), e o do calendário não sobreviveu porque
 * usava `defaultValue`. Mesma causa, gatilho diferente — e o conserto é o mesmo.
 *
 * ---
 *
 * ## ⚠️ Como este teste força a falha, e por que aqui `page.route` FUNCIONA
 *
 * Eu escrevi na mensageria 0072 que `page.route` **não** alcança os oito arquivos
 * da A-013 — e continua verdade: lá o `fetch` sai do **servidor** Next para o
 * Clojure e nunca toca o navegador.
 *
 * ✅ **Aqui é outra coisa.** A submissão de uma *server action* é uma requisição
 * que **o navegador faz** — um POST para a própria URL com o cabeçalho
 * `Next-Action`. Isso o Playwright intercepta.
 *
 * 🔴 A distinção importa e é fácil de errar: não é "server component não dá para
 * interceptar", é **"o que o navegador não pede, o navegador não intercepta"**.
 *
 * ## O que este teste NÃO prova
 *
 * Que o texto chegaria ao banco se a rede estivesse boa — isso é o caminho feliz,
 * coberto pelo resto da suíte. Aqui o objeto é só um: **o que a pessoa digitou
 * continua na tela depois de uma falha.**
 */

const TEXTO = 'Paciente relatou melhora do sono após ajuste da rotina noturna.';

test.describe('A-022 — a nota clínica sobrevive a uma falha ao salvar', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('o texto digitado continua na tela quando o salvamento falha', async ({ page }) => {
    const { pacienteId } = dadosSemeados();

    await page.goto('/');
    await page.locator('#email').fill(CONTA.psicologoEmail);
    await page.locator('#password').fill(CONTA.psicologoSenha);
    await page.getByRole('button', { name: /^entrar/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 90_000 });

    await page.goto(`/patients/${pacienteId}`);

    const conteudo = page.locator('#conteudo');
    await expect(
      conteudo,
      'o formulário de evolução não abriu — sem ele não há o que este teste proteja'
    ).toBeVisible({ timeout: 30_000 });

    await conteudo.fill(TEXTO);

    /**
     * Derruba **a submissão da server action**, não a leitura da página: o filtro
     * é o cabeçalho `next-action`, que só existe no POST da ação.
     *
     * ⚠️ Interceptar tudo faria a própria navegação falhar, e aí o teste provaria
     * "página quebrada preserva texto", que é outra coisa.
     */
    await page.route('**/*', async (rota) => {
      const req = rota.request();
      if (req.method() === 'POST' && req.headers()['next-action']) {
        await rota.fulfill({ status: 500, contentType: 'text/plain', body: 'falha forçada pelo teste' });
        return;
      }
      await rota.continue();
    });

    await page.getByRole('button', { name: /salvar anota/i }).click();

    /**
     * 🔴 A asserção do defeito.
     *
     * ⚠️ Com `toHaveValue` e espera automática: o apagamento acontece **no mesmo
     * instante** do aviso, e a `orla` quase registrou achado errado por amostrar
     * num único momento — o `toast` já tinha sumido quando ela olhou. Aqui o
     * objeto é o campo, que não some; mas a espera evita ler antes de o React
     * ter reprocessado o resultado da ação.
     */
    await expect(
      conteudo,
      'o texto da evolução foi apagado quando o salvamento falhou — a psicóloga ' +
        'perde a nota clínica junto com o aviso de erro (A-022)'
    ).toHaveValue(TEXTO, { timeout: 15_000 });
  });
});

/**
 * O mesmo defeito no grupo de CRIAÇÃO, onde o estrago é maior.
 *
 * 📌 Na edição o formulário volta ao valor **salvo** — some a alteração. Na
 * criação ele volta **em branco**: some tudo, e não há nada no banco para
 * reconstruir a partir.
 *
 * Este é o formulário que a `orla` mediu de verdade com o backend em modo 500
 * (0165), então é o que fecha o círculo entre a medição dela e o conserto.
 */
test.describe('A-022 — o cadastro de paciente sobrevive a uma falha ao salvar', () => {
  test('os campos preenchidos continuam lá quando a criação falha', async ({ page }) => {
    const nome = `Paciente A-022 ${Date.now().toString(36)}`;

    await page.goto('/admin/pacientes/novo');

    await page.locator('#nome').fill(nome);
    await page.locator('#telefone').fill('(21) 99999-8888');

    await page.route('**/*', async (rota) => {
      const req = rota.request();
      if (req.method() === 'POST' && req.headers()['next-action']) {
        await rota.fulfill({ status: 500, contentType: 'text/plain', body: 'falha forçada pelo teste' });
        return;
      }
      await rota.continue();
    });

    await page.getByRole('button', { name: /salvar paciente/i }).click();

    /**
     * ⚠️ ÂNCORA ANTES DAS ASSERÇÕES — e ela existe porque a primeira versão deste
     * teste foi **instável** (run 32228458848: falhou, passou no retry).
     *
     * O erro era `element(s) not found` no `#telefone`: o campo não estava vazio,
     * ele **não existia**. Ou seja, a tela tinha saído do formulário — o
     * formulário navega para a listagem quando a criação dá certo, então numa das
     * tentativas a interceptação não pegou a submissão e o cadastro passou.
     *
     * 🔴 Sem esta âncora, esse caso se disfarça de "o campo foi apagado", que é o
     * defeito oposto do que o teste investiga. É a **D-017** aplicada a mim: eu
     * afirmei sobre o conteúdo de um campo sem antes garantir que a página onde
     * ele mora ainda estava aberta.
     */
    await expect(
      page,
      'a tela saiu do formulário: a criação foi aceita, então a falha não chegou a ' +
        'ser exercitada — isto NÃO é o defeito da A-022, é o teste não ter forçado o erro'
    ).toHaveURL(/\/admin\/pacientes\/novo/, { timeout: 20_000 });

    await expect(
      page.locator('#nome'),
      'o nome digitado foi apagado quando a criação falhou — quem cadastra perde ' +
        'tudo junto com o aviso de erro (A-022, grupo de criação)'
    ).toHaveValue(nome, { timeout: 15_000 });

    await expect(
      page.locator('#telefone'),
      'o telefone também foi apagado — o reset do `<form action>` não escolhe campo'
    ).toHaveValue('(21) 99999-8888', { timeout: 15_000 });
  });
});

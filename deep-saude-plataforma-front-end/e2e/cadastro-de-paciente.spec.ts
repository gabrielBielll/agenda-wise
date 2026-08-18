import { test, expect, type Page } from '@playwright/test';
import { CONTA } from './preparar-dados';
import { dadosSemeados } from './apoio';

/**
 * Cadastro de paciente — as três telas que não tinham spec nenhum.
 *
 * O buraco foi registrado por mim na mensageria 0121 e virou tarefa na 0130,
 * por dois motivos que mudaram desde então.
 *
 * ## 1. Elas só ficaram testáveis depois da A11Y-001a
 *
 * Os controles destas telas eram **exatamente** os que estavam sem nome
 * acessível: `psicologo_id` e `status` no `EditPacienteForm`, `psicologo_id` no
 * `NovoPacienteForm`, `status` no `EditForm`. Antes do conserto, escrever spec
 * aqui significaria `.first()` sobre anônimos — e o diagnóstico invertido de
 * sempre: falha de seletor saindo reportada como falha de produto.
 *
 * ✅ **Por isso cada `getByRole('combobox', { name })` aqui prova duas coisas de
 * graça:** que o fluxo funciona, e que a A11Y-001a não regrediu.
 *
 * ## 2. É onde o dado nasce
 *
 * `psicologo_id` é atribuído aqui. **Atribuir o paciente ao psicólogo errado é a
 * mesma família da confirmação de vínculo do Google** — expõe o histórico de uma
 * pessoa a outro profissional. Não é tela de conveniência.
 *
 * ## O que este arquivo prova, e o que ele deliberadamente NÃO prova
 *
 * | prova | não prova |
 * |---|---|
 * | a **atribuição** chega na listagem | cada campo do formulário |
 * | o `status` **persiste** depois de recarregar | validação de e-mail, telefone, endereço |
 * | o que o **secretário** alcança e o que não | mensagens de erro de campo |
 *
 * ⚠️ Testar formulário campo a campo troca cobertura por volume: quebra a cada
 * mudança de layout e não pega o que quebraria calado, que é a atribuição.
 *
 * ---
 *
 * ## 🔴 EU NÃO RODEI ISTO — e o cabeçalho existe por isso
 *
 * `vale`, Termux, sem navegador. Escrito por leitura dos formulários e das
 * actions. **Quem roda primeiro é o CI.**
 *
 * 📌 Foi exatamente assim que a A-009 achou um defeito de produto de verdade: o
 * meu teste rodou no CI e mostrou que o botão de forçar **não reenviava o
 * formulário**. O cabeçalho é o que transforma uma falha de CI em diagnóstico em
 * vez de suspeita — se algo aqui falhar, comece perguntando se o seletor existe,
 * e só depois se o comportamento mudou.
 */

/** Nome único por execução: rodadas repetidas não colidem nem se confundem. */
function nomeDePaciente(): string {
  return `Paciente Cadastro ${Date.now().toString(36)}`;
}

async function entrarComo(page: Page, email: string, senha: string) {
  await page.goto('/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(senha);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((c) => c.name.includes('next-auth.session-token')),
      { timeout: 90_000, message: `o login de ${email} não criou sessão` }
    )
    .toBe(true);
}

test.describe('cadastro de paciente — a atribuição e a persistência', () => {
  test('o admin cria um paciente e ele aparece atribuído ao psicólogo escolhido', async ({ page }) => {
    const nome = nomeDePaciente();

    await page.goto('/admin/pacientes/novo');

    await page.locator('#nome').fill(nome);

    /**
     * O combobox pedido **pelo nome**. Se a A11Y-001a regredir, esta linha cai
     * antes de qualquer coisa — e a mensagem diz que é nome acessível, não fluxo.
     */
    const psicologo = page.getByRole('combobox', { name: /psic[óo]logo respons[áa]vel/i });
    await expect(
      psicologo,
      'o seletor de psicólogo não tem nome acessível — a A11Y-001a regrediu'
    ).toBeVisible();
    await psicologo.click();
    await page.getByRole('option', { name: CONTA.psicologoNome }).first().click();

    await page.getByRole('button', { name: /salvar paciente/i }).click();

    // O formulário empurra para a listagem quando dá certo.
    await expect(page).toHaveURL(/\/admin\/pacientes(\?|$)/);

    /**
     * 🔴 A asserção que importa: a linha do paciente novo, **com o psicólogo
     * junto**. Conferir só o nome provaria que o cadastro salvou e não provaria
     * a atribuição — que é a parte capaz de expor histórico à pessoa errada.
     */
    const linha = page.getByRole('row').filter({ hasText: nome });
    await expect(
      linha,
      'o paciente criado não apareceu na listagem'
    ).toBeVisible();
    await expect(
      linha,
      `o paciente foi criado sem o psicólogo escolhido, ou com outro — a coluna ` +
        `"Psicólogo" da listagem devia mostrar ${CONTA.psicologoNome}`
    ).toContainText(CONTA.psicologoNome);
  });

  test('mudar o status persiste — e continua lá depois de recarregar', async ({ page }) => {
    const nome = nomeDePaciente();

    // Cria o próprio alvo, em vez de editar o paciente semeado: mexer no status
    // do semeado mudaria o mundo por baixo dos outros arquivos da suíte.
    await page.goto('/admin/pacientes/novo');
    await page.locator('#nome').fill(nome);
    await page.getByRole('button', { name: /salvar paciente/i }).click();
    await expect(page).toHaveURL(/\/admin\/pacientes(\?|$)/);

    await page.getByRole('row').filter({ hasText: nome }).getByRole('link', { name: /editar/i }).click();
    await expect(page).toHaveURL(/\/admin\/pacientes\/[^/]+\/edit/);

    const status = page.getByRole('combobox', { name: /^status$/i });
    await expect(
      status,
      'o seletor de status não tem nome acessível — a A11Y-001a regrediu'
    ).toBeVisible();
    await status.click();
    await page.getByRole('option', { name: /^inativo$/i }).click();

    await page.getByRole('button', { name: /salvar altera/i }).click();
    await expect(page).toHaveURL(/\/admin\/pacientes(\?|$)/);

    /**
     * ⚠️ **Recarregar é o ponto do teste, não zelo.** A tela pode mostrar o valor
     * novo só porque o React ainda tem o estado do formulário na memória. Voltar
     * pela URL força a leitura do banco — é a diferença entre "a tela mudou" e
     * "o dado mudou".
     */
    await page.getByRole('row').filter({ hasText: nome }).getByRole('link', { name: /editar/i }).click();
    await expect(page).toHaveURL(/\/admin\/pacientes\/[^/]+\/edit/);
    await expect(
      page.getByRole('combobox', { name: /^status$/i }),
      'o status voltou ao valor antigo depois de recarregar — a tela confirmou uma gravação que não aconteceu'
    ).toContainText(/inativo/i);
  });
});

test.describe('cadastro de paciente — excluir', () => {
  /**
   * 🔴 VERMELHO DELIBERADO — o botão de excluir do painel do admin nunca funcionou.
   *
   * Eu anotei isto na mensageria 0131 como observação de passagem, dizendo
   * *"não conferi se o cookie existe — é leitura, não medição"*. A `orla` mediu
   * (0132) e eu conferi por conta própria:
   *
   * ```
   * quem ESCREVE  "sessionToken"   admin/login/actions.ts:84
   * quem IMPORTA esse arquivo      ninguém — `handleLogin` e `LoginFormState` sem uso
   * como o login acontece          admin/login/page.tsx:84 -> signIn("credentials")
   * quem LÊ      "sessionToken"    admin/pacientes/actions.ts:7  -> deletePaciente
   * ```
   *
   * O cookie é do **fluxo de login antigo**, que o NextAuth substituiu. Ninguém
   * o escreve mais, então `deletePaciente` do admin devolve **sempre**
   * `{ success: false, message: "Erro de autenticação." }`.
   *
   * 📌 **E há um gêmeo saudável ao lado**, que fecha o diagnóstico: o
   * `deletePaciente` de `(app)/patients/actions.ts` usa `getBackendToken()` e
   * funciona. Mesmo nome, duas implementações, uma lendo cookie de ninguém.
   *
   * ⚠️ **O pior é a mensagem.** "Erro de autenticação" manda quem investiga
   * procurar sessão, token, NextAuth — e a causa é um caminho que ficou para trás
   * numa troca de login. É a quinta vez esta semana que o custo não é a falha, e
   * sim a falha apontando para o lugar errado; as outras quatro eram em teste,
   * **esta é na tela do usuário.**
   */
  test('o admin exclui um paciente e ele some da listagem', async ({ page }) => {
    const nome = nomeDePaciente();

    // O alvo é criado pelo próprio teste — excluir o paciente semeado apagaria o
    // mundo que os outros arquivos da suíte usam.
    await page.goto('/admin/pacientes/novo');
    await page.locator('#nome').fill(nome);
    await page.getByRole('button', { name: /salvar paciente/i }).click();
    await expect(page).toHaveURL(/\/admin\/pacientes(\?|$)/);

    const linha = page.getByRole('row').filter({ hasText: nome });
    await expect(linha, 'o paciente do teste não foi criado').toBeVisible();

    await linha.getByRole('button', { name: /excluir/i }).click();

    const confirmacao = page.getByRole('alertdialog').filter({ hasText: /certeza absoluta/i });
    await expect(confirmacao, 'o diálogo de confirmação não abriu').toBeVisible();
    await confirmacao.getByRole('button', { name: /sim, excluir/i }).click();

    /**
     * A asserção que o defeito derruba. Com o cookie inexistente, a action volta
     * "Erro de autenticação", a linha **continua na tela**, e o único sinal é um
     * toast que some sozinho.
     */
    await expect(
      page.getByRole('row').filter({ hasText: nome }),
      'o paciente continua na listagem depois de confirmar a exclusão — o botão de ' +
        'excluir do admin lê um cookie que ninguém escreve desde a troca para o NextAuth'
    ).toHaveCount(0);
  });
});

test.describe('cadastro de paciente — o que o secretário alcança', () => {
  // Contexto limpo: o globalSetup guarda a sessão do admin, e aqui o objeto é o
  // terceiro papel.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('o secretário cadastra paciente, e não entra na área administrativa', async ({ page }) => {
    await entrarComo(page, CONTA.secretarioEmail, CONTA.secretarioSenha);

    /**
     * ✅ O que ele PODE: cadastro de paciente é dele, pela resposta do Gabriel na
     * mensageria 0064 — `gerenciar_pacientes` e `visualizar_pacientes`, sem
     * prontuário.
     */
    await page.goto('/patients');
    await expect(
      page,
      'o secretário foi expulso da lista de pacientes, que é cadastro e é dele'
    ).toHaveURL(/\/patients/);

    /**
     * 🔴 O que ele NÃO pode: `/admin/*` é a administração da clínica. Dar tela ao
     * secretário (A-017) não foi dar a área administrativa — e esta é a metade
     * que se esquece ao afrouxar uma guarda.
     */
    await page.goto('/admin/pacientes/novo');
    await expect(
      page,
      'o secretário entrou no cadastro administrativo de pacientes — a guarda da A-017 abriu demais'
    ).toHaveURL(/\/admin\/login/);
  });

  /**
   * A terceira tela da lista da 0130 — `/patients/[id]/edit`, o lado do app.
   *
   * ⚠️ **Aqui eu provo que ela ABRE e que o controle tem nome, e não a
   * persistência.** Não é economia: gravar aqui mexeria no paciente **semeado**,
   * que os outros arquivos da suíte usam como mundo estável — e o caminho de
   * persistência já está provado no teste do admin, contra um paciente criado
   * pelo próprio teste.
   *
   * 📌 Dizer qual metade está coberta é o ponto. Uma asserção que parece cobrir
   * a gravação e só abre a tela seria pior que não ter teste nenhum.
   */
  test('e a tela de edição do app abre para ele, com o status nomeado', async ({ page }) => {
    const { pacienteId } = dadosSemeados();
    await entrarComo(page, CONTA.secretarioEmail, CONTA.secretarioSenha);

    await page.goto(`/patients/${pacienteId}/edit`);
    await expect(
      page,
      'o secretário não abriu a edição de paciente — ele tem `gerenciar_pacientes`'
    ).toHaveURL(new RegExp(`/patients/${pacienteId}/edit`));

    await expect(
      page.getByRole('combobox', { name: /^status$/i }),
      'o seletor de status desta tela não tem nome acessível — a A11Y-001a regrediu ' +
        'no `EditForm.tsx`, que foi um dos cinco arquivos consertados'
    ).toBeVisible();
  });
});

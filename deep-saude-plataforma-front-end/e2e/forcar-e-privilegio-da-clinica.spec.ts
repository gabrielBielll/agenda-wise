import { test, expect } from '@playwright/test';
import { contarNoBackend, dadosSemeados } from './apoio';
import { CONTA, DURACAO_DA_SESSAO, HORA_DA_SESSAO } from './preparar-dados';

/**
 * R-006 — forçar agendamento sobre conflito é privilégio da clínica.
 *
 * A outra metade do par que a mensageria 0052 declarou descoberto. O
 * `bloqueio-sobre-sessao.spec.ts` fechou o 409; este fecha o **403**.
 *
 * ## Por que este é diferente dos outros
 *
 * É a única guarda do sistema que **um papel encontra e o outro não**. Provar só
 * o lado negado não bastaria: "restringi por papel" quebra o lado **permitido**
 * sem ninguém notar, porque o teste existente continua verde.
 *
 * ✅ **O lado permitido já está coberto** — por `somente-admin-pode-forcar-conflito`
 * em `agendamentos_test.clj`, que assere 403 + contagem intacta para o psicólogo
 * e 201 + contagem+1 para o admin, no mesmo teste. É o lugar certo: a
 * autorização mora no backend.
 *
 * ⚠️ **E pela tela o lado permitido não é alcançável**, o que é achado e não
 * limitação de teste: o módulo do admin **nunca manda `force`** (o campo não
 * existe no `actions.ts` dele), e o `/calendar` manda sempre
 * `psicologo_id: userId` — "o psicólogo cria para si mesmo". Então o admin não
 * tem por onde forçar uma sessão *de outra pessoa*, que é exatamente o que o
 * modal desta regra manda a psicóloga ir pedir à gestão. Reportado na mensageria.
 *
 * ## A recusa é modal, e o teste assere o conteúdo dela
 *
 * A R-006 não pede só recusar: pede dizer à psicóloga **o que fazer** — procurar
 * a gestão da clínica. Um teste que assertasse "apareceu erro" passaria com um
 * toast genérico, que some sozinho e leva a instrução junto. Então a asserção é
 * sobre a instrução aparecer.
 */

/** Uma sessão colada na semeada: mesmo horário, mesmo psicólogo. */
function horarioConflitante(dia: string) {
  const [h, m] = HORA_DA_SESSAO.split(':').map(Number);
  const fimMin = h * 60 + m + DURACAO_DA_SESSAO;
  const fim = `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}`;
  return { inicio: `${dia}T${HORA_DA_SESSAO}`, fim: `${dia}T${fim}` };
}

/**
 * Preenche o diálogo de novo agendamento no horário da sessão semeada e submete.
 *
 * Devolve o diálogo de conflito, que é o passo anterior ao `force` — o front só
 * manda `force: true` depois que a pessoa confirma nele.
 */
async function tentarAgendarEmCimaDaSessao(page: import('@playwright/test').Page) {
  const { dia, paciente } = dadosSemeados();
  const quando = horarioConflitante(dia);

  await page.goto('/calendar');

  const novo = page.getByRole('button', { name: /^novo$/i });
  const dialogo = page.getByRole('dialog').filter({ hasText: /paciente/i });
  // Clique repetido até hidratar — mesmo motivo do `trocarVisao` em apoio.ts.
  await expect(async () => {
    if (!(await dialogo.isVisible().catch(() => false))) {
      await novo.first().click({ timeout: 5_000 });
    }
    await expect(dialogo).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  await dialogo.getByRole('combobox').first().click();

  // ⚠️ Asserção explícita, e ela existe por um motivo de mecânica, não de estilo.
  //
  // Enquanto a A-012 estiver aberta, a psicóloga não recebe paciente nenhum e
  // este é o ponto onde o teste morre. Um `.click()` direto morre por **timeout
  // do teste** — e `test.fail()` NÃO absorve timeout: o Playwright não consegue
  // distinguir "falhou como esperado" de "travou", então reporta falha e o CI
  // fica vermelho mesmo com a anotação.
  //
  // Medido duas vezes: com `test.fail()` no corpo do `describe` e depois no
  // corpo do teste, sempre `1 failed, 16 passed`. Só na terceira leitura do log
  // ficou claro que a marcação estava certa e o modo de morte é que era
  // incompatível com ela.
  //
  // Com a asserção abaixo a morte vira **falha de asserção**, que o `test.fail()`
  // absorve — e de quebra a mensagem diz a causa, em vez de "esperei um seletor".
  const opcaoDoPaciente = page.getByRole('option', { name: paciente }).first();
  await expect(
    opcaoDoPaciente,
    'a psicóloga não recebeu paciente nenhum. É a A-012: `papel_permissoes` está ' +
      'vazia para o papel dela, então GET /api/pacientes devolve 403 e a lista ' +
      'chega vazia. Ver docs/REVISAO_PRE_PRODUCAO.md e a mensageria 0061.'
  ).toBeVisible({ timeout: 10_000 });
  await opcaoDoPaciente.click();

  await dialogo.locator('#data_hora_sessao').fill(quando.inicio);
  await dialogo.locator('#data_hora_fim').fill(quando.fim);
  await dialogo.getByRole('button', { name: /^agendar$/i }).click();

  return page.getByRole('alertdialog').filter({ hasText: /conflito de hor[áa]rio/i });
}

test.describe('R-006 — a psicóloga é recusada, e a recusa ensina o caminho', () => {
  // Contexto limpo: o globalSetup deixa uma sessão de ADMIN salva, e aqui o
  // objeto do teste é justamente o outro papel.
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * 🔴 **Falha esperada, e a falha É o achado — não mexa sem ler a A-012.**
   *
   * Este teste não chega ao 403 que ele existe para provar: ele trava antes,
   * escolhendo o paciente, porque a psicóloga **não recebe paciente nenhum**.
   *
   * A causa não é a tela nem este arquivo. É que `papel_permissoes` tem **uma
   * linha em todo o schema** — `admin_clinica` → `gerenciar_integracao_google`.
   * Não existe grant nenhum para `psicologo` nem para `secretario`. Como
   * `wrap-checar-permissao` só tem bypass para `admin_clinica`, a psicóloga leva
   * **403 em toda rota clínica**: pacientes, agendamentos e prontuários.
   *
   * Ou seja: numa base recém-migrada, **psicóloga não usa o sistema.** O admin
   * só funciona pelo bypass — que o SEC-006 vai remover, e aí ele cai junto.
   *
   * ⚠️ **`test.fail()` e não `test.skip()`, e a diferença é o ponto:** ele
   * continua rodando e continua sendo executado a cada push. No dia em que
   * alguém conceder as permissões, este teste **passa** e o `test.fail()` faz o
   * CI ficar **vermelho** — que é o aviso de que a linha abaixo deve sair.
   * Guarda que se apaga sozinha quando não for mais necessária.
   *
   * Não é decisão de código quais permissões cada papel recebe: é regra de
   * negócio, e está com o Gabriel. Ver A-012 em `docs/REVISAO_PRE_PRODUCAO.md`
   * e a mensageria 0061.
   *
   * O timeout curto é de propósito — falha esperada não deve custar 2 minutos
   * de CI por tentativa.
   */
  test('forçar como psicóloga leva modal pedindo contato com a gestão', async ({ page, request }) => {
    // ⚠️ `test.fail()` sem argumento SÓ funciona dentro do corpo do teste.
    //
    // Na primeira tentativa esta chamada estava no corpo do `describe`, logo
    // acima — que é onde `test.skip()` funciona como modificador de grupo. Para
    // `test.fail()` a forma de grupo não existe: a chamada não anotou nada, o
    // teste seguiu contando como falha comum, e o CI ficou vermelho igual.
    //
    // Descoberto lendo o log (`16 passed, 1 failed`), não relendo o código.
    test.fail();
    test.setTimeout(45_000);
    const antes = await contarNoBackend(request, '/api/agendamentos');

    await page.goto('/');
    await page.locator('#email').fill(CONTA.psicologoEmail);
    await page.locator('#password').fill(CONTA.psicologoSenha);
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 90_000 });

    const conflito = await tentarAgendarEmCimaDaSessao(page);
    await expect(
      conflito,
      'o backend precisa acusar o conflito antes — sem isso não há botão de forçar para exercitar'
    ).toBeVisible();

    await conflito.getByRole('button', { name: /sim, agendar/i }).click();

    const recusa = page.getByRole('alertdialog').filter({ hasText: /sess[ãa]o marcada/i });
    await expect(
      recusa,
      'a R-006 pede modal; toast some sozinho e leva a instrução junto'
    ).toBeVisible();
    await expect(
      recusa,
      'a recusa tem que dizer O QUE FAZER — procurar a gestão da clínica — e não só que deu errado'
    ).toContainText(/gest[ãa]o da cl[íi]nica/i);

    expect(
      await contarNoBackend(request, '/api/agendamentos'),
      'a psicóloga foi recusada na tela mas o agendamento entrou — a guarda da R-006 caiu'
    ).toBe(antes);
  });
});

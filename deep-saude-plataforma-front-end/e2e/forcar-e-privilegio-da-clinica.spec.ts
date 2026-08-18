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
 * ✅ **E o lado permitido passou a ser alcançável pela tela — A-009, 2026-08-17.**
 *
 * ⚠️ O texto que estava aqui dizia o contrário: *"o módulo do admin nunca manda
 * `force`"*. Era verdade quando foi escrito e **deixou de ser** quando a A-009
 * entrou. Está reescrito, e não riscado, porque comentário que envelhece sem
 * ninguém notar foi exatamente o defeito da A-011: lá um comentário jurava que a
 * checagem disparava "quando o intervalo muda" enquanto o código testava
 * presença de campo, e a garantia falsa sobreviveu a uma revisão.
 *
 * O terceiro passo da R-006 agora existe: o admin recebe o mesmo modal de
 * conflito e pode confirmar. O `describe` do fim deste arquivo exercita isso.
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

  /**
   * ⚠️ `.first()` entre os combobox DESTE diálogo, e quantos existem **depende do
   * caminho**: criando são dois (paciente e "Repetir"), editando é um só — a
   * recorrência fica atrás de `{!editingAppointment && …}`. Por isso a guarda
   * aqui não pode ser contagem fixa: seria verde num caminho e vermelha no outro.
   *
   * Nenhum deles tem nome acessível ([A11Y-001]), então `{ name }` ainda não é
   * opção. A guarda é por EFEITO, depois da escolha.
   */
  const gatilhoPaciente = dialogo.getByRole('combobox').first();

  /**
   * 🔴 A guarda tem que vir ANTES do clique, e a `vale` a pôs depois.
   *
   * A dela — `toContainText(paciente)` depois de escolher — é boa, mas **não
   * alcança o caso que ela descreve**: se a ordem do DOM mudar e o `.first()`
   * abrir o "Repetir", a opção do paciente não existe naquele popover, e quem
   * falha primeiro é a asserção da A-012 logo abaixo — **culpando permissão por
   * um defeito de seletor**. É a mesma inversão de diagnóstico da 0104, uma linha
   * acima da guarda que existia para matá-la.
   *
   * Esta distingue os dois sem depender de nome acessível (A11Y-001) nem de
   * contagem: o seletor de paciente nasce "Selecione..." e o de recorrência nasce
   * **"Não repetir"** — `CalendarClient.tsx:533` e `:608`.
   */
  await expect(
    gatilhoPaciente,
    'o primeiro combobox do diálogo não é o de paciente — a ordem do DOM mudou e ' +
      'o `.first()` está prestes a abrir o seletor de recorrência. NÃO é a A-012.'
  ).toContainText(/selecione/i);

  await gatilhoPaciente.click();

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
  await expect(
    gatilhoPaciente,
    'escolhi o paciente e o seletor não passou a mostrá-lo — o `.first()` pode ' +
      'ter aberto o combobox de "Repetir", que é o outro deste diálogo'
  ).toContainText(paciente);

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

/**
 * A-009 — o terceiro passo da R-006, agora com tela.
 *
 * O par fica completo: o `describe` de cima prova que a psicóloga é recusada e
 * mandada à gestão; este prova que **a gestão consegue resolver**. Provar só o
 * lado negado deixaria o lado permitido quebrar em silêncio — que é o argumento
 * que abre este arquivo.
 *
 * ⚠️ **Este teste não roda na minha máquina** (`vale`, Termux — sem navegador).
 * Escrito por leitura do formulário e do contrato do backend, que esse sim eu
 * exercitei: `atualizar-com-force-e-privilegio-do-admin` e os outros três em
 * `agendamentos_test.clj`, verdes contra banco de verdade. Quem rodar primeiro é
 * a `pico`. Se algum seletor estiver errado, o defeito é do seletor — o
 * comportamento está medido do lado do servidor.
 */
test.describe('A-009 — a gestão força, e é ela quem decide', () => {
  test('o admin recebe o modal de conflito e consegue confirmar', async ({ page, request }) => {
    const { dia, paciente } = dadosSemeados();
    const quando = horarioConflitante(dia);
    const antes = await contarNoBackend(request, '/api/agendamentos');

    await page.goto('/admin/agendamentos/novo');

    // Os dois combobox: abre o popover e escolhe pelo nome.
    await page.getByRole('combobox', { name: /paciente/i }).click();
    await page.getByRole('option', { name: paciente }).first().click();

    await page.getByRole('combobox', { name: /psic[óo]logo/i }).click();
    await page.getByRole('option', { name: CONTA.psicologoNome }).first().click();

    await page.locator('#data_hora_sessao').fill(quando.inicio);
    await page.locator('#data_hora_sessao_fim').fill(quando.fim);
    await page.locator('#valor_consulta').fill('200');

    await page.getByRole('button', { name: /confirmar agendamento/i }).click();

    const conflito = page.getByRole('alertdialog').filter({ hasText: /conflito de hor[áa]rio/i });
    await expect(
      conflito,
      'o admin precisa ver o conflito ANTES de forçar — forçar sem avisar é o oposto da R-006'
    ).toBeVisible();

    // ⚠️ A recusa da psicóloga manda "Entre em contato com a gestão da clínica".
    // Se a gestão vir a MESMA frase, o sistema manda ela procurar a si mesma —
    // beco sem saída.
    //
    // 🔴 O alvo é a ESCALADA, não o substantivo. A guarda original proibia a
    // expressão "gestão da clínica" inteira, e por isso reprovava também o texto
    // CERTO — "Como gestão da clínica, você pode agendar mesmo assim" —, que é
    // exatamente o oposto do beco. Guarda que proíbe o substantivo torna a frase
    // boa impossível de escrever. Medido nas duas cadeias reais: esta continua
    // pegando a recusa da psicóloga e para de reprovar a do admin.
    await expect(
      conflito,
      'o modal do admin não pode mandar a gestão procurar a gestão'
    ).not.toContainText(/(entre em contato|procure|fale|solicite|peça)[^.]{0,40}gest[ãa]o/i);

    await conflito.getByRole('button', { name: /sim, agendar/i }).click();

    await expect(page).toHaveURL(/\/admin\/agendamentos(\?|$)/);
    expect(
      await contarNoBackend(request, '/api/agendamentos'),
      'o admin confirmou o conflito e a sessão não entrou — a A-009 voltou'
    ).toBe(antes + 1);
  });

  /**
   * A-011 — e a sessão que ele acabou de forçar tem que ser editável.
   *
   * É a metade que não pode ser esquecida: sem ela o botão novo produz registros
   * travados, e o defeito só aparece **depois**, quando alguém tenta marcar o
   * pagamento e não consegue. O par A-009↔A-011 existe por causa disso.
   */
  test('e a sessão forçada continua editável pela própria tela', async ({ page }) => {
    const { dia } = dadosSemeados();
    const quando = horarioConflitante(dia);

    await page.goto('/admin/agendamentos');

    // A sessão forçada é a segunda no mesmo horário; qualquer uma das duas serve
    // para o ponto — as duas estão sobrepostas.
    const linha = page.getByRole('row').filter({ hasText: CONTA.psicologoNome }).first();
    await linha.getByRole('link', { name: /editar/i }).click();

    await expect(page).toHaveURL(/\/admin\/agendamentos\/[^/]+\/edit/);

    /**
     * A cobertura que a `orla` pediu na 0104, e o motivo dela.
     *
     * Ela consertou os `SelectTrigger` desta tela **por leitura**, sem vermelho —
     * e disse na própria mensagem que conserto sem teste é o que a D-008 manda
     * não fazer. Estas três linhas são o vermelho que faltou.
     *
     * ⚠️ `getByRole(..., { name })` assere DUAS coisas de uma vez: que o controle
     * existe e que ele tem **nome acessível**. É exatamente a ambiguidade que fez
     * o CI parecer "seletor errado da vale" quando era defeito de produto. Aqui a
     * ambiguidade é o ponto: se qualquer um dos dois lados quebrar, isto cai.
     *
     * 📌 `combobox` **não** tira nome do próprio conteúdo — ao contrário de
     * `button`. Então o texto visível na tela não salva: sem o `id` casando o
     * `<Label htmlFor>`, um leitor de tela anuncia só *"combobox"*.
     *
     * ✅ E `status` entrou junto: ele estava **no mesmo arquivo** que a 0104
     * consertou e ficou de fora. Achado revisando o `0d60c77` pela D-002.
     */
    for (const rotulo of ['Paciente', 'Psicólogo', 'Status']) {
      await expect(
        page.getByRole('combobox', { name: rotulo }),
        `o combobox "${rotulo}" não tem nome acessível — um leitor de tela anuncia só "combobox"`
      ).toBeVisible();
    }

    // Mexe SÓ no dinheiro. O formulário remanda psicologo_id e data_hora_sessao
    // sempre — é essa a A-011.
    await page.locator('#valor_consulta').fill('250');
    await page.getByRole('button', { name: /salvar|atualizar/i }).click();

    /**
     * ⚠️ As duas asserções que estavam aqui davam o diagnóstico ao contrário, e
     * é a mesma inversão da 0104/0111 — desta vez num teste meu.
     *
     * `toHaveCount(0)` logo depois do clique passa **na hora**: o diálogo ainda
     * não teve tempo de aparecer. Se a A-011 regredisse, ele surgiria 200ms
     * depois, com a contagem já aprovada — e quem falharia seria a asserção de
     * URL, dizendo *"salvar falhou"* em vez de *"abriu diálogo de conflito"*.
     * Ausência só quer dizer alguma coisa **depois** de esperar o desfecho.
     *
     * Então espera o desfecho primeiro, seja ele qual for, e só então afirma qual
     * foi. Assim as duas regressões possíveis se reportam pelo próprio nome.
     */
    const dialogoDeConflito = page
      .getByRole('alertdialog')
      .filter({ hasText: /conflito de hor[áa]rio/i });

    await expect
      .poll(
        async () => {
          if (await dialogoDeConflito.isVisible().catch(() => false)) return 'conflito';
          if (/\/admin\/agendamentos(\?|$)/.test(page.url())) return 'salvou';
          return 'esperando';
        },
        { timeout: 60_000, message: 'salvar o valor não deu em nada: nem salvou nem acusou conflito' }
      )
      .not.toBe('esperando');

    expect(
      await dialogoDeConflito.isVisible().catch(() => false),
      'editar o VALOR abriu diálogo de conflito: o backend voltou a checar por presença de campo, não por mudança — é a A-011'
    ).toBe(false);

    await expect(
      page,
      'salvar uma alteração de valor numa sessão sobreposta falhou — é a A-011'
    ).toHaveURL(/\/admin\/agendamentos(\?|$)/);
  });
});

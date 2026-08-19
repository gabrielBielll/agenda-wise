import { test, expect } from '@playwright/test';
import { CONTA, DURACAO_DA_SESSAO, HORA_DA_SESSAO } from './preparar-dados';
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
 * ## ⚠️ Como este teste força a falha — e a sonda que eu tive que jogar fora
 *
 * 🔴 **Primeira versão: interceptar a server action com `page.route` e devolver
 * 500.** Passou uma vez, ficou instável, e depois falhou sempre — sempre com
 * `element(s) not found`.
 *
 * O motivo é que a sonda estava errada, não o conserto: um `500 text/plain` **não
 * é resposta válida de server action**. O Next trata como erro fatal, troca a
 * página pela fronteira de erro, e aí o campo some. O teste então dizia *"o texto
 * foi apagado"* — que é exatamente o defeito que ele investiga. **A sonda
 * fabricava o sintoma que deveria medir.**
 *
 * ✅ **Versão atual: falha de VERDADE, sem interceptação.** O `prontuarioSchema`
 * exige `conteudo` com pelo menos 3 caracteres. Submeter com menos faz a própria
 * ação devolver `{ success: false }` pelo caminho normal — que é o caminho que a
 * A-022 protege.
 *
 * 📌 Isso é melhor que o stub por dois motivos: é **determinístico** (não depende
 * de corrida com o roteamento) e exercita **a mesma via** que uma falha de rede
 * exercitaria — `useActionState` devolvendo estado de erro para um `<form action>`.
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

    // Menos de 3 caracteres: o `prontuarioSchema` recusa, e a ação devolve
    // `success: false` pelo caminho normal. Nenhuma interceptação envolvida.
    await conteudo.fill('ab');

    const queixa = page.locator('#queixa_principal');
    if (await queixa.isVisible().catch(() => false)) {
      await queixa.fill(TEXTO);
    }

    await page.getByRole('button', { name: /salvar anota/i }).click();

    /**
     * ⚠️ Âncora antes da asserção (D-017): prova que a tela continua no
     * formulário. Se a gravação tivesse sido aceita, o campo sumiria e a falha
     * apareceria como "texto apagado" — o defeito oposto ao investigado.
     */
    await expect(
      conteudo,
      'o formulário de evolução sumiu da tela — a submissão não foi recusada como ' +
        'esperado, então a A-022 não chegou a ser exercitada'
    ).toBeVisible({ timeout: 20_000 });

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
    ).toHaveValue('ab', { timeout: 15_000 });
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
    await page.goto('/admin/pacientes/novo');

    // 🔴 NOME CURTO, e NÃO e-mail inválido. A diferença é a única coisa que
    // separa este teste de um falso verde.
    //
    // O gatilho anterior era `#email` com `isto-nao-e-email`. Medido em 19/08
    // contra o build de produção:
    //
    //   checkValidity() do #email          false   → o navegador BARRA
    //   a server action chegou a rodar?    NÃO
    //   os campos continuam preenchidos?   sim     → o teste PASSARIA
    //
    // ⚠️ Ou seja: verde sem exercitar nada. `#email` é `type="email"`, e a
    // validação nativa do navegador recusa a submissão antes de a ação existir —
    // então os campos sobrevivem porque nada aconteceu, não porque o conserto
    // funciona. É o defeito que este arquivo inteiro existe para caçar, do lado
    // de dentro do próprio teste.
    //
    // ✅ `nome` com 2 caracteres passa pela validação do navegador (não há
    // `minlength`) e é recusado pelo `pacienteSchema`, que exige 3. Medido: a
    // ação roda, devolve `success: false`, e a mensagem aparece na tela.
    await page.locator('#nome').fill('Jo');
    await page.locator('#telefone').fill('(21) 99999-8888');

    await page.getByRole('button', { name: /salvar paciente/i }).click();

    /**
     * 🔴 A ÂNCORA QUE IMPEDE O FALSO VERDE: esta mensagem só existe se a ação
     * rodou **e** devolveu `success: false`. Sem ela, "os campos continuam
     * preenchidos" é compatível com "a submissão nunca aconteceu".
     */
    await expect(
      page.getByText(/pelo menos 3 caracteres/i),
      'a recusa do servidor não apareceu — a submissão não chegou a ser avaliada, ' +
        'então a A-022 não foi exercitada (e um "campo preenchido" aqui não prova nada)'
    ).toBeVisible({ timeout: 20_000 });

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
    ).toHaveValue('Jo', { timeout: 15_000 });

    await expect(
      page.locator('#telefone'),
      'o telefone também foi apagado — o reset do `<form action>` não escolhe campo'
    ).toHaveValue('(21) 99999-8888', { timeout: 15_000 });
  });
});

/**
 * # A-022 no calendário — o caso em que a recusa é do PRODUTO, não da validação
 *
 * Os dois testes acima forçam a recusa por schema, que é determinístico mas
 * sintético: ninguém usa o app querendo escrever duas letras. Este exercita a
 * A-022 num caminho que acontece de verdade e com frequência — **marcar em cima
 * de uma sessão que já existe.**
 *
 * É o teste que eu mais queria ter, por três motivos:
 *
 * 1. O diálogo **fica aberto** depois da recusa, de propósito, para a pessoa
 *    decidir. Era exatamente ali que o reset apagava o que ela tinha acabado de
 *    preencher — numa tela cujo assunto é não perder o caminho de volta.
 * 2. A recusa vem do **backend**, então prova a via completa (`useActionState`
 *    devolvendo estado de erro), não só o ramo de validação do cliente.
 * 3. É o formulário que a A-010 deixou para trás: ela tirou o período do
 *    BLOQUEIO do DOM e o da SESSÃO, no mesmo arquivo e dentro do mesmo `Dialog`,
 *    ficou como estava.
 *
 * ⚠️ A dança de abrir o diálogo é copiada de `forcar-e-privilegio-da-clinica`,
 * de propósito e não por descuido: importar de um spec faz o Playwright registrar
 * os testes DELE aqui de novo. O lugar certo de compartilhar isso é o `apoio.ts`,
 * e mover para lá é refatoração de infra que não cabe dentro de um conserto.
 */
test.describe('A-022 — o que foi digitado sobrevive à recusa por conflito', () => {
  test('o diálogo da sessão continua preenchido depois do conflito', async ({ page }) => {
    const { dia, paciente } = dadosSemeados();
    const [h, m] = HORA_DA_SESSAO.split(':').map(Number);
    const fimMin = h * 60 + m + DURACAO_DA_SESSAO;
    const fim = `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}`;
    const inicio = `${dia}T${HORA_DA_SESSAO}`;
    const NOTA = 'Trazer o registro de sono desta semana.';

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

    const gatilhoPaciente = dialogo.getByRole('combobox').first();
    await expect(
      gatilhoPaciente,
      'o primeiro combobox do diálogo não é o de paciente — a ordem do DOM mudou'
    ).toContainText(/selecione/i);
    await gatilhoPaciente.click();
    await page.getByRole('option', { name: paciente }).first().click();

    await dialogo.locator('#data_hora_sessao').fill(inicio);
    await dialogo.locator('#data_hora_fim').fill(`${dia}T${fim}`);
    await dialogo.locator('#valor_consulta').fill('180');
    await dialogo.locator('#observacoes').fill(NOTA);

    await dialogo.getByRole('button', { name: /^agendar$/i }).click();

    /**
     * 🔴 A âncora, e ela é a parte que faz este teste valer alguma coisa.
     *
     * Sem exigir a recusa ANTES, "os campos continuam preenchidos" fica
     * compatível com "a submissão nunca aconteceu" — e o teste passaria verde
     * sem exercitar nada. Foi assim que a sonda anterior deste arquivo me
     * enganou duas vezes: uma fabricando o sintoma, outra sendo barrada pela
     * validação nativa do navegador antes de existir ação.
     */
    const conflito = page.getByRole('alertdialog').filter({ hasText: /conflito de hor[áa]rio/i });
    await expect(
      conflito,
      'o backend não acusou o conflito — sem a recusa não há A-022 para exercitar aqui'
    ).toBeVisible({ timeout: 30_000 });

    // "Cancelar" é o caminho de quem decidiu ajustar em vez de forçar.
    await conflito.getByRole('button', { name: /^cancelar$/i }).click();

    await expect(
      dialogo,
      'o diálogo da sessão fechou junto com a recusa — quem cancelou perdeu a tela ' +
        'inteira, não só o texto'
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      dialogo.locator('#observacoes'),
      'a nota da sessão foi apagada quando o agendamento foi recusado por conflito — ' +
        'é a A-022 no calendário: `<form action>` reseta campo descontrolado sem ' +
        'distinguir sucesso de falha, e aqui o diálogo fica aberto justamente para ' +
        'a pessoa ajustar o que ela não tem mais'
    ).toHaveValue(NOTA, { timeout: 10_000 });

    await expect(
      dialogo.locator('#data_hora_sessao'),
      'o horário digitado foi apagado pela recusa — quem for ajustar tem que ' +
        'redescobrir qual horário já tentou'
    ).toHaveValue(inicio);

    await expect(
      dialogo.locator('#valor_consulta'),
      'o valor da consulta foi apagado pela recusa'
    ).toHaveValue('180');
  });
});

/**
 * # O que eu religuei ao controlar os campos — e que não tinha teste nenhum
 *
 * Controlar campo **quebra escrita direta no DOM**, e o calendário tinha quatro
 * delas. Eu as movi para o estado, e o teste acima não olha para nenhuma: ele
 * prova que o texto sobrevive à recusa, não que o horário ainda se autopreenche
 * nem que o teto de recorrência ainda existe.
 *
 * 🔴 Isso é o buraco clássico: o conserto tem teste, o dano colateral não. Se eu
 * tivesse errado a religação, a suíte ficaria verde e a psicóloga descobriria
 * sozinha que o fim da sessão parou de aparecer.
 *
 * Então este bloco protege exatamente o que eu mexi, e nada além disso.
 */
test.describe('o que sobrevive à mudança de campo descontrolado para controlado', () => {
  async function abrirDialogoDeSessao(page: import('@playwright/test').Page) {
    await page.goto('/calendar');
    const novo = page.getByRole('button', { name: /^novo$/i });
    const dialogo = page.getByRole('dialog').filter({ hasText: /paciente/i });
    await expect(async () => {
      if (!(await dialogo.isVisible().catch(() => false))) {
        await novo.first().click({ timeout: 5_000 });
      }
      await expect(dialogo).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    return dialogo;
  }

  test('escolher o início ainda preenche o fim sozinho, 50 minutos depois', async ({ page }) => {
    const { dia } = dadosSemeados();
    const dialogo = await abrirDialogoDeSessao(page);

    const inicio = dialogo.locator('#data_hora_sessao');
    const fim = dialogo.locator('#data_hora_fim');

    // Limpo o fim primeiro: o auto-preenchimento só age quando ele está vazio,
    // porque a regra é "sugerir", não "sobrescrever o que a pessoa escolheu".
    await fim.fill('');
    await inicio.fill(`${dia}T09:00`);

    await expect(
      fim,
      'o fim da sessão parou de se preencher sozinho. Isto NÃO é a A-022: é o ' +
        'efeito colateral de controlar o campo — antes o `onChange` do início ' +
        'escrevia em `endInput.value` direto, e num campo controlado o React ' +
        'reaplica o estado no render seguinte e a escrita some. Tem que passar ' +
        'pelo `setSessao`.'
    ).toHaveValue(`${dia}T09:50`, { timeout: 10_000 });
  });

  test('o fim já escolhido não é sobrescrito quando o início muda', async ({ page }) => {
    const { dia } = dadosSemeados();
    const dialogo = await abrirDialogoDeSessao(page);

    await dialogo.locator('#data_hora_fim').fill(`${dia}T11:30`);
    await dialogo.locator('#data_hora_sessao').fill(`${dia}T09:00`);

    /**
     * ⚠️ A metade que é fácil perder ao mover a regra para o estado: sugerir o
     * fim é útil, apagar a escolha de quem já decidiu é o oposto. Sem esta
     * asserção, um `setSessao` que ignorasse o valor atual passaria verde no
     * teste de cima e estragaria a sessão de 2h30 de alguém.
     */
    await expect(
      dialogo.locator('#data_hora_fim'),
      'mudar o início apagou o fim que já tinha sido escolhido — a sugestão virou ' +
        'sobrescrita'
    ).toHaveValue(`${dia}T11:30`);
  });

  test('o teto de 120 sessões recorrentes continua valendo', async ({ page }) => {
    const dialogo = await abrirDialogoDeSessao(page);

    // A quantidade só existe depois de escolher uma recorrência.
    const repetir = dialogo.getByRole('combobox').nth(1);
    /**
     * ⚠️ Âncora antes do clique, pelo mesmo motivo da `orla` no
     * `forcar-e-privilegio-da-clinica`: nenhum destes combobox tem nome
     * acessível (A11Y-001b), então o alvo é posicional. Se a ordem do DOM mudar,
     * o `.nth(1)` abre o seletor de PACIENTE, a opção "Semanalmente" não existe
     * ali, e a morte seria um timeout culpando o teto de 120 por um defeito de
     * seletor. O de recorrência nasce "Não repetir"; o de paciente, "Selecione".
     */
    await expect(
      repetir,
      'o segundo combobox do diálogo não é o de recorrência — a ordem do DOM ' +
        'mudou. NÃO é o teto de 120.'
    ).toContainText(/n[ãa]o (se )?repet/i);
    await repetir.click();
    await page.getByRole('option', { name: /semanalmente/i }).first().click();

    const quantidade = dialogo.locator('#quantidade_recorrencia_input');
    await expect(
      quantidade,
      'o campo de quantidade não apareceu depois de escolher "Semanalmente" — sem ' +
        'ele não há teto para exercitar'
    ).toBeVisible({ timeout: 10_000 });

    await quantidade.fill('999');

    await expect(
      quantidade,
      'o teto de 120 sumiu. Antes ele vivia num `onInput` fazendo ' +
        '`input.value = "120"`, que num campo controlado não gruda. Agora tem que ' +
        'estar no `setQuantidadeSessao` — se não estiver, dá para pedir 999 ' +
        'sessões de uma vez.'
    ).toHaveValue('120', { timeout: 10_000 });
  });
});

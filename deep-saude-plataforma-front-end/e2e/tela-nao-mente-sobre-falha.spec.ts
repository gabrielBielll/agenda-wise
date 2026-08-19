import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { CONTA } from './preparar-dados';
import { botaoEntrar, dadosSemeados } from './apoio';

/**
 * A-013 — a tela para de tratar toda falha como "não há nada".
 *
 * Achado ao investigar por que a A-012 ficou invisível por semanas (mensageria
 * 0066): o front tem **14 ocorrências, em 8 arquivos**, de
 *
 * ```ts
 * if (!res.ok) return [];
 * ```
 *
 * Com isso **403, 401, 500 e banco fora do ar produzem exatamente a mesma tela:
 * "não há nada"**. A psicóloga que tomava 403 em tudo abria o calendário, não via
 * paciente nenhum, e concluía *"ainda não cadastrei ninguém"* — não *"o sistema
 * está me recusando"*. O sistema recusava em silêncio e a tela concordava com a
 * recusa.
 *
 * A decisão de produto está na mensageria 0073 — **quatro estados, nunca
 * confundidos**:
 *
 * | Situação | O que a tela diz |
 * |---|---|
 * | lista realmente vazia | "Nenhum … cadastrado ainda" + o caminho para cadastrar |
 * | **403** | "Você não tem acesso a esta lista. Fale com a gestão da clínica." |
 * | **500 / rede** | "Não consegui carregar." + botão de tentar de novo |
 * | **401** | **manda para o login**, sem tela de erro |
 *
 * ⚠️ **A tela de 403 não pode dizer o que existe do outro lado.** "Você não tem
 * acesso" está certo; "há 14 pacientes que você não pode ver" vaza justamente o
 * que a permissão nega.
 *
 * ---
 *
 * ## ⚠️ DUAS DAS QUATRO TELAS NASCEM SEM TESTE, e isto não é descuido
 *
 * Está escrito aqui, e não só na mensageria, porque quem ler o resumo daqui a um
 * mês vai achar que "a A-013 está coberta". **Falta um dos quatro** — o 500.
 *
 * - **401** — coberto aqui. É o único forçável hoje.
 * - **vazio de verdade** — coberto pelo resto da suíte, que roda com banco semeado.
 * - **403** — ✅ **coberto**, desde que a A-012 encheu `papel_permissoes` e a
 *   A-017 deu tela ao secretário. Ele tem `visualizar_pacientes` e **não** tem
 *   `gerenciar_prontuarios` (migration `20260817090000-permissoes-papeis`), então
 *   a recusa é **legítima e real** — não simulada. O gatilho que eu tinha deixado
 *   escrito aqui disparou.
 * - **500 / backend fora do ar** — ❌ sem teste. Virou a **P-002 da `pico`**, que é
 *   quem roda Playwright de verdade: um segundo projeto cujo servidor Next sobe
 *   apontando para uma porta morta.
 *
 * ## Por que `page.route` não serve nesta suíte
 *
 * Os oito arquivos são **server components**: o `fetch` sai do servidor Next para
 * o Clojure e **nunca toca o navegador**. Um `page.route('**\/api/pacientes*')`
 * ali é ignorado em silêncio — o teste passaria exercitando a tela normal e
 * **achando** que forçou 403. Medido antes de escrever (mensageria 0072).
 */

const SEGREDO =
  process.env.NEXTAUTH_SECRET ?? 'segredo-apenas-para-e2e-nao-usar-em-producao';

/**
 * Um `backendToken` que o **front aceita** e a **API recusa**.
 *
 * `exp` no futuro e assinatura falsa. O middleware só decodifica o payload para
 * ler o `exp` — ele não tem o segredo do backend e não deveria ter — então deixa
 * passar; o backend verifica a assinatura e devolve 401.
 *
 * Medido contra o backend de verdade (mensageria 0072):
 *
 * ```
 * sem Authorization              -> 401
 * token malformado               -> 401
 * exp futuro + assinatura ruim   -> 401  {"erro":"Token inválido ou expirado."}
 * ```
 *
 * Este teste segura essa propriedade no lugar: se um dia alguém "melhorar" o
 * middleware para confiar no payload, ou o backend para aceitar sem verificar,
 * ele avisa.
 */
function backendTokenQueAApiRecusa(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  return `${b64({ alg: 'HS256' })}.${b64({ exp, sub: 'a013' })}.assinaturaFalsa`;
}

test.describe('A-013 — 401 no fetch do servidor manda para o login', () => {
  // Contexto limpo: o globalSetup deixa uma sessão de admin válida salva, e aqui
  // o objeto do teste é justamente uma sessão que a API não aceita.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('o calendário não pode renderizar vazio quando a API recusou a sessão', async ({
    page,
    baseURL,
  }) => {
    const cookie = await encode({
      token: {
        role: 'admin_clinica',
        backendToken: backendTokenQueAApiRecusa(),
        sub: 'a013',
      },
      secret: SEGREDO,
    });

    await page.context().addCookies([
      { name: 'next-auth.session-token', value: cookie, url: baseURL! },
    ]);

    await page.goto('/calendar');

    // 401 não é falha do sistema: é sessão que não vale. A pessoa precisa entrar
    // de novo, e tela de erro genérica aqui a faria achar que algo quebrou.
    await expect(
      page,
      'a sessão foi recusada pela API e a tela ficou no calendário mostrando vazio — ' +
        'é a A-013: quem olha conclui "não há nada cadastrado" quando o certo é entrar de novo'
    ).toHaveURL(/\/(\?|$)/);

    await expect(
      page.locator('#email'),
      'depois do 401 a pessoa tem que cair no formulário de login, não numa lista vazia'
    ).toBeVisible();
  });
});

test.describe('A-013 — 403 diz "sem acesso", e não esconde o que a pessoa pode ver', () => {
  /**
   * O quarto estado, com uma recusa **de verdade** — não simulada.
   *
   * O secretário tem `visualizar_pacientes` e **não** tem `gerenciar_prontuarios`
   * (migration `20260817090000-permissoes-papeis`, e é a resposta do Gabriel na
   * mensageria 0064: cadastro sim, prontuário não). Então esta é a única tela do
   * sistema onde **dois níveis de permissão** convivem, e ela prova duas coisas
   * de uma vez:
   *
   * 1. o 403 **fala** — *"você não tem acesso"* — em vez de virar lista vazia,
   *    que era a A-013 e foi o que escondeu a A-012 por semanas;
   * 2. a recusa é **parcial** — o cadastro que ele PODE ver continua na tela.
   *    Antes da A-017 eu devolvia a recusa em tela cheia, o que era a A-013 pelo
   *    avesso: em vez de mostrar de menos, recusar demais.
   */
  test.use({ storageState: { cookies: [], origins: [] } });

  test('o secretário vê o paciente e uma recusa nomeada no lugar do prontuário', async ({ page }) => {
    const { pacienteId, paciente } = dadosSemeados();

    await page.goto('/');
    await page.locator('#email').fill(CONTA.secretarioEmail);
    await page.locator('#password').fill(CONTA.secretarioSenha);
    await botaoEntrar(page).click();
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).some((c) => c.name.includes('next-auth.session-token')),
        { timeout: 90_000, message: 'o login do secretário não criou sessão' }
      )
      .toBe(true);

    await page.goto(`/patients/${pacienteId}`);

    // 1. O que ele PODE ver continua lá.
    await expect(
      page.getByText(paciente).first(),
      'a tela inteira sumiu por causa do prontuário — é a recusa em tela cheia escondendo o cadastro'
    ).toBeVisible();

    // 2. E a seção do prontuário nomeia a recusa.
    const historico = page.locator('#historico-evolucao');
    await expect(
      historico,
      'o 403 do prontuário precisa dizer que é falta de acesso'
    ).toContainText(/não tem acesso|nao tem acesso/i);

    // 3. E não pode, de jeito nenhum, dizer que não há registro.
    await expect(
      historico,
      'a recusa virou "não há nada" — é exatamente a A-013, e num lugar onde ela mente sobre histórico clínico'
    ).not.toContainText(/nenhum registro/i);
  });
});

/**
 * # A-019 — o agendamento novo dizia "não há psicólogas" quando a sessão vencia
 *
 * A mesma doença da A-013, num endereço que a recepção usa todo dia:
 * `admin/agendamentos/novo/page.tsx` fazia `res.ok ? await res.json() : []` nos
 * dois carregamentos. Qualquer desfecho ruim — 401, 403, backend fora do ar —
 * virava **lista vazia**.
 *
 * 🔴 **O estrago não é o formulário quebrado, é o formulário plausível.** Uma
 * clínica sem psicóloga cadastrada é estado legítimo do sistema, então o seletor
 * vazio não parece defeito: parece resposta. Quem está atendendo conclui que a
 * psicóloga foi removida do cadastro e vai procurar quem a apagou.
 *
 * ⚠️ **Este teste existe porque o conserto subiu sem ele.** Eu troquei o
 * `res.ok ? … : []` pelo `carregar` e empurrei; o comportamento novo não tinha
 * nada segurando. É o mesmo buraco que eu venho apontando a noite toda — o
 * conserto tem prova, o vizinho não tem — e desta vez o vizinho era o meu.
 *
 * 📌 **Dos quatro desfechos, o 401 é o único forçável daqui**, e é por isso que
 * ele é o escolhido: o 403 exigiria um papel que alcance `/admin/*` sem ter
 * `visualizar_todos_agendamentos`, e o middleware só deixa `admin_clinica`
 * entrar — que tem tudo. O 500 continua sendo a P-002 da `pico`.
 */
test.describe('A-019 — sessão recusada no agendamento novo manda ao login, não a um seletor vazio', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('o formulário não pode abrir com a lista de psicólogas vazia', async ({ page, baseURL }) => {
    const cookie = await encode({
      token: {
        role: 'admin_clinica',
        backendToken: backendTokenQueAApiRecusa(),
        sub: 'a019',
      },
      secret: SEGREDO,
    });

    await page.context().addCookies([
      { name: 'next-auth.session-token', value: cookie, url: baseURL! },
    ]);

    await page.goto('/admin/agendamentos/novo');

    /**
     * ⚠️ A porta é `/admin/login`, e não `/`, de propósito: esta tela é do módulo
     * administrativo, e mandar a recepção para a porta do psicólogo seria trocar
     * um beco por outro — a credencial dela não serve lá.
     */
    await expect(
      page,
      'a sessão foi recusada pela API e a tela ficou no formulário de agendamento — ' +
        'é a A-019: o seletor de psicóloga abre vazio e quem atende conclui que ' +
        'ela foi removida do cadastro, quando o certo é entrar de novo'
    ).toHaveURL(/\/admin\/login/);

    await expect(
      page.locator('#email'),
      'depois do 401 a pessoa tem que cair no login administrativo, não num ' +
        'formulário que ela não consegue preencher'
    ).toBeVisible({ timeout: 30_000 });
  });
});

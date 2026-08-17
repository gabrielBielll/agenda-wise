import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';

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
 * mês vai achar que "a A-013 está coberta". **Não está — está pela metade.**
 *
 * - **401** — coberto aqui. É o único forçável hoje.
 * - **vazio de verdade** — coberto pelo resto da suíte, que roda com banco semeado.
 * - **403** — ❌ sem teste. Precisa de usuário autenticado **sem** a permissão, e
 *   hoje ninguém tem: `papel_permissoes` está vazia (**A-012**, primeira da fila
 *   da `duna`). 📌 **O teste do 403 entra aqui quando a A-012 cair.**
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

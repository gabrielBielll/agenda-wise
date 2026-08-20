/**
 * Anda pelo sistema com os dados de demonstração e tira foto de cada tela.
 *
 * Lições já pagas que estão aplicadas aqui:
 *  - `networkidle` NUNCA assenta nesta sandbox (fontes bloqueadas + prefetch do
 *    Next). Usar `domcontentloaded` + espera por elemento.
 *  - Clicar em "Entrar" antes de hidratar dispara submit nativo GET, e a senha
 *    vai para a URL. Esperar o botão responder antes.
 *  - Uma tela "verde" pode ser a tela de login disfarçada. Toda captura assere
 *    um elemento que SÓ existe naquela tela.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SITE ?? 'http://127.0.0.1:3210';
// Sem valor padrão, pelo mesmo motivo do semear-demo.mjs: senha com padrão
// vira senha de produção no dia em que alguém esquecer de trocar.
const SENHA = process.env.SENHA_DEMO;
if (!SENHA) { console.error('Falta SENHA_DEMO.'); process.exit(1); }
const SAIDA = process.env.SAIDA ?? '/tmp/passeio';
mkdirSync(SAIDA, { recursive: true });

const relatorio = [];

async function entrar(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(6_000); // hidratação
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(SENHA);
  await page.getByRole('button', { name: /^entrar/i }).click();
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 60_000 });
}

async function foto(page, nome, rota, provaSeletor, descricao) {
  if (rota) {
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  }
  let prova = 'NÃO CONFERIDA';
  try {
    await page.locator(provaSeletor).first().waitFor({ state: 'visible', timeout: 25_000 });
    prova = 'ok';
  } catch {
    prova = `🔴 não achei ${provaSeletor}`;
  }
  await page.waitForTimeout(2500);
  const arquivo = `${SAIDA}/${nome}.png`;
  await page.screenshot({ path: arquivo, fullPage: true });
  relatorio.push({ nome, rota: rota ?? '(atual)', url: page.url(), prova, descricao });
  console.log(`  ${prova === 'ok' ? '✓' : '✘'} ${nome} — ${prova}`);
}

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await contexto.newPage();

const erros = [];
page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 200)); });

try {
  console.log('\n▸ Como a PSICÓLOGA (Beatriz)');
  await entrar(page, 'beatriz.psi@demo.local');
  await foto(page, '01-dashboard-psicologa', '/dashboard', 'main', 'painel inicial da psicóloga');
  await foto(page, '02-calendario', '/calendar', 'main', 'agenda com as sessões semeadas');
  await foto(page, '03-pacientes', '/patients', 'main', 'lista de pacientes dela');

  // Entrar no primeiro paciente para ver o prontuário e o gráfico de humor.
  const primeiro = page.getByRole('link').filter({ hasText: /Amanda|Bruno|Carla/ }).first();
  if (await primeiro.count()) {
    await primeiro.click();
    await page.waitForTimeout(4000);
    await foto(page, '04-paciente-e-humor', null, 'main', 'ficha do paciente com evoluções e humor');
  } else {
    relatorio.push({ nome: '04-paciente-e-humor', prova: '🔴 não achei link de paciente na lista' });
    console.log('  ✘ 04 — não achei link de paciente');
  }

  console.log('\n▸ Como a ADMINISTRADORA (Renata)');
  await contexto.clearCookies();
  const page2 = await contexto.newPage();
  page2.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  await entrar(page2, 'renata.admin@demo.local');
  await foto(page2, '05-admin-agendamentos', '/admin/agendamentos', 'main', 'agenda da clínica inteira');
  await foto(page2, '06-admin-financeiro', '/admin/financeiro', 'main', 'financeiro com repasses');
  await foto(page2, '07-admin-psicologos', '/admin/psicologos', 'main', 'equipe da clínica');
} catch (e) {
  console.log(`\n🔴 parou: ${e.message.slice(0, 300)}`);
} finally {
  console.log('\n─── resumo ───');
  for (const r of relatorio) console.log(`  ${r.prova === 'ok' ? '✓' : '✘'} ${r.nome}  ${r.url ?? ''}`);
  if (erros.length) {
    console.log('\n─── erros do navegador (primeiros 8) ───');
    for (const e of [...new Set(erros)].slice(0, 8)) console.log(`  • ${e}`);
  } else {
    console.log('\n  nenhum erro de JavaScript no console');
  }
  await navegador.close();
}

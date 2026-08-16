import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

/**
 * Semeia o backend antes da suíte, usando SÓ a API pública.
 *
 * Semear por SQL direto seria mais rápido, mas exigiria um cliente de banco no
 * frontend e, principalmente, deixaria de exercitar o caminho real. Provisionar
 * clínica, criar psicólogo e criar agendamento pela API é de graça em cobertura:
 * se qualquer um desses handlers quebrar, a suíte de navegador nem começa.
 *
 * É idempotente. Rodar duas vezes não duplica nada — 409 de "já cadastrado" é
 * tratado como sucesso, porque significa que o dado que o teste precisa existe.
 */

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3999';
const TOKEN_PROVISIONAMENTO = process.env.PROVISIONING_TOKEN ?? 'token-prov-teste';

export const CONTA = {
  email: 'e2e-admin@teste.local',
  senha: 'SenhaE2E123',
  clinica: 'Clinica E2E',
  psicologoEmail: 'e2e-psi@teste.local',
  /** Nome exibido — os testes que escolhem o psicólogo numa lista precisam dele. */
  psicologoNome: 'Psi E2E',
  /** Do lado do e-mail, como a do admin — o teste do 403 loga como psicólogo. */
  psicologoSenha: 'SenhaPsi123',
  paciente: 'Paciente E2E',
};

/** Horário de parede usado pelos testes de fuso. Ver calendario-fuso.spec.ts. */
export const HORA_DA_SESSAO = '14:00';

/**
 * Duração da sessão semeada, em minutos.
 *
 * Exportada porque os testes precisam calcular o horário de FIM que a tela
 * mostra. Repetir o `50` lá faria o teste falhar dizendo que a tela errou o
 * intervalo quando quem mudou foi o semeador — a duplicata mente justamente
 * na hora em que quebra.
 */
export const DURACAO_DA_SESSAO = 50;

/** "Hoje" no fuso da clínica — não no fuso da máquina que roda o teste. */
export function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function esperarBackend(tentativas = 60): Promise<void> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${BACKEND}/api/health`);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Backend não respondeu em ${BACKEND}/api/health.\n` +
      `Suba com:\n` +
      `  cd deep-saude-plataforma-api/deep-saude-backend\n` +
      `  JWT_SECRET=... PROVISIONING_TOKEN=${TOKEN_PROVISIONAMENTO} PORT=3999 \\\n` +
      `  DATABASE_URL=... lein run`
  );
}

async function json(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function provisionarClinica() {
  const res = await fetch(`${BACKEND}/api/admin/provisionar-clinica`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Provisioning-Token': TOKEN_PROVISIONAMENTO,
    },
    body: JSON.stringify({
      nome_clinica: CONTA.clinica,
      limite_psicologos: 10,
      nome_admin: 'Admin E2E',
      email_admin: CONTA.email,
      senha_admin: CONTA.senha,
    }),
  });
  // 409 = a clínica já existe de uma execução anterior. É o esperado ao reusar
  // o banco entre rodadas, não um erro.
  if (!res.ok && res.status !== 409) {
    throw new Error(
      `Provisionamento falhou (${res.status}): ${JSON.stringify(await json(res))}\n` +
        `Confira se PROVISIONING_TOKEN do backend bate com "${TOKEN_PROVISIONAMENTO}".`
    );
  }
}

async function entrar(): Promise<string> {
  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CONTA.email, senha: CONTA.senha }),
  });
  if (!res.ok) {
    throw new Error(`Login do admin de teste falhou (${res.status}).`);
  }
  return (await res.json()).token;
}

async function criarPsicologo(token: string): Promise<string> {
  const res = await fetch(`${BACKEND}/api/usuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      nome: CONTA.psicologoNome,
      email: CONTA.psicologoEmail,
      senha: CONTA.psicologoSenha,
      papel: 'psicologo',
    }),
  });
  if (res.ok) return (await res.json()).id ?? (await buscarPsicologo(token));
  if (res.status === 409) return buscarPsicologo(token);
  throw new Error(`Criação do psicólogo falhou (${res.status}).`);
}

async function buscarPsicologo(token: string): Promise<string> {
  const res = await fetch(`${BACKEND}/api/psicologos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const lista = await res.json();
  const achado = lista.find((p: any) => p.email === CONTA.psicologoEmail) ?? lista[0];
  if (!achado) throw new Error('Nenhum psicólogo na clínica de teste.');
  return achado.id;
}

async function garantirPaciente(token: string, psicologoId: string): Promise<string> {
  const lista = await (
    await fetch(`${BACKEND}/api/pacientes`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const existente = lista.find((p: any) => p.nome === CONTA.paciente);
  if (existente) return existente.id;

  const res = await fetch(`${BACKEND}/api/pacientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome: CONTA.paciente, psicologo_id: psicologoId, status: 'ativo' }),
  });
  if (!res.ok) throw new Error(`Criação do paciente falhou (${res.status}).`);
  return (await res.json()).id;
}

async function garantirSessaoDeHoje(token: string, pacienteId: string, psicologoId: string) {
  const dia = hojeEmSaoPaulo();
  const quando = `${dia}T${HORA_DA_SESSAO}:00`;

  const res = await fetch(`${BACKEND}/api/agendamentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      paciente_id: pacienteId,
      psicologo_id: psicologoId,
      data_hora_sessao: quando,
      valor_consulta: 200,
      duracao: DURACAO_DA_SESSAO,
    }),
  });
  // 409 = já existe sessão nesse horário (rodada anterior). Serve igual.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Criação da sessão falhou (${res.status}): ${JSON.stringify(await json(res))}`);
  }
  return quando;
}

/** Horário de parede em São Paulo de um instante devolvido pela API. */
function paredeEmSaoPaulo(iso: string): string {
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  for (const parte of fmt.formatToParts(new Date(iso))) p[parte.type] = parte.value;
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}

/**
 * O id da sessão semeada.
 *
 * `garantirSessaoDeHoje` trata 409 como sucesso e por isso nem sempre tem o id
 * na mão. Quem precisa dele é o teste de ida e volta, que abre
 * `/admin/agendamentos/<id>/edit` direto em vez de caçar a linha na listagem —
 * clicar pela tabela acoplaria o teste ao `AgendamentosClient`, que é de 709
 * linhas e não é o objeto aqui.
 *
 * A busca é pelo horário de PAREDE em São Paulo, não pelo prefixo da string: a
 * API devolve instante com fuso, e comparar texto daria certo por coincidência
 * às 14:00 e erraria perto da meia-noite.
 */
async function idDaSessaoSemeada(
  token: string,
  pacienteId: string,
  dia: string
): Promise<string | null> {
  const lista = await (
    await fetch(`${BACKEND}/api/agendamentos`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const alvo = (lista as any[]).find(
    (a) =>
      a.paciente_id === pacienteId &&
      paredeEmSaoPaulo(a.data_hora_sessao) === `${dia}T${HORA_DA_SESSAO}`
  );
  return alvo?.id ?? null;
}

/**
 * Deixa ao menos um repasse como 'transferido'.
 *
 * É o que dá dente ao teste da coluna "{pagos}/{total} Pagos": ela comparava
 * com 'pago', valor que `status_repasse` nunca assume, e por isso ficava
 * permanentemente em 0. Com um repasse transferido semeado, o numerador tem
 * obrigatoriamente que ser > 0 — se voltar a zero, a regressão voltou.
 */
async function marcarUmRepasseTransferido(token: string) {
  const lista = await (
    await fetch(`${BACKEND}/api/agendamentos`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const alvo = lista[0];
  if (!alvo) return;

  await fetch(`${BACKEND}/api/agendamentos/${alvo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status_repasse: 'transferido' }),
  });
}

/**
 * Marca a sessão semeada como PAGA.
 *
 * Sem isto, `marcar repasse como transferido persiste` pula **sempre**: a coluna
 * de repasse do financeiro só vira botão quando `getEffectivePagamento(ag) ===
 * 'pago'` (`FinanceiroClient.tsx`, ~1090); com pagamento pendente ela renderiza
 * um `<span>🔒 Bloqueado</span>`, e o `getByRole('button', ...)` do teste não
 * acha nada. O `test.skip` dizia "sem transações no mês corrente", que é o
 * sintoma e não a causa — a transação existia, faltava estar paga.
 *
 * Conferido por leitura do componente, não medido: não há Playwright neste
 * aparelho. Se o teste continuar pulando depois disto, a causa é outra e o
 * `skip` de lá precisa virar falha.
 */
async function marcarSessaoComoPaga(token: string, agendamentoId: string | null) {
  if (!agendamentoId) return;
  await fetch(`${BACKEND}/api/agendamentos/${agendamentoId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status_pagamento: 'pago' }),
  });
}

/**
 * Autentica uma vez e guarda a sessão para todos os specs reusarem.
 *
 * Sem isto cada teste refazia o login pela tela, e em `next dev` — que compila
 * rota sob demanda — o `beforeEach` sozinho estourava o timeout. Logar uma vez
 * também aquece `/calendar` e `/admin/financeiro`, tirando a primeira
 * compilação (dezenas de segundos) de dentro do tempo medido dos testes.
 *
 * `login.spec.ts` pede contexto limpo explicitamente, porque lá o objeto é
 * justamente o formulário de login.
 */
async function autenticarEAquecer(baseURL: string) {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ baseURL, timezoneId: 'America/Sao_Paulo' });
  const pagina = await contexto.newPage();

  await pagina.goto('/admin/login');
  await pagina.getByLabel(/e-?mail/i).fill(CONTA.email);
  await pagina.locator('input[type="password"]').fill(CONTA.senha);
  await pagina.getByRole('button', { name: /entrar|acessar|login/i }).click();
  await pagina.waitForURL(/\/admin\/dashboard/, { timeout: 120_000 });

  for (const rota of ['/calendar', '/admin/financeiro']) {
    await pagina.goto(rota, { timeout: 120_000 });
    await pagina.waitForLoadState('networkidle').catch(() => {});
  }

  await contexto.storageState({ path: join(__dirname, '.auth.json') });
  await navegador.close();
}

export default async function prepararDados(config: FullConfig) {
  await esperarBackend();
  await provisionarClinica();
  const token = await entrar();
  const psicologoId = await criarPsicologo(token);
  const pacienteId = await garantirPaciente(token, psicologoId);
  const quando = await garantirSessaoDeHoje(token, pacienteId, psicologoId);
  const dia = hojeEmSaoPaulo();
  const agendamentoId = await idDaSessaoSemeada(token, pacienteId, dia);
  await marcarSessaoComoPaga(token, agendamentoId);
  await marcarUmRepasseTransferido(token);

  writeFileSync(
    join(__dirname, '.dados-semeados.json'),
    JSON.stringify(
      { ...CONTA, psicologoId, pacienteId, agendamentoId, quando, dia },
      null,
      2
    )
  );

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:9002';
  await autenticarEAquecer(String(baseURL));

  console.log(`\n  [e2e] backend em ${BACKEND}`);
  console.log(`  [e2e] sessão semeada para ${quando} (horário de parede em São Paulo)`);
  console.log(`  [e2e] sessão autenticada salva; rotas aquecidas`);
  console.log(
    agendamentoId
      ? `  [e2e] id da sessão: ${agendamentoId}\n`
      : `  [e2e] ⚠️  não achei o id da sessão semeada — o teste de ida e volta vai pular\n`
  );
}

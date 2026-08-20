/**
 * Backend de mentira que imita o CONTRATO lido do Clojure — não o comportamento.
 *
 * Serve para uma coisa só: rodar `semear-demo.mjs` de ponta a ponta e ver se a
 * sequência, os nomes de campo e a idempotência funcionam. NÃO prova que o
 * backend real aceita — prova que o script faz o que eu quis que ele fizesse.
 *
 * Cada regra abaixo tem a linha do fonte de onde saiu.
 */
import { createServer } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';

/**
 * JWT de verdade — HS256 — porque o middleware do front DECODIFICA o token e
 * checa `exp` (`middleware.ts:102`, `isBackendTokenExpired`).
 *
 * Com um UUID no lugar do JWT o login funcionava e o middleware mandava todo
 * mundo de volta para `/?expired=true`. O sintoma ("sessao expirada") nao aponta
 * em nada para "o token nao e um JWT".
 */
const SEGREDO = process.env.JWT_SECRET ?? 'segredo-demo';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function assinar(claims) {
  const cabecalho = b64({ alg: 'HS256', typ: 'JWT' });
  const corpo = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 });
  const assinatura = createHmac('sha256', SEGREDO).update(`${cabecalho}.${corpo}`).digest('base64url');
  return `${cabecalho}.${corpo}.${assinatura}`;
}

const db = {
  clinicas: [],
  usuarios: [],   // {id,nome,email,senha,papel,clinica_id,modalidade_repasse,percentual_repasse,valor_fixo_repasse}
  pacientes: [],  // {id,nome,email,psicologo_id,clinica_id,status}
  agendamentos: [],
  prontuarios: [],
};

const TOKEN_PROV = process.env.PROVISIONING_TOKEN ?? 'token-prov-demo';
const modalidades = new Set(['percentual', 'fixo']);

/** remuneracao.clj:11 — validar-regra */
function validarRegra({ modalidade_repasse, percentual_repasse, valor_fixo_repasse }) {
  if (!modalidades.has(modalidade_repasse)) return "modalidade_repasse deve ser 'percentual' ou 'fixo'.";
  if (modalidade_repasse === 'percentual') {
    if (percentual_repasse == null) return 'percentual_repasse é obrigatório.';
    if (percentual_repasse < 0) return 'percentual_repasse não pode ser negativo.';
    if (percentual_repasse > 100) return 'percentual_repasse não pode ser maior que 100.';
    if (valor_fixo_repasse != null) return 'valor_fixo_repasse deve ficar vazio na modalidade percentual.';
    return null;
  }
  if (valor_fixo_repasse == null) return 'valor_fixo_repasse é obrigatório.';
  if (valor_fixo_repasse < 0) return 'valor_fixo_repasse não pode ser negativo.';
  if (percentual_repasse != null) return 'percentual_repasse deve ficar vazio na modalidade fixa.';
  return null;
}

const tokens = new Map(); // token -> usuario

function ler(req) {
  return new Promise((res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      try { res(b ? JSON.parse(b) : {}); } catch { res({}); }
    });
  });
}

function identidade(req) {
  const h = req.headers.authorization ?? '';
  return tokens.get(h.replace(/^Bearer /, '')) ?? null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const corpo = ['POST', 'PUT'].includes(req.method) ? await ler(req) : {};
  const eu = identidade(req);

  const responder = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body ?? null));
  };

  // --- públicas -----------------------------------------------------------
  if (p === '/api/health') return responder(200, { status: 'ok', banco: 'ok' });

  if (p === '/api/admin/provisionar-clinica' && req.method === 'POST') {
    if (req.headers['x-provisioning-token'] !== TOKEN_PROV)
      return responder(403, { erro: 'Provisionamento não autorizado.' });
    if (db.clinicas.some((c) => c.nome === corpo.nome_clinica))
      return responder(409, { erro: 'Clínica já existe.' });
    const clinica = { id: randomUUID(), nome: corpo.nome_clinica };
    db.clinicas.push(clinica);
    db.usuarios.push({
      id: randomUUID(), nome: corpo.nome_admin, email: corpo.email_admin,
      senha: corpo.senha_admin, papel: 'admin_clinica', clinica_id: clinica.id,
    });
    return responder(201, { clinica_id: clinica.id });
  }

  if (p === '/api/auth/login' && req.method === 'POST') {
    const u = db.usuarios.find((x) => x.email === corpo.email && x.senha === corpo.senha);
    if (!u) return responder(401, { erro: 'Credenciais inválidas.' });
    const t = assinar({ user_id: u.id, clinica_id: u.clinica_id, papel_id: u.papel, role: u.papel });
    tokens.set(t, u);
    // core.clj:352 — a chave e `user`, NAO `usuario`. O front le data.user
    // (lib/auth.ts:66); com `usuario` o login devolve null em silencio.
    return responder(200, { message: 'Usuário autenticado com sucesso.', token: t,
      user: { id: u.id, email: u.email, clinica_id: u.clinica_id, papel_id: u.papel, role: u.papel } });
  }

  if (!eu) return responder(401, { erro: 'Token ausente ou inválido.' });

  // --- usuários (core.clj:367) --------------------------------------------
  if (p === '/api/usuarios' && req.method === 'POST') {
    if (db.usuarios.some((u) => u.email === corpo.email))
      return responder(409, { erro: 'Email já cadastrado no sistema.' });
    const temRegra = corpo.modalidade_repasse != null || corpo.percentual_repasse != null || corpo.valor_fixo_repasse != null;
    if (temRegra && corpo.papel !== 'psicologo')
      return responder(422, { erro: 'Regra de repasse só pode ser definida para psicóloga.' });
    if (temRegra) {
      const erro = validarRegra(corpo);
      if (erro) return responder(422, { erro, code: 'regra_repasse_invalida' });
    }
    const novo = { id: randomUUID(), ...corpo, clinica_id: eu.clinica_id };
    db.usuarios.push(novo);
    return responder(201, novo);
  }

  if (p === '/api/psicologos' && req.method === 'GET') {
    return responder(200, db.usuarios
      .filter((u) => u.papel === 'psicologo' && u.clinica_id === eu.clinica_id)
      .map((u) => ({ id: u.id, nome: u.nome, email: u.email })));
  }

  // --- pacientes (core.clj:487) -------------------------------------------
  if (p === '/api/pacientes' && req.method === 'GET') {
    return responder(200, db.pacientes.filter((x) => x.clinica_id === eu.clinica_id));
  }
  if (p === '/api/pacientes' && req.method === 'POST') {
    if (corpo.email && db.pacientes.some((x) => x.email === corpo.email && x.clinica_id === eu.clinica_id))
      return responder(409, { erro: 'unique_email_clinica' });
    const novo = { id: randomUUID(), ...corpo, clinica_id: eu.clinica_id };
    db.pacientes.push(novo);
    return responder(201, novo);
  }

  const mPacienteUm = p.match(/^\/api\/pacientes\/([^/]+)$/);
  if (mPacienteUm && req.method === 'GET') {
    const pac = db.pacientes.find((x) => x.id === mPacienteUm[1]);
    if (!pac) return responder(404, { erro: 'Paciente não encontrado.' });
    const psi = db.usuarios.find((u) => u.id === pac.psicologo_id);
    return responder(200, { ...pac, nome_psicologo: psi?.nome ?? null });
  }

  // --- prontuários (prontuarios.clj:27) -----------------------------------
  const mProntuario = p.match(/^\/api\/pacientes\/([^/]+)\/prontuarios$/);
  if (mProntuario) {
    const paciente = db.pacientes.find((x) => x.id === mProntuario[1]);
    if (!paciente) return responder(404, { erro: 'Paciente não encontrado.' });
    if (req.method === 'GET') {
      // prontuarios.clj:117 — LEFT JOIN agendamentos devolve data_sessao, e a
      // tela prefere essa data a data_registro (ProntuarioList.tsx:50).
      return responder(200, db.prontuarios
        .filter((x) => x.paciente_id === paciente.id)
        .map((x) => ({
          ...x,
          nome_psicologo: db.usuarios.find((u) => u.id === x.psicologo_id)?.nome ?? null,
          data_sessao: db.agendamentos.find((a) => a.id === x.agendamento_id)?.data_hora_sessao ?? null,
        })));
    }
    if (req.method === 'POST') {
      if (!corpo.conteudo || !String(corpo.conteudo).trim())
        return responder(400, { erro: 'Conteúdo da evolução é obrigatório.' });
      if (eu.papel === 'psicologo' && paciente.psicologo_id !== eu.id)
        return responder(403, { erro: 'Você só pode registrar prontuários para seus pacientes.' });
      // baseline.up.sql:99 — data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP.
      // Sem isto a tela mostra "Invalid Date", e eu quase reportei isso como
      // defeito do produto quando era buraco do simulador.
      const novo = { id: randomUUID(), data_registro: new Date().toISOString(),
                     ...corpo, paciente_id: paciente.id, psicologo_id: eu.id };
      db.prontuarios.push(novo);
      return responder(201, novo);
    }
  }

  // --- agendamentos --------------------------------------------------------
  if (p === '/api/agendamentos/sincronizar' && req.method === 'POST') {
    // core.clj:1081 — os UPDATE filtram por pagamento_automatico = true, e
    // provisionar-clinica nao liga a flag. Com PAGAMENTO_AUTOMATICO=nao este
    // servidor reproduz o que a vale mediu em producao: 200 e zero efeito.
    if (process.env.PAGAMENTO_AUTOMATICO === 'nao') {
      return responder(200, { message: 'Sincronização concluída',
                              status_atualizados: 0, pagamentos_atualizados: 0 });
    }
    const agora = new Date();
    let n = 0;
    for (const a of db.agendamentos) {
      if (new Date(a.data_hora_sessao) < agora && (a.status == null || a.status === 'agendado')) {
        a.status = 'realizado'; n++;
      }
      if (a.status === 'realizado' && a.status_pagamento === 'pendente') a.status_pagamento = 'pago';
      // remuneracao.clj:52 — só calcula o que ainda não tem cálculo
      if (a.status === 'realizado' && a.valor_repasse == null) {
        const psi = db.usuarios.find((u) => u.id === a.psicologo_id);
        a.valor_repasse = psi?.modalidade_repasse === 'fixo'
          ? Number(psi.valor_fixo_repasse)
          : Number(a.valor_consulta) * Number(psi?.percentual_repasse ?? 0) / 100;
      }
    }
    return responder(200, { atualizados: n });
  }

  if (p === '/api/agendamentos' && req.method === 'GET') {
    // core.clj:1231 — admin e secretario veem a clinica inteira; psicologa ve
    // SO a propria agenda. Sem este filtro o simulador mostraria a agenda de
    // todo mundo para qualquer um, e eu acusaria um defeito de privacidade que
    // o produto nao tem.
    const meus = db.agendamentos.filter((x) => x.clinica_id === eu.clinica_id
      && (['admin_clinica', 'secretario'].includes(eu.papel) || x.psicologo_id === eu.id));
    // core.clj:1222 — o SELECT devolve nome_paciente e nome_psicologo por JOIN.
    return responder(200, meus.map((a) => ({
      ...a,
      nome_paciente: db.pacientes.find((x) => x.id === a.paciente_id)?.nome ?? null,
      nome_psicologo: db.usuarios.find((u) => u.id === a.psicologo_id)?.nome ?? null,
    })));
  }
  if (p === '/api/agendamentos' && req.method === 'POST') {
    // core.clj:663 — conflito ignora canceladas
    const inicio = new Date(corpo.data_hora_sessao).getTime();
    const fim = inicio + (corpo.duracao ?? 50) * 60000;
    const bate = db.agendamentos.some((a) => {
      if (a.psicologo_id !== corpo.psicologo_id || a.status === 'cancelado') return false;
      const i = new Date(a.data_hora_sessao).getTime();
      return inicio < i + (a.duracao ?? 50) * 60000 && i < fim;
    });
    if (bate && !corpo.force) return responder(409, { erro: 'Conflito de horário.' });
    const novo = {
      id: randomUUID(), ...corpo, clinica_id: eu.clinica_id,
      // TIMESTAMPTZ desde 20260811100100: a API devolve INSTANTE com offset,
      // interpretando o que chega como parede de Sao Paulo (UTC-3).
      data_hora_sessao: new Date(corpo.data_hora_sessao + '-03:00').toISOString(),
      status: corpo.status ?? 'agendado',
      status_pagamento: 'pendente', status_repasse: 'pendente', valor_repasse: null,
      // core.clj:782 — cancelada zera o valor
      valor_consulta: corpo.status === 'cancelado' ? 0 : corpo.valor_consulta,
    };
    db.agendamentos.push(novo);
    return responder(201, novo);
  }

  const mAg = p.match(/^\/api\/agendamentos\/([^/]+)$/);
  if (mAg && req.method === 'PUT') {
    const a = db.agendamentos.find((x) => x.id === mAg[1]);
    if (!a) return responder(404, { erro: 'não encontrado' });
    // core.clj:797 — valor_repasse não vem do cliente
    if (corpo.valor_repasse != null)
      return responder(400, { erro: 'valor_repasse é calculado pelo servidor a partir da regra da psicóloga.' });
    Object.assign(a, corpo);
    return responder(200, a);
  }

  // Rotas que o front consulta e que este contrato de mentira nao precisa
  // simular de verdade — devolver vazio e o suficiente para a tela desenhar.
  if (req.method === 'GET' && (p === '/api/bloqueios' || p.startsWith('/api/google'))) {
    return responder(200, []);
  }

  console.log(`404 ${req.method} ${p}`);
  return responder(404, { erro: `sem rota para ${req.method} ${p}` });
});

server.listen(Number(process.env.PORTA ?? 3998), '127.0.0.1', () => console.log('contrato de mentira na 3998'));

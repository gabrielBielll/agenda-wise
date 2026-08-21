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
  // D-024 — janela de agenda. `tipo` separa os DOIS sinais que dividem esta
  // tabela: `bloqueio` proibe, `disponivel` oferece. Ate 21/08 este simulador
  // devolvia [] aqui, entao NENHUMA janela desenhava — nem a grafite, que ja
  // existia. Quem tirasse foto da agenda concluiria que o bloqueio sumiu.
  bloqueios: [],   // {id,clinica_id,psicologo_id,data_inicio,data_fim,motivo,tipo,recorrencia_id}
  prontuarios: [],
};

const TOKEN_PROV = process.env.PROVISIONING_TOKEN ?? 'token-prov-demo';
const modalidades = new Set(['percentual', 'fixo']);
const camposPortateis = [
  'agenda_wise_id', 'nome', 'email', 'telefone', 'data_nascimento', 'endereco',
  'avatar_url', 'psicologo_email', 'historico_familiar', 'uso_medicamentos',
  'diagnostico', 'contatos_emergencia', 'status', 'nota_fiscal', 'origem',
  'vencimento_pagamento', 'tipo_pagamento',
];

const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const sqlLiteral = (value) => {
  if (value == null) return 'NULL';
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  return `'${String(value).replaceAll("'", "''")}'`;
};

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
      user: { id: u.id, nome: u.nome, email: u.email, clinica_id: u.clinica_id, papel_id: u.papel, role: u.papel } });
  }

  if (!eu) return responder(401, { erro: 'Token ausente ou inválido.' });

  if (p === '/api/me' && req.method === 'GET') {
    return responder(200, { id: eu.id, nome: eu.nome, email: eu.email });
  }
  if (p === '/api/me' && req.method === 'PUT') {
    if (!corpo.nome || !String(corpo.nome).trim())
      return responder(422, { erro: 'Informe o nome que deve aparecer na plataforma.' });
    eu.nome = String(corpo.nome).trim();
    return responder(200, { id: eu.id, nome: eu.nome, email: eu.email });
  }

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
    return responder(200, db.pacientes.filter((x) => x.clinica_id === eu.clinica_id
      && (eu.papel !== 'psicologo' || x.psicologo_id === eu.id)));
  }
  if (p === '/api/pacientes' && req.method === 'POST') {
    if (corpo.email && db.pacientes.some((x) => x.email === corpo.email && x.clinica_id === eu.clinica_id))
      return responder(409, { erro: 'unique_email_clinica' });
    const novo = { id: randomUUID(), ...corpo, clinica_id: eu.clinica_id };
    db.pacientes.push(novo);
    return responder(201, novo);
  }

  if (p === '/api/pacientes/exportar' && req.method === 'GET') {
    const formato = url.searchParams.get('formato');
    if (!['csv', 'json', 'sql'].includes(formato))
      return responder(422, { erro: 'Escolha um formato válido: csv, json ou sql.' });
    const pacientes = db.pacientes
      .filter((x) => x.clinica_id === eu.clinica_id && (eu.papel !== 'psicologo' || x.psicologo_id === eu.id))
      .map((x) => ({
        agenda_wise_id: x.id,
        nome: x.nome,
        email: x.email ?? null,
        telefone: x.telefone ?? null,
        data_nascimento: x.data_nascimento ?? null,
        endereco: x.endereco ?? null,
        avatar_url: x.avatar_url ?? null,
        psicologo_email: db.usuarios.find((u) => u.id === x.psicologo_id)?.email ?? null,
        historico_familiar: x.historico_familiar ?? null,
        uso_medicamentos: x.uso_medicamentos ?? null,
        diagnostico: x.diagnostico ?? null,
        contatos_emergencia: x.contatos_emergencia ?? null,
        status: x.status ?? 'ativo',
        nota_fiscal: Boolean(x.nota_fiscal),
        origem: x.origem ?? null,
        vencimento_pagamento: x.vencimento_pagamento ?? null,
        tipo_pagamento: x.tipo_pagamento ?? 'avulso',
      }));
    const envelope = { schema: 'agenda-wise/pacientes@1', exportado_em: new Date().toISOString(), quantidade: pacientes.length, pacientes };
    const json = JSON.stringify(envelope, null, 2);
    let conteudo;
    if (formato === 'csv') {
      conteudo = `\uFEFF${camposPortateis.join(',')}\r\n${pacientes.map((patient) => camposPortateis.map((field) => csvCell(patient[field])).join(',')).join('\r\n')}\r\n`;
    } else if (formato === 'json') conteudo = json;
    else {
      const marker = Buffer.from(json, 'utf8').toString('base64');
      conteudo = `-- AgendaWise — backup de pacientes\n-- AGENDAWISE_PORTABLE_JSON_BASE64 ${marker}\nBEGIN;\n${pacientes.map((patient) => `-- ${sqlLiteral(patient.agenda_wise_id)} · ${sqlLiteral(patient.nome)}`).join('\n')}\nCOMMIT;\n`;
    }
    const filename = `agenda-wise-pacientes-${new Date().toISOString().slice(0, 10)}.${formato}`;
    const mime = formato === 'csv' ? 'text/csv' : formato === 'json' ? 'application/json' : 'application/sql';
    res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    return res.end(conteudo);
  }

  if (p === '/api/pacientes/importar' && req.method === 'POST') {
    const registros = Array.isArray(corpo.registros) ? corpo.registros : null;
    if (!registros) return responder(422, { erro: 'Envie registros como uma lista JSON.' });
    if (!registros.length) return responder(422, { erro: 'O lote de importação está vazio.' });
    if (registros.length > 100) return responder(413, { erro: 'Envie no máximo 100 pacientes por lote.' });
    const estrategia = corpo.estrategia ?? 'ignorar_existentes';
    const erros = [];
    const planos = [];
    const vistos = new Set();
    for (let index = 0; index < registros.length; index += 1) {
      const registro = registros[index];
      const linha = registro.linha_arquivo ?? index + 2;
      const nome = String(registro.nome ?? '').trim();
      const email = String(registro.email ?? '').trim().toLowerCase() || null;
      if (!nome) erros.push({ linha, campo: 'nome', erro: 'Nome é obrigatório.' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push({ linha, campo: 'email', erro: 'E-mail inválido.' });
      const chave = registro.agenda_wise_id ? `id:${registro.agenda_wise_id}` : email ? `email:${email}` : null;
      if (chave && vistos.has(chave)) erros.push({ linha, campo: 'email', erro: 'Registro repetido no mesmo arquivo.' });
      if (chave) vistos.add(chave);
      const existente = db.pacientes.find((x) => x.clinica_id === eu.clinica_id
        && (x.id === registro.agenda_wise_id || (email && String(x.email ?? '').toLowerCase() === email)));
      if (eu.papel === 'psicologo' && existente && existente.psicologo_id !== eu.id)
        erros.push({ linha, campo: 'email', erro: 'Este paciente já pertence a outro profissional da clínica.' });
      const psi = eu.papel === 'psicologo' ? eu : db.usuarios.find((u) => u.clinica_id === eu.clinica_id && u.email === registro.psicologo_email);
      if (registro.psicologo_email && !psi) erros.push({ linha, campo: 'psicologo_email', erro: 'Psicóloga não encontrada nesta clínica.' });
      const action = existente ? estrategia === 'atualizar_existentes' ? 'atualizar' : 'ignorar' : 'criar';
      planos.push({ action, existente, psi, registro: { ...registro, nome, email } });
    }
    if (erros.length) return responder(422, { erro: 'Há registros que precisam ser corrigidos.', code: 'patient_import_validation_failed', erros });
    const resumo = {
      novos: planos.filter((x) => x.action === 'criar').length,
      atualizaveis: planos.filter((x) => x.action === 'atualizar').length,
      ignorados: planos.filter((x) => x.action === 'ignorar').length,
      processados: planos.length,
    };
    if (!corpo.validar_apenas) {
      for (const plano of planos) {
        if (plano.action === 'ignorar') continue;
        const dados = Object.fromEntries(camposPortateis.filter((field) => field !== 'agenda_wise_id' && field !== 'psicologo_email' && field in plano.registro).map((field) => [field, plano.registro[field]]));
        if (plano.action === 'atualizar') Object.assign(plano.existente, dados, plano.psi ? { psicologo_id: plano.psi.id } : {});
        else db.pacientes.push({ id: randomUUID(), clinica_id: eu.clinica_id, status: 'ativo', ...dados, ...(plano.psi ? { psicologo_id: plano.psi.id } : {}) });
      }
    }
    return responder(200, { valido: true, validar_apenas: Boolean(corpo.validar_apenas), ...resumo });
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
      // Presença agora é confirmação humana; o relógio não promove a sessão.
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
  if (mAg && req.method === 'DELETE') {
    const index = db.agendamentos.findIndex((x) => x.id === mAg[1]);
    if (index < 0) return responder(404, { erro: 'não encontrado' });
    db.agendamentos.splice(index, 1);
    return responder(200, { mensagem: 'Agendamento excluído com sucesso.' });
  }
  if (mAg && req.method === 'PUT') {
    const a = db.agendamentos.find((x) => x.id === mAg[1]);
    if (!a) return responder(404, { erro: 'não encontrado' });
    // core.clj:797 — valor_repasse não vem do cliente
    if (corpo.valor_repasse != null)
      return responder(400, { erro: 'valor_repasse é calculado pelo servidor a partir da regra da psicóloga.' });
    Object.assign(a, corpo);
    return responder(200, a);
  }

  // --- janelas de agenda (D-024) -------------------------------------------
  //
  // 🔴 Ate 21/08 este bloco devolvia [] para /api/bloqueios, e era o suficiente
  // "para a tela desenhar" — mas desenhava a agenda SEM janela nenhuma. Depois
  // da D-024 isso vira armadilha: a janela azul nao apareceria, e quem olhasse a
  // foto concluiria que o azul nao foi implementado. Achado falso sobre o
  // trabalho de outra pessoa, que e o que o README desta pasta manda evitar.
  if (p === '/api/bloqueios' && req.method === 'GET') {
    if (!eu) return responder(401, { erro: 'sem token' });
    // core.clj:1565 — a listagem filtra por clinica, e devolve os DOIS tipos.
    // Quem separa e o front (`normalizarTipoJanela`), nao esta consulta.
    const minhas = db.bloqueios.filter((b) => b.clinica_id === eu.clinica_id
      && (eu.papel === 'psicologo' ? b.psicologo_id === eu.id : true));
    return responder(200, minhas);
  }

  if (p === '/api/bloqueios' && req.method === 'POST') {
    if (!eu) return responder(401, { erro: 'sem token' });
    if (!corpo.data_inicio || !corpo.data_fim)
      return responder(400, { erro: 'data_inicio e data_fim são obrigatórios.' });

    // core.clj:1463 — ausente e `bloqueio`, e e isso que mantem compativel a
    // tela de bloquear horario, que nao manda `tipo`.
    const tipo = (corpo.tipo ?? '').trim() || 'bloqueio';
    // core.clj:1471 — vocabulario fechado no servidor, 422 legivel.
    if (tipo !== 'bloqueio' && tipo !== 'disponivel')
      return responder(422, { erro: `Valor inválido para tipo: '${tipo}'. Aceitos: bloqueio, disponivel.`,
                              code: 'tipo_invalido' });

    // core.clj:1497 — a recusa por sessao existente e do BLOQUEIO, nao da
    // janela oferecida: oferecer 14h-18h com as 15h ocupadas nao e contradicao.
    if (tipo === 'bloqueio') {
      const bate = db.agendamentos.some((a) => a.psicologo_id === (corpo.psicologo_id ?? eu.id)
        && a.status !== 'cancelado'
        && new Date(a.data_hora_sessao) < new Date(corpo.data_fim)
        && new Date(new Date(a.data_hora_sessao).getTime() + (a.duracao ?? 50) * 60000) > new Date(corpo.data_inicio));
      if (bate) return responder(409, { erro: 'há sessões marcadas no período', code: 'session_conflict' });
    }

    const nova = {
      id: randomUUID(),
      clinica_id: eu.clinica_id,
      psicologo_id: corpo.psicologo_id ?? eu.id,
      data_inicio: corpo.data_inicio,
      data_fim: corpo.data_fim,
      motivo: corpo.motivo ?? null,
      dia_inteiro: corpo.dia_inteiro ?? false,
      tipo,
      recorrencia_id: null,
    };
    db.bloqueios.push(nova);
    return responder(201, nova);
  }

  if (req.method === 'GET' && p.startsWith('/api/google')) {
    return responder(200, []);
  }

  console.log(`404 ${req.method} ${p}`);
  return responder(404, { erro: `sem rota para ${req.method} ${p}` });
});

const porta = Number(process.env.PORTA ?? 3998);
server.listen(porta, '127.0.0.1', () => console.log(`contrato de mentira na ${porta}`));

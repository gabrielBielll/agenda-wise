#!/usr/bin/env node
/**
 * Semeia uma clínica de demonstração com dados que dão o que olhar.
 *
 * ## Por que este arquivo existe
 *
 * O `e2e/preparar-dados.ts` semeia o **mínimo** para os testes passarem: uma
 * psicóloga, um paciente, uma sessão. É o certo para teste — dado a mais é
 * ruído que esconde regressão. Mas para **abrir o sistema e conferir**, esse
 * mínimo mostra telas vazias: o calendário tem um retângulo, o financeiro tem
 * uma linha, e o gráfico de humor não tem curva nenhuma porque curva precisa de
 * mais de um ponto.
 *
 * Este script existe para o outro objetivo: **encher o sistema de vida** —
 * várias psicólogas, pacientes distribuídos entre elas, semanas de sessões já
 * realizadas, prontuários com humor variando ao longo do tempo, faltas,
 * cancelamentos, e repasses em estados diferentes.
 *
 * ## As três regras que este script segue
 *
 * 🔴 **1. Só a API pública.** Nada de SQL direto. Semear por SQL seria mais
 * rápido e passaria por cima de toda validação — e aí o dado semeado poderia
 * ser um dado que o sistema **nunca conseguiria criar sozinho**. Se um handler
 * estiver quebrado, este script tem que falhar, não contornar.
 *
 * 🔴 **2. Idempotente.** Rodar duas vezes não duplica. `409` de "já existe" é
 * tratado como sucesso, porque significa que o dado que a demonstração precisa
 * está lá. Isso importa mais do que parece: ninguém quer descobrir, na frente
 * da CEO, que rodar o semeador de novo criou trinta pacientes repetidos.
 *
 * 🔴 **3. Nenhuma senha escrita aqui dentro.** As credenciais vêm de variável
 * de ambiente. Este repositório já foi público com credencial dentro uma vez
 * (`docs/INCIDENTE_2026-08-15.md`), e a regra que saiu de lá é: **a diferença é
 * persistência, não contato.** Usar, pode. Guardar no arquivo, não.
 *
 * ## Como rodar
 *
 * ```sh
 * BASE_URL=https://SEU-FRONT            \
 * PROVISIONING_TOKEN=...                \
 * SENHA_DEMO=...                        \
 *   node scripts/semear-demo.mjs
 * ```
 *
 * ⚠️ **`BASE_URL` deve ser o host do FRONT**, não o do backend. Desde que o
 * backend virou rede privada (19/08), ele não é alcançável de fora — quem
 * atravessa é o proxy do `next.config.ts`. O host do front funciona de dentro e
 * de fora; o do backend, só de dentro.
 *
 * Para semear um backend local em desenvolvimento, `BASE_URL=http://localhost:3999`
 * também funciona: as rotas são as mesmas.
 */

const BASE = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const TOKEN_PROV = process.env.PROVISIONING_TOKEN ?? '';
const SENHA = process.env.SENHA_DEMO ?? '';
const SO_MOSTRAR = process.argv.includes('--simular');

if (!BASE || !TOKEN_PROV || !SENHA) {
  console.error(
    'Faltou configuração. Este script precisa das três:\n' +
      '  BASE_URL             host do front (ex.: https://meu-app.code.run)\n' +
      '  PROVISIONING_TOKEN   o mesmo valor que o backend tem\n' +
      '  SENHA_DEMO           a senha que TODOS os usuários de demonstração terão\n\n' +
      'Nenhuma delas tem valor padrão de propósito: senha com valor padrão vira\n' +
      'senha de produção no dia em que alguém esquecer de trocar.'
  );
  process.exit(1);
}

if (SENHA.length < 8) {
  console.error('SENHA_DEMO precisa de pelo menos 8 caracteres — o backend recusa senhas curtas.');
  process.exit(1);
}

/* ────────────────────────────── o elenco ────────────────────────────── */

const CLINICA = 'Clínica Deep Saúde — Demonstração';

/**
 * ⚠️ Domínio `.demo.local`: não existe, e é de propósito.
 *
 * Se algum dia este sistema disparar e-mail (lembrete de sessão, recuperação de
 * senha), um domínio inexistente **quica** em vez de chegar em alguém de
 * verdade. Endereço de pessoa real em dado de demonstração é como se manda
 * e-mail de teste para cliente sem querer.
 */
const ADMIN = { nome: 'Renata Alencar', email: 'renata.admin@demo.local' };

const PSICOLOGAS = [
  {
    nome: 'Beatriz Nogueira',
    email: 'beatriz.psi@demo.local',
    crp: '06/123456',
    abordagem: 'Terapia Cognitivo-Comportamental',
    area_de_atuacao: 'Ansiedade e transtornos do humor',
    // Repasse percentual: o financeiro precisa de pelo menos uma de cada
    // modalidade, senão metade da tela nunca é exercitada.
    modalidade_repasse: 'percentual',
    percentual_repasse: 60,
  },
  {
    nome: 'Caio Mendonça',
    email: 'caio.psi@demo.local',
    crp: '06/234567',
    abordagem: 'Psicanálise',
    area_de_atuacao: 'Adultos e casais',
    modalidade_repasse: 'percentual',
    percentual_repasse: 55,
  },
  {
    nome: 'Helena Vasques',
    email: 'helena.psi@demo.local',
    crp: '06/345678',
    abordagem: 'Terapia Sistêmica',
    area_de_atuacao: 'Infantil e adolescente',
    // A outra modalidade: valor fixo por sessão.
    modalidade_repasse: 'fixo',
    valor_fixo_repasse: 120,
  },
];

const SECRETARIA = { nome: 'Douglas Prates', email: 'douglas.sec@demo.local' };

/**
 * Pacientes com horário fixo semanal, como é numa clínica de verdade.
 *
 * 📌 `diaDaSemana` (1 = segunda … 5 = sexta) e `hora` juntos formam a "vaga" da
 * pessoa. Duas pessoas da MESMA psicóloga nunca dividem a mesma vaga — o
 * backend recusaria com 409 de conflito, que é a R-006 fazendo o trabalho dela.
 * Pacientes de psicólogas diferentes podem ter o mesmo horário, e devem: é
 * assim que se prova que o conflito é por psicóloga e não por relógio.
 *
 * `humorBase` e `tendencia` desenham a curva do gráfico de humor. Alguém
 * melhorando, alguém estável, alguém oscilando — porque um gráfico em que todo
 * mundo sobe igual não mostra nada.
 */
const PACIENTES = [
  { nome: 'Amanda Ribeiro',   psi: 0, dia: 1, hora: '09:00', valor: 220, humorBase: 2, tendencia:  0.3, tel: '(11) 98123-4501' },
  { nome: 'Bruno Tavares',    psi: 0, dia: 1, hora: '10:00', valor: 220, humorBase: 3, tendencia:  0.1, tel: '(11) 98123-4502' },
  { nome: 'Carla Domingues',  psi: 0, dia: 3, hora: '14:00', valor: 200, humorBase: 4, tendencia:  0.0, tel: '(11) 98123-4503' },
  { nome: 'Daniel Furtado',   psi: 1, dia: 2, hora: '09:00', valor: 250, humorBase: 2, tendencia:  0.2, tel: '(11) 98123-4504' },
  { nome: 'Eduarda Simões',   psi: 1, dia: 2, hora: '11:00', valor: 250, humorBase: 3, tendencia: -0.1, tel: '(11) 98123-4505' },
  { nome: 'Fábio Queiroz',    psi: 1, dia: 4, hora: '16:00', valor: 250, humorBase: 4, tendencia:  0.1, tel: '(11) 98123-4506' },
  { nome: 'Gabriela Antunes', psi: 2, dia: 2, hora: '15:00', valor: 180, humorBase: 3, tendencia:  0.2, tel: '(11) 98123-4507' },
  { nome: 'Henrique Lopes',   psi: 2, dia: 4, hora: '10:00', valor: 180, humorBase: 2, tendencia:  0.4, tel: '(11) 98123-4508' },
  { nome: 'Isabela Moraes',   psi: 2, dia: 5, hora: '08:00', valor: 180, humorBase: 4, tendencia: -0.2, tel: '(11) 98123-4509' },
];

/** Quantas semanas para trás e para a frente. */
const SEMANAS_PASSADAS = 8;
const SEMANAS_FUTURAS = 3;

/* ─────────────────────────── infraestrutura ─────────────────────────── */

let criados = 0;
let jaExistiam = 0;

const passo = (texto) => console.log(`\n▸ ${texto}`);
const ok = (texto) => console.log(`  ✓ ${texto}`);
const nota = (texto) => console.log(`    ${texto}`);

/**
 * Uma chamada HTTP com mensagem de erro que serve para alguma coisa.
 *
 * ⚠️ Quando falha, imprime **o corpo da resposta**. Um "falhou (422)" sozinho
 * manda a pessoa abrir o código do backend para descobrir qual campo estava
 * errado; o corpo já diz. É a mesma regra das âncoras dos testes: a mensagem de
 * falha é onde o diagnóstico mora ou onde ele se perde.
 */
async function api(caminho, { metodo = 'GET', token, corpo, tokenProv } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tokenProv) headers['X-Provisioning-Token'] = tokenProv;

  let res;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    throw new Error(
      `Não consegui falar com ${BASE}${caminho}.\n` +
        `  ${e.message}\n` +
        `  Confira se BASE_URL é o host do FRONT (o backend está em rede privada desde 19/08).`
    );
  }

  const texto = await res.text();
  let corpoResposta = null;
  try {
    corpoResposta = texto ? JSON.parse(texto) : null;
  } catch {
    corpoResposta = texto.slice(0, 300);
  }
  return { status: res.status, ok: res.ok, corpo: corpoResposta };
}

/** Falha alto, com o corpo da resposta junto. */
function exigir(r, oQue) {
  if (!r.ok) {
    throw new Error(`${oQue} falhou (HTTP ${r.status}): ${JSON.stringify(r.corpo)}`);
  }
  return r.corpo;
}

/**
 * Trata `409` como sucesso — mas devolve QUAL dos dois aconteceu.
 *
 * 📌 A contagem no fim (`criados` × `jaExistiam`) não é enfeite: é como se
 * enxerga que a idempotência funcionou. Segunda execução com tudo em
 * `jaExistiam` é a prova; segunda execução criando de novo é um defeito, e um
 * defeito silencioso se ninguém contar.
 */
function contabilizar(r, oQue) {
  if (r.status === 409) {
    jaExistiam++;
    return { novo: false, corpo: r.corpo };
  }
  exigir(r, oQue);
  criados++;
  return { novo: true, corpo: r.corpo };
}

/* ─────────────────────────────── tempo ─────────────────────────────── */

/**
 * Datas no fuso da CLÍNICA, não no da máquina que roda o script.
 *
 * 🔴 Isto não é preciosismo. Quem rodar isto de um servidor em UTC e usar a data
 * local da máquina vai semear sessões que aparecem no dia errado do calendário
 * para quem abre no Brasil — e o sintoma ("as sessões estão um dia atrasadas")
 * não aponta em nada para o semeador. O PR #7 inteiro mexeu em fuso de sessão
 * por causa de uma família de erros assim.
 */
function hojeNaClinica() {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [ano, mes, dia] = s.split('-').map(Number);
  return { ano, mes, dia };
}

/** A segunda-feira da semana corrente, como Date em UTC-puro (só para contar dias). */
function segundaDaSemanaCorrente() {
  const { ano, mes, dia } = hojeNaClinica();
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const diaDaSemana = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // domingo = 7
  d.setUTCDate(d.getUTCDate() - (diaDaSemana - 1));
  return d;
}

/** `YYYY-MM-DD` de N semanas de deslocamento, no dia da semana pedido. */
function dataDaVaga(deslocamentoSemanas, diaDaSemana) {
  const d = segundaDaSemanaCorrente();
  d.setUTCDate(d.getUTCDate() + deslocamentoSemanas * 7 + (diaDaSemana - 1));
  return d.toISOString().slice(0, 10);
}

/** Já passou? Compara data de parede com data de parede — sem instante, sem fuso. */
function jaPassou(dataISO) {
  const { ano, mes, dia } = hojeNaClinica();
  const hoje = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return dataISO < hoje;
}

/**
 * `YYYY-MM-DDTHH:MM` de parede em São Paulo, a partir do instante que a API devolve.
 *
 * ⚠️ Comparar o texto do `data_hora_sessao` cru daria certo por coincidência às
 * 14:00 e erraria perto da meia-noite — a API responde instante com fuso, não a
 * hora que a tela mostra. Mesmo cuidado que o `e2e/preparar-dados.ts` toma.
 */
function paredeEmSaoPaulo(iso) {
  /**
   * 🔴 Se a string **não** tiver fuso, ela já É horário de parede — e converter
   * desloca 3 horas.
   *
   * `data_hora_sessao` é `TIMESTAMPTZ` desde a migration `20260811100100`, então
   * hoje a API sempre manda offset. Mas uma base que não passou por essa
   * migration devolveria a forma ingênua, a conversão erraria por 3 h, a chave
   * nunca casaria — e o semeador recriaria **todas** as sessões a cada execução.
   * Caro, silencioso, e a três horas de distância da causa.
   */
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(String(iso))) return String(iso).slice(0, 16);

  const p = {};
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  for (const parte of fmt.formatToParts(new Date(iso))) p[parte.type] = parte.value;
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}

/* ─────────────────────────── conteúdo clínico ─────────────────────────── */

/**
 * Evolução de sessão em texto plausível — e deliberadamente genérico.
 *
 * ⚠️ Nenhuma destas frases descreve pessoa real, e nenhuma inventa diagnóstico.
 * Prontuário é o dado mais sensível que este sistema guarda; dado de
 * demonstração aqui tem que ser claramente ficcional, não um caso clínico
 * verossímil que alguém possa confundir com registro de verdade.
 */
const ABERTURAS = [
  'Sessão de acompanhamento. Paciente compareceu no horário.',
  'Retorno semanal. Relata a semana como mais tranquila que a anterior.',
  'Sessão de seguimento. Trouxe material do exercício combinado.',
  'Atendimento regular. Chegou trazendo assunto de trabalho.',
  'Sessão de continuidade. Revisitamos combinados anteriores.',
];

const DESENVOLVIMENTOS = [
  'Trabalhamos estratégias de organização da rotina e sono.',
  'Exploramos o padrão de autocobrança em contexto profissional.',
  'Retomamos o registro de pensamentos automáticos da semana.',
  'Discussão sobre limites nas relações familiares.',
  'Foco em técnicas de respiração e ancoragem para momentos de pico.',
];

const FECHAMENTOS = [
  'Combinado exercício para a próxima semana.',
  'Mantido o plano terapêutico atual.',
  'Sem intercorrências. Segue o acompanhamento semanal.',
  'Paciente demonstra adesão ao combinado.',
  'Reavaliar objetivos no próximo mês.',
];

const escolher = (lista, semente) => lista[Math.abs(semente) % lista.length];

/**
 * O humor de uma sessão, entre 1 e 5.
 *
 * 📌 A oscilação é de propósito: uma reta perfeita não parece dado clínico, e
 * mais importante — não exercita o gráfico. Um `MoodChart` só mostra que sabe
 * desenhar quando a linha sobe, desce e volta.
 */
function humorDaSessao(base, tendencia, indice) {
  const oscilacao = [0, 1, -1, 0, 1, 0, -1, 1][indice % 8];
  const valor = Math.round(base + tendencia * indice + oscilacao * 0.6);
  return Math.min(5, Math.max(1, valor));
}

/* ────────────────────────────── o roteiro ────────────────────────────── */

async function main() {
  console.log(`Semeando a demonstração em ${BASE}`);
  if (SO_MOSTRAR) {
    console.log('\n(--simular: nada será escrito, só o plano)\n');
  }

  /* 1. A clínica e o admin ------------------------------------------------ */
  passo('Clínica e administradora');
  if (!SO_MOSTRAR) {
    const r = await api('/api/admin/provisionar-clinica', {
      metodo: 'POST',
      tokenProv: TOKEN_PROV,
      corpo: {
        nome_clinica: CLINICA,
        limite_psicologos: 10,
        nome_admin: ADMIN.nome,
        email_admin: ADMIN.email,
        senha_admin: SENHA,
      },
    });
    contabilizar(r, 'Provisionamento da clínica');
  }
  ok(`${CLINICA} — admin ${ADMIN.email}`);

  if (SO_MOSTRAR) {
    planoResumido();
    return;
  }

  /* 2. Entrar como admin -------------------------------------------------- */
  const login = await api('/api/auth/login', {
    metodo: 'POST',
    corpo: { email: ADMIN.email, senha: SENHA },
  });
  if (!login.ok) {
    throw new Error(
      `Login da administradora falhou (HTTP ${login.status}).\n` +
        `  Se a clínica já existia de uma execução anterior, a senha dela é a\n` +
        `  daquela execução — SENHA_DEMO precisa ser a mesma.`
    );
  }
  const tokenAdmin = login.corpo.token;

  /* 3. Psicólogas e secretário -------------------------------------------- */
  passo('Equipe');
  for (const psi of PSICOLOGAS) {
    const r = await api('/api/usuarios', {
      metodo: 'POST',
      token: tokenAdmin,
      corpo: { ...psi, senha: SENHA, papel: 'psicologo' },
    });
    const { novo } = contabilizar(r, `Criação de ${psi.nome}`);
    const regra =
      psi.modalidade_repasse === 'percentual'
        ? `${psi.percentual_repasse}% de repasse`
        : `R$ ${psi.valor_fixo_repasse} fixos por sessão`;
    ok(`${psi.nome} — ${regra}${novo ? '' : ' (já existia)'}`);
  }

  {
    const r = await api('/api/usuarios', {
      metodo: 'POST',
      token: tokenAdmin,
      corpo: { ...SECRETARIA, senha: SENHA, papel: 'secretario' },
    });
    const { novo } = contabilizar(r, 'Criação do secretário');
    ok(`${SECRETARIA.nome} — secretário${novo ? '' : ' (já existia)'}`);
  }

  /* 4. Descobrir os ids das psicólogas ------------------------------------ */
  const listaPsis = exigir(
    await api('/api/psicologos', { token: tokenAdmin }),
    'Listagem de psicólogas'
  );
  const idPorEmail = new Map(listaPsis.map((p) => [p.email, p.id]));

  /**
   * 🔴 Sem `??` de fallback aqui, e isso é uma escolha.
   *
   * A `vale` encontrou em 19/08 um `?? lista[0]` no semeador dos testes: se o
   * e-mail não casasse, ele escolhia *qualquer* psicóloga, em silêncio. O dado
   * semeado ficava plausível e errado, e o teste passava medindo outra coisa.
   * Aqui, se faltar, o script morre dizendo qual faltou.
   */
  for (const psi of PSICOLOGAS) {
    if (!idPorEmail.has(psi.email)) {
      throw new Error(
        `A psicóloga ${psi.email} não apareceu em /api/psicologos depois de criada.\n` +
          `  Não vou escolher outra no lugar dela: dado plausível e errado é pior que erro.`
      );
    }
  }

  /* 5. Pacientes ----------------------------------------------------------- */
  passo('Pacientes');
  const jaCadastrados = exigir(
    await api('/api/pacientes', { token: tokenAdmin }),
    'Listagem de pacientes'
  );
  const idPorNome = new Map(jaCadastrados.map((p) => [p.nome, p.id]));

  for (const pac of PACIENTES) {
    const psi = PSICOLOGAS[pac.psi];
    if (idPorNome.has(pac.nome)) {
      jaExistiam++;
      ok(`${pac.nome} (já existia)`);
      continue;
    }
    const criado = exigir(
      await api('/api/pacientes', {
        metodo: 'POST',
        token: tokenAdmin,
        corpo: {
          nome: pac.nome,
          email: `${pac.nome.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.local`,
          telefone: pac.tel,
          psicologo_id: idPorEmail.get(psi.email),
          status: 'ativo',
        },
      }),
      `Criação do paciente ${pac.nome}`
    );
    criados++;
    idPorNome.set(pac.nome, criado.id);
    ok(`${pac.nome} → ${psi.nome}`);
  }

  /* 6. Sessões ------------------------------------------------------------- */
  passo(`Sessões — ${SEMANAS_PASSADAS} semanas para trás, ${SEMANAS_FUTURAS} para a frente`);

  /**
   * ⚠️ **Faltas e cancelamentos entram de propósito.**
   *
   * Uma agenda em que 100% das sessões aconteceram não é uma agenda: é uma
   * planilha. E o financeiro tem regra específica para cancelada — o backend
   * zera `valor_consulta` — que só aparece se existir uma. Semear só o caminho
   * feliz esconde metade das telas.
   */
  const EXCECOES = new Map([
    ['Bruno Tavares:-6', 'falta'],
    ['Eduarda Simões:-4', 'cancelado'],
    ['Henrique Lopes:-3', 'falta'],
    ['Carla Domingues:-2', 'cancelado'],
  ]);

  /**
   * 🔴 **A idempotência das sessões NÃO pode depender do 409, e isso foi medido.**
   *
   * A primeira versão deste bloco confiava no conflito de horário: se a sessão
   * já existisse, o backend devolveria 409 e o script seguiria. Rodei duas vezes
   * contra um servidor que imita o contrato, e a segunda execução criou **duas
   * sessões novas** — exatamente as duas canceladas.
   *
   * A causa está no `core.clj:663`: a checagem de conflito tem
   * `AND status != 'cancelado'`. **Sessão cancelada não conflita com nada** — e
   * deve ser assim mesmo, senão cancelar um horário o deixaria bloqueado para
   * sempre. Mas isso significa que ela nunca produz 409, e o semeador a
   * recriaria a cada execução, empilhando canceladas invisíveis.
   *
   * 📌 O 409 responde *"esse horário está ocupado?"*. Eu estava usando a
   * resposta dele para perguntar *"eu já semeei isso?"* — que é outra pergunta.
   * A lista abaixo responde a minha.
   */
  const agendaAtual = exigir(
    await api('/api/agendamentos', { token: tokenAdmin }),
    'Listagem de agendamentos existentes'
  );
  const vagasOcupadas = new Set(
    agendaAtual.map((a) => `${a.paciente_id}:${paredeEmSaoPaulo(a.data_hora_sessao)}`)
  );

  let totalSessoes = 0;
  const sessoesPorPaciente = new Map();

  for (const pac of PACIENTES) {
    const psi = PSICOLOGAS[pac.psi];
    const pacienteId = idPorNome.get(pac.nome);
    const minhas = [];

    for (let semana = -SEMANAS_PASSADAS; semana <= SEMANAS_FUTURAS; semana++) {
      const data = dataDaVaga(semana, pac.dia);
      const quando = `${data}T${pac.hora}:00`;
      const excecao = EXCECOES.get(`${pac.nome}:${semana}`);

      if (vagasOcupadas.has(`${pacienteId}:${data}T${pac.hora}`)) {
        jaExistiam++;
        if (jaPassou(data) && !excecao) minhas.push({ data, semana });
        continue;
      }

      const r = await api('/api/agendamentos', {
        metodo: 'POST',
        token: tokenAdmin,
        corpo: {
          paciente_id: pacienteId,
          psicologo_id: idPorEmail.get(psi.email),
          data_hora_sessao: quando,
          valor_consulta: pac.valor,
          duracao: 50,
          ...(excecao ? { status: excecao } : {}),
        },
      });

      // 409 aqui é conflito de horário — a sessão daquela vaga já existe.
      if (r.status === 409) {
        jaExistiam++;
      } else {
        exigir(r, `Sessão de ${pac.nome} em ${data}`);
        criados++;
        totalSessoes++;
      }
      if (jaPassou(data) && !excecao) minhas.push({ data, semana });
    }
    sessoesPorPaciente.set(pac.nome, minhas);
  }
  ok(`${totalSessoes} sessões novas (as repetidas já estavam lá)`);

  /**
   * 🔴 **De qual sessão é cada evolução — e sem isto o gráfico de humor mente.**
   *
   * `prontuarios.data_registro` é `DEFAULT CURRENT_TIMESTAMP`: é a hora em que o
   * registro foi **escrito**, não a da sessão. Semeando tudo de uma vez, os 70
   * prontuários nascem com o mesmo carimbo, e a "Evolução do Humor" desenha a
   * curva inteira empilhada num único dia. A curva aparece — e a linha do tempo
   * é falsa.
   *
   * 📌 O produto já resolve isso, e eu só precisei usar: o prontuário aceita
   * `agendamento_id`, a listagem faz `LEFT JOIN agendamentos` e devolve
   * `data_sessao` (`prontuarios.clj:117`), e a tela **prefere** essa data —
   * `ProntuarioList.tsx:50`: `p.data_sessao ? ... : p.data_registro`.
   *
   * Vinculando, a evolução passa a valer pela data da sessão que ela descreve,
   * que é o que uma psicóloga espera ler.
   */
  const agendaDepois = exigir(
    await api('/api/agendamentos', { token: tokenAdmin }),
    'Releitura da agenda para vincular prontuários'
  );
  const idDaSessao = new Map(
    agendaDepois.map((a) => [`${a.paciente_id}:${paredeEmSaoPaulo(a.data_hora_sessao)}`, a.id])
  );

  /* 7. Prontuários — logando como cada psicóloga --------------------------- */
  passo('Prontuários e humor');

  /**
   * 🔴 **Aqui o script troca de identidade, e é obrigatório.**
   *
   * O backend grava `psicologo_id = usuário logado` (`prontuarios.clj:50`) e
   * recusa 403 se uma psicóloga escrever para paciente de outra. Se este bloco
   * rodasse com o token da administradora, TODOS os prontuários nasceriam
   * assinados por ela — dado plausível, tela funcionando, e a autoria toda
   * errada. Logar como cada uma é o que faz o dado ser verdadeiro.
   */
  let totalProntuarios = 0;
  for (const psi of PSICOLOGAS) {
    const entrada = await api('/api/auth/login', {
      metodo: 'POST',
      corpo: { email: psi.email, senha: SENHA },
    });
    if (!entrada.ok) {
      throw new Error(`Login de ${psi.nome} falhou (HTTP ${entrada.status}).`);
    }
    const tokenPsi = entrada.corpo.token;

    const meusPacientes = PACIENTES.filter((p) => PSICOLOGAS[p.psi].email === psi.email);
    for (const pac of meusPacientes) {
      const pacienteId = idPorNome.get(pac.nome);

      // Quantos prontuários esta pessoa já tem? Repetir a cada execução
      // encheria o gráfico de pontos duplicados no mesmo dia.
      const existentes = exigir(
        await api(`/api/pacientes/${pacienteId}/prontuarios`, { token: tokenPsi }),
        `Prontuários de ${pac.nome}`
      );
      if (existentes.length > 0) {
        jaExistiam++;
        nota(`${pac.nome}: ${existentes.length} evoluções já registradas`);
        continue;
      }

      const sessoes = sessoesPorPaciente.get(pac.nome) ?? [];
      for (let i = 0; i < sessoes.length; i++) {
        const semente = pac.nome.length + i;
        const agendamentoId = idDaSessao.get(`${pacienteId}:${sessoes[i].data}T${pac.hora}`);
        const corpo = {
          paciente_id: pacienteId,
          agendamento_id: agendamentoId,
          tipo: 'sessao',
          humor: humorDaSessao(pac.humorBase, pac.tendencia, i),
          conteudo:
            `${escolher(ABERTURAS, semente)} ` +
            `${escolher(DESENVOLVIMENTOS, semente + 1)} ` +
            `${escolher(FECHAMENTOS, semente + 2)}`,
          queixa_principal: i === 0 ? 'Queixa inicial registrada na primeira sessão.' : undefined,
          resumo_tecnico: 'Evolução dentro do esperado para o plano terapêutico vigente.',
          encaminhamentos_tarefas: i % 3 === 0 ? 'Exercício de registro diário até a próxima sessão.' : undefined,
        };
        exigir(
          await api(`/api/pacientes/${pacienteId}/prontuarios`, {
            metodo: 'POST',
            token: tokenPsi,
            corpo,
          }),
          `Prontuário de ${pac.nome}`
        );
        criados++;
        totalProntuarios++;
      }
      nota(`${pac.nome}: ${sessoes.length} evoluções`);
      /**
       * ⚠️ Vínculo que falha em silêncio volta a empilhar tudo num dia só, e o
       * gráfico continua parecendo certo. Se sobrar evolução sem sessão, isto
       * grita — em vez de deixar a descoberta para quem for olhar a curva.
       */
      const semVinculo = sessoes.filter(
        (s) => !idDaSessao.get(`${pacienteId}:${s.data}T${pac.hora}`)
      ).length;
      if (semVinculo > 0) {
        throw new Error(
          `${semVinculo} evoluções de ${pac.nome} ficariam sem sessão vinculada.\n` +
            `  A data delas cairia no dia da semeadura e a linha do tempo do humor seria falsa.`
        );
      }
    }
  }
  ok(`${totalProntuarios} prontuários novos`);

  /* 8. Fechar o financeiro ------------------------------------------------- */
  passo('Financeiro');

  /**
   * 📌 **O script NÃO marca sessão como realizada nem como paga.** O backend faz
   * isso sozinho: `sincronizar-status` vira `agendado → realizado` para o que já
   * passou, marca `status_pagamento = pago` no que não foi cancelado, e calcula
   * `valor_repasse` a partir da regra de cada psicóloga.
   *
   * ⚠️ E `valor_repasse` **não é aceito** vindo do cliente — o handler devolve
   * erro explícito dizendo que é calculado pelo servidor. Tentar semear esse
   * número seria inventar dinheiro, e é justamente o que a R-004 proíbe.
   */
  exigir(
    await api('/api/agendamentos/sincronizar', { metodo: 'POST', token: tokenAdmin }),
    'Sincronização de status'
  );
  ok('sessões passadas viraram realizadas e pagas, com repasse calculado pelo servidor');

  /**
   * Um repasse já transferido, para que a tela tenha os DOIS estados.
   *
   * Sem isto a coluna de repasses fica inteira em "pendente", e ninguém vê como
   * é a linha de um repasse fechado.
   */
  const agenda = exigir(
    await api('/api/agendamentos', { token: tokenAdmin }),
    'Listagem de agendamentos'
  );
  const pagasAntigas = agenda
    .filter((a) => a.status === 'realizado' && a.status_pagamento === 'pago')
    .sort((a, b) => String(a.data_hora_sessao).localeCompare(String(b.data_hora_sessao)))
    .slice(0, 12);

  let transferidos = 0;
  for (const a of pagasAntigas) {
    const r = await api(`/api/agendamentos/${a.id}`, {
      metodo: 'PUT',
      token: tokenAdmin,
      corpo: { status_repasse: 'transferido' },
    });
    if (r.ok) transferidos++;
  }
  ok(`${transferidos} repasses marcados como transferidos (os mais antigos)`);

  /* 9. Prestação de contas ------------------------------------------------- */
  const contagem = {
    psicologas: PSICOLOGAS.length,
    pacientes: PACIENTES.length,
    sessoes: agenda.length,
    realizadas: agenda.filter((a) => a.status === 'realizado').length,
    canceladas: agenda.filter((a) => a.status === 'cancelado').length,
    faltas: agenda.filter((a) => a.status === 'falta').length,
    futuras: agenda.filter((a) => a.status === 'agendado').length,
  };

  console.log('\n─────────────────────────────────────────────');
  console.log('Pronto. O que existe agora nesta clínica:\n');
  for (const [chave, valor] of Object.entries(contagem)) {
    console.log(`  ${String(valor).padStart(4)}  ${chave}`);
  }
  console.log(`\n  criados nesta execução: ${criados}`);
  console.log(`  já existiam:            ${jaExistiam}`);
  console.log('\nEntre com qualquer um destes e-mails e a SENHA_DEMO:');
  console.log(`  administradora  ${ADMIN.email}`);
  for (const p of PSICOLOGAS) console.log(`  psicóloga       ${p.email}`);
  console.log(`  secretário      ${SECRETARIA.email}`);
  console.log('─────────────────────────────────────────────\n');
}

function planoResumido() {
  console.log(`  ${PSICOLOGAS.length} psicólogas, ${PACIENTES.length} pacientes`);
  console.log(`  ${SEMANAS_PASSADAS + SEMANAS_FUTURAS + 1} semanas de agenda por paciente`);
  console.log(`  ≈ ${PACIENTES.length * (SEMANAS_PASSADAS + SEMANAS_FUTURAS + 1)} sessões`);
  console.log(`  ≈ ${PACIENTES.length * SEMANAS_PASSADAS} prontuários com humor\n`);
}

main().catch((e) => {
  console.error(`\n🔴 ${e.message}\n`);
  process.exit(1);
});

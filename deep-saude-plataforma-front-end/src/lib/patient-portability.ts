export type PatientFileFormat = 'csv' | 'json' | 'sql';
export type PatientImportStrategy = 'ignorar_existentes' | 'atualizar_existentes';

export type PortablePatient = {
  linha_arquivo: number;
  agenda_wise_id?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  data_nascimento?: string;
  endereco?: string;
  avatar_url?: string;
  psicologo_email?: string;
  historico_familiar?: string;
  uso_medicamentos?: string;
  diagnostico?: string;
  contatos_emergencia?: string;
  status?: string;
  nota_fiscal?: boolean | string;
  origem?: string;
  vencimento_pagamento?: string;
  tipo_pagamento?: string;
};

export type PatientFileIssue = { line: number; field: string; message: string };

const aliases: Record<string, keyof PortablePatient> = {
  id: 'agenda_wise_id',
  agenda_wise_id: 'agenda_wise_id',
  agendawise_id: 'agenda_wise_id',
  nome: 'nome',
  nome_completo: 'nome',
  name: 'nome',
  email: 'email',
  e_mail: 'email',
  telefone: 'telefone',
  celular: 'telefone',
  phone: 'telefone',
  data_nascimento: 'data_nascimento',
  nascimento: 'data_nascimento',
  birth_date: 'data_nascimento',
  endereco: 'endereco',
  address: 'endereco',
  avatar_url: 'avatar_url',
  foto: 'avatar_url',
  psicologo_email: 'psicologo_email',
  psicologa_email: 'psicologo_email',
  email_psicologo: 'psicologo_email',
  email_psicologa: 'psicologo_email',
  historico_familiar: 'historico_familiar',
  uso_medicamentos: 'uso_medicamentos',
  medicamentos: 'uso_medicamentos',
  diagnostico: 'diagnostico',
  contatos_emergencia: 'contatos_emergencia',
  contato_emergencia: 'contatos_emergencia',
  status: 'status',
  nota_fiscal: 'nota_fiscal',
  origem: 'origem',
  vencimento_pagamento: 'vencimento_pagamento',
  tipo_pagamento: 'tipo_pagamento',
};

const textLimits: Partial<Record<keyof PortablePatient, number>> = {
  nome: 255,
  email: 255,
  telefone: 50,
  data_nascimento: 10,
  endereco: 10_000,
  avatar_url: 4_000,
  psicologo_email: 255,
  historico_familiar: 20_000,
  uso_medicamentos: 20_000,
  diagnostico: 20_000,
  contatos_emergencia: 10_000,
  status: 10,
  origem: 50,
  vencimento_pagamento: 100,
  tipo_pagamento: 20,
};

function headerKey(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function stripSpreadsheetProtection(value: string) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function detectCsvDelimiter(content: string) {
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === '\n' || character === '\r')) break;
    else if (!quoted && counts.has(character)) counts.set(character, (counts.get(character) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ',';
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const delimiter = detectCsvDelimiter(content);

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }

  if (quoted) throw new Error('O CSV terminou dentro de um campo entre aspas.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizeObject(input: Record<string, unknown>, line: number): PortablePatient {
  const patient: PortablePatient = { linha_arquivo: line };
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = aliases[headerKey(rawKey)];
    if (!key || key === 'linha_arquivo' || rawValue === undefined || rawValue === null) continue;
    (patient as Record<string, unknown>)[key] = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  }
  return patient;
}

function parseCsv(content: string) {
  const rows = parseCsvRows(content);
  if (rows.length < 2) throw new Error('O CSV precisa ter cabeçalho e pelo menos um paciente.');
  const headers = rows[0].map(value => aliases[headerKey(value)]);
  if (!headers.includes('nome')) throw new Error('O CSV precisa ter uma coluna “nome”.');

  return rows.slice(1).map((values, rowIndex) => {
    const patient: PortablePatient = { linha_arquivo: rowIndex + 2 };
    headers.forEach((key, columnIndex) => {
      if (!key || key === 'linha_arquivo') return;
      (patient as Record<string, unknown>)[key] = stripSpreadsheetProtection((values[columnIndex] ?? '').trim());
    });
    return patient;
  });
}

function decodeBase64Utf8(encoded: string) {
  const binary = globalThis.atob(encoded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function patientsFromJsonValue(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const envelope = value as Record<string, unknown>;
    if (Array.isArray(envelope.pacientes)) return envelope.pacientes;
    if (Array.isArray(envelope.patients)) return envelope.patients;
  }
  throw new Error('O JSON precisa ser uma lista ou conter a propriedade “pacientes”.');
}

function parseJson(content: string) {
  const values = patientsFromJsonValue(JSON.parse(content));
  return values.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`O registro ${index + 1} do JSON não é um objeto.`);
    }
    return normalizeObject(value as Record<string, unknown>, index + 2);
  });
}

function parseSql(content: string) {
  const match = content.match(/^-- AGENDAWISE_PORTABLE_JSON_BASE64 ([A-Za-z0-9+/=]+)$/m);
  if (!match) {
    throw new Error('Por segurança, o upload não executa SQL. Use somente um arquivo SQL exportado pela própria Agenda Wise.');
  }
  return parseJson(decodeBase64Utf8(match[1]));
}

export function formatFromPatientFile(file: Pick<File, 'name'>): PatientFileFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv' || extension === 'json' || extension === 'sql') return extension;
  throw new Error('Formato não reconhecido. Escolha um arquivo .csv, .json ou .sql.');
}

export function parsePatientFile(content: string, format: PatientFileFormat) {
  const patients = format === 'csv' ? parseCsv(content) : format === 'json' ? parseJson(content) : parseSql(content);
  if (patients.length === 0) throw new Error('O arquivo não contém pacientes.');
  if (patients.length > 5_000) throw new Error('Uma importação pode conter no máximo 5.000 pacientes. Divida a base em mais de um arquivo.');
  return patients;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'não', 'nao', 'no', ''].includes(normalized)) return false;
  return null;
}

export function validatePortablePatients(patients: PortablePatient[]) {
  const issues: PatientFileIssue[] = [];
  const seen = new Map<string, number>();

  for (const patient of patients) {
    const line = patient.linha_arquivo;
    const name = String(patient.nome ?? '').trim();
    if (!name) issues.push({ line, field: 'nome', message: 'Nome é obrigatório.' });

    for (const [field, limit] of Object.entries(textLimits)) {
      const value = patient[field as keyof PortablePatient];
      if (value !== undefined && String(value).length > limit) {
        issues.push({ line, field, message: `Use no máximo ${limit} caracteres.` });
      }
    }

    const email = String(patient.email ?? '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ line, field: 'email', message: 'E-mail inválido.' });
    }
    const psychologistEmail = String(patient.psicologo_email ?? '').trim().toLowerCase();
    if (psychologistEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(psychologistEmail)) {
      issues.push({ line, field: 'psicologo_email', message: 'E-mail da psicóloga inválido.' });
    }

    if (patient.data_nascimento && !validIsoDate(String(patient.data_nascimento))) {
      issues.push({ line, field: 'data_nascimento', message: 'Use uma data válida no formato AAAA-MM-DD.' });
    }
    if (patient.status && !['ativo', 'inativo'].includes(String(patient.status).toLowerCase())) {
      issues.push({ line, field: 'status', message: 'Status deve ser ativo ou inativo.' });
    }
    if (patient.nota_fiscal !== undefined) {
      const normalized = normalizeBoolean(patient.nota_fiscal);
      if (normalized === null) issues.push({ line, field: 'nota_fiscal', message: 'Use sim/não ou true/false.' });
      else patient.nota_fiscal = normalized;
    }

    patient.nome = name;
    if (email) patient.email = email;
    else delete patient.email;
    if (psychologistEmail) patient.psicologo_email = psychologistEmail;
    else delete patient.psicologo_email;
    if (patient.status) patient.status = String(patient.status).toLowerCase();

    const stableKeys = [
      patient.agenda_wise_id ? `id:${patient.agenda_wise_id}` : null,
      email ? `email:${email}` : null,
    ].filter((key): key is string => Boolean(key));
    for (const stableKey of stableKeys) {
      const previousLine = seen.get(stableKey);
      if (previousLine) issues.push({ line, field: stableKey.startsWith('id:') ? 'agenda_wise_id' : 'email', message: `Registro repetido; já aparece na linha ${previousLine}.` });
      else seen.set(stableKey, line);
    }
  }
  return issues;
}

const textEncoder = new TextEncoder();

export function splitPatientImportBatches(patients: PortablePatient[], maxPayloadBytes = 180_000) {
  const batches: PortablePatient[][] = [];
  let batch: PortablePatient[] = [];

  for (const patient of patients) {
    const candidate = [...batch, patient];
    const bytes = textEncoder.encode(JSON.stringify({ registros: candidate })).byteLength;
    if (candidate.length > 100 || bytes > maxPayloadBytes) {
      if (batch.length === 0) throw new Error(`O registro da linha ${patient.linha_arquivo} é grande demais para importar.`);
      batches.push(batch);
      batch = [patient];
      if (textEncoder.encode(JSON.stringify({ registros: batch })).byteLength > maxPayloadBytes) {
        throw new Error(`O registro da linha ${patient.linha_arquivo} é grande demais para importar.`);
      }
    } else batch = candidate;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

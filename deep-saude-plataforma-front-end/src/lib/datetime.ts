/**
 * Contrato de data/hora entre frontend e backend.
 *
 * Há exatamente duas representações no sistema, e confundir as duas é a origem
 * dos bugs de "aparece 3 horas errado":
 *
 *  1. INSTANTE — o que a API devolve. ISO-8601 com fuso ("2026-08-17T17:00:00Z"
 *     ou "...-03:00"). Identifica um momento único no tempo. `new Date()` sabe
 *     ler isso corretamente.
 *
 *  2. HORÁRIO DE PAREDE — o que o usuário digita e o que a API espera receber
 *     ("2026-08-17 14:00:00"). Não tem fuso; o backend o interpreta no fuso da
 *     clínica.
 *
 * Antes deste módulo, três views parseavam o mesmo campo de três jeitos
 * diferentes — inclusive removendo o sufixo de fuso na mão para forçar leitura
 * local. Enquanto a coluna do banco era TIMESTAMP sem fuso isso remendava o
 * sintoma; agora que a API devolve instante de verdade, remover o fuso é
 * exatamente o que quebra.
 *
 * Regra: nada de `new Date(x.replace('Z',''))` fora daqui.
 *
 * ---
 *
 * ## A parede é a da CLÍNICA, não a do navegador (2026-08-15)
 *
 * Até esta data o módulo traduzia instante → parede usando
 * `getTimezoneOffset()`, ou seja, o fuso de quem está olhando. Isso deixava
 * leitura e escrita em desacordo entre si: o formulário exibia a hora convertida
 * para o fuso do navegador, e ao salvar mandava o literal do input, que o
 * backend lê como São Paulo. Abrir a tela de edição em Lisboa e clicar Salvar
 * sem tocar na data deslocava a sessão em 4h; em Tóquio, 12h e mudava de dia.
 *
 * Medido em 2026-08-15 e detalhado na mensageria 0031.
 *
 * O modelo agora é: **uma sessão marcada para as 14:00 é às 14:00 da clínica, e
 * é isso que todo mundo vê, em qualquer fuso.** Decidido pelo Gabriel em
 * 2026-08-15. A contrapartida aceita: o psicólogo em viagem vê o horário da
 * clínica, não o do relógio dele.
 *
 * Quando o navegador já está em `America/Sao_Paulo` — que é o caso de todos os
 * usuários hoje e da configuração do Playwright — **nada muda**. É por isso que
 * a suíte de calendário continua verde: a única asserção que muda de valor é a
 * do navegador em Tóquio, e ela mudou de propósito.
 */

/**
 * ⚠️ DÍVIDA CONHECIDA: constante, e deveria ser dado da clínica.
 *
 * O escopo virou produto multi-clínica (mensageria 0030), então clínicas em
 * fusos diferentes deixam de ser hipótese.
 *
 * ⚠️ Eu escrevi aqui que "não há coluna de fuso em `clinicas`". **Está errado**,
 * e a `orla` corrigiu na 0037: a coluna existe desde a migration
 * `20260811100100-fuso-horario`, é `NOT NULL DEFAULT 'America/Sao_Paulo'` — logo
 * toda clínica já tem fuso preenchido — e o backend **já resolve por clínica**,
 * em `fuso-da-clinica`, em todo caminho de escrita de agendamento.
 *
 * Ou seja, a assimetria é o contrário do que este comentário dizia: o backend é
 * multi-fuso e é o FRONT que ficou mono-fuso, por esta constante. Não quebra
 * hoje porque toda clínica tem o mesmo valor; quebra na primeira clínica
 * vendida em outro fuso, que é o plano declarado.
 *
 * O caminho mais curto é o backend devolver o fuso da clínica no login, junto
 * do `clinica_id`, para não custar mais uma chamada. Está registrado como
 * pendência nomeada no INDEX e merece desenho, não remendo.
 *
 * Está exportado de propósito: é o único lugar a mudar, e é greppável.
 */
export const FUSO_CLINICA = "America/Sao_Paulo";

type Componentes = {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  min: number;
  seg: number;
};

const FORMATADOR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_CLINICA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Componentes do horário de parede da clínica para um instante. */
function componentesNaClinica(d: Date): Componentes {
  const p: Record<string, string> = {};
  for (const parte of FORMATADOR.formatToParts(d)) p[parte.type] = parte.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // `hour12: false` devolve "24" para a meia-noite em alguns motores.
    hora: Number(p.hour) % 24,
    min: Number(p.minute),
    seg: Number(p.second),
  };
}

/** Deslocamento do fuso da clínica, em ms, no instante dado (cobre horário de verão). */
function deslocamentoDaClinica(d: Date): number {
  const c = componentesNaClinica(d);
  const comoSeFosseUtc = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.min, c.seg);
  // O formatador não tem milissegundos; trunca dos dois lados para não somar ruído.
  return comoSeFosseUtc - Math.floor(d.getTime() / 1000) * 1000;
}

const zero = (n: number) => String(n).padStart(2, "0");

/** Instante vindo da API -> Date. */
export function parseInstante(iso: string | Date): Date {
  return iso instanceof Date ? iso : new Date(iso);
}

/**
 * Instante -> `Date` cujos getters LOCAIS devolvem o horário de parede da
 * clínica. É o que o calendário usa para posicionar sessão na grade e para
 * rotular hora, porque toda a aritmética dele é `getHours`/`getDate`/`setHours`.
 *
 * ⚠️ O resultado NÃO é um instante válido — é um espelho para leitura de
 * componentes. Nunca mande ele para a API nem compare com `Date.now()`. Para
 * voltar ao instante de verdade, use `instanteDeParede`.
 *
 * Quando o navegador está no fuso da clínica, o espelho é igual ao original.
 *
 * ---
 *
 * ## ⚠️ A-008(b) — o limite, MEDIDO, e por que ele não tem conserto aqui
 *
 * `new Date(ano, mes, dia, hora, min)` constrói no fuso de **quem olha**. Se essa
 * hora local **não existe** ali — a madrugada em que o relógio pula para a frente
 * — o JS normaliza para a frente, em silêncio. O espelho passa a mentir sobre a
 * própria hora que ele existe para carregar.
 *
 * **Não é remendável.** Nenhum `Date` local representa uma hora local que não
 * existe. Trocar a construção por outra fórmula não muda isso.
 *
 * ### O tamanho exato, varrendo 2027 hora a hora (8.760 sessões por fuso)
 *
 * ```
 * espectador          divergências   caso
 * America/Sao_Paulo        0         (o Brasil não tem DST desde 2019)
 * Europe/Lisbon            1         28/03, clínica 01:30 -> grade põe em 02:30
 * Europe/Berlin            1         28/03, clínica 02:30 -> grade põe em 03:30
 * America/New_York         1         14/03, clínica 02:30 -> grade põe em 03:30
 * Australia/Sydney         1         03/10, clínica 02:30 -> grade põe em 03:30
 * ```
 *
 * 📌 **Uma hora por ano, por fuso de espectador.** A sessão cai **uma linha
 * abaixo** na grade. O **dia nunca erra** — só a linha da hora.
 *
 * ### O que corrige, e por que não foi feito agora
 *
 * A saída é o espelho virar **UTC** (`Date.UTC` na construção, `getUTCHours` /
 * `getUTCDate` / `setUTCHours` na leitura). UTC não tem horário de verão, então
 * a normalização nunca acontece. É mecânico, e são **26 sítios** —
 * `CalendarClient.tsx` (17) e `WeekView.tsx` (9).
 *
 * ⚠️ **O risco não é o defeito, é a conversão.** Um sítio esquecido mantém o
 * defeito de uma hora; um sítio convertido **por engano** — sobre um `Date` que
 * não é espelho — desloca a grade inteira em três horas. `tsc` não pega nenhum
 * dos dois: `getHours` e `getUTCHours` existem os dois. Quem fizer precisa de
 * navegador, e eu (`vale`) não tenho.
 *
 * ✅ **Onde o espelho já foi abandonado:** `descreveSessaoEmConflito` formata
 * direto do instante com `Intl` (ver `horaNaClinica`/`diaNaClinica`) e não tem
 * essa falha. Foi a metade da A-008(b) que fechou.
 *
 * 🟡 **Latente até a R-016** — psicólogo em outro país. Da clínica no Rio, com
 * todo mundo em São Paulo, a linha de cima diz 0.
 */
export function paredeDaClinica(valor: string | Date): Date {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return d;
  const c = componentesNaClinica(d);
  return new Date(c.ano, c.mes - 1, c.dia, c.hora, c.min, c.seg);
}

/** Agora, como parede da clínica. Substitui `new Date()` no calendário. */
export function agoraNaClinica(): Date {
  return paredeDaClinica(new Date());
}

/** Lê componentes de parede de um `<input datetime-local>` ou de um espelho. */
function componentesDeParede(valor: string | Date): Componentes | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return {
      ano: valor.getFullYear(),
      mes: valor.getMonth() + 1,
      dia: valor.getDate(),
      hora: valor.getHours(),
      min: valor.getMinutes(),
      seg: valor.getSeconds(),
    };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(valor);
  if (!m) return null;
  return {
    ano: Number(m[1]),
    mes: Number(m[2]),
    dia: Number(m[3]),
    hora: Number(m[4]),
    min: Number(m[5]),
    seg: Number(m[6] ?? 0),
  };
}

/**
 * Hora de parede da clínica, "HH:MM", **sem passar pelo espelho**.
 *
 * ⚠️ A-008(b). O espelho (`paredeDaClinica`) constrói um `Date` LOCAL com os
 * componentes da clínica — e quando esses componentes caem na hora que **não
 * existe** no fuso de quem olha (o salto do horário de verão dele), o JavaScript
 * normaliza para frente **em silêncio**. Medido, com o espectador em Lisboa e a
 * sessão às 01:30 de São Paulo em 2027-03-28: `getHours()` devolve **02**.
 *
 * Nenhum `Date` local representa aquela hora naquele fuso, então o espelho não
 * tem conserto — o que tem conserto é **não usar espelho para exibir**. Estas
 * funções formatam direto do instante, com `Intl` no fuso da clínica, e não têm
 * hora inexistente porque não constroem `Date` nenhum.
 *
 * O espelho continua existindo para a **grade do calendário**, que faz
 * aritmética com `setHours`/`getDate` e precisaria ser reescrita inteira para
 * largar dele. Esse é o pedaço da A-008(b) que fica aberto.
 */
export function horaNaClinica(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  const c = componentesNaClinica(d);
  return `${zero(c.hora)}:${zero(c.min)}`;
}

/** "qua., 20/08" — dia da clínica, também sem espelho. Ver `horaNaClinica`. */
export function diaNaClinica(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

/**
 * "20/08/2026" — data da clínica com ano, direto do instante e sem espelho.
 *
 * Mesma família de `diaNaClinica`/`horaNaClinica`: financeiro e prontuário
 * formatavam com `date-fns`/`toLocaleString`, que usam o fuso do NAVEGADOR — e
 * divergiam do calendário para a psicóloga (ou admin) em outro fuso (A-025). O
 * que vale é a parede da CLÍNICA, o mesmo que o resto do app mostra.
 */
export function dataNaClinica(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** "20/08" — dia e mês da clínica (rótulo de gráfico). Ver `dataNaClinica`. */
export function diaMesNaClinica(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

/** "quarta-feira" — dia da semana por extenso no fuso da clínica. */
export function diaDaSemanaNaClinica(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    weekday: "long",
  }).format(d);
}

/**
 * "20/08/2026 14:00" — data + hora da clínica, para onde antes se usava
 * `new Date(x).toLocaleString('pt-BR')` (fuso do navegador). Reaproveita
 * `dataNaClinica` e `horaNaClinica`, então segue sem espelho.
 */
export function dataHoraNaClinica(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  return `${dataNaClinica(d)} ${horaNaClinica(d)}`;
}

/**
 * ## Data PURA — nascimento/aniversário, sem fuso nenhum (A-025 / F3)
 *
 * `data_nascimento` é um DATE no banco ("1990-05-20"): identifica um DIA de
 * calendário, não um instante. Passá-lo por `new Date("1990-05-20")` o lê como
 * meia-noite UTC, e aí `toLocaleDateString`/`toISOString` o reprojetam no fuso
 * do runtime — contêiner UTC mostra 20/05, São Paulo mostra 19/05. O dia do
 * aniversário não pode depender de ONDE o servidor roda.
 *
 * ⚠️ Estas duas funções NÃO usam o fuso da clínica e NÃO constroem `Date`: uma
 * data pura não tem fuso a que pertencer. Elas fatiam a string, então o dia é o
 * mesmo em qualquer runtime. Não confundir com as funções de INSTANTE acima.
 */

/**
 * "1990-05-20" (ou ISO com hora) -> "1990-05-20", só fatiando o começo.
 * `null` quando não há data reconhecível. É o que alimenta `<input type="date">`
 * sem passar por `new Date().toISOString()`.
 */
export function dataPuraISO(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Data pura -> "DD/MM/AAAA" para exibição. "" quando não há data. */
export function dataPuraParaBR(valor: string | null | undefined): string {
  const iso = dataPuraISO(valor);
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Espelho de parede -> valor de `<input type="datetime-local">`.
 *
 * Não converte fuso nenhum: lê os componentes locais do espelho, que já são o
 * relógio da clínica. É o que substitui os blocos de `getFullYear()` +
 * `padStart` espalhados pelas telas.
 */
export function paredeParaInput(parede: Date): string {
  if (Number.isNaN(parede.getTime())) return "";
  return (
    `${parede.getFullYear()}-${zero(parede.getMonth() + 1)}-${zero(parede.getDate())}` +
    `T${zero(parede.getHours())}:${zero(parede.getMinutes())}`
  );
}

/**
 * Horário de parede da clínica -> instante de verdade.
 *
 * Aceita o valor cru de um `<input type="datetime-local">` ("2026-08-17T14:00")
 * ou um espelho de `paredeDaClinica`. É o inverso de `paraInputLocal`.
 */
export function instanteDeParede(valor: string | Date): Date {
  const c = componentesDeParede(valor);
  if (!c) return new Date(NaN);
  const palpite = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.min, c.seg);
  // Duas passadas: a primeira usa o deslocamento no palpite, a segunda o
  // corrige quando o palpite caiu do outro lado de uma virada de horário de
  // verão. Converge para qualquer fuso do mundo real.
  const primeira = palpite - deslocamentoDaClinica(new Date(palpite));
  return new Date(palpite - deslocamentoDaClinica(new Date(primeira)));
}

/**
 * Instante -> valor de `<input type="datetime-local">`, no fuso da CLÍNICA.
 *
 * Antes descontava `getTimezoneOffset()`, o que devolvia o fuso do navegador —
 * ver o cabeçalho deste arquivo.
 */
export function paraInputLocal(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  const c = componentesNaClinica(d);
  return `${c.ano}-${zero(c.mes)}-${zero(c.dia)}T${zero(c.hora)}:${zero(c.min)}`;
}

/**
 * Valor do `<input type="datetime-local">` ("2026-08-17T14:00") -> horário de
 * parede no formato que a API espera ("2026-08-17 14:00:00").
 *
 * Não converte fuso, e é correto justamente porque `paraInputLocal` já entrega
 * o input em horário da clínica: o que sai daqui é o mesmo relógio que entrou.
 */
export function paraPayloadParede(valorDoInput: string): string {
  if (!valorDoInput) return "";
  const comSegundos =
    valorDoInput.length === 16 ? `${valorDoInput}:00` : valorDoInput;
  return comSegundos.replace("T", " ");
}

/** Soma minutos a um instante. */
export function maisMinutos(valor: string | Date, minutos: number): Date {
  return new Date(parseInstante(valor).getTime() + minutos * 60 * 1000);
}

/**
 * Soma minutos a um horário de parede da clínica e devolve parede de novo.
 *
 * É o que os formulários precisam para calcular "fim = início + duração": o
 * valor do input é parede, e `maisMinutos` sozinho o trataria como instante no
 * fuso do navegador.
 */
export function paredeMaisMinutos(valorDoInput: string | Date, minutos: number): string {
  const inicio = instanteDeParede(valorDoInput);
  if (Number.isNaN(inicio.getTime())) return "";
  return paraInputLocal(maisMinutos(inicio, minutos));
}

/** Soma minutos a um espelho de parede e devolve espelho. */
export function paredeSomada(parede: Date, minutos: number): Date {
  return new Date(parede.getTime() + minutos * 60 * 1000);
}

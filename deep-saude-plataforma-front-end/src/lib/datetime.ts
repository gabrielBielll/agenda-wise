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
 * fusos diferentes deixam de ser hipótese. Não há coluna de fuso em `clinicas`
 * hoje; quando houver, isto vira parâmetro e o backend precisa concordar — ele
 * também interpreta horário de parede como São Paulo.
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

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
 */

/** Instante vindo da API -> Date. */
export function parseInstante(iso: string | Date): Date {
  return iso instanceof Date ? iso : new Date(iso);
}

/**
 * Instante -> valor de <input type="datetime-local">, no fuso do navegador.
 *
 * `toISOString()` devolveria UTC, que mostraria o horário errado no formulário;
 * por isso o desconto do offset local antes de fatiar.
 */
export function paraInputLocal(valor: string | Date): string {
  const d = parseInstante(valor);
  if (Number.isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Valor do <input type="datetime-local"> ("2026-08-17T14:00") -> horário de
 * parede no formato que a API espera ("2026-08-17 14:00:00").
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

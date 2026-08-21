/**
 * CPF: os dois dígitos verificadores, e a máscara.
 *
 * 🔴 **Espelho do `dominio.clj`, não substituto dele.** Quem decide se um CPF
 * entra no banco é o servidor — este arquivo existe para a psicóloga ver o erro
 * enquanto digita, em vez de descobrir depois de salvar. Se os dois um dia
 * discordarem, o servidor é quem manda; o `dominio.clj` é a autoridade, como já
 * vale para todo vocabulário deste projeto.
 *
 * ⚠️ **A aritmética é a mesma dos dois lados de propósito.** Validar formato aqui
 * e verificadores lá deixaria passar exatamente o erro mais comum — dígito
 * trocado com formato certo — até o momento de salvar.
 */

/** Só os dígitos. Espelha o `dominio/digitos`. */
export function digitosDoCpf(cpf: string): string {
  return (cpf ?? "").replace(/\D/g, "");
}

/** `12345678909` -> `123.456.789-09`. Máscara é apresentação; grava-se dígito. */
export function formatarCpf(cpf: string): string {
  const d = digitosDoCpf(cpf).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * O CPF fecha nos dois dígitos verificadores?
 *
 * ⚠️ **Os onze dígitos repetidos são recusados de propósito.**
 * `111.111.111-11` e os outros nove **fecham** na conta — a matemática os
 * aceita. São inválidos por convenção, e quem digita um deles está se livrando
 * do campo, não informando um CPF. Sem esta linha o validador diria "ok" para o
 * valor mais comum de lixo.
 */
export function cpfValido(cpf: string): boolean {
  const d = digitosDoCpf(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const n = [...d].map(Number);
  const verificador = (ate: number) => {
    const soma = n.slice(0, ate).reduce((s, v, i) => s + v * (ate + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return verificador(9) === n[9] && verificador(10) === n[10];
}

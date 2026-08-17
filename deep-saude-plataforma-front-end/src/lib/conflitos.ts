import { diaNaClinica, horaNaClinica, maisMinutos, parseInstante } from "@/lib/datetime";

/**
 * O que o backend devolve quando recusa por conflito, e como a tela conta isso.
 *
 * Contrato fixado pela `orla` na mensageria 0043 e implementado por `duna` em
 * `core.clj` (`414ded1`). Os dois lados do front — o calendário do psicólogo e o
 * módulo do admin — falam a mesma forma porque ela mora aqui.
 *
 * ## Por que a lista de sessões importa
 *
 * A **R-014** não diz só "recuse": diz recusar **mostrando o dia e a hora de
 * cada sessão atingida**, para a pessoa conseguir resolver. Engolir isso num
 * "erro ao criar bloqueio" cumpre a letra e perde o ponto — quem recebe a recusa
 * fica sem saber o que ajustar.
 *
 * É o mesmo raciocínio do contexto que o Gabriel deu na 0041: aqui notificação
 * é serviço, não ruído.
 */

/** Uma sessão que impede o bloqueio. `data_hora_sessao` vem no fuso da clínica. */
export type SessaoEmConflito = {
  id: string;
  data_hora_sessao: string;
  duracao?: number;
};

/** Resultado de criar bloqueio. `sessoes` só vem preenchido no 409. */
export type ResultadoDeBloqueio = {
  message: string;
  success: boolean;
  /** Preenchido quando o backend recusou com `code: "session_conflict"`. */
  sessoes?: SessaoEmConflito[];
};

/**
 * Lê a recusa do backend e separa o 409 de conflito de um erro qualquer.
 *
 * Fica aqui, e não em cada `actions.ts`, porque duplicar a leitura do contrato
 * é como os dois módulos passaram a discordar sobre datas — o defeito que a
 * D-010 fechou.
 */
export function lerRecusaDeBloqueio(
  status: number,
  corpo: { erro?: string; code?: string; sessoes?: SessaoEmConflito[] }
): ResultadoDeBloqueio {
  if (status === 409 && corpo.code === "session_conflict") {
    return {
      message: corpo.erro || "Há sessões marcadas nesse período.",
      success: false,
      sessoes: corpo.sessoes ?? [],
    };
  }
  return {
    message: corpo.erro || "Falha ao criar bloqueio.",
    success: false,
  };
}

/**
 * "20/08 (qua), 14:00 – 14:50" — o que a R-014 manda mostrar.
 *
 * Usa `paredeDaClinica` porque o instante vem com o offset da clínica e é o
 * relógio dela que vale (D-010). Formatar com `toLocaleString` direto no
 * instante mostraria o horário de quem está olhando, que é exatamente o defeito
 * do item 1 reaparecendo num lugar novo.
 */
export function descreveSessaoEmConflito(sessao: SessaoEmConflito): string {
  const instante = parseInstante(sessao.data_hora_sessao);
  if (Number.isNaN(instante.getTime())) return "(horário inválido)";

  /**
   * A-008(a) — o fim é calculado no INSTANTE e só depois vira parede.
   *
   * Antes era `new Date(inicio.getTime() + duracao * 60_000)`, somando tempo real
   * sobre um **espelho de parede** e lendo getters locais. Isso só devolve
   * "parede + duração" se o relógio de **quem olha** não virar no meio — e quando
   * vira, a tela mostra a sessão terminando uma hora fora.
   *
   * Reproduzido varrendo 2027, com a sessão em horário de São Paulo:
   *
   * ```
   * espectador          sessão             mostrava   correto
   * Europe/Lisbon       2027-03-28 01:30   03:20      02:20
   * America/New_York    2027-03-14 02:30   04:20      03:20
   * Australia/Sydney    2027-04-04 02:30   02:20      03:20
   * America/Sao_Paulo   —                  (nenhum caso)
   * ```
   *
   * A última linha é o motivo de ninguém ter visto: o Brasil não tem horário de
   * verão desde 2019, então o defeito é **impossível de descobrir por acidente**
   * daqui. Ele acorda com a R-016 — psicólogo em outro país é plano declarado.
   *
   * A forma certa é aritmética de instante: a sessão dura 50 minutos **reais**,
   * e as duas pontas são convertidas para a parede da clínica em separado.
   */
  const fim = maisMinutos(instante, sessao.duracao ?? 50);

  /**
   * A-008(b) — sem espelho aqui.
   *
   * Corrigir só a (a) deixou o defeito **visível em vez de silencioso**: com o
   * espectador em Lisboa, a linha saía `02:30 – 02:20`, com o início depois do
   * fim, porque o espelho do início tinha sido normalizado para a frente.
   *
   * Formatar direto do instante, no fuso da clínica, não tem essa falha: não
   * existe hora inexistente quando não se constrói `Date` local nenhum.
   */
  return `${diaNaClinica(instante)}, ${horaNaClinica(instante)} – ${horaNaClinica(fim)}`;
}

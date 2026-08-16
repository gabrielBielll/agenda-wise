import { paredeDaClinica } from "@/lib/datetime";

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
  const inicio = paredeDaClinica(sessao.data_hora_sessao);
  if (Number.isNaN(inicio.getTime())) return "(horário inválido)";

  const fim = new Date(inicio.getTime() + (sessao.duracao ?? 50) * 60 * 1000);
  const hora = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const dia = inicio.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });

  return `${dia}, ${hora(inicio)} – ${hora(fim)}`;
}

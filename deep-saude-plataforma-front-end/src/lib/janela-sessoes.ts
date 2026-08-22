/**
 * A janela da lista de sessões do formulário de evolução.
 *
 * O Gabriel apontou o problema antes dele acontecer: o seletor "Vincular a
 * Sessão" desenha o histórico INTEIRO do paciente. Hoje são nove linhas; num
 * paciente de anos são centenas, e achar a sessão certa vira garimpo.
 *
 * 🔴 E não é só a tela. `GET /api/agendamentos?paciente_id=` não tem `LIMIT`
 * (`core.clj`, `listar-agendamentos-handler`) — ele ordena `DESC` e devolve
 * tudo. Paginar aqui é a metade barata; a outra metade é do backend e está
 * anotada, não feita.
 *
 * 📌 Isto é função PURA e mora fora do componente pelo mesmo motivo da
 * `aplicar-cep`: enquanto a regra vive dentro do JSX, o único jeito de
 * exercitá-la é clicando — e aqui há um caso que ninguém clicaria por acaso
 * (ver `janelaInicial`).
 */

/** O mínimo que a lista precisa ter para esta regra funcionar. */
export interface SessaoVinculavel {
  id: string;
  data_hora_sessao: string;
}

/** Quantas sessões aparecem por vez, antes do "Carregar mais". */
export const SESSOES_POR_PAGINA = 10;

/**
 * Data em milissegundos, com data ilegível empurrada para o fim.
 *
 * Sem este cuidado, uma `data_hora_sessao` inválida devolve `NaN` no
 * comparador — e comparador que devolve `NaN` não ordena errado: ele ordena de
 * um jeito **indefinido**, que muda com o tamanho da entrada. É exatamente a
 * família de defeito que este repositório coleciona: nada quebra, o resultado
 * só deixa de significar o que diz.
 */
function instante(sessao: SessaoVinculavel): number {
  const t = Date.parse(sessao.data_hora_sessao);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Da sessão mais recente para a mais antiga.
 *
 * O backend já ordena assim, e mesmo assim ordenamos de novo: a ordem da TELA
 * não pode depender do `ORDER BY` de lá. Trocar a origem de `appointments` por
 * um cache, outra rota ou um `map` no meio mudaria a ordem **sem quebrar
 * nada visível** — e a lista continuaria parecendo certa.
 */
export function ordenarDaMaisRecente<T extends SessaoVinculavel>(sessoes: readonly T[]): T[] {
  return [...sessoes].sort((a, b) => {
    const ta = instante(a);
    const tb = instante(b);
    if (ta === tb) return 0;
    return tb > ta ? 1 : -1;
  });
}

/**
 * 🔴 De quantas sessões a lista precisa COMEÇAR — e este é o caso que a
 * paginação quase quebrou em silêncio.
 *
 * O Radix monta o `<select>` oculto que submete o formulário a partir dos
 * `SelectItem` que estão renderizados (`nativeOptionsSet`, em
 * `@radix-ui/react-select/dist/index.mjs`). Item fora da janela é `<option>`
 * que não existe: o gatilho volta a exibir o texto de placeholder e o campo
 * sai VAZIO no envio.
 *
 * O efeito seria abrir uma evolução antiga, corrigir uma vírgula, salvar — e
 * **desvincular a sessão dela**, sem erro, sem aviso e sem nada na tela dizendo
 * que mudou. Por isso a janela nunca começa menor que a posição da sessão já
 * vinculada.
 *
 * ⚠️ Vinculada a uma sessão que não está na lista (apagada, ou de outro
 * psicólogo pela R-012) devolve a janela padrão: não há o que manter visível, e
 * esse vínculo já aparecia vazio antes desta mudança.
 */
export function janelaInicial(
  sessoesOrdenadas: readonly SessaoVinculavel[],
  agendamentoVinculado?: string | null,
  porPagina: number = SESSOES_POR_PAGINA,
): number {
  const minimo = Math.max(1, porPagina);
  if (!agendamentoVinculado) return minimo;
  const posicao = sessoesOrdenadas.findIndex((s) => s.id === agendamentoVinculado);
  return posicao < 0 ? minimo : Math.max(minimo, posicao + 1);
}

/**
 * D-024 — as duas janelas de agenda, e o que cada uma significa.
 *
 * ## 🔴 Janela não é sessão, e a distinção não é acadêmica
 *
 * `bloqueio` e `disponivel` são estados de uma FAIXA DE TEMPO, não de uma
 * consulta. Não entram em `status-sessao`, não viram linha em `agendamentos`.
 * Pô-los no vocabulário de sessão criaria sessão sem paciente, sem valor e sem
 * psicóloga responsável — o caminho que o `dominio.clj` registra como o desastre
 * do `status_repasse`.
 *
 * No banco as duas dividem a tabela `bloqueios_agenda`, separadas pela coluna
 * `tipo`. É o mesmo intervalo (clínica, psicóloga, início, fim) com o **sinal
 * invertido**: uma proíbe, a outra oferece.
 *
 * ## ⚠️ Por que `disponivel` e não `cor-pavao`
 *
 * Os valores de hoje são idênticos aos do Pavão da paleta. O que difere é o
 * significado, e é isso que decide qual variável usar: `--cor-pavao` é uma
 * ESCOLHA da clínica em `/admin/aparencia` e pode ir parar em qualquer estado de
 * sessão. `--disponivel` é significado fixo da plataforma, como o `--grafite` do
 * bloqueio. Se fossem a mesma variável, a clínica escolher Pavão para "agendada"
 * repintaria as janelas oferecidas junto — e o contrário também.
 *
 * ## 📌 A cor não carrega o estado; o glifo carrega
 *
 * Vale aqui pelo mesmo motivo dos cinco estados de sessão (§13 de
 * `docs/GOOGLE_CORES_E_RECONCILIACAO.md`): quem não distingue matiz precisa de um
 * segundo canal. Os glifos foram medidos contra a Montserrat com os dois
 * controles da `scripts/mede-cobertura-de-glifo.mjs` — o `○`, que era a escolha
 * óbvia para "vago", **não está na fonte** e cairia em fonte de sistema, exatamente
 * como o `✓` caía antes de 20/08.
 *
 * ⚠️ **A escolha das FORMAS é julgamento, não medição** — separando, como manda a
 * casa. Medido: cobertura da fonte e largura. Que `+` leia como "cabe uma sessão
 * aqui" é decisão, e muda sem quebrar nada: são duas strings.
 */

export type TipoJanela = 'bloqueio' | 'disponivel';

export type JanelaAparencia = {
  /**
   * 🔴 Este texto é lido, não é `title` decorativo.
   *
   * A `orla` deixou um achado aberto sobre a grade de SESSÕES: lá o glifo é
   * `aria-hidden` e o `label` não é renderizado, então o leitor de tela ouve
   * hora e nome e não ouve o estado. Não repito aqui: a janela anuncia o que é.
   */
  label: string;
  glyph: string;
  /** O bloco desenhado sobre a faixa de tempo — preenchimento e borda. */
  blocoClassName: string;
  /** O texto dentro do bloco (motivo, ou o rótulo padrão). */
  textoClassName: string;
  /** A lavagem de fundo da célula da hora inteira. */
  celulaClassName: string;
  /** O que aparece quando a janela não tem motivo escrito. */
  rotuloPadrao: string;
};

const aparencias: Record<TipoJanela, JanelaAparencia> = {
  bloqueio: {
    label: 'Horário bloqueado',
    // 🔒 é emoji, e continua sendo o que já estava no ar desde antes da D-024.
    // Não medi contra a Montserrat porque emoji nunca vem dela — vem da fonte de
    // emoji do sistema, por desenho. Trocar isto é outro cartão.
    glyph: '🔒',
    blocoClassName: 'bg-grafite-suave border-l-4 border-grafite',
    textoClassName: 'text-grafite-foreground',
    celulaClassName: 'bg-grafite-tenue',
    rotuloPadrao: 'Bloqueado',
  },
  disponivel: {
    label: 'Horário disponível',
    // `+`: "cabe uma sessão aqui". Medido na Montserrat (3312 bytes contra 1664
    // do controle ausente). O `□` também está na fonte, mas foi descartado por
    // ser confundível com o `■` da sessão realizada — e os dois aparecem lado a
    // lado na mesma tela.
    glyph: '+',
    blocoClassName: 'bg-disponivel-suave border-l-4 border-disponivel',
    textoClassName: 'text-disponivel-foreground',
    celulaClassName: 'bg-disponivel-tenue',
    rotuloPadrao: 'Disponível',
  },
};

/**
 * Janela sem `tipo` é BLOQUEIO.
 *
 * 🔴 O default não é arbitrário: até 21/08 toda linha de `bloqueios_agenda`
 * significava proibição, e o backend grava `DEFAULT 'bloqueio'` pelo mesmo
 * motivo. Se este default escorregasse para `disponivel`, todo bloqueio antigo
 * apareceria como horário oferecido — e o sintoma seria uma ausência.
 */
export function normalizarTipoJanela(tipo?: string | null): TipoJanela {
  return tipo === 'disponivel' ? 'disponivel' : 'bloqueio';
}

export function janelaAparencia(tipo?: string | null): JanelaAparencia {
  return aparencias[normalizarTipoJanela(tipo)];
}

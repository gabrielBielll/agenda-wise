import { CLASSES_DE_COR, type CoresEscolhidas } from "./cores-agenda";

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'realizado'
  | 'cancelado'
  | 'falta';

export type AppointmentStatusAppearance = {
  label: string;
  shortLabel: string;
  /**
   * 🔴 **Segundo canal, independente de cor — e aqui ele carrega peso, não enfeita.**
   *
   * O chip do calendário mostra hora e nome do paciente. **Não mostra o estado.**
   * Então, até 20/08, a cor era o único canal que separava "aguardando
   * confirmação" de "confirmada" — e essas duas foram medidas em **1,02 de
   * luminância**: terracota contra sálvia, o par que colapsa em deuteranopia.
   *
   * Quem não distingue matiz não separava as duas, e é justamente essa distinção
   * que decide se a psicóloga liga para a paciente confirmando.
   *
   * O glifo é lido por quem não lê a cor. É `aria-hidden` de propósito: o estado
   * já chega ao leitor de tela pelo `label`, e anunciar o símbolo junto viraria
   * ruído.
   *
   * ## 🔴 Por que os cinco, e não só a confirmada
   *
   * Medido em 2026-08-20 (§13 de `docs/GOOGLE_CORES_E_RECONCILIACAO.md`): das
   * **462** formas de escolher 5 cores entre as 11 do Google, **nenhuma** deixa
   * os cinco estados distinguíveis por luminância. Não é escolha ruim de
   * valores — cabem 9 cores no tema claro e 8 no escuro, e as 11 não cabem.
   *
   * Ou seja: **a cor não consegue carregar o estado.** Ela carrega o
   * reconhecimento (a convenção do Google); o estado é do glifo. Com a paleta
   * por clínica (GC-016), sem os cinco a tela deixaria a clínica escolher
   * combinações ilegíveis — a paleta viraria a fonte do problema.
   *
   * ## ⚠️ Por que `√` e não `✓`
   *
   * A fonte do corpo é **Montserrat**, e ela **não tem o U+2713 (`✓`)** — medido
   * baixando o subconjunto do Google Fonts e comparando o tamanho com um caso
   * presente e um ausente. O `✓` que entrou aqui em 19/08 caía em fonte de
   * sistema: métrica diferente, forma dependente de plataforma, e quadradinho
   * onde o sistema não tivesse.
   *
   * Os cinco abaixo **estão todos na Montserrat**, medidos um a um. A rotina
   * está em `scripts/mede-cobertura-de-glifo.mjs`.
   *
   * 📌 E nenhum é de largura dupla (`east_asian_width` W ou F), o que evitaria o
   * texto do chip pular quando o glifo aparece.
   *
   * 📌 **A escolha das FORMAS é julgamento, não medição** — separando, como manda
   * a casa. O que foi medido é a cobertura da fonte e a largura. Que `√` leia
   * como "confirmado" e `∅` como "não veio" é decisão do Gabriel, e ela pode
   * mudar sem que nada aqui quebre: são cinco strings.
   */
  glyph: string | null;
  /**
   * 🔴 A sessão já passou e ninguém disse se aconteceu.
   *
   * NÃO é um sexto estado guardado: é `agendado`/`confirmado` mais o relógio.
   * "Realizada" é confirmação humana deliberada — o diálogo diz que ela alimenta
   * o financeiro —, então passar da hora não pode marcar sozinho.
   *
   * ⚠️ Mas o chip mentia: mostrava `?` ("aguardando confirmação da paciente")
   * para uma sessão que já aconteceu, quando o que está pendente é outra coisa
   * inteiramente — *"aconteceu?"*, e a resposta vira dinheiro. As duas situações
   * pedem ações opostas da psicóloga, e a grade não as distinguia.
   *
   * 📌 O diálogo JÁ distinguia (ele troca o botão para "Confirmar que a sessão
   * aconteceu"). Quem não sabia era a grade.
   */
  pedeConfirmacao: boolean;
  eventClassName: string;
  badgeClassName: string;
};

const appearances: Record<AppointmentStatus, AppointmentStatusAppearance> = {
  agendado: {
    label: 'Aguardando confirmação',
    shortLabel: 'Agendada',
    glyph: '?',
    pedeConfirmacao: false, // aguardando confirmação — a pergunta ainda sem resposta, e é o estado em que a psicóloga precisa AGIR
    eventClassName: 'border-agenda-agendada bg-agenda-agendada-suave text-agenda-agendada-foreground hover:brightness-[.98]',
    badgeClassName: 'border-agenda-agendada/35 bg-agenda-agendada-suave text-agenda-agendada-foreground',
  },
  confirmado: {
    label: 'Sessão confirmada',
    shortLabel: 'Confirmada',
    glyph: '√',
    pedeConfirmacao: false, // confirmado. Era `✓` até 20/08; trocado porque a Montserrat não tem o U+2713
    eventClassName: 'border-agenda-confirmada bg-agenda-confirmada-suave text-agenda-confirmada-foreground hover:brightness-[.98]',
    badgeClassName: 'border-agenda-confirmada/35 bg-agenda-confirmada-suave text-agenda-confirmada-foreground',
  },
  realizado: {
    label: 'Sessão realizada',
    shortLabel: 'Realizada',
    glyph: '■',
    pedeConfirmacao: false, // bloco fechado: aconteceu e acabou
    eventClassName: 'border-success bg-success/15 text-foreground hover:bg-success/20',
    badgeClassName: 'border-success/35 bg-success/10 text-success',
  },
  cancelado: {
    label: 'Sessão cancelada',
    shortLabel: 'Cancelada',
    glyph: '×',
    pedeConfirmacao: false, // cancelado. É o U+00D7 da fonte, não o `✕` U+2715, que está fora dela
    eventClassName: 'border-tomate bg-tomate-suave text-tomate-foreground hover:brightness-95 opacity-80',
    badgeClassName: 'border-tomate/35 bg-tomate-suave text-tomate-foreground',
  },
  falta: {
    label: 'Paciente não compareceu',
    shortLabel: 'Falta',
    glyph: '∅',
    pedeConfirmacao: false, // vazio: o horário existiu e ninguém veio
    eventClassName: 'border-tomate bg-tomate-suave text-tomate-foreground hover:brightness-95',
    badgeClassName: 'border-tomate/35 bg-tomate-suave text-tomate-foreground',
  },
};

export function normalizeAppointmentStatus(status?: string): AppointmentStatus {
  return status && status in appearances ? status as AppointmentStatus : 'agendado';
}

/**
 * A aparência de um estado, já com a cor que a clínica escolheu — se escolheu.
 *
 * 🔴 **Sem `escolhidas`, nada muda.** Quem nunca abriu `/admin/aparencia` continua
 * vendo exatamente as cores de hoje: os tokens da plataforma, que foram medidos
 * um a um e cujo par agendada/confirmada foi corrigido em 20/08. Subir esta
 * função não repinta a agenda de ninguém — repintar é consequência de escolher.
 *
 * ⚠️ E o parâmetro é **o que foi escolhido**, não a paleta efetiva. Se fosse a
 * efetiva, todo estado teria cor e a agenda inteira mudaria de aparência no
 * primeiro deploy. A ausência é a informação.
 *
 * 📌 O `glyph` **não** depende da cor e nunca vem daqui alterado: é ele que
 * carrega o estado, e a cor carrega o reconhecimento. Trocar a paleta não mexe
 * na leitura.
 */
export function appointmentStatusAppearance(
  status?: string,
  escolhidas?: CoresEscolhidas,
  /** Quando vem, o relógio entra na conta: sessão vencida sem veredito pede `!`. */
  sessao?: { inicio: string; duracao?: number }
): AppointmentStatusAppearance {
  const estado = normalizeAppointmentStatus(status);
  const base = appearances[estado];
  const cor = escolhidas?.[estado];
  const c = cor ? CLASSES_DE_COR[cor] : undefined;
  const comCor = c
    ? {
        ...base,
        eventClassName: `${c.borda} ${c.fundo} ${c.texto} hover:brightness-[.98]`,
        badgeClassName: `${c.borda} ${c.fundo} ${c.texto}`,
      }
    : base;

  if (!sessao || !precisaConfirmacao(status, sessao.inicio, sessao.duracao)) return comCor;

  return {
    ...comCor,
    glyph: '!',
    pedeConfirmacao: true,
    // `chama-atencao` está no globals.css e some sozinha em
    // `prefers-reduced-motion` — ver o comentário lá.
    eventClassName: `${comCor.eventClassName} chama-atencao`,
  };
}

export function appointmentHasEnded(start: string, duration = 50, now = Date.now()) {
  return new Date(start).getTime() + duration * 60_000 <= now;
}

/**
 * A sessão terminou e continua sem veredito — precisa da psicóloga.
 *
 * Só `agendado` e `confirmado`: `realizado` já tem resposta, e `cancelado` e
 * `falta` também. Um cancelamento que envelhece não vira pendência.
 */
export function precisaConfirmacao(
  status: string | undefined,
  inicio: string,
  duracao = 50,
  now = Date.now()
): boolean {
  const e = normalizeAppointmentStatus(status);
  return (e === 'agendado' || e === 'confirmado') && appointmentHasEnded(inicio, duracao, now);
}

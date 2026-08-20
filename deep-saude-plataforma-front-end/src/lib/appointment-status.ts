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
   * já chega ao leitor de tela pelo `label`, e anunciar "✓" junto viraria ruído.
   */
  glyph: string | null;
  eventClassName: string;
  badgeClassName: string;
};

const appearances: Record<AppointmentStatus, AppointmentStatusAppearance> = {
  agendado: {
    label: 'Aguardando confirmação',
    shortLabel: 'Agendada',
    glyph: null,
    eventClassName: 'border-agenda-agendada bg-agenda-agendada-suave text-agenda-agendada-foreground hover:brightness-[.98]',
    badgeClassName: 'border-agenda-agendada/35 bg-agenda-agendada-suave text-agenda-agendada-foreground',
  },
  confirmado: {
    label: 'Sessão confirmada',
    shortLabel: 'Confirmada',
    glyph: '✓',
    eventClassName: 'border-agenda-confirmada bg-agenda-confirmada-suave text-agenda-confirmada-foreground hover:brightness-[.98]',
    badgeClassName: 'border-agenda-confirmada/35 bg-agenda-confirmada-suave text-agenda-confirmada-foreground',
  },
  realizado: {
    label: 'Sessão realizada',
    shortLabel: 'Realizada',
    glyph: null,
    eventClassName: 'border-success bg-success/15 text-foreground hover:bg-success/20',
    badgeClassName: 'border-success/35 bg-success/10 text-success',
  },
  cancelado: {
    label: 'Sessão cancelada',
    shortLabel: 'Cancelada',
    glyph: null,
    eventClassName: 'border-tomate bg-tomate-suave text-tomate-foreground hover:brightness-95 opacity-80',
    badgeClassName: 'border-tomate/35 bg-tomate-suave text-tomate-foreground',
  },
  falta: {
    label: 'Paciente não compareceu',
    shortLabel: 'Falta',
    glyph: null,
    eventClassName: 'border-tomate bg-tomate-suave text-tomate-foreground hover:brightness-95',
    badgeClassName: 'border-tomate/35 bg-tomate-suave text-tomate-foreground',
  },
};

export function normalizeAppointmentStatus(status?: string): AppointmentStatus {
  return status && status in appearances ? status as AppointmentStatus : 'agendado';
}

export function appointmentStatusAppearance(status?: string): AppointmentStatusAppearance {
  return appearances[normalizeAppointmentStatus(status)];
}

export function appointmentHasEnded(start: string, duration = 50, now = Date.now()) {
  return new Date(start).getTime() + duration * 60_000 <= now;
}

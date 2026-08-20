export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'realizado'
  | 'cancelado'
  | 'falta';

export type AppointmentStatusAppearance = {
  label: string;
  shortLabel: string;
  eventClassName: string;
  badgeClassName: string;
};

const appearances: Record<AppointmentStatus, AppointmentStatusAppearance> = {
  agendado: {
    label: 'Aguardando confirmação',
    shortLabel: 'Agendada',
    eventClassName: 'border-agenda-agendada bg-agenda-agendada-suave text-agenda-agendada-foreground hover:brightness-[.98]',
    badgeClassName: 'border-agenda-agendada/35 bg-agenda-agendada-suave text-agenda-agendada-foreground',
  },
  confirmado: {
    label: 'Sessão confirmada',
    shortLabel: 'Confirmada',
    eventClassName: 'border-agenda-confirmada bg-agenda-confirmada-suave text-agenda-confirmada-foreground hover:brightness-[.98]',
    badgeClassName: 'border-agenda-confirmada/35 bg-agenda-confirmada-suave text-agenda-confirmada-foreground',
  },
  realizado: {
    label: 'Sessão realizada',
    shortLabel: 'Realizada',
    eventClassName: 'border-success bg-success/15 text-foreground hover:bg-success/20',
    badgeClassName: 'border-success/35 bg-success/10 text-success',
  },
  cancelado: {
    label: 'Sessão cancelada',
    shortLabel: 'Cancelada',
    eventClassName: 'border-tomate bg-tomate-suave text-tomate-foreground hover:brightness-95 opacity-80',
    badgeClassName: 'border-tomate/35 bg-tomate-suave text-tomate-foreground',
  },
  falta: {
    label: 'Paciente não compareceu',
    shortLabel: 'Falta',
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

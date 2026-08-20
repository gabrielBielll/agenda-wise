import Link from 'next/link';
import { getServerSession } from 'next-auth';
import {
  ArrowRight, CalendarDays, CheckCircle2, Leaf, Plus, Sparkles, UsersRound, Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CareWhisper, DailyCareGreeting } from '@/components/dashboard/DailyCareGreeting';
import { FalhaDeCarregamento } from '@/components/FalhaDeCarregamento';
import { authOptions } from '@/lib/auth';
import { carregar } from '@/lib/carregar';

interface Appointment {
  id: string;
  data_hora_sessao: string;
  nome_paciente?: string;
  paciente_id?: string;
  status?: string;
  duracao?: number;
  modalidade?: string;
}

interface Block {
  id: string;
  data_inicio: string;
  data_fim: string;
}

interface OwnProfile {
  nome?: string;
}

const partsInSaoPaulo = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return { key: `${read('year')}-${read('month')}-${read('day')}`, year: Number(read('year')), month: Number(read('month')), day: Number(read('day')) };
};

const timeInSaoPaulo = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

const initials = (name?: string) => (name || 'Paciente')
  .split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  const [appointments, blocks, profile] = await Promise.all([
    carregar<Appointment[]>('/api/agendamentos', token),
    carregar<Block[]>('/api/bloqueios', token),
    carregar<OwnProfile>('/api/me', token),
  ]);
  if (!appointments.ok) return <FalhaDeCarregamento motivo={appointments.motivo} oQue="seu dia" />;
  if (!blocks.ok) return <FalhaDeCarregamento motivo={blocks.motivo} oQue="suas pausas" />;

  const now = new Date();
  const todayKey = partsInSaoPaulo(now).key;
  const active = appointments.dados.filter(item => item.status !== 'cancelado');
  const today = active
    .filter(item => partsInSaoPaulo(new Date(item.data_hora_sessao)).key === todayKey)
    .sort((a, b) => new Date(a.data_hora_sessao).getTime() - new Date(b.data_hora_sessao).getTime());
  const upcoming = active
    .filter(item => new Date(item.data_hora_sessao).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.data_hora_sessao).getTime() - new Date(b.data_hora_sessao).getTime());
  const next = upcoming[0];
  const minutesUntilNext = next ? Math.max(0, Math.round((new Date(next.data_hora_sessao).getTime() - now.getTime()) / 60_000)) : null;

  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now);
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[weekdayName] || 1;
  // Meio-dia UTC mantém a data civil estável ao atravessar o fuso da clínica.
  const weekStart = new Date(Date.UTC(partsInSaoPaulo(now).year, partsInSaoPaulo(now).month - 1, partsInSaoPaulo(now).day, 12));
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekday - 1));
  const weekKeys = new Set(Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    return partsInSaoPaulo(date).key;
  }));
  const thisWeek = active.filter(item => weekKeys.has(partsInSaoPaulo(new Date(item.data_hora_sessao)).key));
  const protectedBreaks = blocks.dados.filter(item => weekKeys.has(partsInSaoPaulo(new Date(item.data_inicio)).key)).length;
  const patientsThisWeek = new Set(thisWeek.map(item => item.paciente_id).filter(Boolean)).size;

  const weekDays = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    const key = partsInSaoPaulo(date).key;
    const count = thisWeek.filter(item => partsInSaoPaulo(new Date(item.data_hora_sessao)).key === key).length;
    return { key, count, label: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][index] };
  });
  const maxDay = Math.max(1, ...weekDays.map(day => day.count));

  return (
    <div className="quiet-page">
      <DailyCareGreeting name={profile.ok ? profile.dados.nome : undefined} />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="group overflow-hidden hover:shadow-[var(--quiet-shadow)]"><CardContent className="relative flex items-center gap-4 p-5"><span className="terra-icon"><CalendarDays className="h-5 w-5" /></span><div className="min-w-0"><p className="page-eyebrow text-muted-foreground">Sessões hoje</p><div className="mt-1 flex flex-wrap items-end gap-2"><strong className="font-headline text-4xl font-normal">{today.length}</strong><small className="mb-1.5 text-[10px] text-muted-foreground">{minutesUntilNext === null ? 'Agenda concluída' : minutesUntilNext < 60 ? `Próxima em ${minutesUntilNext} min` : `Próxima às ${timeInSaoPaulo(next.data_hora_sessao)}`}</small></div></div><span className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-primary/10 transition-transform duration-500 group-hover:scale-125" /></CardContent></Card>
        <Card className="group overflow-hidden hover:shadow-[var(--quiet-shadow)]"><CardContent className="relative flex items-center gap-4 p-5"><span className="soft-icon"><Sparkles className="h-5 w-5" /></span><div><p className="page-eyebrow text-muted-foreground">Ritmo semanal</p><div className="mt-1 flex items-end gap-2"><strong className="font-headline text-4xl font-normal">{thisWeek.length}</strong><small className="mb-1.5 text-[10px] text-muted-foreground">sessões na semana</small></div></div><span className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-accent/10 transition-transform duration-500 group-hover:scale-125" /></CardContent></Card>
        <Card className="group overflow-hidden hover:shadow-[var(--quiet-shadow)]"><CardContent className="relative flex items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-[14px] bg-secondary/20 text-secondary"><UsersRound className="h-5 w-5" /></span><div><p className="page-eyebrow text-muted-foreground">Pessoas na semana</p><div className="mt-1 flex items-end gap-2"><strong className="font-headline text-4xl font-normal">{patientsThisWeek}</strong><small className="mb-1.5 text-[10px] text-muted-foreground">pacientes acompanhados</small></div></div></CardContent></Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,.75fr)]">
        <div className="space-y-5">
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="page-eyebrow">Em seguida</p><h3 className="section-title mt-1">Sua próxima sessão</h3></div>{next && <span className="flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[10px] font-semibold text-primary"><i className="h-1.5 w-1.5 rounded-full bg-primary" /> {minutesUntilNext !== null && minutesUntilNext < 60 ? `Em ${minutesUntilNext} min` : timeInSaoPaulo(next.data_hora_sessao)}</span>}</div>
            {next ? (
              <Link href="/calendar" className="group relative flex min-h-32 flex-wrap items-center overflow-hidden rounded-[23px] bg-accent px-5 py-5 text-accent-foreground shadow-[var(--quiet-shadow)] transition-all hover:-translate-y-1 hover:shadow-[var(--quiet-shadow-strong)] sm:flex-nowrap sm:px-6">
                <span className="absolute -right-16 -top-28 h-56 w-56 rounded-full border border-accent-foreground/10" />
                <div className="min-w-24"><strong className="block font-headline text-3xl font-normal">{timeInSaoPaulo(next.data_hora_sessao)}</strong><small className="text-[9px] text-accent-foreground/65">{next.duracao || 50} minutos</small></div><span className="mr-6 hidden h-12 w-px bg-accent-foreground/20 sm:block" />
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-[3px] border-accent-foreground/70 bg-background/85 text-sm font-semibold text-accent">{initials(next.nome_paciente)}</span>
                <div className="ml-4 min-w-0 flex-1"><strong className="block truncate font-headline text-xl font-normal">{next.nome_paciente || 'Próxima sessão'}</strong><span className="text-[10px] text-accent-foreground/65">Sessão clínica · {next.duracao || 50} minutos</span><small className="mt-2 flex items-center gap-1.5 text-[10px]"><Video className="h-3.5 w-3.5" /> {next.modalidade || 'Confira os detalhes na agenda'}</small></div>
                <div className="relative mt-4 flex w-full items-center justify-end gap-2 text-xs font-semibold sm:mt-0 sm:w-auto"><span>Abrir agenda</span><ArrowRight className="h-10 w-10 rounded-full bg-accent-foreground/10 p-3 transition-transform group-hover:translate-x-1" /></div>
              </Link>
            ) : (
              <Card className="border-dashed"><CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="font-headline text-xl">O horizonte está livre.</p><p className="mt-1 text-sm text-muted-foreground">Nenhuma sessão futura encontrada na sua agenda.</p></div><Button asChild><Link href="/calendar?nova=1"><Plus />Agendar sessão</Link></Button></CardContent></Card>
            )}
          </div>

          <Card><CardHeader className="flex-row items-end justify-between space-y-0 pb-2"><div><p className="page-eyebrow">Seu ritmo</p><CardTitle className="mt-1">Uma semana em equilíbrio</CardTitle></div><Button variant="ghost" size="sm" asChild><Link href="/calendar">Ver agenda <ArrowRight /></Link></Button></CardHeader><CardContent className="grid gap-6 pt-3 md:grid-cols-[190px_1fr]">
            <div><strong className="font-headline text-4xl font-normal">{thisWeek.length}</strong><p className="text-[10px] text-muted-foreground">sessões esta semana</p><CareWhisper /><span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[9px] font-semibold text-success"><Leaf className="h-3.5 w-3.5" /> {protectedBreaks} {protectedBreaks === 1 ? 'pausa protegida' : 'pausas protegidas'}</span></div>
            <div className="flex h-36 items-end justify-around gap-2 sm:gap-3">{weekDays.map((day, index) => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="flex h-full w-full max-w-8 items-end overflow-hidden rounded-lg bg-accent/5"><i className={index === weekday - 1 ? 'block w-full rounded-lg bg-primary' : 'block w-full rounded-lg bg-accent/40'} style={{ height: day.count === 0 ? '3%' : `${Math.max(12, (day.count / maxDay) * 100)}%` }} /></span><small className="text-[8px] text-muted-foreground">{day.label}</small></div>)}</div>
          </CardContent></Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><p className="page-eyebrow">Hoje</p><CardTitle className="mt-1">Minha agenda</CardTitle></div>
            <Button variant="outline" size="icon" asChild><Link href="/calendar"><ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent>
            {today.length > 0 ? (
              <div className="relative space-y-1 before:absolute before:bottom-5 before:left-[48px] before:top-5 before:w-px before:bg-border/70">
                {today.map(item => {
                  const current = item.id === next?.id;
                  const done = item.status === 'realizado';
                  const missed = item.status === 'falta';
                  const waitingForConfirmation = !done && !missed
                    && new Date(item.data_hora_sessao).getTime() + (item.duracao || 50) * 60_000 < now.getTime();
                  const statusText = done
                    ? 'Realizada'
                    : missed
                      ? 'Falta registrada'
                      : waitingForConfirmation
                        ? 'Aguardando sua confirmação'
                        : item.status === 'confirmado'
                          ? 'Confirmada'
                          : 'Agendada';
                  const markerClass = current
                    ? 'z-10 h-2 w-2 rounded-full bg-primary ring-4 ring-primary/10'
                    : done
                      ? 'z-10 text-success'
                      : missed
                        ? 'z-10 h-2 w-2 rounded-full bg-tomate ring-4 ring-tomate/10'
                        : waitingForConfirmation
                          ? 'z-10 h-2 w-2 rounded-full bg-agenda-agendada ring-4 ring-agenda-agendada/10'
                          : item.status === 'confirmado'
                            ? 'z-10 h-2 w-2 rounded-full bg-agenda-confirmada ring-4 ring-agenda-confirmada/10'
                            : 'z-10 h-2 w-2 rounded-full border-2 border-accent bg-background';

                  return (
                    <Link href="/calendar" key={item.id} className={current ? 'relative grid grid-cols-[42px_18px_1fr] items-center rounded-xl bg-primary/10 px-2 py-3' : 'relative grid grid-cols-[42px_18px_1fr] items-center rounded-xl px-2 py-3 transition-colors hover:bg-accent/5'}>
                      <span className="text-[9px] text-muted-foreground">{timeInSaoPaulo(item.data_hora_sessao)}</span>
                      <span className={markerClass}>{done && <CheckCircle2 className="h-3 w-3 -translate-x-0.5" />}</span>
                      <span className="ml-1 min-w-0">
                        <strong className="block truncate text-[11px]">{item.nome_paciente || 'Sessão clínica'}</strong>
                        <small className={waitingForConfirmation ? 'text-[9px] font-medium text-agenda-agendada-foreground' : 'text-[9px] text-muted-foreground'}>{statusText} · {item.duracao || 50} min</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : <p className="rounded-xl bg-muted/35 p-4 text-sm text-muted-foreground">Nenhuma sessão marcada para hoje.</p>}
            <Button variant="outline" className="mt-4 w-full border-dashed" asChild><Link href="/calendar?nova=1"><Plus />Adicionar horário</Link></Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

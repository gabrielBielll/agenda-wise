import Link from 'next/link';
import {
  ArrowRight, CalendarDays, CheckCircle2, FileText, Leaf,
  Plus, TrendingUp, Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CareWhisper, DailyCareGreeting } from '@/components/dashboard/DailyCareGreeting';

const today = [
  { time: '08:30', name: 'Primeira sessão', type: 'Atendimento online', done: true },
  { time: '10:00', name: 'Próximo atendimento', type: 'Terapia individual', current: true },
  { time: '13:30', name: 'Sessão confirmada', type: 'Acompanhamento' },
  { time: '15:00', name: 'Sessão confirmada', type: 'Terapia individual' },
  { time: '17:30', name: 'Último horário', type: 'Terapia individual' },
];

export default function DashboardPage() {
  return (
    <div className="quiet-page">
      <DailyCareGreeting />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="group overflow-hidden hover:shadow-[0_22px_60px_rgba(74,67,55,.11)]"><CardContent className="relative flex items-center gap-4 p-5"><span className="terra-icon"><CalendarDays className="h-5 w-5" /></span><div><p className="page-eyebrow text-muted-foreground">Sessões hoje</p><div className="mt-1 flex items-end gap-2"><strong className="font-headline text-4xl font-normal">5</strong><small className="mb-1.5 text-[10px] text-muted-foreground">Próxima em 12 minutos</small></div></div><span className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-accent/8 transition-transform duration-500 group-hover:scale-125" /></CardContent></Card>
        <Card className="group overflow-hidden hover:shadow-[0_22px_60px_rgba(74,67,55,.11)]"><CardContent className="relative flex items-center gap-4 p-5"><span className="soft-icon"><TrendingUp className="h-5 w-5" /></span><div><p className="page-eyebrow text-muted-foreground">Ocupação semanal</p><div className="mt-1 flex items-end gap-2"><strong className="font-headline text-4xl font-normal">82%</strong><small className="mb-1.5 text-[10px] text-muted-foreground">+6% nesta semana</small></div></div><span className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-primary/8 transition-transform duration-500 group-hover:scale-125" /></CardContent></Card>
        <Card className="group overflow-hidden hover:shadow-[0_22px_60px_rgba(74,67,55,.11)]"><CardContent className="relative flex items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-[14px] bg-secondary/20 text-secondary"><FileText className="h-5 w-5" /></span><div><p className="page-eyebrow text-muted-foreground">Notas pendentes</p><div className="mt-1 flex items-end gap-2"><strong className="font-headline text-4xl font-normal">2</strong><small className="mb-1.5 text-[10px] text-muted-foreground">Tudo em dia até ontem</small></div></div></CardContent></Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,.75fr)]">
        <div className="space-y-5">
          <div>
            <div className="mb-3 flex items-end justify-between"><div><p className="page-eyebrow">Em seguida</p><h3 className="section-title mt-1">Sua próxima sessão</h3></div><span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-[10px] font-semibold text-accent"><i className="h-1.5 w-1.5 rounded-full bg-accent" /> Em 12 min</span></div>
            <Link href="/calendar" className="group relative flex min-h-32 flex-wrap items-center overflow-hidden rounded-[23px] bg-primary px-6 py-5 text-primary-foreground shadow-[0_20px_48px_rgba(91,98,80,.2)] transition-all hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(91,98,80,.25)] sm:flex-nowrap">
              <span className="absolute -right-16 -top-28 h-56 w-56 rounded-full border border-white/10 shadow-[0_0_0_35px_rgba(255,255,255,.025),0_0_0_70px_rgba(255,255,255,.018)]" />
              <div className="min-w-24"><strong className="block font-headline text-3xl font-normal">10:00</strong><small className="text-[9px] text-white/60">até 10:50</small></div><span className="mr-6 hidden h-12 w-px bg-white/20 sm:block" />
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-[3px] border-white/80 bg-[#f1ded4] text-sm font-semibold text-accent">CR</span>
              <div className="ml-4 flex-1"><strong className="block font-headline text-xl font-normal">Próxima sessão</strong><span className="text-[10px] text-white/65">Terapia individual · 50 minutos</span><small className="mt-2 flex items-center gap-1.5 text-[10px]"><Video className="h-3.5 w-3.5" /> Atendimento online</small></div>
              <div className="relative mt-4 flex w-full items-center justify-end gap-2 text-xs font-semibold sm:mt-0 sm:w-auto"><span>Abrir agenda</span><ArrowRight className="h-10 w-10 rounded-full bg-white/15 p-3 transition-transform group-hover:translate-x-1" /></div>
            </Link>
          </div>

          <Card><CardHeader className="flex-row items-end justify-between space-y-0 pb-2"><div><p className="page-eyebrow">Seu ritmo</p><CardTitle className="mt-1">Uma semana em equilíbrio</CardTitle></div><Button variant="ghost" size="sm" asChild><Link href="/calendar">Ver agenda <ArrowRight /></Link></Button></CardHeader><CardContent className="grid gap-6 pt-3 md:grid-cols-[190px_1fr]">
            <div><strong className="font-headline text-4xl font-normal">21</strong><p className="text-[10px] text-muted-foreground">sessões esta semana</p><CareWhisper /><span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-semibold text-primary"><Leaf className="h-3.5 w-3.5" /> 3 pausas protegidas</span></div>
            <div className="flex h-36 items-end justify-around gap-3">{[55,78,62,94,70,18].map((height,index)=><div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="flex h-full w-full max-w-8 items-end overflow-hidden rounded-lg bg-primary/5"><i className={index===3?'block w-full rounded-lg bg-accent':'block w-full rounded-lg bg-primary/35'} style={{height:`${height}%`}} /></span><small className="text-[8px] text-muted-foreground">{['SEG','TER','QUA','QUI','SEX','SÁB'][index]}</small></div>)}</div>
          </CardContent></Card>
        </div>

        <Card className="h-fit"><CardHeader className="flex-row items-center justify-between space-y-0"><div><p className="page-eyebrow">Hoje</p><CardTitle className="mt-1">Minha agenda</CardTitle></div><Button variant="outline" size="icon" asChild><Link href="/calendar"><ArrowRight /></Link></Button></CardHeader><CardContent><div className="relative space-y-1 before:absolute before:bottom-5 before:left-[48px] before:top-5 before:w-px before:bg-border/70">{today.map(item=><Link href="/calendar" key={item.time} className={item.current?'relative grid grid-cols-[42px_18px_1fr] items-center rounded-xl bg-accent/15 px-2 py-3':'relative grid grid-cols-[42px_18px_1fr] items-center rounded-xl px-2 py-3 transition-colors hover:bg-primary/5'}><span className="text-[9px] text-muted-foreground">{item.time}</span><span className={item.current?'z-10 h-2 w-2 rounded-full bg-accent ring-4 ring-accent/10':item.done?'z-10 text-primary':'z-10 h-2 w-2 rounded-full border-2 border-primary bg-background'}>{item.done&&<CheckCircle2 className="h-3 w-3 -translate-x-0.5" />}</span><span className="ml-1"><strong className="block text-[11px]">{item.name}</strong><small className="text-[9px] text-muted-foreground">{item.type}</small></span></Link>)}</div><Button variant="outline" className="mt-4 w-full border-dashed" asChild><Link href="/calendar?nova=1"><Plus />Adicionar horário</Link></Button></CardContent></Card>
      </section>
    </div>
  );
}

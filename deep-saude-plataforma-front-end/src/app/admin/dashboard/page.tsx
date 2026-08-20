export const dynamic = 'force-dynamic';
export const revalidate = 0;

import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { BriefcaseMedical, CalendarClock, DollarSign, Leaf, TrendingUp, Users } from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FalhaDeCarregamento } from '@/components/FalhaDeCarregamento';
import { authOptions } from '@/lib/auth';
import { carregar } from '@/lib/carregar';

interface AgendamentoDashboard {
  id: string;
  data_hora_sessao: string;
  valor_consulta: number | string;
  status?: string;
  status_pagamento?: 'pendente' | 'pago';
  nome_paciente?: string;
  nome_psicologo?: string;
}

const dateParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return { year: Number(read('year')), month: Number(read('month')), day: Number(read('day')), key: `${read('year')}-${read('month')}-${read('day')}` };
};

const formatSession = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  if (!token) redirect('/admin/login?expired=true');

  const porta = { porta: '/admin/login' };
  const [psicologos, pacientes, agendamentos] = await Promise.all([
    carregar<unknown[]>('/api/psicologos', token, porta),
    carregar<unknown[]>('/api/pacientes', token, porta),
    carregar<AgendamentoDashboard[]>('/api/agendamentos', token, porta),
  ]);

  if (!psicologos.ok) return <FalhaDeCarregamento motivo={psicologos.motivo} oQue="os dados do dashboard" />;
  if (!pacientes.ok) return <FalhaDeCarregamento motivo={pacientes.motivo} oQue="os dados do dashboard" />;
  if (!agendamentos.ok) return <FalhaDeCarregamento motivo={agendamentos.motivo} oQue="os dados do dashboard" />;

  const now = new Date();
  const today = dateParts(now);
  const validSessions = agendamentos.dados.filter(item => item.status !== 'cancelado');
  const consultasHoje = validSessions.filter(item => dateParts(new Date(item.data_hora_sessao)).key === today.key).length;
  const paid = agendamentos.dados.filter(item => item.status_pagamento === 'pago');
  const receitaMes = paid
    .filter(item => { const date = dateParts(new Date(item.data_hora_sessao)); return date.year === today.year && date.month === today.month; })
    .reduce((total, item) => total + Number(item.valor_consulta || 0), 0);
  const previousMonthDate = new Date(today.year, today.month - 2, 1);
  const previous = dateParts(previousMonthDate);
  const receitaAnterior = paid
    .filter(item => { const date = dateParts(new Date(item.data_hora_sessao)); return date.year === previous.year && date.month === previous.month; })
    .reduce((total, item) => total + Number(item.valor_consulta || 0), 0);
  const growth = receitaAnterior > 0 ? Math.round(((receitaMes - receitaAnterior) / receitaAnterior) * 100) : null;
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaMes);

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    const parts = dateParts(date);
    const count = validSessions.filter(item => dateParts(new Date(item.data_hora_sessao)).key === parts.key).length;
    const label = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(date).replace('.', '').toUpperCase();
    return { ...parts, count, label };
  });
  const maxDay = Math.max(1, ...lastSevenDays.map(day => day.count));
  const upcoming = validSessions
    .filter(item => new Date(item.data_hora_sessao).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.data_hora_sessao).getTime() - new Date(b.data_hora_sessao).getTime())
    .slice(0, 4);

  return (
    <div className="quiet-page py-2 sm:py-4">
      <section><p className="page-eyebrow mb-2">Visão da clínica</p><h1 className="page-title">Tudo em harmonia.</h1><p className="page-subtitle">Sinais essenciais da operação, calculados com os dados atuais da clínica.</p></section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Psicólogos" value={psicologos.dados.length} icon={Users} description="Profissionais cadastrados" colorVariant="primary" />
        <StatsCard title="Pacientes" value={pacientes.dados.length} icon={BriefcaseMedical} description="Pessoas cadastradas" colorVariant="success" />
        <StatsCard title="Consultas hoje" value={consultasHoje} icon={CalendarClock} description="Sessões não canceladas" colorVariant="warning" />
        <StatsCard title="Receita recebida" value={currency} icon={DollarSign} description="Pagamentos confirmados no mês" footerIcon={growth === null ? undefined : TrendingUp} footerText={growth === null ? 'Sem base no mês anterior' : `${growth >= 0 ? '+' : ''}${growth}% sobre o mês anterior`} colorVariant="success" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <Card>
          <CardHeader><p className="page-eyebrow">Últimos 7 dias</p><CardTitle>Ritmo de atendimentos</CardTitle><CardDescription>Sessões não canceladas registradas na agenda.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex h-[250px] items-end justify-around gap-1 rounded-2xl bg-accent/5 p-3 sm:h-[280px] sm:gap-4 sm:p-6">
              {lastSevenDays.map((day, index) => (
                <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-3">
                  <span className="relative flex h-full w-full max-w-12 items-end overflow-hidden rounded-xl bg-card/60" title={`${day.count} sessões`}>
                    <i className={index === 6 ? 'block w-full rounded-xl bg-primary' : 'block w-full rounded-xl bg-accent/55'} style={{ height: day.count === 0 ? '3%' : `${Math.max(12, (day.count / maxDay) * 100)}%` }} />
                  </span>
                  <small className="max-w-full truncate text-[8px] text-muted-foreground sm:text-[9px]">{day.label}</small>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><p className="page-eyebrow">A seguir</p><CardTitle>Próximos encontros</CardTitle><CardDescription>As sessões mais próximas na agenda da equipe.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length > 0 ? upcoming.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent/5">
                <span className={index === 0 ? 'h-2 w-2 shrink-0 rounded-full bg-primary' : 'h-2 w-2 shrink-0 rounded-full bg-accent/55'} />
                <div className="min-w-0"><strong className="block truncate text-xs">{item.nome_paciente || 'Paciente sem nome'}</strong><small className="block truncate text-[10px] text-muted-foreground">{formatSession(item.data_hora_sessao)}{item.nome_psicologo ? ` · ${item.nome_psicologo}` : ''}</small></div>
              </div>
            )) : <p className="rounded-xl bg-muted/35 p-4 text-sm text-muted-foreground">Nenhuma sessão futura encontrada.</p>}
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-success/10 p-3 text-success"><Leaf className="h-4 w-4" /><span className="text-[10px] font-semibold">Dados sincronizados com a operação da clínica</span></div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

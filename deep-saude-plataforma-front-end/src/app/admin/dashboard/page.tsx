export const dynamic = 'force-dynamic';
export const revalidate = 0;

import React from 'react';
import { BriefcaseMedical, CalendarClock, DollarSign, Leaf, TrendingUp, Users } from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

async function getDashboardData() {
  await new Promise(resolve => setTimeout(resolve, 150));
  return { totalPsicologos: 12, totalPacientes: 157, consultasHoje: 8, receitaMes: 2560000, crescimentoMensalPercent: 15 };
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardData();
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.receitaMes / 100);
  const activity = [
    ['Novo paciente cadastrado', 'Maria Silva · há 5 min', 'bg-accent'],
    ['Consulta concluída', 'Agenda atualizada · há 15 min', 'bg-primary'],
    ['Novo agendamento', 'Para amanhã às 10:00 · há 1 h', 'bg-secondary'],
    ['Relatório mensal gerado', 'Financeiro · há 2 h', 'bg-primary/50'],
  ];
  return (
    <div className="quiet-page py-4">
      <section><p className="page-eyebrow mb-2">Visão da clínica</p><h1 className="page-title">Tudo em harmonia.</h1><p className="page-subtitle">Acompanhe os sinais essenciais da operação Deep Saúde.</p></section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Psicólogos" value={stats.totalPsicologos} icon={Users} description="Profissionais ativos" colorVariant="primary" />
        <StatsCard title="Pacientes" value={stats.totalPacientes} icon={BriefcaseMedical} description="Pessoas cadastradas" colorVariant="success" />
        <StatsCard title="Consultas hoje" value={stats.consultasHoje} icon={CalendarClock} description="Agendamentos confirmados" colorVariant="warning" />
        <StatsCard title="Receita do mês" value={currency} icon={DollarSign} description={`+${stats.crescimentoMensalPercent}% sobre o mês anterior`} footerIcon={TrendingUp} footerText="Crescimento saudável" colorVariant="success" />
      </section>
      <section className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <Card><CardHeader><p className="page-eyebrow">Últimos 7 dias</p><CardTitle>Ritmo de atendimentos</CardTitle><CardDescription>Volume diário de sessões realizadas pela clínica.</CardDescription></CardHeader><CardContent><div className="flex h-[280px] items-end justify-around gap-4 rounded-2xl bg-primary/5 p-6">{[52,76,63,88,70,40,24].map((height,index)=><div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-3"><span className="flex h-full w-full max-w-12 items-end overflow-hidden rounded-xl bg-white/55"><i className={index===3?'block w-full rounded-xl bg-accent':'block w-full rounded-xl bg-primary/40'} style={{height:`${height}%`}} /></span><small className="text-[9px] text-muted-foreground">{['SEG','TER','QUA','QUI','SEX','SÁB','DOM'][index]}</small></div>)}</div></CardContent></Card>
        <Card><CardHeader><p className="page-eyebrow">Agora</p><CardTitle>Atividades recentes</CardTitle><CardDescription>Movimentos importantes no sistema.</CardDescription></CardHeader><CardContent className="space-y-2">{activity.map(([title,description,color])=><div key={title} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-primary/5"><span className={`h-2 w-2 rounded-full ${color}`} /><div><strong className="block text-xs">{title}</strong><small className="text-[10px] text-muted-foreground">{description}</small></div></div>)}<div className="mt-5 flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-primary"><Leaf className="h-4 w-4" /><span className="text-[10px] font-semibold">Operação funcionando normalmente</span></div></CardContent></Card>
      </section>
    </div>
  );
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

import React from 'react';
import { Users, BriefcaseMedical, CalendarClock, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

// Componentes Card simples sem dependências problemáticas
function SimpleCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`rounded-lg border bg-white dark:bg-gray-800 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SimpleCardHeader({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
      {children}
    </div>
  );
}

function SimpleCardTitle({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <h3 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

function SimpleCardDescription({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <p className={`text-sm text-gray-600 dark:text-gray-400 ${className}`}>
      {children}
    </p>
  );
}

function SimpleCardContent({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`p-6 pt-0 ${className}`}>
      {children}
    </div>
  );
}

// Componente StatsCard inline
function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  footerText, 
  footerIcon: FooterIcon, 
  colorVariant = 'default' 
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  footerText?: string;
  footerIcon?: React.ElementType;
  colorVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'default';
}) {
  const getVariantClasses = () => {
    switch (colorVariant) {
      case 'primary':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800';
      case 'danger':
        return 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800';
      default:
        return 'bg-white dark:bg-gray-800';
    }
  };

  const getIconColor = () => {
    switch (colorVariant) {
      case 'primary':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'danger':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <SimpleCard className={getVariantClasses()}>
      <SimpleCardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <SimpleCardTitle className="text-sm font-medium">{title}</SimpleCardTitle>
        <Icon className={`h-5 w-5 ${getIconColor()}`} />
      </SimpleCardHeader>
      <SimpleCardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        )}
        {(footerText || FooterIcon) && (
          <div className="flex items-center mt-2 text-xs text-gray-600 dark:text-gray-400">
            {FooterIcon && <FooterIcon className={`h-3 w-3 mr-1 ${getIconColor()}`} />}
            {footerText && <span>{footerText}</span>}
          </div>
        )}
      </SimpleCardContent>
    </SimpleCard>
  );
}

// Estrutura de dados
interface DashboardStats {
  totalPsicologos: number;
  totalPacientes: number;
  consultasHoje: number;
  receitaMes: number;
  crescimentoMensalPercent: number;
  previsaoProximoMes: number;
}

// Função para buscar dados mock
async function getDashboardData(): Promise<DashboardStats> {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    totalPsicologos: 12,
    totalPacientes: 157,
    consultasHoje: 8,
    receitaMes: 2560000, // R$ 25.600,00 (em centavos)
    crescimentoMensalPercent: 15, // 15%
    previsaoProximoMes: 2800000, // R$ 28.000,00
  };
}

// Componente principal
export default async function AdminDashboardPage() {
  const stats = await getDashboardData();

  const formatCurrency = (valueInCents: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(valueInCents / 100);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
          Dashboard Administrativo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Visão geral e métricas da sua clínica.
        </p>
      </div>

      {/* Grid de Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total de Psicólogos"
          value={stats.totalPsicologos}
          icon={Users}
          description="Psicólogos ativos na plataforma."
          colorVariant="primary"
        />
        <StatsCard
          title="Total de Pacientes"
          value={stats.totalPacientes}
          icon={BriefcaseMedical}
          description="Pacientes cadastrados."
          colorVariant="primary"
        />
        <StatsCard
          title="Consultas Hoje"
          value={stats.consultasHoje}
          icon={CalendarClock}
          description="Agendamentos confirmados para hoje."
          colorVariant="warning"
        />
        <StatsCard
          title="Receita do Mês"
          value={formatCurrency(stats.receitaMes)}
          icon={DollarSign}
          description={`${stats.crescimentoMensalPercent >= 0 ? '+' : ''}${stats.crescimentoMensalPercent}% em relação ao mês anterior`}
          footerIcon={stats.crescimentoMensalPercent >= 0 ? TrendingUp : TrendingDown}
          colorVariant={stats.crescimentoMensalPercent >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Seção de Gráficos e Tabelas */}
      <div className="grid gap-6 md:grid-cols-2">
        <SimpleCard>
          <SimpleCardHeader>
            <SimpleCardTitle>Agendamentos (Últimos 7 Dias)</SimpleCardTitle>
            <SimpleCardDescription>Visualização do volume de agendamentos.</SimpleCardDescription>
          </SimpleCardHeader>
          <SimpleCardContent>
            <div className="h-[300px] w-full bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400">
                Gráfico de Agendamentos (Recharts) - Em breve
              </p>
            </div>
          </SimpleCardContent>
        </SimpleCard>
        
        <SimpleCard>
          <SimpleCardHeader>
            <SimpleCardTitle>Atividades Recentes</SimpleCardTitle>
            <SimpleCardDescription>Últimas ações importantes no sistema.</SimpleCardDescription>
          </SimpleCardHeader>
          <SimpleCardContent>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">Novo paciente cadastrado: Maria Silva</p>
                  <p className="text-xs text-gray-500">5 min atrás</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">Consulta realizada: Dr. João Santos</p>
                  <p className="text-xs text-gray-500">15 min atrás</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">Agendamento criado para amanhã</p>
                  <p className="text-xs text-gray-500">1 hora atrás</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">Relatório mensal gerado</p>
                  <p className="text-xs text-gray-500">2 horas atrás</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-gray-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">Backup automático concluído</p>
                  <p className="text-xs text-gray-500">3 horas atrás</p>
                </div>
              </div>
            </div>
          </SimpleCardContent>
        </SimpleCard>
      </div>

      {/* Card de Previsão */}
      <div className="grid gap-4">
        <StatsCard
          title="Previsão Próximo Mês"
          value={formatCurrency(stats.previsaoProximoMes)}
          icon={DollarSign}
          footerText="Baseado em tendências atuais"
          colorVariant="default"
        />
      </div>
    </div>
  );
}

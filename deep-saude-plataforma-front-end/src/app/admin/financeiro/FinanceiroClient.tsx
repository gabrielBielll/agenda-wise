"use client";

import React, { useState, useMemo } from "react";
import { format, parseISO, isSameMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from "recharts";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, DollarSign, Calendar as CalendarIcon, Filter } from "lucide-react";

interface Agendamento {
  id: string;
  data_hora_sessao: string;
  valor_consulta: number;
  paciente_id: string;
  nome_paciente?: string;
  psicologo_id?: string;
  nome_psicologo?: string;
  status?: string;
}

interface FinanceiroClientProps {
  initialAgendamentos: Agendamento[];
}

export default function FinanceiroClient({ initialAgendamentos }: FinanceiroClientProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Filter appointments for the selected month
  const filteredData = useMemo(() => {
    return initialAgendamentos
      .filter(ag => {
        const agDate = parseISO(ag.data_hora_sessao);
        return isSameMonth(agDate, currentDate);
      })
      .sort((a, b) => new Date(b.data_hora_sessao).getTime() - new Date(a.data_hora_sessao).getTime());
  }, [initialAgendamentos, currentDate]);

  // Calculate stats
  const totalReceita = filteredData.reduce((acc, curr) => acc + (Number(curr.valor_consulta) || 0), 0);
  const totalAtendimentos = filteredData.length;

  // Prepare data for chart (group by day)
  const chartData = useMemo(() => {
    const dailyData: Record<string, number> = {};
    
    // Initialize all days of month with 0 (optional, but looks better)
    // For simplicity, let's just show days that have data or maybe just list them in order
    
    filteredData.forEach(ag => {
      const day = format(parseISO(ag.data_hora_sessao), "dd/MM");
      dailyData[day] = (dailyData[day] || 0) + (Number(ag.valor_consulta) || 0);
    });

    return Object.entries(dailyData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        // Simple sort by day string "dd/MM" works if within same month
        const dayA = parseInt(a.name.split('/')[0]);
        const dayB = parseInt(b.name.split('/')[0]);
        return dayA - dayB;
      });
  }, [filteredData]);

  const handlePrevMonth = () => setCurrentDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentDate(prev => addMonths(prev, 1));

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Gestão financeira e visão geral de receitas.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-card p-1 rounded-lg border shadow-sm">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-40 text-center font-medium">
                {format(currentDate, "MMMM yyyy", { locale: ptBR }).toUpperCase()}
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalReceita)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total no período selecionado
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atendimentos</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAtendimentos}</div>
            <p className="text-xs text-muted-foreground">
              Sessões agendadas/realizadas
            </p>
          </CardContent>
        </Card>

         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {formatCurrency(totalAtendimentos > 0 ? totalReceita / totalAtendimentos : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Média por atendimento
            </p>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Evolução da Receita</CardTitle>
            <CardDescription>Visualização diária da receita no mês.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `R$${value}`} 
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#16a34a" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorReceita)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Transações</CardTitle>
          <CardDescription>Lista detalhada de todos os registros do mês.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Psicólogo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length > 0 ? (
                filteredData.map((ag) => (
                  <TableRow key={ag.id}>
                    <TableCell className="font-medium">
                        <div className="flex flex-col">
                            <span>{format(parseISO(ag.data_hora_sessao), "dd/MM/yyyy")}</span>
                            <span className="text-xs text-muted-foreground">{format(parseISO(ag.data_hora_sessao), "HH:mm")}</span>
                        </div>
                    </TableCell>
                    <TableCell>{ag.nome_paciente || "Não informado"}</TableCell>
                    <TableCell>{ag.nome_psicologo || "Não informado"}</TableCell>
                    <TableCell>
                        <Badge variant={ag.status === 'cancelado' ? 'destructive' : 'secondary'}>
                            {ag.status || 'Agendado'}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-700">
                      {formatCurrency(Number(ag.valor_consulta))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                    Nenhum registro encontrado para este mês.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TrendingUpIcon(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    )
  }

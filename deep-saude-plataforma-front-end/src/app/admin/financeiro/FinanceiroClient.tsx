"use client";

import React, { useState, useMemo } from "react";
import { format, parseISO, isSameMonth, subMonths, addMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
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
  // Configuração inicial: dataRage cobrindo o mês atual
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
  });
  
  const [selectedPsicologo, setSelectedPsicologo] = useState<string>("all");
  const [selectedPaciente, setSelectedPaciente] = useState<string>("all");
  
  // Extract unique options for filters
  const psicologos = useMemo(() => {
    const unique = new Set(initialAgendamentos.map(ag => ag.nome_psicologo).filter(Boolean));
    return Array.from(unique).sort();
  }, [initialAgendamentos]);

  const pacientes = useMemo(() => {
    const unique = new Set(initialAgendamentos.map(ag => ag.nome_paciente).filter(Boolean));
    return Array.from(unique).sort();
  }, [initialAgendamentos]);

  // Filter appointments
  const filteredData = useMemo(() => {
    if (!dateRange?.from) return [];

    return initialAgendamentos
      .filter(ag => {
        const agDate = parseISO(ag.data_hora_sessao);
        
        // Filter by Date Range (inclusive)
        // Set 'from' to start of day and 'to' to end of day to be inclusive
        const start = new Date(dateRange.from!);
        start.setHours(0, 0, 0, 0);
        
        let end = new Date(dateRange.to || dateRange.from!); // If no 'to', assume single day
        end.setHours(23, 59, 59, 999);
        
        const matchesDate = agDate >= start && agDate <= end;
        const matchesPsicologo = selectedPsicologo === "all" || ag.nome_psicologo === selectedPsicologo;
        const matchesPaciente = selectedPaciente === "all" || ag.nome_paciente === selectedPaciente;
        
        return matchesDate && matchesPsicologo && matchesPaciente;
      })
      .sort((a, b) => new Date(b.data_hora_sessao).getTime() - new Date(a.data_hora_sessao).getTime());
  }, [initialAgendamentos, dateRange, selectedPsicologo, selectedPaciente]);

  // Calculate stats
  const totalReceita = filteredData.reduce((acc, curr) => acc + (Number(curr.valor_consulta) || 0), 0);
  const totalAtendimentos = filteredData.length;

  // Prepare data for chart (group by day)
  const chartData = useMemo(() => {
    const dailyData: Record<string, number> = {};
    
    filteredData.forEach(ag => {
      const day = format(parseISO(ag.data_hora_sessao), "dd/MM");
      dailyData[day] = (dailyData[day] || 0) + (Number(ag.valor_consulta) || 0);
    });

    return Object.entries(dailyData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const dayA = parseInt(a.name.split('/')[0]);
        const dayB = parseInt(b.name.split('/')[0]);
        return dayA - dayB;
      });
  }, [filteredData]);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
            <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
            <p className="text-muted-foreground">Gestão financeira e visão geral de receitas.</p>
            </div>
            
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center bg-card p-4 rounded-lg border">
            <div className="flex items-center gap-2 mr-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
            </div>
            
            <DatePickerWithRange date={dateRange} setDate={setDateRange} />

            <Select value={selectedPsicologo} onValueChange={setSelectedPsicologo}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todos os Psicólogos" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Psicólogos</SelectItem>
                    {psicologos.map((name) => (
                        <SelectItem key={name} value={name as string}>{name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={selectedPaciente} onValueChange={setSelectedPaciente}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todos os Pacientes" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Pacientes</SelectItem>
                    {pacientes.map((name) => (
                        <SelectItem key={name} value={name as string}>{name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {(selectedPsicologo !== "all" || selectedPaciente !== "all" || (dateRange?.from && !isSameMonth(dateRange.from, new Date()))) && (
                <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                        setSelectedPsicologo("all");
                        setSelectedPaciente("all");
                        setDateRange({
                            from: startOfMonth(new Date()),
                            to: endOfMonth(new Date()),
                        });
                    }}
                    className="text-muted-foreground"
                >
                    Redefinir Filtros
                </Button>
            )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Filtrada</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalReceita)}
            </div>
            <p className="text-xs text-muted-foreground">
              {dateRange?.from ? `${format(dateRange.from, "dd/MM")} - ${format(dateRange.to || dateRange.from, "dd/MM")}` : "Período selecionado"}
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
              Média por atendimento filtrado
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

      {/* Breakdown by Psychologist */}
      <Card>
        <CardHeader>
            <CardTitle>Faturamento por Psicólogo</CardTitle>
            <CardDescription>Receita total gerada por cada profissional neste mês.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Psicólogo</TableHead>
                        <TableHead className="text-right">Sessões</TableHead>
                        <TableHead className="text-right">Total Gerado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Object.entries(
                        filteredData.reduce((acc, curr) => {
                            const name = curr.nome_psicologo || "Desconhecido";
                            if (!acc[name]) acc[name] = { total: 0, count: 0 };
                            acc[name].total += Number(curr.valor_consulta) || 0;
                            acc[name].count += 1;
                            return acc;
                        }, {} as Record<string, { total: number; count: number }>)
                    )
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([name, stats]) => (
                        <TableRow key={name}>
                            <TableCell className="font-medium">{name}</TableCell>
                            <TableCell className="text-right">{stats.count}</TableCell>
                            <TableCell className="text-right font-bold text-green-700">
                                {formatCurrency(stats.total)}
                            </TableCell>
                        </TableRow>
                    ))}
                    {filteredData.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                Sem dados para exibir.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

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

import React from 'react';
import { cookies } from 'next/headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";

interface Agendamento {
  id: string;
  data_hora_sessao: string;
  valor_consulta: number;
  paciente_id: string; // Could fetch name if I join, but for MVP ID is okay or maybe I can join in backend?
  // Backend listing returns * from agendamentos.
  // It relies on core.clj `listar-agendamentos-handler`.
  // `listar-agendamentos-handler`: `SELECT * FROM agendamentos ...`.
  // It does NOT join with patients.
  // For MVP, showing a list with date/value is getting barely acceptable.
  // Ideally I should join.
}

// Let's improve the backend handler for agendamentos to join with patients?
// Or just show ID/Value for now to be fast?
// User asked for "MVP funcional". Showing "Patient ID" is ugly.
// But changing backend again might take time.
// Wait, `listar-prontuarios` joins. `listar-pacientes` joins.
// `listar-agendamentos` (Step 144 line 338) does NOT join.
// `SELECT * FROM agendamentos ...`
// I will implement client-side fetch of patients? No, expensive.
// I will show Date and Value for now, maybe "Atendimento" as title.
// Actually, let's check if I can quickly update `core.clj` to join.
// The task "Implement Basic Financeiro" allows for quick backend tweaks.
// But given time, maybe I'll verify if `agendamentos` table has name? No.
// I'll stick to Date and Value. It's "Basic" Financeiro.

async function getAgendamentos(token: string): Promise<Agendamento[]> {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar financeiro:", error);
    return [];
  }
}

export default async function AdminFinanceiroPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sessionToken')?.value;

  if (!token) return <p>Não autorizado.</p>;

  const agendamentos = await getAgendamentos(token);

  // Calcular totais
  const totalReceita = agendamentos.reduce((acc, curr) => acc + Number(curr.valor_consulta), 0);
  
  // Agrupar por mês? MVP: Total Geral e Lista.

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Visão geral dos atendimentos e receitas.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total Estimada</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceita)}
            </div>
            <p className="text-xs text-muted-foreground">Baseado em {agendamentos.length} agendamentos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Lançamentos</CardTitle>
          <CardDescription>Lista de atendimentos realizados/agendados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agendamentos.length > 0 ? (
                agendamentos.map((ag) => (
                  <TableRow key={ag.id}>
                    <TableCell>{new Date(ag.data_hora_sessao).toLocaleString('pt-BR')}</TableCell>
                    <TableCell>Sessão de Terapia</TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(ag.valor_consulta))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                    Nenhum registro financeiro encontrado.
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

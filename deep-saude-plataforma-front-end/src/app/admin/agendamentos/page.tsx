import React from 'react';
import { cookies } from 'next/headers';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, PlusCircle, AlertTriangle } from "lucide-react";

interface Agendamento {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_hora_sessao: string;
  valor_consulta: number;
}

// Helper para formatar data (assumindo ISO do backend ou timestamp)
const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleString('pt-BR');
  } catch (e) {
    return dateString;
  }
};

async function getAgendamentos(token: string): Promise<Agendamento[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

export default async function AdminAgendamentosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sessionToken')?.value;
  
  if (!token) return <p>Não autorizado.</p>;
  
  const agendamentos = await getAgendamentos(token);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5"/> Agendamentos</CardTitle>
            <CardDescription>Visualize e gerencie os agendamentos da clínica.</CardDescription>
          </div>
          <Button asChild>
            <Link href="/admin/agendamentos/novo">
              <PlusCircle className="mr-2 h-4 w-4" />
              Novo Agendamento
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Valor (R$)</TableHead>
              <TableHead className="text-right">ID (Debug)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agendamentos.length > 0 ? (
              agendamentos.map((ag) => (
                <TableRow key={ag.id}>
                  <TableCell>{formatDate(ag.data_hora_sessao)}</TableCell>
                  <TableCell>{Number(ag.valor_consulta).toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{ag.id.substring(0, 8)}...</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                  Nenhum agendamento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

"use client";

import React, { useState } from 'react';
import Link from "next/link";
import { DeleteAgendamentoButton } from "./DeleteAgendamentoButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, PlusCircle, AlertTriangle, Pencil, Search } from "lucide-react";

interface Agendamento {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_hora_sessao: string;
  valor_consulta: number;
  nome_paciente?: string;
  nome_psicologo?: string;
}

interface Item {
  id: string;
  nome: string;
}

// Helper para formatar data (assumindo ISO do backend ou timestamp)
const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleString('pt-BR');
  } catch (e) {
    return dateString;
  }
};

export default function AgendamentosClient({ 
  agendamentos, 
  pacientes, 
  psicologos 
}: { 
  agendamentos: Agendamento[], 
  pacientes: Item[], 
  psicologos: Item[] 
}) {
  const [selectedPaciente, setSelectedPaciente] = useState<string>("all");
  const [selectedPsicologo, setSelectedPsicologo] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const filteredAgendamentos = agendamentos.filter(ag => {
    const matchPaciente = selectedPaciente === "all" || ag.paciente_id === selectedPaciente;
    const matchPsicologo = selectedPsicologo === "all" || ag.psicologo_id === selectedPsicologo;
    
    const term = searchTerm.toLowerCase();
    const matchSearch = 
      (ag.nome_paciente?.toLowerCase() || "").includes(term) ||
      (ag.nome_psicologo?.toLowerCase() || "").includes(term);

    let matchDate = true;
    if (selectedDate) {
      // selectedDate comes from input type="date" as YYYY-MM-DD
      // ag.data_hora_sessao is an ISO string or timestamp from backend
      // We need to compare them in the local timezone or consistent timezone
      
      const agDateObj = new Date(ag.data_hora_sessao);
      // Create a string in YYYY-MM-DD format using local time
      const year = agDateObj.getFullYear();
      const month = String(agDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(agDateObj.getDate()).padStart(2, '0');
      const agDateString = `${year}-${month}-${day}`;
      
      matchDate = agDateString === selectedDate;
    }

    return matchPaciente && matchPsicologo && matchSearch && matchDate;
  });

  console.log("DEBUG: AgendamentosClient render. Total:", agendamentos.length, "Filtered:", filteredAgendamentos.length);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
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
        
        <div className="flex flex-col md:flex-row gap-4 mt-4">
          <div className="w-full md:w-1/4 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-1/4">
             <input
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="w-full md:w-1/4">
             <Select value={selectedPaciente} onValueChange={setSelectedPaciente}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por Paciente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Pacientes</SelectItem>
                {pacientes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-1/4">
            <Select value={selectedPsicologo} onValueChange={setSelectedPsicologo}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por Psicólogo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Psicólogos</SelectItem>
                {psicologos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Psicólogo</TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Valor (R$)</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAgendamentos.length > 0 ? (
              filteredAgendamentos.map((ag) => (
                <TableRow key={ag.id}>
                  <TableCell>{ag.nome_paciente || 'N/A'}</TableCell>
                  <TableCell>{ag.nome_psicologo || 'N/A'}</TableCell>
                  <TableCell>{formatDate(ag.data_hora_sessao)}</TableCell>
                  <TableCell>{Number(ag.valor_consulta).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/agendamentos/${ag.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <DeleteAgendamentoButton id={ag.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                  Nenhum agendamento encontrado com os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

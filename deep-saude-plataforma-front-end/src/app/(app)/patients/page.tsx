"use client";

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ArrowRight, Leaf, Loader2, AlertTriangle, UserPlus, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { deletePaciente, getPacientes } from "./actions";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Interface do Paciente que esperamos da API
interface Patient {
  id: string;
  nome: string;
  email: string | null;
  lastSession?: string; // Futuramente virá dos agendamentos
  avatar_url?: string | null;
  status?: string;
}

export default function PatientsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ativo");

  const fetchPatientsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPacientes();
      console.log("PatientsPage: Resultado do getPacientes:", result);
      
      if (result.success && result.data) {
        setPatients(result.data);
      } else {
        throw new Error(result.error || 'Falha ao buscar os dados dos pacientes.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchPatientsData();
    } else if (sessionStatus === 'unauthenticated') {
      // Opcional: Redirecionar ou mostrar erro
      setError("Usuário não autenticado.");
      setLoading(false);
    }
  }, [sessionStatus]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const handleDelete = async (patientId: string, patientName: string) => {
    if (!confirm(`Tem certeza que deseja remover o paciente "${patientName}"?`)) {
      return;
    }

    setDeletingId(patientId);
    startTransition(async () => {
      const result = await deletePaciente(patientId);
      if (result.success) {
        toast({ title: "Sucesso!", description: result.message });
        setPatients(prev => prev.filter(p => p.id !== patientId));
      } else {
        toast({ title: "Erro ao Remover", description: result.message, variant: "destructive" });
      }
      setDeletingId(null);
    });
  };
  
  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.nome.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Tratamento de status: se não tiver status, assume 'ativo'
    const patientStatus = patient.status || 'ativo';
    const matchesStatus = statusFilter === "todos" || patientStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Buscando seus pacientes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle/> Erro ao Carregar Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="font-headline text-3xl">Meus Pacientes</CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Gerencie os pacientes vinculados a você.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/patients/new">
                <UserPlus className="mr-2 h-4 w-4" />
                Novo Paciente
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Pesquisar pacientes por nome..."
                className="pl-10 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredPatients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPatients.map((patient) => (
                <Card key={patient.id} className="shadow-md hover:shadow-lg transition-shadow flex flex-col">
                  <CardHeader className="flex flex-row items-start space-x-4">
                    <Avatar className="h-12 w-12 mt-1">
                      <AvatarImage src={patient.avatar_url || ''} alt={patient.nome} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">{getInitials(patient.nome)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <CardTitle className="font-headline text-xl truncate pr-2">{patient.nome}</CardTitle>
                        <Badge variant={patient.status === 'inativo' ? 'secondary' : 'default'} className="shrink-0">
                          {patient.status === 'inativo' ? 'Inativo' : 'Ativo'}
                        </Badge>
                      </div>
                      {patient.lastSession && <CardDescription>Última Sessão: {new Date(patient.lastSession).toLocaleDateString('pt-BR')}</CardDescription>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">Clique para ver o perfil detalhado e as notas de sessão.</p>
                  </CardContent>
                  <CardFooter className="flex justify-between items-center pt-4 border-t">
                    <div className="flex gap-2">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(patient.id, patient.nome)}
                        disabled={deletingId === patient.id}
                      >
                        {deletingId === patient.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/patients/${patient.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <Button variant="default" size="sm" asChild>
                      <Link href={`/patients/${patient.id}`}>
                        Ver Perfil <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Leaf className="mx-auto h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="font-headline text-xl text-muted-foreground">Nenhum paciente encontrado com esses filtros.</p>
              <p className="text-sm text-muted-foreground mb-4">
               {statusFilter === 'ativo' ? "Você não tem pacientes ativos no momento." : "Tente ajustar os filtros de pesquisa."}
              </p>
              <Button asChild>
                <Link href="/patients/new">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Adicionar Primeiro Paciente
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { PlusCircle, Edit, Trash2, AlertTriangle, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { deletePaciente } from './actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  nome_psicologo: string | null;
}

export default function ClientComponent({
  initialData,
  error,
}: {
  initialData: Paciente[];
  error?: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pacientes, setPacientes] = useState(initialData);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPsicologo, setSelectedPsicologo] = useState<string>("all");

  // Extrair lista única de psicólogos
  const psicologos = React.useMemo(() => {
    const unique = new Set(pacientes.map(p => p.nome_psicologo).filter(Boolean));
    return Array.from(unique).sort();
  }, [pacientes]);

  const filteredPacientes = pacientes.filter(paciente => {
    const matchesSearch = searchTerm.length < 3 || paciente.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPsicologo = selectedPsicologo === "all" || paciente.nome_psicologo === selectedPsicologo || (selectedPsicologo === "none" && !paciente.nome_psicologo);
    
    return matchesSearch && matchesPsicologo;
  });

  const handleDelete = (pacienteId: string) => {
    startTransition(async () => {
      const result = await deletePaciente(pacienteId);
      if (result.success) {
        setPacientes(currentPacientes => currentPacientes.filter(p => p.id !== pacienteId));
        toast({
          title: "Sucesso!",
          description: result.message,
        });
      } else {
        toast({
          title: "Erro",
          description: result.message,
          variant: "destructive",
        });
      }
    });
  };

  if (error) {
    return (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle/> Erro ao Carregar Dados</CardTitle>
            <CardDescription>Não foi possível buscar os pacientes da sua clínica.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gestão de Pacientes</CardTitle>
            <CardDescription>Adicione, edite e gerencie os pacientes da clínica.</CardDescription>
          </div>
          <Button asChild>
            <Link href="/admin/pacientes/novo">
              <PlusCircle className="mr-2 h-4 w-4" />
              Adicionar Paciente
            </Link>
          </Button>
        </div>
        <div className="mt-4 flex flex-col md:flex-row gap-4">
          <Input
            placeholder="Buscar paciente (mínimo 3 letras)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="md:max-w-sm w-full"
          />
          <Select value={selectedPsicologo} onValueChange={setSelectedPsicologo}>
            <SelectTrigger className="w-full md:w-[280px]">
              <SelectValue placeholder="Filtrar por Psicólogo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Psicólogos</SelectItem>
              <SelectItem value="none">Sem Psicólogo (A designar)</SelectItem>
              {psicologos.map((psi) => (
                <SelectItem key={psi as string} value={psi as string}>
                  {psi}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Psicólogo Responsável</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPacientes.length > 0 ? (
              filteredPacientes.map((paciente) => (
                <TableRow key={paciente.id}>
                  <TableCell className="font-medium">{paciente.nome}</TableCell>
                  <TableCell>{paciente.email || 'N/A'}</TableCell>
                  <TableCell>{paciente.nome_psicologo || 'A designar'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                      <Link href={`/admin/pacientes/${paciente.id}/view`}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">Visualizar</span>
                      </Link>
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                      <Link href={`/admin/pacientes/${paciente.id}/edit`}>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" className="h-8 w-8" disabled={isPending}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Excluir</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Essa ação não pode ser desfeita. Isso excluirá permanentemente o paciente "{paciente.nome}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(paciente.id)} disabled={isPending}>
                            {isPending ? "Excluindo..." : "Sim, excluir"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24">
                  {searchTerm.length >= 3 || selectedPsicologo !== "all" 
                    ? "Nenhum paciente encontrado com esses filtros." 
                    : "Nenhum paciente encontrado."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

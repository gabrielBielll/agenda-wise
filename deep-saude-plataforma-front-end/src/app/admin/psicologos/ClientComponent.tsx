"use client";

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { PlusCircle, Edit, Trash2, AlertTriangle, Eye } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { deletePsicologo } from './actions';

interface Psicologo {
  id: string;
  nome: string;
  email: string;
}

// ===================================================================
// PARTE 2: CLIENT COMPONENT
// Esta parte é interativa e executa no navegador.
// ===================================================================
export default function ClientComponent({
  initialData,
  error,
}: {
  initialData: Psicologo[];
  error?: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [psicologos, setPsicologos] = useState(initialData);

  const handleDelete = (psicologoId: string) => {
    startTransition(async () => {
      const result = await deletePsicologo(psicologoId);
      if (result.success) {
        setPsicologos(currentPsicologos => currentPsicologos.filter(p => p.id !== psicologoId));
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
            <CardDescription>Não foi possível buscar os psicólogos da sua clínica.</CardDescription>
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
            <CardTitle>Gestão de Psicólogos</CardTitle>
            <CardDescription>Adicione, edite e gerencie os psicólogos da clínica.</CardDescription>
          </div>
          <Button asChild>
            <Link href="/admin/psicologos/novo">
              <PlusCircle className="mr-2 h-4 w-4" />
              Adicionar Psicólogo
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {psicologos.length > 0 ? (
              psicologos.map((psicologo) => (
                <TableRow key={psicologo.id}>
                  <TableCell className="font-medium">{psicologo.nome}</TableCell>
                  <TableCell>{psicologo.email}</TableCell>
                  <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/admin/psicologos/${psicologo.id}/view`}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">Visualizar</span>
                        </Link>
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/admin/psicologos/${psicologo.id}/edit`}>
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
                            Essa ação não pode ser desfeita. Isso excluirá permanentemente o psicólogo
                             "{psicologo.nome}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(psicologo.id)} disabled={isPending}>
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
                <TableCell colSpan={3} className="text-center h-24">
                  Nenhum psicólogo encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

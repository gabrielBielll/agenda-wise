"use client";

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { PlusCircle, Edit, Trash2, AlertTriangle, Eye, Search } from 'lucide-react';
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { deletePsicologo } from './actions';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredPsicologos = psicologos.filter(psicologo => 
    searchTerm === "" || psicologo.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate pagination
  const totalItems = filteredPsicologos.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPsicologos = filteredPsicologos.slice(startIndex, endIndex);

  // Reset to page 1 if filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
        <div className="mt-4">
          <Input
            placeholder="Buscar psicólogo por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
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
            {currentPsicologos.length > 0 ? (
              currentPsicologos.map((psicologo) => (
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

        {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageToShow = i + 1;
                      if (totalPages > 5) {
                          if (currentPage > 3) {
                              pageToShow = currentPage - 2 + i;
                          }
                          if (pageToShow > totalPages) return null;
                      }
                      
                      return (
                        <PaginationItem key={pageToShow}>
                          <PaginationLink 
                            isActive={currentPage === pageToShow}
                            onClick={() => setCurrentPage(pageToShow)}
                            className="cursor-pointer"
                          >
                            {pageToShow}
                          </PaginationLink>
                        </PaginationItem>
                      );
                  }).filter(Boolean)}

                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

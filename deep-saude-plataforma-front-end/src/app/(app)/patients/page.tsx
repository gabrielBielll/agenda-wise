'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, CalendarDays, Edit, Leaf, Loader2, Search, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { deletePaciente, getPacientes } from './actions';

// Reconstruído a partir do uso: a definição havia sido apagada por uma edição
// parcial e substituída por um comentário "... existing code".
interface Patient {
  id: string;
  nome: string;
  status?: 'ativo' | 'inativo';
  avatar_url?: string | null;
  /** Derivado no backend a partir do último agendamento; nem sempre presente. */
  lastSession?: string | null;
}

export default function PatientsPage() {
  const { status: sessionStatus } = useSession();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('ativo');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      setLoading(true);
      getPacientes().then(result => {
        if (result.success && result.data) setPatients(result.data);
        else setError(result.error || 'Falha ao buscar os dados dos pacientes.');
      }).catch(err => setError(err.message)).finally(() => setLoading(false));
    } else if (sessionStatus === 'unauthenticated') {
      setError('Usuário não autenticado.');
      setLoading(false);
    }
  }, [sessionStatus]);

  useEffect(() => setCurrentPage(1), [searchTerm, statusFilter]);

  const handleDelete = (patientId: string) => {
    setDeletingId(patientId);
    startTransition(async () => {
      const result = await deletePaciente(patientId);
      if (result.success) {
        toast({ title: 'Paciente removido', description: result.message });
        setPatients(previous => previous.filter(patient => patient.id !== patientId));
      } else toast({ title: 'Não foi possível remover', description: result.message, variant: 'destructive' });
      setDeletingId(null);
      setDeleteTarget(null);
    });
  };

  const filteredPatients = patients.filter(patient => {
    const matchesName = patient.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const currentStatus = patient.status || 'ativo';
    return matchesName && (statusFilter === 'todos' || currentStatus === statusFilter);
  });
  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const currentPatients = filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const initials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

  if (loading) return <div className="flex h-72 flex-col items-center justify-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10"><Loader2 className="h-7 w-7 animate-spin text-primary" /></span><div className="text-center"><p className="font-headline text-xl">Preparando seu espaço de cuidado...</p><p className="mt-1 text-xs text-muted-foreground">Buscando seus pacientes com segurança.</p></div></div>;
  if (error) return <Card className="mx-auto max-w-xl border-destructive/20"><CardContent className="flex flex-col items-center p-10 text-center"><Leaf className="mb-4 h-10 w-10 text-destructive/60" /><CardTitle>Não conseguimos carregar seus pacientes</CardTitle><p className="mt-2 text-sm text-muted-foreground">{error}</p></CardContent></Card>;

  return (
    <div className="quiet-page">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground"><span className="h-px w-6 bg-accent" /> Cuidado contínuo</p><h2 className="page-title">Pessoas, não prontuários.</h2><p className="page-subtitle">Uma visão delicada de cada jornada que você acompanha.</p></div>
        <div className="flex w-full items-end justify-between gap-5 md:w-auto"><div className="text-left md:text-right"><strong className="block font-headline text-4xl font-normal text-accent">{filteredPatients.length}</strong><span className="page-eyebrow text-muted-foreground">pacientes {statusFilter === 'ativo' ? 'ativos' : ''}</span></div><Button asChild><Link href="/patients/new"><UserPlus />Novo paciente</Link></Button></div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar por nome" className="pl-11" /></label>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-[190px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="ativo">Em acompanhamento</SelectItem><SelectItem value="inativo">Inativos</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select>
      </section>

      {currentPatients.length ? <>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {currentPatients.map((patient, index) => (
            <Card key={patient.id} className="group flex min-h-[260px] flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--quiet-shadow)]">
              <CardHeader className="flex-row items-start space-y-0 p-5 pb-3">
                <Avatar className="h-14 w-14 border-[3px] border-card shadow-sm"><AvatarImage src={patient.avatar_url || ''} alt={patient.nome} /><AvatarFallback className={index % 3 === 0 ? 'bg-accent/15 font-semibold text-accent' : index % 3 === 1 ? 'bg-primary/10 font-semibold text-primary' : 'bg-secondary/20 font-semibold text-secondary-foreground'}>{initials(patient.nome)}</AvatarFallback></Avatar>
                <div className="ml-auto flex items-center gap-2"><Badge variant={patient.status === 'inativo' ? 'secondary' : 'default'}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />{patient.status === 'inativo' ? 'Inativo' : 'Em acompanhamento'}</Badge></div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col px-5 pb-5"><Link href={`/patients/${patient.id}`} className="group/name"><CardTitle className="truncate text-[23px] transition-colors group-hover/name:text-primary">{patient.nome}</CardTitle><p className="mt-1 text-[10px] text-muted-foreground">Acesse a jornada terapêutica e as anotações.</p></Link>
                <div className="mt-5 rounded-[14px] bg-primary/5 p-3"><span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Última sessão</span><strong className="mt-1.5 block text-xs">{patient.lastSession ? new Date(patient.lastSession).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : 'Ainda não registrada'}</strong></div>
                <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4"><div className="flex gap-1"><Button variant="ghost" size="icon" asChild aria-label="Editar"><Link href={`/patients/${patient.id}/edit`}><Edit /></Link></Button><Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: patient.id, name: patient.nome })} disabled={deletingId === patient.id} aria-label="Remover" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">{deletingId === patient.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></div><Button variant="ghost" size="sm" asChild><Link href={`/patients/${patient.id}`}>Ver jornada <ArrowRight /></Link></Button></div>
              </CardContent>
            </Card>
          ))}
        </section>
        {totalPages > 1 && <Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" onClick={event => { event.preventDefault(); if (currentPage > 1) setCurrentPage(currentPage - 1); }} className={currentPage === 1 ? 'pointer-events-none opacity-40' : ''} /></PaginationItem>{Array.from({ length: totalPages }).map((_, index) => <PaginationItem key={index}><PaginationLink href="#" isActive={currentPage === index + 1} onClick={event => { event.preventDefault(); setCurrentPage(index + 1); }}>{index + 1}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#" onClick={event => { event.preventDefault(); if (currentPage < totalPages) setCurrentPage(currentPage + 1); }} className={currentPage === totalPages ? 'pointer-events-none opacity-40' : ''} /></PaginationItem></PaginationContent></Pagination>}
      </> : <Card><CardContent className="flex flex-col items-center py-16 text-center"><span className="soft-icon mb-4 h-16 w-16 rounded-full"><Leaf className="h-7 w-7" /></span><h3 className="section-title">Nenhum paciente por aqui.</h3><p className="mb-5 mt-2 text-sm text-muted-foreground">Ajuste os filtros ou comece uma nova jornada de cuidado.</p><Button asChild><Link href="/patients/new"><UserPlus />Adicionar paciente</Link></Button></CardContent></Card>}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação exclui o cadastro permanentemente. Confirme apenas se o histórico e os vínculos já foram tratados pela clínica.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter paciente</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!deleteTarget || deletingId !== null} onClick={() => deleteTarget && handleDelete(deleteTarget.id)}>{deletingId ? 'Removendo...' : 'Sim, remover'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

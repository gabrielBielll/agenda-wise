"use client";

import React, { useState } from 'react';
import Link from "next/link";
import { DeleteAgendamentoButton } from "./DeleteAgendamentoButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, PlusCircle, AlertTriangle, Pencil, Search, List, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { WeekView } from "../../(app)/calendar/WeekView";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createBloqueioAdmin, deleteBloqueioAdmin, deleteAgendamento } from "./actions";
import { descreveSessaoEmConflito, type SessaoEmConflito } from "@/lib/conflitos";
import { Check, ChevronsUpDown, Lock, Trash2 } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Utility to create a blocked time type compatible with WeekView
interface Bloqueio {
  id: string;
  data_inicio: string;
  data_fim: string;
  motivo?: string;
  dia_inteiro?: boolean;
  psicologo_id: string; // Critical for filtering
  recorrencia_id?: string;
}

interface Agendamento {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_hora_sessao: string;
  valor_consulta: number;
  nome_paciente?: string;
  nome_psicologo?: string;
  recorrencia_id?: string;
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
  psicologos,
  bloqueios = []
}: { 
  agendamentos: Agendamento[], 
  pacientes: Item[], 
  psicologos: Item[],
  bloqueios?: Bloqueio[]
}) {
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedPaciente, setSelectedPaciente] = useState<string>("all");
  const [selectedPsicologo, setSelectedPsicologo] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(""); // For List View
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date()); // For Calendar View
  const { toast } = useToast();

  // Block Dialog State
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockRecurrenceType, setBlockRecurrenceType] = useState("none");
  const [blockRecurrenceCount, setBlockRecurrenceCount] = useState(1);
  const [blockMotivo, setBlockMotivo] = useState("");
  const [blockPsicologoId, setBlockPsicologoId] = useState("");
  const [openPsicologoBlock, setOpenPsicologoBlock] = useState(false);

  // Conflict State
  // R-014: a recusa mostra QUAIS sessões impedem o bloqueio, não só quantas.
  const [sessoesEmConflito, setSessoesEmConflito] = useState<SessaoEmConflito[] | null>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

  // Delete Block Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteData, setDeleteData] = useState<{ id: string, recorrencia_id?: string } | null>(null);

  // Delete Appointment Dialog State
  const [isDeleteAgendamentoOpen, setIsDeleteAgendamentoOpen] = useState(false);
  const [agendamentoToDelete, setAgendamentoToDelete] = useState<{ id: string, recorrencia_id?: string } | null>(null);

  const handleCreateBlock = async (formData: FormData) => {
    // We can use state instead of formData since we might not wrap everything in a form element perfectly with shadcn
    // But let's use the state variables we defined
    
    if (!blockStart || !blockEnd || !blockPsicologoId) {
        toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
        return;
    }

    // Sem pré-checagem: o backend recusa e devolve as sessões atingidas na
    // própria recusa (R-014). Ver o mesmo raciocínio no CalendarClient.
    const result = await createBloqueioAdmin(blockStart, blockEnd, blockPsicologoId, blockMotivo, false, blockRecurrenceType, blockRecurrenceCount);

    if (result.success) {
        toast({ title: "Sucesso", description: result.message, className: "bg-success text-success-foreground" });
        setIsBlockDialogOpen(false);
        // Reset fields
        setBlockStart("");
        setBlockEnd("");
        setBlockMotivo("");
        return;
    }

    if (result.sessoes) {
        setSessoesEmConflito(result.sessoes);
        setIsBlockDialogOpen(false);
        setIsConflictDialogOpen(true);
        return;
    }

    toast({ title: "Erro", description: result.message, variant: "destructive" });
  };

  // `confirmBlockCreation` removida em 2026-08-16 — R-014. As duas saídas que
  // ela oferecia deixaram de existir: cancelar agendamentos em massa saiu do
  // fluxo de criar bloqueio, e criar por cima da sessão o backend recusa.

  const handleDeleteBloqueio = (id: string, recorrencia_id?: string) => {
      setDeleteData({ id, recorrencia_id });
      setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async (mode?: 'single' | 'all_future') => {
      if (!deleteData) return;

      const result = await deleteBloqueioAdmin(deleteData.id, mode);
      if (result.success) {
          toast({ title: "Sucesso", description: result.message, className: "bg-success text-success-foreground" });
          setIsDeleteDialogOpen(false);
          setDeleteData(null);
      } else {
          toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
  };

  // Appointment Deletion Handlers
  const handleDeleteAgendamento = (id: string, recorrencia_id?: string) => {
       setAgendamentoToDelete({ id, recorrencia_id });
       setIsDeleteAgendamentoOpen(true);
  };

  const confirmDeleteAgendamento = async (mode?: 'single' | 'all_future' | 'all') => {
      if (!agendamentoToDelete) return;

      const result = await deleteAgendamento(agendamentoToDelete.id, mode);
      
      if (result.success) {
          toast({
              title: "Sucesso",
              description: result.message,
              className: "bg-success text-success-foreground",
          });
          setIsDeleteAgendamentoOpen(false);
          setAgendamentoToDelete(null);
      } else {
          toast({
              title: "Erro",
              description: result.message,
              variant: "destructive",
          });
      }
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Calendar Navigation Handlers
  const handlePrevWeek = () => {
    setCurrentCalendarDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() - 7);
      return newDate;
    });
  };

  const handleNextWeek = () => {
    setCurrentCalendarDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + 7);
      return newDate;
    });
  };

  const handleToday = () => {
    setCurrentCalendarDate(new Date());
  };

  const filteredAgendamentos = agendamentos.filter(ag => {
    const matchPaciente = selectedPaciente === "all" || ag.paciente_id === selectedPaciente;
    const matchPsicologo = selectedPsicologo === "all" || ag.psicologo_id === selectedPsicologo;
    
    const term = searchTerm.toLowerCase();
    const matchSearch = 
      (ag.nome_paciente?.toLowerCase() || "").includes(term) ||
      (ag.nome_psicologo?.toLowerCase() || "").includes(term);

    let matchDate = true;
    
    // Only apply strict date filter in List View
    if (viewMode === "list" && selectedDateFilter) {
      const agDateObj = new Date(ag.data_hora_sessao);
      const year = agDateObj.getFullYear();
      const month = String(agDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(agDateObj.getDate()).padStart(2, '0');
      const agDateString = `${year}-${month}-${day}`;
      
      matchDate = agDateString === selectedDateFilter;
    }

    return matchPaciente && matchPsicologo && matchSearch && matchDate;
  });

  // Calculate pagination
  const totalItems = filteredAgendamentos.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentAgendamentos = filteredAgendamentos.slice(startIndex, endIndex);

  // Reset to page 1 if filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedPaciente, selectedPsicologo, searchTerm, selectedDateFilter]);

  // Format Helper for Week Range Display
  const getWeekRangeDisplay = (date: Date) => {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    
    // Simple formatter (can be improved with date-fns format if needed, but native is fine)
    return `${start.toLocaleDateString('pt-BR')} - ${end.toLocaleDateString('pt-BR')}`;
  };

  /**
   * Redesign — o vocabulário é do `8109afc`, não meu.
   *
   * Esta tela ficou de fora do commit do Gabriel (ele mexeu em
   * `admin/agendamentos/page.tsx`, mas só em 2 linhas de import — a UI mora
   * aqui). É a tela de maior uso da recepção, então era a que mais ia destoar.
   *
   * ⚠️ **Copiei o padrão dele, não inventei um.** A casca segue
   * `(app)/patients/page.tsx`: `quiet-page`, o eyebrow com o traço de `bg-accent`,
   * `page-title`, `page-subtitle`, e a contagem grande em `text-accent` ao lado
   * da ação primária. O corpo da tabela **não precisou de nada**: ele restilizou
   * o primitivo `components/ui/table.tsx`, então ela já herdou o visual novo.
   *
   * 📌 Tudo por token (`text-muted-foreground`, `bg-accent`, `bg-card`) e nunca
   * cor crua — ele definiu a paleta escura inteira no `globals.css`, e um
   * uma superfície literal aqui quebraria o modo escuro em silêncio.
   *
   * 🔴 **Nenhum comportamento mudou.** Os `id` da A11Y-001a, o fluxo de forçar da
   * A-009, o diálogo de bloqueio e os filtros continuam idênticos — só a casca
   * mudou de roupa.
   */
  return (
    <div className="quiet-page page-enter">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            <span className="h-px w-6 bg-accent" /> Agenda da clínica
          </p>
          <h2 className="page-title">O tempo de cada encontro.</h2>
          <p className="page-subtitle">Visualize e organize os agendamentos de toda a equipe.</p>
        </div>
        <div className="flex items-end gap-5">
          <div className="text-right">
            <strong className="block font-headline text-4xl font-normal text-accent">{filteredAgendamentos.length}</strong>
            <span className="page-eyebrow text-muted-foreground">
              {filteredAgendamentos.length === 1 ? 'sessão' : 'sessões'}
            </span>
          </div>
        </div>
      </section>

    <Card>
      <CardHeader>
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <CardTitle className="section-title flex items-center gap-2">
              <span className="soft-icon h-9 w-9"><Calendar className="h-[18px] w-[18px]"/></span>
              Agendamentos
            </CardTitle>
            <CardDescription>Visualize e gerencie os agendamentos da clínica.</CardDescription>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex justify-self-start rounded-xl bg-muted p-1">
              <Button 
                variant={viewMode === "list" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setViewMode("list")}
                title="Lista"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === "calendar" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setViewMode("calendar")}
                title="Calendário"
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/admin/agendamentos/novo">
                <PlusCircle className="mr-2 h-4 w-4" />
                Novo Agendamento
              </Link>
            </Button>
            
            <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
              <DialogTrigger asChild>
                {/* Por token: o laranja cru não conhece o tema escuro, e `accent` é
                    exatamente a terracota que ele usa para chamar atenção sem alarmar. */}
                <Button variant="outline" className="w-full gap-2 border-accent/40 text-accent hover:bg-accent/10 sm:w-auto">
                  <Lock className="h-4 w-4" />
                  Bloquear Horário
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Bloquear Horário</DialogTitle>
                  <DialogDescription>
                    Impede agendamentos neste intervalo.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  
                  {/* Psicólogo Select */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="block-psico">Psicólogo</Label>
                    <Popover open={openPsicologoBlock} onOpenChange={setOpenPsicologoBlock}>
                      <PopoverTrigger asChild>
                        {/* ⚠️ `role="combobox"` num <button> DESLIGA o nome-pelo-conteúdo
                            que ele teria — `button` é nameFrom:contents, `combobox` não.
                            Sem este id o controle fica SEM NOME NENHUM (D-016).
                            É o controle que eu classifiquei errado na 0106 e corrigi
                            na 0110; aqui ele fecha. */}
                        <Button
                          id="block-psico"
                          variant="outline"
                          role="combobox"
                          aria-expanded={openPsicologoBlock}
                          className="w-full justify-between font-normal"
                        >
                          {blockPsicologoId
                            ? psicologos.find((p) => p.id === blockPsicologoId)?.nome
                            : "Selecione o psicólogo..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Buscar psicólogo..." />
                          <CommandList>
                            <CommandEmpty>Nenhum psicólogo encontrado.</CommandEmpty>
                            <CommandGroup>
                              {psicologos.map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={p.nome}
                                  onSelect={() => {
                                    setBlockPsicologoId(p.id);
                                    setOpenPsicologoBlock(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      blockPsicologoId === p.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {p.nome}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="block_inicio">Início</Label>
                        <Input id="block_inicio" type="datetime-local" value={blockStart} onChange={e => setBlockStart(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="block_fim">Fim</Label>
                        <Input id="block_fim" type="datetime-local" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="block_motivo">Motivo</Label>
                    <Input id="block_motivo" placeholder="Ex: Férias, Reunião..." value={blockMotivo} onChange={e => setBlockMotivo(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                         {/* ⚠️ Este Label não tinha `htmlFor` NENHUM — categoria que a minha
                             varredura da 0106 não via, porque ela procurava `htmlFor`
                             apontando para o nada. Sem os DOIS tokens o controle fica sem
                             nome, igual aos outros. */}
                         <Label htmlFor="block_recurrence_type">Repetição</Label>
                         <Select value={blockRecurrenceType} onValueChange={setBlockRecurrenceType}>
                            <SelectTrigger id="block_recurrence_type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Não repetir</SelectItem>
                                <SelectItem value="semanal">Semanalmente</SelectItem>
                                <SelectItem value="quinzenal">Quinzenalmente (15 dias)</SelectItem>
                            </SelectContent>
                         </Select>
                    </div>
                     {blockRecurrenceType !== 'none' && (
                        <div className="flex flex-col gap-2">
                             <Label htmlFor="block_recurrence_count">Qtd. Vezes</Label>
                             <Input id="block_recurrence_count" 
                                type="number" 
                                min="2" max="52" 
                                value={blockRecurrenceCount} 
                                onChange={e => setBlockRecurrenceCount(parseInt(e.target.value))} 
                             />
                        </div>
                     )}
                  </div>

                </div>
                <DialogFooter>
                    <Button onClick={() => handleCreateBlock(new FormData())}>Criar Bloqueio</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

             {/* Conflict Dialog */}
             <Dialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" /> Não dá para bloquear esse período
                        </DialogTitle>
                        <DialogDescription>
                            Há {sessoesEmConflito?.length === 1 ? 'uma sessão marcada' : `${sessoesEmConflito?.length ?? 0} sessões marcadas`} dentro dele.
                            Remarque ou cancele {sessoesEmConflito?.length === 1 ? 'a sessão' : 'as sessões'} antes de bloquear.
                        </DialogDescription>
                    </DialogHeader>

                    {/* R-014: dia e hora de cada sessão atingida, para dar o que resolver. */}
                    <ul className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
                        {(sessoesEmConflito ?? []).map((sessao) => (
                            <li key={sessao.id} className="py-0.5 font-medium tabular-nums">
                                {descreveSessaoEmConflito(sessao)}
                            </li>
                        ))}
                    </ul>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setIsConflictDialogOpen(false);
                            setSessoesEmConflito(null);
                            setIsBlockDialogOpen(true);
                        }}>Voltar e ajustar</Button>
                    </DialogFooter>
                </DialogContent>
             </Dialog>

             {/* Delete Block Dialog */}
             <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remover Bloqueio</DialogTitle>
                        <DialogDescription>
                            Deseja remover este bloqueio da agenda?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => confirmDelete('single')}>
                            Remover Apenas Este
                        </Button>
                        {deleteData?.recorrencia_id && (
                            <Button variant="destructive" onClick={() => confirmDelete('all_future')}>
                                Remover Este e Futuros
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
             </Dialog>

             {/* Delete Appointment Dialog */}
             <Dialog open={isDeleteAgendamentoOpen} onOpenChange={setIsDeleteAgendamentoOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remover Agendamento</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja remover este agendamento? Esta ação é irreversível se não for apenas cancelamento.
                            {/* Ajuste: na verdade, deleteAgendamento exclui permanentemente (DELETE SQL), enquanto cancelar é (UPDATE status). 
                                Aqui estamos deletando. A mensagem deve refletir isso. */}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                         <Button variant="ghost" onClick={() => setIsDeleteAgendamentoOpen(false)}>Voltar</Button>
                         <Button variant="destructive" onClick={() => confirmDeleteAgendamento('single')}>
                            Remover Apenas Este
                         </Button>
                         {agendamentoToDelete?.recorrencia_id && (
                            <>
                                <Button variant="destructive" onClick={() => confirmDeleteAgendamento('all_future')}>
                                    Este e Futuros
                                </Button>
                                <Button variant="destructive" onClick={() => confirmDeleteAgendamento('all')}>
                                    Todos da Série
                                </Button>
                            </>
                         )}
                    </DialogFooter>
                </DialogContent>
             </Dialog>

          </div>
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
             {viewMode === "list" ? (
               <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
              />
             ) : (
               <div className="flex items-center justify-between border rounded-md px-2 h-10 bg-background">
                 <Button variant="ghost" size="icon" onClick={handlePrevWeek} className="h-8 w-8">
                   <ChevronLeft className="h-4 w-4" />
                 </Button>
                 <span className="text-xs font-medium cursor-pointer hover:underline" onClick={handleToday}>
                   {getWeekRangeDisplay(currentCalendarDate)}
                 </span>
                 <Button variant="ghost" size="icon" onClick={handleNextWeek} className="h-8 w-8">
                   <ChevronRight className="h-4 w-4" />
                 </Button>
               </div>
             )}
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
        {viewMode === "list" ? (
          <>
          <p className="mobile-scroll-hint mb-2">Deslize a tabela para ver todos os dados da sessão.</p>
          <Table className="min-w-[760px]">
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
              {currentAgendamentos.length > 0 ? (
                currentAgendamentos.map((ag) => (
                  <TableRow key={ag.id}>
                    <TableCell>{ag.nome_paciente || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{ag.nome_psicologo || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{formatDate(ag.data_hora_sessao)}</TableCell>
                    <TableCell>{Number(ag.valor_consulta).toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/admin/agendamentos/${ag.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                          </Link>
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteAgendamento(ag.id, ag.recorrencia_id)}
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  {/* O estado vazio segue o padrão dele em `(app)/patients/page.tsx`:
                      ícone em `soft-icon` redondo, `section-title`, e a frase em
                      `text-muted-foreground`. Aqui ele vive dentro da tabela, então
                      ocupa a linha inteira em vez de virar Card. */}
                  <TableCell colSpan={5} className="h-auto py-14">
                    <div className="flex flex-col items-center text-center">
                      <span className="soft-icon mb-4 h-16 w-16 rounded-full"><Calendar className="h-7 w-7" /></span>
                      <h3 className="section-title">Nenhuma sessão por aqui.</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Ajuste os filtros ou marque um novo horário.
                      </p>
                    </div>
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
          </>
        ) : (
          <div className="h-[70vh] min-h-[520px] overflow-hidden rounded-2xl border border-border/60 p-1 sm:p-2 lg:h-[650px]">
             {selectedPsicologo === "all" ? (
               <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                 <AlertTriangle className="h-10 w-10 mb-2 opacity-50" />
                 <p>Selecione um Psicólogo para visualizar a agenda.</p>
               </div>
             ) : (
               <WeekView 
                 date={currentCalendarDate}
                 appointments={filteredAgendamentos.map(ag => ({
                   id: ag.id,
                   data_hora_sessao: ag.data_hora_sessao,
                   nome_paciente: ag.nome_paciente || "",
                 } as any))}
                 bloqueios={bloqueios.filter(b => b.psicologo_id === selectedPsicologo)}
                 // TODO(admin-calendar-create-from-slot): abrir /novo com psicólogo e
                 // data/hora pré-preenchidos quando WeekView expuser o instante clicado.
                 onAddAppointment={() => {}}
                 onEditAppointment={(app) => {
                    window.location.href = `/admin/agendamentos/${app.id}/edit`;
                 }}
                 // ⚠️ Esta tela segue só REMOVENDO, e a assimetria fica registrada.
                 // A agenda da psicóloga ganhou edição de janela em 21/08; aqui o
                 // admin continua apenas apagando. Não estendi por conta própria: o
                 // pedido do Gabriel foi sobre o fluxo dela, e este é outro ator.
                 // Mas é a mesma família de "dois caminhos, um consertado" que este
                 // projeto já pagou antes, então fica escrito em vez de escondido.
                 onEditBloqueio={(block) => handleDeleteBloqueio(block.id, block.recorrencia_id)}
               />
             )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

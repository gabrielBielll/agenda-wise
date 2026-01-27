'use client';

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, PlusCircle, Pencil, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormState, useFormStatus } from "react-dom";
import { createAgendamento, updateAgendamento, deleteAgendamento, cancelAgendamento, createBloqueio, deleteBloqueio, FormState, type Bloqueio } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { CalendarHeader } from "./CalendarHeader";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { cn } from "@/lib/utils";

// Define interface for Appointment
interface Appointment {
  id: string;
  data_hora_sessao: string;
  duracao?: number; // Duration in minutes
  nome_paciente: string;
  paciente_id?: string; // Needed for pre-filling edit form
  valor_consulta?: number;
  status?: string; // 'agendado' | 'cancelado' | 'concluido'
}

// ... existing imports ...

// Helper function to add minutes to a date
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}


interface Paciente {
  id: string;
  nome: string;
}

interface SlotAction {
  date: Date;
  x: number;
  y: number;
  isBlocked?: boolean;
  bloqueioId?: string;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (isEditing ? "Atualizando..." : "Criando...") : (isEditing ? "Salvar" : "Agendar")}
    </Button>
  );
}

export default function CalendarClient({ appointments, pacientes, bloqueios = [] }: { appointments: Appointment[], pacientes: Paciente[], bloqueios?: Bloqueio[] }) {
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('week'); // Default to week view potentially
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [newAppointmentDate, setNewAppointmentDate] = useState<Date | null>(null); // To store date clicked in views
  const [slotAction, setSlotAction] = useState<SlotAction | null>(null); // For context menu
  const { toast } = useToast();
  
  // Wrapper action to handle both create and update
  const action = async (prevState: FormState, formData: FormData) => {
    if (editingAppointment) {
      return updateAgendamento(editingAppointment.id, prevState, formData);
    } else {
      return createAgendamento(prevState, formData);
    }
  };

  const [state, formAction] = useFormState(action, initialState);



// ... inside component ...

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast({
            title: "Sucesso",
            description: state.message,
            className: "bg-green-500 text-white",
        });
        setIsDialogOpen(false);
        setEditingAppointment(null);
        setNewAppointmentDate(null);
      } else {
        // Check for session expiration
        if (state.message.toLowerCase().includes("token") || 
            state.message.toLowerCase().includes("expirado") ||
            state.message.toLowerCase().includes("autenticação")) {
            
            toast({
                title: "Sessão Expirada",
                description: "Sua sessão expirou. Redirecionando...",
                variant: "destructive",
            });
            
            setTimeout(() => {
                signOut({ callbackUrl: "/" });
            }, 1500);
            return;
        }

        toast({
            title: "Erro",
            description: state.message,
            variant: "destructive",
        });
      }
    }
  }, [state, toast]);


  const handleOpenNew = (selectedDate?: Date) => {
    setSlotAction(null); // Close context menu
    setEditingAppointment(null);
    setNewAppointmentDate(selectedDate || date);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (app: Appointment) => {
    setEditingAppointment(app);
    setNewAppointmentDate(null);
    setIsDialogOpen(true);
  };

  const handleSlotClick = (selectedDate: Date, event?: React.MouseEvent, isBlocked?: boolean, bloqueioId?: string) => {
    // Show context menu with options
    if (event) {
      setSlotAction({ date: selectedDate, x: event.clientX, y: event.clientY, isBlocked, bloqueioId });
    } else if (!isBlocked) {
      handleOpenNew(selectedDate);
    }
  };

  const handleOpenBlock = () => {
    if (slotAction) {
      setNewAppointmentDate(slotAction.date);
    }
    setSlotAction(null);
    setIsBlockDialogOpen(true);
  };

  const handleCreateBlock = async (formData: FormData) => {
    const dataInicio = formData.get('data_inicio') as string;
    const dataFim = formData.get('data_fim') as string;
    const motivo = formData.get('motivo') as string;
    const diaInteiro = formData.get('dia_inteiro') === 'on';

    const result = await createBloqueio(dataInicio, dataFim, motivo, diaInteiro);
    if (result.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-green-500 text-white" });
      setIsBlockDialogOpen(false);
      setNewAppointmentDate(null);
    } else {
      toast({ title: "Erro", description: result.message, variant: "destructive" });
    }
  };

  const handleDeleteBlock = async (id: string) => {
    const result = await deleteBloqueio(id);
    if (result.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-green-500 text-white" });
    } else {
      toast({ title: "Erro", description: result.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
      const result = await deleteAgendamento(id);
      if (result.success) {
          toast({
              title: "Sucesso",
              description: result.message,
              className: "bg-green-500 text-white",
          });
      } else {
          toast({
              title: "Erro",
              description: result.message,
              variant: "destructive",
          });
      }
  };

  const handleCancel = async (id: string) => {
    const result = await cancelAgendamento(id);
    if (result.success) {
      toast({
        title: "Sessão Cancelada",
        description: result.message,
        className: "bg-orange-500 text-white",
      });
      setIsDialogOpen(false);
      setEditingAppointment(null);
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  // Filter appointments for the selected date (Only for Month View sidebar)
  const filteredAppointments = appointments.filter(app => {
    if (!date) return false;
    const appDate = new Date(app.data_hora_sessao);
    const match = appDate.toDateString() === date.toDateString();
    return match;
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r bg-card p-4 flex flex-col gap-6">
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-full h-12 shadow-md flex items-center justify-start pl-4 gap-3 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleOpenNew()}>
              <Plus className="h-6 w-6" /> 
              <span className="font-semibold text-base">Novo</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
              <DialogDescription>
                {editingAppointment ? "Atualize os dados da sessão." : "Agende uma sessão para um de seus pacientes."}
              </DialogDescription>
            </DialogHeader>
            <form action={(formData) => {
                // Determine duration before submitting
                const startStr = formData.get("data_hora_sessao") as string;
                const endStr = formData.get("data_hora_fim") as string;
                
                if (startStr && endStr) {
                    const start = new Date(startStr);
                    const end = new Date(endStr);
                    const diffMs = end.getTime() - start.getTime();
                    const diffMins = Math.round(diffMs / 60000);
                    formData.set("duracao", diffMins.toString());
                } else {
                    formData.set("duracao", "50"); // Default fallback
                }
                formAction(formData);
            }} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paciente" className="text-right">
                  Paciente
                </Label>
                <div className="col-span-3">
                    <Select name="paciente_id" required defaultValue={editingAppointment?.paciente_id || ""}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                            {pacientes.length > 0 ? (
                                pacientes.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled>Nenhum paciente encontrado</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                      {state.errors?.paciente_id && <p className="text-xs text-destructive mt-1">{state.errors.paciente_id[0]}</p>}
                </div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="data_hora_sessao" className="text-right">
                  Início
                </Label>
                <div className="col-span-3">
                    <Input
                    id="data_hora_sessao"
                    name="data_hora_sessao"
                    type="datetime-local"
                    required
                    defaultValue={editingAppointment ? (() => {
                      const date = new Date(editingAppointment.data_hora_sessao);
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const hours = String(date.getHours()).padStart(2, '0');
                      const minutes = String(date.getMinutes()).padStart(2, '0');
                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                    })() : (newAppointmentDate ? (() => {
                        const d = newAppointmentDate;
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const hours = String(d.getHours()).padStart(2, '0');
                        const minutes = String(d.getMinutes()).padStart(2, '0');
                        return `${year}-${month}-${day}T${hours}:${minutes}`;
                    })() : "")}
                    onChange={(e) => {
                        // Auto-update end time when start time changes if this is a new appointment or just for convenience
                        // For now let's just let user pick
                        const form = e.target.form;
                        if (form) {
                            const startTime = new Date(e.target.value);
                            if (!isNaN(startTime.getTime())) {
                                const endTime = addMinutes(startTime, 50);
                                const endInput = form.elements.namedItem("data_hora_fim") as HTMLInputElement;
                                if (endInput && !endInput.value) { // Only set if empty? Or always update to keep 50m gap? Better to update if user didn't manually set a weird duration? Let's just update for now.
                                     const year = endTime.getFullYear();
                                      const month = String(endTime.getMonth() + 1).padStart(2, '0');
                                      const day = String(endTime.getDate()).padStart(2, '0');
                                      const hours = String(endTime.getHours()).padStart(2, '0');
                                      const minutes = String(endTime.getMinutes()).padStart(2, '0');
                                      endInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                                }
                            }
                        }
                    }}
                    />
                      {state.errors?.data_hora_sessao && <p className="text-xs text-destructive mt-1">{state.errors.data_hora_sessao[0]}</p>}
                </div>
              </div>

               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="data_hora_fim" className="text-right">
                  Fim
                </Label>
                <div className="col-span-3">
                    <Input
                    id="data_hora_fim"
                    name="data_hora_fim"
                    type="datetime-local"
                    required
                    defaultValue={editingAppointment ? (() => {
                      const start = new Date(editingAppointment.data_hora_sessao);
                      const duration = editingAppointment.duracao || 50;
                      const end = addMinutes(start, duration);
                      
                      const year = end.getFullYear();
                      const month = String(end.getMonth() + 1).padStart(2, '0');
                      const day = String(end.getDate()).padStart(2, '0');
                      const hours = String(end.getHours()).padStart(2, '0');
                      const minutes = String(end.getMinutes()).padStart(2, '0');
                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                    })() : (newAppointmentDate ? (() => {
                        const d = newAppointmentDate;
                        // Calculate default end time (start + 50m)
                        const end = addMinutes(d, 50);
                         const year = end.getFullYear();
                          const month = String(end.getMonth() + 1).padStart(2, '0');
                          const day = String(end.getDate()).padStart(2, '0');
                          const hours = String(end.getHours()).padStart(2, '0');
                          const minutes = String(end.getMinutes()).padStart(2, '0');
                           return `${year}-${month}-${day}T${hours}:${minutes}`;
                    })() : "")}
                    />
                </div>
              </div>
              
              <input type="hidden" name="duracao" defaultValue="50" />

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="valor_consulta" className="text-right">
                  Valor (R$)
                </Label>
                  <div className="col-span-3">
                    <Input
                    id="valor_consulta"
                    name="valor_consulta"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    defaultValue={editingAppointment?.valor_consulta || ""}
                    />
                    {state.errors?.valor_consulta && <p className="text-xs text-destructive mt-1">{state.errors.valor_consulta[0]}</p>}
                </div>
              </div>
              <DialogFooter className="flex w-full items-center justify-between sm:justify-between">
                {editingAppointment && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" type="button" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Agendamento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Você tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                              if (editingAppointment) {
                                  handleDelete(editingAppointment.id);
                                  setIsDialogOpen(false);
                              }
                          }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Cancel Session Button */}
                    {editingAppointment.status !== 'cancelado' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" type="button" className="border-orange-500 text-orange-500 hover:bg-orange-50">
                            ✕ Cancelar Sessão
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancelar Sessão?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A sessão será marcada como cancelada e o valor financeiro será zerado automaticamente. Os dados da sessão serão mantidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => {
                              if (editingAppointment) {
                                handleCancel(editingAppointment.id);
                              }
                            }} className="bg-orange-500 text-white hover:bg-orange-600">
                              Confirmar Cancelamento
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {editingAppointment.status === 'cancelado' && (
                      <span className="text-orange-500 text-sm font-medium">✕ Sessão Cancelada</span>
                    )}
                  </>
                )}
                <div className={cn("flex gap-2", !editingAppointment && "w-full justify-end")}>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Fechar</Button>
                  {(!editingAppointment || editingAppointment.status !== 'cancelado') && (
                    <SubmitButton isEditing={!!editingAppointment} />
                  )}
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Block Dialog */}
        <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>🔒 Bloquear Horário</DialogTitle>
              <DialogDescription>
                Marque este horário como indisponível.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateBlock} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="data_inicio" className="text-right">Início</Label>
                <div className="col-span-3">
                  <Input
                    id="data_inicio"
                    name="data_inicio"
                    type="datetime-local"
                    required
                    defaultValue={newAppointmentDate ? (() => {
                      const d = newAppointmentDate;
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    })() : ""}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="data_fim" className="text-right">Fim</Label>
                <div className="col-span-3">
                  <Input
                    id="data_fim"
                    name="data_fim"
                    type="datetime-local"
                    required
                    defaultValue={newAppointmentDate ? (() => {
                      const d = addMinutes(newAppointmentDate, 60);
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    })() : ""}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="motivo" className="text-right">Motivo</Label>
                <div className="col-span-3">
                  <Input
                    id="motivo"
                    name="motivo"
                    placeholder="Ex: Reunião, Compromisso pessoal..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsBlockDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Bloquear</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Context Menu for slot actions */}
        {slotAction && (
          <div 
            className="fixed z-50 bg-popover border rounded-md shadow-lg p-1 min-w-[180px]"
            style={{ left: slotAction.x, top: slotAction.y }}
            onClick={() => setSlotAction(null)}
          >
            {slotAction.isBlocked ? (
              <>
                <div className="px-3 py-2 text-xs text-muted-foreground border-b mb-1">
                  🔒 Horário bloqueado
                </div>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 rounded-sm flex items-center gap-2 text-destructive"
                  onClick={() => {
                    if (slotAction.bloqueioId) {
                      handleDeleteBlock(slotAction.bloqueioId);
                    }
                    setSlotAction(null);
                  }}
                >
                  🗑️ Remover Bloqueio
                </button>
              </>
            ) : (
              <>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-sm flex items-center gap-2"
                  onClick={() => handleOpenNew(slotAction.date)}
                >
                  <Plus className="h-4 w-4" /> Novo Agendamento
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-sm flex items-center gap-2 text-orange-600"
                  onClick={handleOpenBlock}
                >
                  🔒 Bloquear Horário
                </button>
              </>
            )}
          </div>
        )}

        {/* Click outside to close context menu */}
        {slotAction && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setSlotAction(null)}
          />
        )}

        <div className="rounded-md border shadow-sm bg-background p-2">
            <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                className="p-0"
                classNames={{
                months: "flex flex-col space-y-4",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent",
                day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 rounded-full hover:bg-accent hover:text-accent-foreground",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-50",
                day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                day_hidden: "invisible",
                }}
            />
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex-shrink-0">
             <CalendarHeader 
                date={date} 
                setDate={setDate} 
                view={view} 
                setView={setView} 
                onToday={() => setDate(new Date())}
            />
        </div>
        
        <div className="flex-1 overflow-hidden p-4">
             {view === 'month' && (
             <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
                <div className="h-full">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    className="rounded-md border shadow-md bg-card p-0 w-full h-full"
                    month={date}
                    onMonthChange={setDate}
                    classNames={{
                    months: "flex flex-col w-full h-full",
                    month: "flex flex-col w-full h-full",
                    caption_label: "hidden", 
                    caption: "hidden", 
                    nav: "hidden", 
                    table: "w-full h-full border-collapse",
                    head_row: "flex w-full mb-2",
                    head_cell: "text-muted-foreground w-full font-medium text-sm text-center",
                    row: "flex w-full flex-1",
                    cell: "border p-1 w-full h-full relative hover:bg-accent/5 transition-colors align-top",
                    day: "w-full h-full p-1 text-left font-normal aria-selected:opacity-100 flex flex-col items-start justify-start hover:bg-transparent",
                    day_selected: "bg-transparent text-foreground", // Remove selected bg for monthly grid view cells
                    day_today: "bg-accent/20",
                    day_outside: "text-muted-foreground opacity-50 bg-muted/10",
                    }}
                    components={{
                         DayContent: (props) => {
                             const dayDate = props.date;
                             const dayAppointments = appointments.filter(app => new Date(app.data_hora_sessao).toDateString() === dayDate.toDateString());
                             
                             return (
                                 <div className="w-full h-full flex flex-col gap-1 items-start" onClick={() => handleOpenNew(dayDate)}>
                                     <span className={cn("text-sm font-semibold p-1 rounded-full w-7 h-7 flex items-center justify-center", 
                                        dayDate.toDateString() === new Date().toDateString() ? "bg-primary text-primary-foreground" : "")}>
                                        {dayDate.getDate()}
                                     </span>
                                     <div className="flex flex-col gap-1 w-full overflow-hidden">
                                         {dayAppointments.slice(0, 4).map(app => (
                                             <div key={app.id} 
                                                className="text-[10px] bg-primary/10 text-primary-foreground px-1 py-0.5 rounded truncate w-full border-l-2 border-primary cursor-pointer hover:bg-primary/20"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenEdit(app);
                                                }}
                                             >
                                                <span className="font-bold text-foreground">{new Date(app.data_hora_sessao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span> <span className="text-foreground">{app.nome_paciente}</span>
                                             </div>
                                         ))}
                                         {dayAppointments.length > 4 && (
                                             <div className="text-[10px] text-muted-foreground pl-1">
                                                 +{dayAppointments.length - 4} mais
                                             </div>
                                         )}
                                     </div>
                                 </div>
                             )
                         }
                    }}
                />
                </div>
            </div>
          )}

          {view === 'week' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 h-full">
                  <WeekView 
                    date={date} 
                    appointments={appointments}
                    bloqueios={bloqueios}
                    onAddAppointment={handleSlotClick} 
                    onEditAppointment={handleOpenEdit}
                    onDeleteBloqueio={handleDeleteBlock}
                  />
              </div>
          )}

          {view === 'day' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 h-full">
                  <DayView 
                    date={date} 
                    appointments={appointments}
                    bloqueios={bloqueios}
                    onAddAppointment={handleSlotClick} 
                    onEditAppointment={handleOpenEdit}
                    onDeleteBloqueio={handleDeleteBlock}
                  />
              </div>
          )}
        </div>
      </main>
    </div>
  );
}

'use client';

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, PlusCircle, Pencil, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, FileText, ExternalLink } from "lucide-react";
import Link from "next/link";
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { createAgendamento, updateAgendamento, deleteAgendamento, cancelAgendamento, reactivateAgendamento, createBloqueio, deleteBloqueio, checkBlockConflicts, FormState, type Bloqueio } from "./actions";
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
  recorrencia_id?: string;
  observacoes?: string;
}



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

  const appointmentDays = useMemo(() => {
    const days = new Set<string>();
    appointments.forEach(app => {
        days.add(new Date(app.data_hora_sessao).toDateString());
    });
    return days;
  }, [appointments]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isConfirmDeleteBlockOpen, setIsConfirmDeleteBlockOpen] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{ count: number, start: string, end: string, motivo: string, diaInteiro: boolean } | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<{ id: string, recorrencia_id?: string } | null>(null);
  const [isConfirmDeleteApptOpen, setIsConfirmDeleteApptOpen] = useState(false);
  const [apptToDelete, setApptToDelete] = useState<{ id: string, recorrencia_id?: string } | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false); // For single appt delete (non-recurrent or recurrence choice made)
  const [isCancelOpen, setIsCancelOpen] = useState(false); // For single appt cancel
  const [blockRecurrenceType, setBlockRecurrenceType] = useState<string>("none");
  const [blockRecurrenceCount, setBlockRecurrenceCount] = useState<number>(1);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>(undefined);


  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Update selected patient when editing
  useEffect(() => {
    if (editingAppointment) {
        setSelectedPatientId(editingAppointment.paciente_id);
    } else {
        setSelectedPatientId(undefined);
    }
  }, [editingAppointment]);
  const [newAppointmentDate, setNewAppointmentDate] = useState<Date | null>(null); // To store date clicked in views
  const [slotAction, setSlotAction] = useState<SlotAction | null>(null); // For context menu
  const { toast } = useToast();
  const [recurrenceType, setRecurrenceType] = useState<string>("none");
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [forceSubmission, setForceSubmission] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  
  const [isConfirmEditRecurrenceOpen, setIsConfirmEditRecurrenceOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<FormData | null>(null);

  // Wrapper action to handle both create and update
  const action = async (prevState: FormState, formData: FormData) => {
    let result: FormState | undefined;
    try {
        if (editingAppointment) {
            // Check if it is a recurring appointment
            // We need to know if the user WANTS to edit all future or just one.
            // But this action is called by the form. 
            // If we are here, we need to check if we already made a choice?
            // Actually, best way is: 
            // 1. If recurring and no mode selected yet -> prevent default submit? 
            //    BUT this is a server action called by React. We can't easily "pause" it here to show a dialog.
            //    Instead, we should probably handle the "Save" button click?
            //    Or, we can check a hidden field "edit_mode"?
            
            // BETTER APPROACH:
            // Intercept the form submission in the onFormAction or onSubmit?
            // But we are using useActionState.
            
            // Alternative: Check editingAppointment.recorrencia_id
            if (editingAppointment.recorrencia_id && !formData.get('mode')) {
                // If it's recurring and NO mode is set, we stop here and open the dialog?
                // But we need the FormData using the CURRENT values of the form.
                // We can save formData to state, open dialog, then call action again with mode appended.
                setPendingEditData(formData);
                setIsConfirmEditRecurrenceOpen(true);
                return { message: "", success: false }; // Return dummy state to stop immediate submit logic? 
                // Or better: don't call updateAgendamento yet.
            } else {
                 const mode = formData.get('mode') as 'single' | 'all_future' | undefined;
                 result = await updateAgendamento(editingAppointment.id, prevState, formData, mode);
            }
        } else {
            result = await createAgendamento(prevState, formData);
        }
    } catch (error) {
        console.error("Erro na server action:", error);
        return { message: "Erro interno no servidor.", success: false };
    }
    return result || { message: "Erro desconhecido.", success: false };
  };

  const handleConfirmEditRecurrence = (mode: 'single' | 'all_future') => {
      if (!pendingEditData || !formRef.current) return;
      
      // We need to Trigger the action again WITH the mode.
      // Since we can't easily modify the FormData object passed to startTransition if we call formAction directly with it...
      // wait, we can just append to pendingEditData if it's mutable? FormData is.
      pendingEditData.append('mode', mode);
      
      // Now we need to submit this data.
      // calling startTransition(() => formAction(pendingEditData)) works?
      // usage string: const [state, formAction] = useActionState(action, initialState);
      
      // Let's use a hidden input "mode" in the form and programmatic submit?
      // No, because we already have the data in pendingEditData.
      
      // We can manually call the action wrapper?
      // But useActionState wraps it. 
      // We can call formAction(pendingEditData).
      React.startTransition(() => {
          formAction(pendingEditData);
      });
      
      setIsConfirmEditRecurrenceOpen(false);
      setPendingEditData(null);
  };

  const [state, formAction] = useActionState(action, initialState);



// ... inside component ...

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast({
            title: "Sucesso",
            description: state.message,
            className: "bg-green-500 text-white",
        });
        
        // Add delay to prevent 'removeChild' errors with Radix UI primitives (Select/Dialog race)
        setTimeout(() => {
            setIsDialogOpen(false);
            setIsConflictOpen(false); // Close conflict dialog on success
            setIsConfirmEditRecurrenceOpen(false); // Close edit recurrence dialog
            setEditingAppointment(null);
            setNewAppointmentDate(null);
            setForceSubmission(false); // Reset force
        }, 100);
      } else if (state.conflict) {
        setIsConflictOpen(true);
      } else {
        // Check for session expiration
        if (state.message.toLowerCase().includes("token") || 
            state.message.toLowerCase().includes("expirado") ||
            state.message.toLowerCase().includes("autenticação")) {
            
             toast({
                title: "Sessão Expirada",
                description: "Por favor, faça login novamente.",
                variant: "destructive",
            });
            // Redirect?
        } else {
             toast({ title: "Erro", description: state.message, variant: "destructive" });
        }
      }
    }
  }, [state, toast]);

  const handleForceSubmit = () => {
      setForceSubmission(true);
      // setIsConflictOpen(false); // Removed: Keep open until success to prevent removeChild race condition
      // Wait for state to update then submit
      setTimeout(() => {
          formRef.current?.requestSubmit();
      }, 0);
  };

  const handleOpenNew = (selectedDate?: Date) => {
    setSlotAction(null); // Close context menu
    setEditingAppointment(null);
    setNewAppointmentDate(selectedDate || date);
    setRecurrenceType("none");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (app: Appointment) => {
    setEditingAppointment(app);
    setNewAppointmentDate(null);
    setRecurrenceType("none");
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
    setBlockRecurrenceType("none");
    setBlockRecurrenceCount(1);
    setSlotAction(null);
    setIsBlockDialogOpen(true);
  };

  const handleCreateBlock = async (formData: FormData) => {
    const dataInicio = formData.get('data_inicio') as string;
    const dataFim = formData.get('data_fim') as string;
    const motivo = formData.get('motivo') as string;
    const diaInteiro = formData.get('dia_inteiro') === 'on';

    // 1. Check for conflicts first
    const conflictResult = await checkBlockConflicts(dataInicio, dataFim, blockRecurrenceType, blockRecurrenceCount);

    if (conflictResult.total > 0) {
      // Conflicts found, open decision dialog
      setConflictData({ count: conflictResult.total, start: dataInicio, end: dataFim, motivo, diaInteiro });
      setIsBlockDialogOpen(false); // Close the input dialog
      setIsConflictDialogOpen(true);
      return;
    }

    // No conflicts, proceed normally
    const result = await createBloqueio(dataInicio, dataFim, motivo, diaInteiro, blockRecurrenceType, blockRecurrenceCount);
    if (result && result.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-green-500 text-white" });
      setIsBlockDialogOpen(false);
      setNewAppointmentDate(null);
    } else {
      toast({ title: "Erro", description: result?.message || "Erro desconhecido ao criar bloqueio.", variant: "destructive" });
    }
  };

  const confirmBlockCreation = async (cancelConflicts: boolean) => {
    if (!conflictData) return;

    const result = await createBloqueio(
      conflictData.start, 
      conflictData.end, 
      conflictData.motivo, 
      conflictData.diaInteiro, 
      blockRecurrenceType, 
      blockRecurrenceCount,
      cancelConflicts
    );

    if (result && result.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-green-500 text-white" });
      setIsConflictDialogOpen(false);
      setConflictData(null);
      setNewAppointmentDate(null);
    } else {
      toast({ title: "Erro", description: result?.message || "Erro ao criar bloqueio com resolução de conflitos.", variant: "destructive" });
    }
  };

  const handleDeleteBlock = async (id: string, mode?: 'single' | 'all_future') => {
    const result = await deleteBloqueio(id, mode);
    if (result.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-green-500 text-white" });
      setIsConfirmDeleteBlockOpen(false);
      // setBlockToDelete(null); // Keep state to avoid layout shift/error during close animation
    } else {
      toast({ title: "Erro", description: result.message, variant: "destructive" });
    }
  };

  const initDeleteBlock = (id: string, recorrencia_id?: string) => {
      console.log('initDeleteBlock called with:', { id, recorrencia_id });
      setBlockToDelete({ id, recorrencia_id });
      setSlotAction(null);
      setIsConfirmDeleteBlockOpen(true);
  };

  const handleDelete = (id: string) => {
      // Find appointment to check recurrence
      const app = appointments.find(a => a.id === id);
      const recorrenciaId = app?.recorrencia_id;

      if (recorrenciaId) {
          setApptToDelete({ id, recorrencia_id: recorrenciaId });
          setIsConfirmDeleteApptOpen(true);
      } else {
          // Open single delete confirmation
          // We don't need to setApptToDelete for single, as we rely on editingAppointment, 
          // BUT executeDelete uses the ID passed.
          // Wait, 'isDeleteOpen' dialog uses 'editingAppointment.id'.
          setIsDeleteOpen(true);
      }
  };

  const executeDelete = async (id: string, mode: 'single' | 'all_future') => {
      // Close confirmation dialogs FIRST to avoid conflict with parent dialog closure
      setIsConfirmDeleteApptOpen(false);
      setIsDeleteOpen(false);
      
      const result = await deleteAgendamento(id, mode);
      
      if (result.success) {
          toast({
              title: "Sucesso",
              description: result.message,
              className: "bg-green-500 text-white",
          });
          
          setApptToDelete(null);
          setIsDialogOpen(false); // Close edit dialog finally
          setEditingAppointment(null);
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

 
  
  const handleReactivate = async (id: string) => {
    const result = await reactivateAgendamento(id);
    if (result.success) {
      toast({
        title: "Sessão Reativada",
        description: result.message,
        className: "bg-green-500 text-white",
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
            <form 
              ref={formRef}
              key={editingAppointment ? editingAppointment.id : "new-appointment"}
              action={(formData) => {
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
              <input type="hidden" name="force" value={forceSubmission.toString()} />
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paciente" className="text-right">
                  Paciente
                </Label>
                <div className="col-span-3">
                    <Select 
                        name="paciente_id" 
                        required 
                        defaultValue={editingAppointment?.paciente_id || ""}
                        onValueChange={setSelectedPatientId}
                    >
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

              {!editingAppointment && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="recorrencia_tipo" className="text-right">
                      Repetir
                    </Label>
                    <div className="col-span-3 flex flex-col gap-2">
                        <div className="flex gap-2">
                            <Select name="recorrencia_tipo" value={recurrenceType} onValueChange={setRecurrenceType}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Não repetir" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Não repetir</SelectItem>
                                    <SelectItem value="semanal">Semanalmente</SelectItem>
                                    <SelectItem value="quinzenal">Quinzenalmente</SelectItem>
                                </SelectContent>
                            </Select>
                            
                            {recurrenceType !== 'none' && (
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="quantidade_recorrencia" className="whitespace-nowrap text-sm text-muted-foreground">x vezes:</Label>
                                    <Input 
                                        type="number" 
                                        name="quantidade_recorrencia" 
                                        className="w-20" 
                                        min="2" 
                                    max="120" 
                                    defaultValue="4"
                                    id="quantidade_recorrencia_input"
                                    onInput={(e) => {
                                        const input = e.currentTarget;
                                        if (input.value && parseInt(input.value) > 120) input.value = "120";
                                    }}
                                />
                                </div>
                            )}
                        </div>

                        {recurrenceType !== 'none' && (
                             <div className="flex gap-2 text-xs">
                                <button 
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => {
                                        const now = newAppointmentDate || new Date();
                                        const currentYear = now.getFullYear();
                                        const endOfYear = new Date(currentYear, 11, 31);
                                        const diffTime = Math.abs(endOfYear.getTime() - now.getTime());
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        
                                        let count = 0;
                                        if (recurrenceType === 'semanal') {
                                            count = Math.floor(diffDays / 7);
                                        } else if (recurrenceType === 'quinzenal') {
                                            count = Math.floor(diffDays / 14);
                                        }
                                        
                                        const input = document.getElementById('quantidade_recorrencia_input') as HTMLInputElement;
                                        if (input) input.value = Math.min(Math.max(count, 1), 120).toString();
                                    }}
                                >
                                    Até o fim de {newAppointmentDate?.getFullYear() || new Date().getFullYear()}
                                </button>
                                <span className="text-muted-foreground">|</span>
                                <button 
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => {
                                        const now = newAppointmentDate || new Date();
                                        const nextYear = now.getFullYear() + 1;
                                        const endOfNextYear = new Date(nextYear, 11, 31);
                                        const diffTime = Math.abs(endOfNextYear.getTime() - now.getTime());
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        
                                        let count = 0;
                                        if (recurrenceType === 'semanal') {
                                            count = Math.floor(diffDays / 7);
                                        } else if (recurrenceType === 'quinzenal') {
                                            count = Math.floor(diffDays / 14);
                                        }
                                        
                                        const input = document.getElementById('quantidade_recorrencia_input') as HTMLInputElement;
                                        if (input) input.value = Math.min(Math.max(count, 1), 120).toString();
                                    }}
                                >
                                    Até o fim de {(newAppointmentDate?.getFullYear() || new Date().getFullYear()) + 1}
                                </button>
                             </div>
                        )}
                    </div>
                  </div>
              )}

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

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="observacoes" className="text-right mt-2">
                  Notas
                </Label>
                <div className="col-span-3">
                    <Textarea 
                        id="observacoes" 
                        name="observacoes" 
                        placeholder="Adicione observações sobre a sessão..."
                        className="min-h-[80px]"
                        defaultValue={editingAppointment?.observacoes || ""}
                    />
                </div>
              </div>

              {selectedPatientId && (
                  <div className="flex justify-end">
                      <Link 
                        href={`/patients/${selectedPatientId}`} 
                        target="_blank"
                        className="text-sm text-primary flex items-center gap-1 hover:underline"
                      >
                          <FileText className="h-4 w-4" />
                          Ir para Prontuário
                          <ExternalLink className="h-3 w-3" />
                      </Link>
                  </div>
              )}
                <DialogFooter className="flex w-full items-center justify-between sm:justify-between">
                {editingAppointment && (
                  <>
                     <Button variant="destructive" type="button" size="icon" onClick={() => handleDelete(editingAppointment.id)}>
                          <Trash2 className="h-4 w-4" />
                     </Button>

                    {/* Cancel Session Button */}
                    {editingAppointment.status !== 'cancelado' && (
                          <Button variant="outline" type="button" className="border-orange-500 text-orange-500 hover:bg-orange-50" onClick={() => setIsCancelOpen(true)}>
                            ✕ Cancelar Sessão
                          </Button>
                    )}
                    {editingAppointment.status === 'cancelado' && (
                        <div className="flex items-center gap-2">
                             <span className="text-orange-500 text-sm font-medium">✕ Sessão Cancelada</span>
                             <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-8 border-green-600 text-green-600 hover:bg-green-50"
                                onClick={() => handleReactivate(editingAppointment.id)}
                            >
                                ⟳ Reativar
                             </Button>
                        </div>
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

         {/* EXCLUDED FROM NESTING: Confirm Delete Dialog */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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
                        executeDelete(editingAppointment.id, 'single');
                    }
                }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* EXCLUDED FROM NESTING: Confirm Conflict Dialog */}
        <AlertDialog open={isConflictOpen} onOpenChange={setIsConflictOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Conflito de Horário</AlertDialogTitle>
                <AlertDialogDescription>
                    Já existe um agendamento neste horário. Deseja agendar mesmo assim?
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setForceSubmission(false)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleForceSubmit} className="bg-orange-500 text-white hover:bg-orange-600">
                    Sim, agendar
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* EXCLUDED FROM NESTING: Confirm Cancel Dialog */}
        <AlertDialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
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
                    setIsCancelOpen(false);
                    }
                }} className="bg-orange-500 text-white hover:bg-orange-600">
                    Confirmar Cancelamento
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* EXCLUDED FROM NESTING: Confirm Edit Recurrence Dialog */}
        <AlertDialog open={isConfirmEditRecurrenceOpen} onOpenChange={setIsConfirmEditRecurrenceOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Editar Agendamento Recorrente</AlertDialogTitle>
                <AlertDialogDescription>
                    Este agendamento é parte de uma série. Você deseja aplicar as alterações apenas neste agendamento ou em todos os agendamentos seguintes?
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:justify-start gap-2">
                <AlertDialogCancel onClick={() => setIsConfirmEditRecurrenceOpen(false)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleConfirmEditRecurrence('single')}>
                    Apenas este
                </AlertDialogAction>
                <AlertDialogAction onClick={() => handleConfirmEditRecurrence('all_future')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Este e os seguintes
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

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
                    placeholder="Ex: Reunião, Compromisso pessoal..."
                  />
                </div>
              </div>

               {/* Recurrence Options for Block */}
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label htmlFor="block_recurrence_type" className="text-right">
                   Repetir
                 </Label>
                 <div className="col-span-3 flex flex-col gap-2">
                     <div className="flex gap-2">
                         <Select value={blockRecurrenceType} onValueChange={setBlockRecurrenceType}>
                             <SelectTrigger className="w-[180px]">
                                 <SelectValue placeholder="Não repetir" />
                             </SelectTrigger>
                             <SelectContent>
                                 <SelectItem value="none">Não repetir</SelectItem>
                                 <SelectItem value="semanal">Semanalmente</SelectItem>
                                 <SelectItem value="quinzenal">Quinzenalmente</SelectItem>
                             </SelectContent>
                         </Select>
                         
                         {blockRecurrenceType !== 'none' && (
                             <div className="flex items-center gap-2">
                                 <Label htmlFor="block_recurrence_count" className="whitespace-nowrap text-sm text-muted-foreground">x vezes:</Label>
                                 <Input 
                                     type="number" 
                                     className="w-20" 
                                     min="2" 
                                     max="120" 
                                     value={blockRecurrenceCount}
                                     onChange={(e) => {
                                         let val = parseInt(e.target.value);
                                         if (isNaN(val)) val = 1;
                                         if (val > 120) val = 120;
                                         setBlockRecurrenceCount(val);
                                     }}
                                 />
                             </div>
                         )}
                     </div>

                     {blockRecurrenceType !== 'none' && (
                          <div className="flex gap-2 text-xs">
                             <button 
                                 type="button"
                                 className="text-primary hover:underline"
                                 onClick={() => {
                                     const now = newAppointmentDate || new Date();
                                     const currentYear = now.getFullYear();
                                     const endOfYear = new Date(currentYear, 11, 31);
                                     const diffTime = Math.abs(endOfYear.getTime() - now.getTime());
                                     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                     
                                     let count = 0;
                                     if (blockRecurrenceType === 'semanal') {
                                         count = Math.floor(diffDays / 7);
                                     } else if (blockRecurrenceType === 'quinzenal') {
                                         count = Math.floor(diffDays / 14);
                                     }
                                     
                                     setBlockRecurrenceCount(Math.min(Math.max(count, 1), 120));
                                 }}
                             >
                                 Até o fim de {newAppointmentDate?.getFullYear() || new Date().getFullYear()}
                             </button>
                             <span className="text-muted-foreground">|</span>
                             <button 
                                 type="button"
                                 className="text-primary hover:underline"
                                 onClick={() => {
                                     const now = newAppointmentDate || new Date();
                                     const nextYear = now.getFullYear() + 1;
                                     const endOfNextYear = new Date(nextYear, 11, 31);
                                     const diffTime = Math.abs(endOfNextYear.getTime() - now.getTime());
                                     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                     
                                     let count = 0;
                                     if (blockRecurrenceType === 'semanal') {
                                         count = Math.floor(diffDays / 7);
                                     } else if (blockRecurrenceType === 'quinzenal') {
                                         count = Math.floor(diffDays / 14);
                                     }
                                     
                                     setBlockRecurrenceCount(Math.min(Math.max(count, 1), 120));
                                 }}
                             >
                                 Até o fim de {(newAppointmentDate?.getFullYear() || new Date().getFullYear()) + 1}
                             </button>
                          </div>
                     )}
                 </div>
               </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsBlockDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Bloquear</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Conflict Resolution Dialog */}
        <AlertDialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>⚠️ Conflito de Agendamento</AlertDialogTitle>
              <AlertDialogDescription>
                Existem <b>{conflictData?.count}</b> agendamento(s) no período que você está tentando bloquear.
                <br /><br />
                O que deseja fazer com os agendamentos existentes?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:justify-end gap-2 sm:flex-row">
              <AlertDialogCancel onClick={() => {
                setIsConflictDialogOpen(false);
                setConflictData(null);
                setIsBlockDialogOpen(true); // Re-open block dialog to adjust if needed
              }}>
                Cancelar Operação
              </AlertDialogCancel>
              
              <Button variant="outline" onClick={() => confirmBlockCreation(false)}>
                Manter Agendamentos
              </Button>
              
              <Button variant="destructive" onClick={() => confirmBlockCreation(true)}>
                Cancelar Agendamentos
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Block Confirmation Dialog */}
        <AlertDialog open={isConfirmDeleteBlockOpen} onOpenChange={setIsConfirmDeleteBlockOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remover Bloqueio</AlertDialogTitle>
                    <AlertDialogDescription>
                        {blockToDelete?.recorrencia_id 
                            ? "Este é um bloqueio recorrente. O que você deseja fazer?" 
                            : "Tem certeza que deseja remover este bloqueio?"}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:justify-start gap-2">
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    {blockToDelete?.recorrencia_id ? (
                        <>
                            <AlertDialogAction onClick={() => blockToDelete && handleDeleteBlock(blockToDelete.id, 'single')}>
                                Apenas este
                            </AlertDialogAction>
                            <AlertDialogAction onClick={() => blockToDelete && handleDeleteBlock(blockToDelete.id, 'all_future')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Este e os seguintes
                            </AlertDialogAction>
                        </>
                    ) : (
                         <AlertDialogAction onClick={() => blockToDelete && handleDeleteBlock(blockToDelete.id, 'single')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Remover
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Delete Appointment Confirmation Dialog */}
        <AlertDialog open={isConfirmDeleteApptOpen} onOpenChange={setIsConfirmDeleteApptOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Agendamento</AlertDialogTitle>
                    <AlertDialogDescription>
                        Este agendamento faz parte de uma série recorrente. O que você deseja fazer?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:justify-start gap-2">
                    <AlertDialogCancel onClick={() => setApptToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => apptToDelete && executeDelete(apptToDelete.id, 'single')}>
                        Apenas este
                    </AlertDialogAction>
                    <AlertDialogAction onClick={() => apptToDelete && executeDelete(apptToDelete.id, 'all_future')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Este e os seguintes
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

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
                       // Find the block to check for recurrence
                       const block = bloqueios.find(b => b.id === slotAction.bloqueioId);
                       initDeleteBlock(slotAction.bloqueioId, block?.recorrencia_id);
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
                modifiers={{
                    hasAppointment: (date) => appointmentDays.has(date.toDateString())
                }}
                modifiersClassNames={{
                    hasAppointment: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-primary after:rounded-full relative"
                }}
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
                day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 rounded-full hover:bg-accent hover:text-accent-foreground flex items-center justify-center", // Added flex centering
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
                    onDeleteBloqueio={initDeleteBlock}
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
                    onDeleteBloqueio={initDeleteBlock}
                  />
              </div>
          )}
        </div>
      </main>
    </div>
  );
}

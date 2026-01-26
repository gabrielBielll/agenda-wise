'use client';

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, ExternalLink, Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormState, useFormStatus } from "react-dom";
import { createAgendamento, updateAgendamento, FormState } from "./actions";
import { useToast } from "@/hooks/use-toast";

// Define interface for Appointment
interface Appointment {
  id: string;
  data_hora_sessao: string;
  nome_paciente: string;
  paciente_id?: string; // Needed for pre-filling edit form
  valor_consulta?: number;
}

interface Paciente {
  id: string;
  nome: string;
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
      {pending ? (isEditing ? "Atualizando..." : "Criando...") : (isEditing ? "Salvar Alterações" : "Agendar")}
    </Button>
  );
}

export default function CalendarClient({ appointments, pacientes }: { appointments: Appointment[], pacientes: Paciente[] }) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isSynced, setIsSynced] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
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
      } else {
        toast({
            title: "Erro",
            description: state.message,
            variant: "destructive",
        });
      }
    }
  }, [state, toast]);

  const handleSyncGoogleCalendar = () => {
    setIsSynced(true);
    alert("Sincronização com Google Agenda iniciada (simulado).");
  };

  const handleOpenNew = () => {
    setEditingAppointment(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (app: Appointment) => {
    setEditingAppointment(app);
    setIsDialogOpen(true);
  };

  // Filter appointments for the selected date
  const filteredAppointments = appointments.filter(app => {
    if (!date) return false;
    const appDate = new Date(app.data_hora_sessao);
    const match = appDate.toDateString() === date.toDateString();
    return match;
  });

  console.log("DEBUG: CalendarClient render. Date:", date?.toDateString(), "Total:", appointments.length, "Filtered:", filteredAppointments.length);

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-headline text-3xl">Meu Calendário</CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Gerencie seus agendamentos e sincronize com o Google Agenda.
              </CardDescription>
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="mt-4 sm:mt-0" onClick={handleOpenNew}>
                  <PlusCircle className="mr-2 h-5 w-5" /> Novo Agendamento
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
                  <DialogDescription>
                    {editingAppointment ? "Atualize os dados da sessão." : "Agende uma sessão para um de seus pacientes."}
                  </DialogDescription>
                </DialogHeader>
                <form action={formAction} className="grid gap-4 py-4">
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
                                {pacientes.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                         {state.errors?.paciente_id && <p className="text-xs text-destructive mt-1">{state.errors.paciente_id[0]}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="data_hora_sessao" className="text-right">
                      Data/Hora
                    </Label>
                    <div className="col-span-3">
                        <Input
                        id="data_hora_sessao"
                        name="data_hora_sessao"
                        type="datetime-local"
                        required
                        defaultValue={editingAppointment ? (() => {
                          const date = new Date(editingAppointment.data_hora_sessao);
                          // Format to YYYY-MM-DDThh:mm in LOCAL time
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const hours = String(date.getHours()).padStart(2, '0');
                          const minutes = String(date.getMinutes()).padStart(2, '0');
                          return `${year}-${month}-${day}T${hours}:${minutes}`;
                        })() : ""}
                        />
                         {state.errors?.data_hora_sessao && <p className="text-xs text-destructive mt-1">{state.errors.data_hora_sessao[0]}</p>}
                    </div>
                  </div>
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
                  <DialogFooter>
                    <SubmitButton isEditing={!!editingAppointment} />
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

          </div>
        </CardHeader>
        <CardContent>
          {!isSynced && (
            <div className="mb-6 p-4 bg-accent/20 border border-accent rounded-lg text-center">
              <p className="text-accent-foreground mb-2">Seu Google Agenda ainda não está sincronizado.</p>
              <Button onClick={handleSyncGoogleCalendar} variant="default">
                <ExternalLink className="mr-2 h-4 w-4" /> Sincronizar com Google Agenda
              </Button>
            </div>
          )}
          {isSynced && (
             <div className="mb-6 p-4 bg-green-100 border border-green-600 text-green-700 rounded-lg text-center">
              <p>Sincronizado com sucesso com o Google Agenda (simulado).</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border shadow-md bg-card p-0"
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 p-4",
                  month: "space-y-4 w-full",
                  caption_label: "font-headline text-xl",
                  day: "h-10 w-10 rounded-md hover:bg-secondary",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground rounded-md",
                }}
              />
            </div>
            <div className="md:col-span-1 space-y-4">
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="font-headline text-xl">
                    Agendamentos para {date ? date.toLocaleDateString('pt-BR') : 'data selecionada'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {filteredAppointments.length > 0 ? (
                      filteredAppointments.map(app => (
                        <li key={app.id} className="p-3 bg-secondary/50 rounded-md flex justify-between items-center group">
                          <span>
                             {new Date(app.data_hora_sessao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {app.nome_paciente}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleOpenEdit(app)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </li>
                      ))
                    ) : (
                      <li className="p-3 text-muted-foreground">Não há mais agendamentos para hoje.</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

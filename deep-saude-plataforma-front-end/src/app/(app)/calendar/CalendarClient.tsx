'use client';

import { Button } from "@/components/ui/button";
import { descreveSessaoEmConflito, type SessaoEmConflito } from "@/lib/conflitos";
import { paraInputLocal, maisMinutos, paredeDaClinica, agoraNaClinica,
         paredeParaInput, paredeSomada, paredeMaisMinutos, instanteDeParede } from "@/lib/datetime";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, FileText, ExternalLink, CalendarCheck2, CheckCircle2 } from "lucide-react";
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
import { createAgendamento, updateAgendamento, deleteAgendamento, cancelAgendamento, reactivateAgendamento, updateAppointmentStatus, createBloqueio, deleteBloqueio, FormState, type Bloqueio } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { useLoading } from "@/components/LoadingOverlay";
import { CalendarHeader } from "./CalendarHeader";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { cn } from "@/lib/utils";
import { appointmentHasEnded, appointmentStatusAppearance, normalizeAppointmentStatus, type AppointmentStatus } from "@/lib/appointment-status";

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



// Datas na grade e nos formulários são horário de parede da CLÍNICA — espelhos
// de `paredeDaClinica`, não instantes. Ver o cabeçalho de lib/datetime.ts.
const addMinutes = paredeSomada;


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

interface StatusTransition {
  status: Extract<AppointmentStatus, 'confirmado' | 'realizado'>;
  title: string;
  description: string;
  action: string;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-w-[110px]">
      {pending ? (isEditing ? "Atualizando..." : "Criando...") : (isEditing ? "Salvar" : "Agendar")}
    </Button>
  );
}

export default function CalendarClient({ appointments, pacientes, bloqueios = [] }: { appointments: Appointment[], pacientes: Paciente[], bloqueios?: Bloqueio[] }) {
  const [date, setDate] = useState<Date>(agoraNaClinica());
  const [view, setView] = useState<'month' | 'week' | 'day'>('week'); // Default to week view potentially

  const appointmentDays = useMemo(() => {
    const days = new Set<string>();
    appointments.forEach(app => {
        days.add(paredeDaClinica(app.data_hora_sessao).toDateString());
    });
    return days;
  }, [appointments]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isConfirmDeleteBlockOpen, setIsConfirmDeleteBlockOpen] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  // R-014: a recusa mostra QUAIS sessões impedem o bloqueio, não só quantas.
  const [sessoesEmConflito, setSessoesEmConflito] = useState<SessaoEmConflito[] | null>(null);
  // R-006: psicólogo tentou forçar e o backend recusou (403).
  const [isForcaNegadaOpen, setIsForcaNegadaOpen] = useState(false);
  /**
   * A-010 — o período do bloqueio vive em estado, não no DOM.
   *
   * Eram campos não controlados (`defaultValue`) dentro de um `Dialog` do Radix
   * sem `forceMount`. O Radix desmonta o conteúdo ao fechar, os nós morrem, e
   * reabrir remontava a partir do slot original — então o botão "Voltar e
   * ajustar" da recusa por conflito devolvia **formulário em branco**, numa tela
   * cujo assunto é justamente não perder o caminho de volta.
   *
   * O módulo do admin já fazia assim (`AgendamentosClient`, `value={blockStart}`)
   * e não perdia nada. Era o grupo de controle que provou o mecanismo sem
   * precisar de teste vermelho antes — ver mensageria 0062 e 0063.
   */
  /**
   * A-022 — o diálogo da SESSÃO tinha o mesmo defeito do diálogo do bloqueio.
   *
   * A A-010 tirou o período do bloqueio do DOM e ninguém foi olhar o vizinho:
   * paciente, início, fim, valor, notas e quantidade continuavam em
   * `defaultValue`, dentro do mesmo `Dialog` do Radix, que desmonta o conteúdo
   * ao fechar.
   *
   * 🔴 Isso custa em dois caminhos desta tela, e os dois são de recusa:
   *
   * 1. `<form action={...}>` reseta os campos descontrolados quando a ação
   *    termina, **sem distinguir sucesso de falha**. Backend fora do ar, valor
   *    recusado, sessão expirada — o formulário voltava em branco.
   * 2. Na recusa por conflito o diálogo continua aberto para a psicóloga
   *    decidir. Era exatamente aí que o reset apagava o que ela tinha acabado
   *    de preencher, numa tela cujo assunto é não perder o caminho de volta.
   *
   * O período nasce semeado em `handleOpenNew`/`handleOpenEdit` — o que o
   * `defaultValue` fazia, só que num lugar que sobrevive ao diálogo fechar. É a
   * mesma solução da A-010, agora no formulário que ficou de fora.
   */
  const sessaoVazia = {
    paciente_id: "",
    data_hora_sessao: "",
    data_hora_fim: "",
    valor_consulta: "",
    observacoes: "",
    quantidade_recorrencia: "4",
  };
  const [sessao, setSessao] = useState(sessaoVazia);
  const mudarSessao =
    (nome: keyof typeof sessaoVazia) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setSessao((c) => ({ ...c, [nome]: e.target.value }));
  /**
   * ⚠️ O teto de 120 vivia em três escritas diretas no DOM (um `onInput` e os
   * dois atalhos de fim de ano). Num campo controlado nada disso gruda: o React
   * reaplica o estado no render seguinte. O limite passa a morar aqui.
   */
  const setQuantidadeSessao = (bruto: string) =>
    setSessao((c) => ({
      ...c,
      quantidade_recorrencia: bruto && parseInt(bruto) > 120 ? "120" : bruto,
    }));

  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockToDelete, setBlockToDelete] = useState<{ id: string, recorrencia_id?: string } | null>(null);
  const [isConfirmDeleteApptOpen, setIsConfirmDeleteApptOpen] = useState(false);
  const [apptToDelete, setApptToDelete] = useState<{ id: string, recorrencia_id?: string } | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false); // For single appt delete (non-recurrent or recurrence choice made)
  const [isCancelOpen, setIsCancelOpen] = useState(false); // For single appt cancel
  const [blockRecurrenceType, setBlockRecurrenceType] = useState<string>("none");
  const [blockRecurrenceCount, setBlockRecurrenceCount] = useState<number>(1);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>(undefined);


  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [statusTransition, setStatusTransition] = useState<StatusTransition | null>(null);

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
  const { showLoading, hideLoading } = useLoading();
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
                setPendingEditData(formData);
                setIsConfirmEditRecurrenceOpen(true);
                return { message: "", success: false };
            } else {
                showLoading("Atualizando agendamento...");
                const mode = formData.get('mode') as 'single' | 'all_future' | undefined;
                result = await updateAgendamento(editingAppointment.id, prevState, formData, mode);
            }
        } else {
            showLoading("Agendando sessão...");
            result = await createAgendamento(prevState, formData);
        }
    } catch (error) {
        console.error("Erro na server action:", error);
        hideLoading();
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

      showLoading("Atualizando agendamento...");
      React.startTransition(() => {
          formAction(pendingEditData);
      });
      
      setIsConfirmEditRecurrenceOpen(false);
      setPendingEditData(null);
  };

  const [state, formAction] = useActionState(action, initialState);



// ... inside component ...

  useEffect(() => {
    hideLoading();
    if (state.message) {
      if (state.success) {
        toast({
            title: "Sucesso",
            description: state.message,
            className: "bg-success text-success-foreground",
        });
        
        // Step 1: close dialogs (starts Radix close animation)
        setIsDialogOpen(false);
        setIsConflictOpen(false);
        setIsConfirmEditRecurrenceOpen(false);
        setForceSubmission(false);
        // Step 2: clear appointment state AFTER the dialog animation finishes (~150ms).
        // Changing editingAppointment at the same time as closing causes the Select Portal
        // (rendered in document.body) to become orphaned mid-animation → removeChild crash.
        setTimeout(() => {
            setEditingAppointment(null);
            setNewAppointmentDate(null);
        }, 300);
      } else if (state.conflict) {
        setIsConflictOpen(true);
      } else if (state.forcaNegada) {
        // R-006: forçar sobre conflito é do admin da clínica. A recusa pede uma
        // AÇÃO de quem recebeu — falar com a gestão — então é modal, não toast:
        // toast some sozinho e leva a instrução junto.
        setIsConflictOpen(false);
        setForceSubmission(false);
        setIsForcaNegadaOpen(true);
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
    const quando = selectedDate || date;
    setNewAppointmentDate(quando);
    setRecurrenceType("none");
    // A-022: semeia o período com o slot clicado — o que o `defaultValue` fazia.
    setSessao({
      ...sessaoVazia,
      data_hora_sessao: paredeParaInput(quando),
      data_hora_fim: paredeParaInput(addMinutes(quando, 50)),
    });
    setIsDialogOpen(true);
  };

  /**
   * A-021 — o botão "Nova sessão" apontava para `/calendar/new`, que não existe.
   *
   * 🔴 Medido em 19/08 abrindo o app: quatro pontos de entrada levavam a 404 —
   * o botão primário do topo, o botão flutuante do rodapé no celular, o
   * "Adicionar horário" do painel e o botão do cabeçalho do calendário. É a
   * ação principal da psicóloga, e a mais provável de alguém clicar numa
   * demonstração.
   *
   * A tela nunca precisou dessa rota: a sessão nova nasce num diálogo daqui.
   * Então os links passam a trazer `?nova=1` e o diálogo abre na chegada.
   *
   * ⚠️ Leio de `window.location` e não de `useSearchParams` de propósito: o
   * hook exige fronteira de Suspense para a renderização estática, e trocar o
   * desenho de renderização de uma tela grande para consertar um link é preço
   * que não combina com o tamanho do defeito. Aqui já é código de cliente.
   *
   * O `replaceState` limpa o parâmetro para que recarregar a página, ou voltar
   * para ela, não reabra o diálogo sozinho.
   */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('nova')) return;
    window.history.replaceState(null, '', window.location.pathname);
    handleOpenNew();
    // Só na montagem: é a intenção que veio na URL, não um estado contínuo.
  }, []);

  const handleOpenEdit = (app: Appointment) => {
    setEditingAppointment(app);
    setNewAppointmentDate(null);
    setRecurrenceType("none");
    // A-022: os dados da sessão em edição nascem no estado, não no DOM.
    setSessao({
      ...sessaoVazia,
      paciente_id: app.paciente_id || "",
      data_hora_sessao: paraInputLocal(app.data_hora_sessao),
      data_hora_fim: paraInputLocal(maisMinutos(app.data_hora_sessao, app.duracao || 50)),
      valor_consulta: String(app.valor_consulta ?? ""),
      observacoes: app.observacoes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSlotClick = (selectedDate: Date, event?: React.MouseEvent, isBlocked?: boolean, bloqueioId?: string) => {
    // Show context menu with options
    if (event) {
      const menuWidth = 184;
      const clampedX = Math.min(event.clientX, window.innerWidth - menuWidth);
      setSlotAction({ date: selectedDate, x: clampedX, y: event.clientY, isBlocked, bloqueioId });
    } else if (!isBlocked) {
      handleOpenNew(selectedDate);
    }
  };

  const handleOpenBlock = () => {
    if (slotAction) {
      setNewAppointmentDate(slotAction.date);
      // Semeia o período com o slot clicado — o que o `defaultValue` fazia, só
      // que agora num lugar que sobrevive ao diálogo fechar.
      setBlockStart(paredeParaInput(slotAction.date));
      setBlockEnd(paredeParaInput(addMinutes(slotAction.date, 60)));
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

    // Sem pré-checagem: o backend recusa e devolve as sessões atingidas na
    // própria recusa (R-014). Perguntar antes seria uma ida a mais que responde
    // o que a criação já responde — e que pode discordar dela entre as duas.
    showLoading("Criando bloqueio...");
    const result = await createBloqueio(dataInicio, dataFim, motivo, diaInteiro, blockRecurrenceType, blockRecurrenceCount);
    hideLoading();

    if (result?.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-success text-success-foreground" });
      setIsBlockDialogOpen(false);
      setNewAppointmentDate(null);
      return;
    }

    if (result?.sessoes) {
      setSessoesEmConflito(result.sessoes);
      setIsBlockDialogOpen(false);
      setIsConflictDialogOpen(true);
      return;
    }

    toast({ title: "Erro", description: result?.message || "Erro desconhecido ao criar bloqueio.", variant: "destructive" });
  };

  // `confirmBlockCreation` foi removida em 2026-08-16. Ela oferecia duas saídas
  // e a R-014 fechou as duas: "Cancelar Agendamentos" era cancelamento em massa
  // escondido dentro de criar bloqueio, e "Manter Agendamentos" mandava criar o
  // bloqueio por cima da sessão — que o backend agora recusa de qualquer forma.

  const handleDeleteBlock = async (id: string, mode?: 'single' | 'all_future') => {
    showLoading("Excluindo bloqueio...");
    const result = await deleteBloqueio(id, mode);
    hideLoading();
    if (result.success) {
      toast({ title: "Sucesso", description: result.message, className: "bg-success text-success-foreground" });
      setIsConfirmDeleteBlockOpen(false);
    } else {
      toast({ title: "Erro", description: result.message, variant: "destructive" });
    }
  };

  const initDeleteBlock = (id: string, recorrencia_id?: string) => {
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
      setIsConfirmDeleteApptOpen(false);
      setIsDeleteOpen(false);

      showLoading("Excluindo agendamento...");
      const result = await deleteAgendamento(id, mode);
      hideLoading();

      if (result.success) {
          toast({
              title: "Sucesso",
              description: result.message,
              className: "bg-success text-success-foreground",
          });
          setApptToDelete(null);
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

  const handleCancel = async (id: string) => {
    showLoading("Cancelando sessão...");
    const result = await cancelAgendamento(id);
    hideLoading();
    if (result.success) {
      toast({
        title: "Sessão Cancelada",
        description: result.message,
        className: "bg-tomate-suave text-tomate-foreground border-tomate",
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
    showLoading("Reativando sessão...");
    const result = await reactivateAgendamento(id);
    hideLoading();
    if (result.success) {
      toast({
        title: "Sessão Reativada",
        description: result.message,
        className: "bg-success text-success-foreground",
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

  const handleStatusUpdate = async () => {
    if (!editingAppointment || !statusTransition) return;
    showLoading(statusTransition.status === 'realizado' ? "Confirmando sessão..." : "Confirmando agendamento...");
    const result = await updateAppointmentStatus(editingAppointment.id, statusTransition.status);
    hideLoading();
    setStatusTransition(null);

    if (result.success) {
      toast({
        title: statusTransition.status === 'realizado' ? "Sessão realizada" : "Agendamento confirmado",
        description: result.message,
        className: "bg-success text-success-foreground",
      });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      return;
    }

    toast({ title: "Não foi possível confirmar", description: result.message, variant: "destructive" });
  };

  const openPrimaryStatusTransition = (appointment: Appointment) => {
    if (appointmentHasEnded(appointment.data_hora_sessao, appointment.duracao || 50)) {
      setStatusTransition({
        status: 'realizado',
        title: 'Confirmar que a sessão aconteceu?',
        description: 'A sessão será marcada como realizada. Essa confirmação alimenta o financeiro e será refletida na cor da agenda.',
        action: 'Sim, a sessão aconteceu',
      });
      return;
    }

    setStatusTransition({
      status: 'confirmado',
      title: 'Confirmar este agendamento?',
      description: 'A sessão continuará no mesmo horário e passará a aparecer em verde-sálvia como confirmada.',
      action: 'Confirmar agendamento',
    });
  };

  // Filter appointments for the selected date (Only for Month View sidebar)
  const filteredAppointments = appointments.filter(app => {
    if (!date) return false;
    const appDate = paredeDaClinica(app.data_hora_sessao);
    const match = appDate.toDateString() === date.toDateString();
    return match;
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-transparent">
      {/* Sidebar */}
      <aside className="hidden w-[260px] flex-shrink-0 flex-col gap-6 border-r border-border/40 bg-card/35 p-4 backdrop-blur-md lg:flex">
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setTimeout(() => {
                setEditingAppointment(null);
                setNewAppointmentDate(null);
              }, 300);
            }
          }}>
          <DialogTrigger asChild>
            <Button className="h-12 w-full justify-start gap-3 rounded-[15px] pl-4" onClick={() => handleOpenNew()}>
              <Plus className="h-5 w-5" />
              <span>Nova sessão</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 sm:max-w-[680px]">
            <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
              <DialogTitle>{editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
              <DialogDescription>
                {editingAppointment ? "Atualize os dados da sessão." : "Agende uma sessão para um de seus pacientes."}
              </DialogDescription>
              {editingAppointment && (
                <span className={cn(
                  "mt-3 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  appointmentStatusAppearance(editingAppointment.status).badgeClassName,
                )}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {appointmentStatusAppearance(editingAppointment.status).label}
                </span>
              )}
            </DialogHeader>
            <form 
              ref={formRef}
              key={editingAppointment ? editingAppointment.id : "new-appointment"}
              action={(formData) => {
                // Determine duration before submitting
                const startStr = formData.get("data_hora_sessao") as string;
                const endStr = formData.get("data_hora_fim") as string;
                
                if (startStr && endStr) {
                    const start = instanteDeParede(startStr);
                    const end = instanteDeParede(endStr);
                    const diffMs = end.getTime() - start.getTime();
                    const diffMins = Math.round(diffMs / 60000);
                    formData.set("duracao", diffMins.toString());
                } else {
                    formData.set("duracao", "50"); // Default fallback
                }
                formAction(formData);
            }} className="flex min-h-0 flex-col overflow-hidden">
              <input type="hidden" name="force" value={forceSubmission.toString()} />
              <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
              <div className="space-y-2">
                <Label htmlFor="paciente">
                  Paciente
                </Label>
                <div>
                    <Select 
                        name="paciente_id" 
                        required 
                        value={sessao.paciente_id}
                        onValueChange={(v) => {
                          setSessao((c) => ({ ...c, paciente_id: v }));
                          setSelectedPatientId(v);
                        }}
                    >
                        <SelectTrigger id="paciente" className="h-11">
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
              
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="data_hora_sessao">
                  Início
                </Label>
                <div>
                    <Input
                    id="data_hora_sessao"
                    name="data_hora_sessao"
                    type="datetime-local"
                    required
                    value={sessao.data_hora_sessao}
                    onChange={(e) => {
                        // O valor do input é parede da clínica: somar 50min com
                        // `new Date` leria no fuso do navegador.
                        //
                        // ⚠️ Antes o fim era preenchido escrevendo em
                        // `endInput.value` direto. Num campo controlado isso não
                        // gruda — o React reaplica o estado no render seguinte.
                        // Agora os dois viajam juntos, no mesmo `setSessao`.
                        const inicio = e.target.value;
                        const fim = paredeMaisMinutos(inicio, 50);
                        setSessao((c) => ({
                            ...c,
                            data_hora_sessao: inicio,
                            data_hora_fim: !c.data_hora_fim && fim ? fim : c.data_hora_fim,
                        }));
                    }}
                    />
                      {state.errors?.data_hora_sessao && <p className="text-xs text-destructive mt-1">{state.errors.data_hora_sessao[0]}</p>}
                </div>
              </div>

               <div className="space-y-2">
                <Label htmlFor="data_hora_fim">
                  Fim
                </Label>
                <div>
                    <Input
                    id="data_hora_fim"
                    name="data_hora_fim"
                    type="datetime-local"
                    required
                    value={sessao.data_hora_fim}
                    onChange={mudarSessao("data_hora_fim")}
                    />
                </div>
              </div>
              </div>
              
              <input type="hidden" name="duracao" defaultValue="50" />

              {!editingAppointment && (
                  <div className="space-y-2">
                    <Label htmlFor="recorrencia_tipo">
                      Repetir
                    </Label>
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Select name="recorrencia_tipo" value={recurrenceType} onValueChange={setRecurrenceType}>
                                <SelectTrigger id="recorrencia_tipo" className="w-full sm:w-[220px]">
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
                                    id="quantidade_recorrencia_input"
                                    value={sessao.quantidade_recorrencia}
                                    onChange={(e) => setQuantidadeSessao(e.target.value)}
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
                                        const now = newAppointmentDate || agoraNaClinica();
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
                                        
                                        setQuantidadeSessao(Math.min(Math.max(count, 1), 120).toString());
                                    }}
                                >
                                    Até o fim de {newAppointmentDate?.getFullYear() || agoraNaClinica().getFullYear()}
                                </button>
                                <span className="text-muted-foreground">|</span>
                                <button 
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => {
                                        const now = newAppointmentDate || agoraNaClinica();
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
                                        
                                        setQuantidadeSessao(Math.min(Math.max(count, 1), 120).toString());
                                    }}
                                >
                                    Até o fim de {(newAppointmentDate?.getFullYear() || agoraNaClinica().getFullYear()) + 1}
                                </button>
                             </div>
                        )}
                    </div>
                  </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="valor_consulta">
                  Valor (R$)
                </Label>
                  <div>
                    <Input
                    id="valor_consulta"
                    name="valor_consulta"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={sessao.valor_consulta}
                    onChange={mudarSessao("valor_consulta")}
                    />
                    {state.errors?.valor_consulta && <p className="text-xs text-destructive mt-1">{state.errors.valor_consulta[0]}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">
                  Notas
                </Label>
                <div>
                    <Textarea 
                        id="observacoes" 
                        name="observacoes" 
                        placeholder="Adicione observações sobre a sessão..."
                        className="min-h-[80px]"
                        value={sessao.observacoes}
                        onChange={mudarSessao("observacoes")}
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
              </div>

              <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/15 px-5 py-4 sm:px-7">
                {editingAppointment && (
                  normalizeAppointmentStatus(editingAppointment.status) === 'agendado'
                  || (normalizeAppointmentStatus(editingAppointment.status) === 'confirmado'
                    && appointmentHasEnded(editingAppointment.data_hora_sessao, editingAppointment.duracao || 50))
                ) && (
                  <Button
                    type="button"
                    className="h-11 w-full gap-2 bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => openPrimaryStatusTransition(editingAppointment)}
                  >
                    {appointmentHasEnded(editingAppointment.data_hora_sessao, editingAppointment.duracao || 50)
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <CalendarCheck2 className="h-4 w-4" />}
                    {appointmentHasEnded(editingAppointment.data_hora_sessao, editingAppointment.duracao || 50)
                      ? 'Confirmar que a sessão aconteceu'
                      : 'Confirmar agendamento'}
                  </Button>
                )}

                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {editingAppointment && (
                      <Button variant="outline" type="button" size="icon" className="shrink-0 border-destructive/45 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(editingAppointment.id)} aria-label="Excluir agendamento">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {editingAppointment && editingAppointment.status !== 'cancelado' && (
                      <Button variant="outline" type="button" className="flex-1 border-destructive/45 text-destructive hover:bg-destructive/10 sm:flex-none" onClick={() => setIsCancelOpen(true)}>
                        Cancelar sessão
                      </Button>
                    )}
                    {editingAppointment?.status === 'cancelado' && (
                      <Button type="button" variant="outline" className="border-success/45 text-success hover:bg-success/10" onClick={() => handleReactivate(editingAppointment.id)}>
                        Reativar sessão
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => setIsDialogOpen(false)}>Fechar</Button>
                    {(!editingAppointment || editingAppointment.status !== 'cancelado') && (
                      <SubmitButton isEditing={!!editingAppointment} />
                    )}
                  </div>
                </div>
              </div>
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
                {/* ⚠️ O ÚNICO laranja cru que sobrou nesta tela, e é de propósito.
                    Os outros viraram token porque pintavam ESTADO (cancelada,
                    bloqueio) e discordavam da grade. Este não é estado: é uma
                    ação de "siga apesar do aviso", e para isso o projeto não tem
                    token — não há `--aviso` nem `--info`. Inventar um sem o
                    Gabriel decidir seria trocar uma escolha não feita por outra,
                    que foi exatamente onde a `vale` parou na varredura de cor.
                    Não colide com a convenção da R-017 porque botão não é chip
                    de evento. Ver docs/GOOGLE_CORES_E_RECONCILIACAO.md §12. */}
                <AlertDialogAction onClick={handleForceSubmit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
                }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Confirmar Cancelamento
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!statusTransition} onOpenChange={(open) => !open && setStatusTransition(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{statusTransition?.title}</AlertDialogTitle>
              <AlertDialogDescription>{statusTransition?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStatusTransition(null)}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleStatusUpdate}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {statusTransition?.action}
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
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
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
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
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
                                     const now = newAppointmentDate || agoraNaClinica();
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
                                 Até o fim de {newAppointmentDate?.getFullYear() || agoraNaClinica().getFullYear()}
                             </button>
                             <span className="text-muted-foreground">|</span>
                             <button 
                                 type="button"
                                 className="text-primary hover:underline"
                                 onClick={() => {
                                     const now = newAppointmentDate || agoraNaClinica();
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
                                 Até o fim de {(newAppointmentDate?.getFullYear() || agoraNaClinica().getFullYear()) + 1}
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

        {/* R-006 — o psicólogo não força agendamento sobre conflito */}
        <AlertDialog open={isForcaNegadaOpen} onOpenChange={setIsForcaNegadaOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Esse horário já tem sessão marcada</AlertDialogTitle>
              <AlertDialogDescription>
                Só a administração da clínica pode marcar duas sessões no mesmo
                horário. <b>Entre em contato com a gestão da clínica</b> para
                resolver — informando o dia e a hora que você estava tentando
                agendar.
                <br /><br />
                Nada foi agendado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsForcaNegadaOpen(false)}>
                Entendi
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Conflict Resolution Dialog */}
        <AlertDialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Não dá para bloquear esse período</AlertDialogTitle>
              <AlertDialogDescription>
                Há {sessoesEmConflito?.length === 1 ? 'uma sessão marcada' : `${sessoesEmConflito?.length ?? 0} sessões marcadas`} dentro dele.
                Remarque ou cancele {sessoesEmConflito?.length === 1 ? 'a sessão' : 'as sessões'} antes de bloquear.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* R-014: mostrar dia e hora de cada sessão atingida, para dar o que resolver. */}
            <ul className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
              {(sessoesEmConflito ?? []).map((sessao) => (
                <li key={sessao.id} className="py-0.5 font-medium tabular-nums">
                  {descreveSessaoEmConflito(sessao)}
                </li>
              ))}
            </ul>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setIsConflictDialogOpen(false);
                setSessoesEmConflito(null);
                setIsBlockDialogOpen(true); // volta para ajustar o período
              }}>
                Voltar e ajustar
              </AlertDialogCancel>
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-sm flex items-center gap-2 text-grafite"
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

        <div className="rounded-[18px] border border-border/70 bg-card/55 p-3 shadow-[var(--quiet-shadow-soft)]">
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
                head_row: "flex w-full",
                head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[0.7rem] text-center",
                row: "flex w-full mt-2",
                cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent",
                day: "h-7 w-7 p-0 font-normal aria-selected:opacity-100 rounded-full hover:bg-accent hover:text-accent-foreground flex items-center justify-center",
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
        <div className="flex-shrink-0 border-b border-border/35 bg-background/35 px-4 py-3 sm:px-6">
             <CalendarHeader 
                date={date} 
                setDate={setDate} 
                view={view} 
                setView={setView} 
                onToday={() => setDate(agoraNaClinica())}
            />
            <div className="mt-3 flex max-w-full gap-x-4 gap-y-2 overflow-x-auto pb-1 text-[10px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Legenda dos estados da agenda">
              {[
                ['Agendada', 'bg-agenda-agendada'],
                ['Confirmada', 'bg-agenda-confirmada'],
                ['Realizada', 'bg-success'],
                ['Cancelada ou falta', 'bg-tomate'],
              ].map(([label, color]) => (
                <span key={label} className="flex shrink-0 items-center gap-1.5">
                  <i className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
        </div>
        
        <div className="flex-1 overflow-hidden p-3 sm:p-5">
             {view === 'month' && (
             <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
                <div className="h-full">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    className="h-full w-full rounded-[20px] border border-border/70 bg-card/70 p-0 shadow-[var(--quiet-shadow-soft)] backdrop-blur-md"
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
                             const dayAppointments = appointments.filter(app => paredeDaClinica(app.data_hora_sessao).toDateString() === dayDate.toDateString());
                             
                             return (
                                 <div className="w-full h-full flex flex-col gap-1 items-start" onClick={() => handleOpenNew(dayDate)}>
                                     <span className={cn("text-sm font-semibold p-1 rounded-full w-7 h-7 flex items-center justify-center", 
                                        dayDate.toDateString() === agoraNaClinica().toDateString() ? "bg-primary text-primary-foreground" : "")}>
                                        {dayDate.getDate()}
                                     </span>
                                     <div className="flex flex-col gap-1 w-full overflow-hidden">
                                         {dayAppointments.slice(0, 4).map(app => (
                                             <div key={app.id} 
                                                className={cn(
                                                  "w-full cursor-pointer truncate rounded border-l-2 px-1 py-0.5 text-[10px]",
                                                  appointmentStatusAppearance(app.status).eventClassName,
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenEdit(app);
                                                }}
                                             >
                                                <span className="font-bold">{paredeDaClinica(app.data_hora_sessao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span> <span>{app.nome_paciente}</span>
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

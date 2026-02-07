"use client";

import React, { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateAgendamento, type FormState } from "../../actions";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Psicologo {
  id: string;
  nome: string;
}

interface Paciente {
  id: string;
  nome: string;
}

interface Agendamento {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_hora_sessao: string; // ISO string
  valor_consulta: number;
  duracao?: number;
  status?: string;
  recorrencia_id?: string;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Salvando..." : "Salvar Alterações"}
    </Button>
  );
}

export default function EditarAgendamentoForm({
  agendamento,
  psicologos,
  pacientes
}: {
  agendamento: Agendamento;
  psicologos: Psicologo[];
  pacientes: Paciente[];
}) {
  const { toast } = useToast();
  
  const [isRecurrenceDialogOpen, setIsRecurrenceDialogOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  const updateWithId = updateAgendamento.bind(null, agendamento.id);

  const clientWrapperAction = async (prevState: FormState, formData: FormData): Promise<FormState> => {
       // Check recurrence
       if (agendamento.recorrencia_id && !formData.get('mode')) {
           setPendingFormData(formData);
           setIsRecurrenceDialogOpen(true);
           return prevState; // Do nothing yet, wait for user selection
       }
       return updateWithId(prevState, formData);
  };

  const [state, formAction] = useFormState(clientWrapperAction, initialState);

  const handleConfirmMode = (mode: string) => {
    if (pendingFormData) {
        pendingFormData.set('mode', mode);
        React.startTransition(() => {
            formAction(pendingFormData);
        });
        setIsRecurrenceDialogOpen(false);
        setPendingFormData(null);
    }
  };

  // Time formatting helpers
  const formatForInput = (dateString: string) => {
      try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return "";
          const offset = date.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
          return localISOTime;
      } catch (e) {
          return "";
      }
  };

  const calculateEndDate = (startDateString: string, durationMinutes: number) => {
      try {
        const date = new Date(startDateString);
        if (isNaN(date.getTime())) return "";
        const endDate = new Date(date.getTime() + durationMinutes * 60000);
        const offset = endDate.getTimezoneOffset() * 60000;
        return (new Date(endDate.getTime() - offset)).toISOString().slice(0, 16);
      } catch (e) {
        return "";
      }
  };

  // State
  const initialDuration = agendamento.duracao || 50;
  const [start, setStart] = useState(formatForInput(agendamento.data_hora_sessao));
  const [end, setEnd] = useState(calculateEndDate(agendamento.data_hora_sessao, initialDuration));

  // Handlers
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = e.target.value;
      setStart(newStart);
      
      let durationToKeep = 50;
      if (start && end) {
          const sDate = new Date(start);
          const eDate = new Date(end);
          if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
              const diff = (eDate.getTime() - sDate.getTime()) / 60000;
              if (diff > 0) durationToKeep = diff;
          }
      }

      if (newStart) {
          setEnd(calculateEndDate(newStart, durationToKeep));
      }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEnd(e.target.value);
  };

  useEffect(() => {
    if (state.message && !state.success) {
      toast({
        title: "Erro na Edição",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, toast]);

  return (
    <>
    <form action={formAction}>
      <CardContent className="space-y-4 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="paciente_id">Paciente</Label>
            <Select name="paciente_id" defaultValue={agendamento.paciente_id} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um paciente" />
              </SelectTrigger>
              <SelectContent>
                {pacientes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.paciente_id && <p className="text-sm font-medium text-destructive">{state.errors.paciente_id[0]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="psicologo_id">Psicólogo</Label>
            <Select name="psicologo_id" defaultValue={agendamento.psicologo_id} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um psicólogo" />
              </SelectTrigger>
              <SelectContent>
                {psicologos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.psicologo_id && <p className="text-sm font-medium text-destructive">{state.errors.psicologo_id[0]}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="data_hora_sessao">Início da Sessão</Label>
            <Input 
                id="data_hora_sessao" 
                name="data_hora_sessao" 
                type="datetime-local" 
                value={start}
                onChange={handleStartChange}
                required 
            />
            {state.errors?.data_hora_sessao && <p className="text-sm font-medium text-destructive">{state.errors.data_hora_sessao[0]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="data_hora_sessao_fim">Fim da Sessão</Label>
            <Input 
                id="data_hora_sessao_fim" 
                name="data_hora_sessao_fim" 
                type="datetime-local" 
                value={end}
                onChange={handleEndChange}
                required 
            />
            {/* Display error for end time if any (added to actions types) */}
            {state.errors?.data_hora_sessao_fim && <p className="text-sm font-medium text-destructive">{state.errors.data_hora_sessao_fim[0]}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="valor_consulta">Valor (R$)</Label>
                <Input 
                    id="valor_consulta" 
                    name="valor_consulta" 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00" 
                    defaultValue={agendamento.valor_consulta}
                    required 
                />
                {state.errors?.valor_consulta && <p className="text-sm font-medium text-destructive">{state.errors.valor_consulta[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={agendamento.status || "agendado"}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
        </div>

        <div className="flex justify-end pt-4"><SubmitButton /></div>
      </CardContent>
    </form>

    <Dialog open={isRecurrenceDialogOpen} onOpenChange={setIsRecurrenceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Recorrência</DialogTitle>
            <DialogDescription>
              Este agendamento faz parte de uma série. Como você deseja aplicar as alterações?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => handleConfirmMode('single')}>
              Apenas esta sessão
            </Button>
            <Button variant="secondary" onClick={() => handleConfirmMode('all_future')}>
              Esta e futuras
            </Button>
            <Button variant="default" onClick={() => handleConfirmMode('all')}>
              Todas (inclusive passadas)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import React, { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateAgendamento, type FormState } from "../../actions";
import { useRouter } from "next/navigation";

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
  const updateWithId = updateAgendamento.bind(null, agendamento.id);
  const [state, formAction] = useFormState(updateWithId, initialState);

  useEffect(() => {
    if (state.message && !state.success) {
      toast({
        title: "Erro na Edição",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, toast]);

  // Format date for input datetime-local (YYYY-MM-DDTHH:mm)
  // Backend sends "2024-01-01 10:00:00.0" or ISO. 
  // We need to parse it safely.
  const formatForInput = (dateString: string) => {
      try {
          const date = new Date(dateString);
          // Adjust for timezone offset if needed or use local ISO string
          // Simple approach: toISOString().slice(0, 16) gives UTC. 
          // For local time input, we need local time.
          const offset = date.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
          return localISOTime;
      } catch (e) {
          return "";
      }
  };

  return (
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
            <Label htmlFor="data_hora_sessao">Data e Hora</Label>
            <Input 
                id="data_hora_sessao" 
                name="data_hora_sessao" 
                type="datetime-local" 
                defaultValue={formatForInput(agendamento.data_hora_sessao)}
                required 
            />
            {state.errors?.data_hora_sessao && <p className="text-sm font-medium text-destructive">{state.errors.data_hora_sessao[0]}</p>}
          </div>

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
        </div>

        <div className="flex justify-end pt-4"><SubmitButton /></div>
      </CardContent>
    </form>
  );
}

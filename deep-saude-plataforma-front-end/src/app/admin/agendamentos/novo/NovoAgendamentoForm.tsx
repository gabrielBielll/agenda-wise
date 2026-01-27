"use client";

import React, { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createAgendamento, type FormState } from "../actions";
import { CalendarIcon, Clock, DollarSign, User } from "lucide-react";
import { useRouter } from "next/navigation";

interface Psicologo {
  id: string;
  nome: string;
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Agendando..." : "Confirmar Agendamento"}
    </Button>
  );
}

export default function NovoAgendamentoForm({
  psicologos,
  pacientes
}: {
  psicologos: Psicologo[];
  pacientes: Paciente[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createAgendamento, initialState);

  // Time formatting helpers
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
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Handlers
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = e.target.value;
      setStart(newStart);
      
      // Default duration to 50 minutes if calculating from scratch
      let durationToKeep = 50;
      
      // If we already have a valid start/end pair, try to preserve the duration
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
      } else {
        setEnd("");
      }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEnd(e.target.value);
  };

  useEffect(() => {
    if (state.message && !state.success) {
      toast({
        title: "Erro no Agendamento",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, toast]);

  return (
    <form action={formAction}>
      <CardContent className="space-y-4 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="paciente_id">Paciente</Label>
            <Select name="paciente_id" required>
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
            <Select name="psicologo_id" required>
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
            {state.errors?.data_hora_sessao_fim && <p className="text-sm font-medium text-destructive">{state.errors.data_hora_sessao_fim[0]}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="valor_consulta">Valor (R$)</Label>
            <Input id="valor_consulta" name="valor_consulta" type="number" step="0.01" min="0" placeholder="0.00" required />
            {state.errors?.valor_consulta && <p className="text-sm font-medium text-destructive">{state.errors.valor_consulta[0]}</p>}
          </div>
           {/* Spacer */}
           <div></div>
        </div>

        <div className="flex justify-end pt-4"><SubmitButton /></div>
      </CardContent>
    </form>
  );
}

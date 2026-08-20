"use client";

import React, { useRef, useEffect, useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updatePatientClinicalData, type FormState } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface PatientClinicalData {
  historico_familiar?: string | null;
  uso_medicamentos?: string | null;
  diagnostico?: string | null;
  contatos_emergencia?: string | null;
}

interface ProntuarioDataViewerProps {
  patientId: string;
  patientData: PatientClinicalData;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const initialState: FormState = { message: "", errors: {}, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : <><Save className="mr-2 h-4 w-4" /> Salvar Prontuário</>}
    </Button>
  );
}

export default function ProntuarioDataViewer({ patientId, patientData }: { patientId: string, patientData: PatientClinicalData }) {
  const updateAction = updatePatientClinicalData.bind(null, patientId);
  const [state, formAction] = useActionState(updateAction, initialState);

  /**
   * ## A-022 — por que estes campos são controlados
   *
   * `<form action={formAction}>` **reseta os campos descontrolados quando a ação
   * termina, e não distingue sucesso de falha.** Em tela de edição o reset devolve
   * os campos ao `defaultValue` — aos dados antigos. A alteração some e a tela
   * fica com cara de intacta, que é pior de notar do que um campo em branco.
   *
   * Mesma causa e mesmo conserto da A-010.
   */
  const [campos, setCampos] = React.useState({
    diagnostico: patientData.diagnostico || "",
    historico_familiar: patientData.historico_familiar || "",
    uso_medicamentos: patientData.uso_medicamentos || "",
    contatos_emergencia: patientData.contatos_emergencia || "",
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));
  const { toast } = useToast();

   useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? "Sucesso" : "Erro",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
    }
  }, [state, toast]);

  return (
    <div className="rounded-2xl border border-border/70 bg-card/45 p-4">
        <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <span className="text-primary">📋</span> Dados Clínicos (Prontuário)
        </h4>
        <form action={formAction} className="space-y-6">
            
            <div className="space-y-2">
                <Label htmlFor="diagnostico" className="text-base font-semibold">Diagnóstico / Hipótese Diagnóstica</Label>
                <p className="text-xs text-muted-foreground mb-1">Análise funcional e hipóteses clínicas.</p>
                <Textarea 
                    id="diagnostico" 
                    name="diagnostico" 
                    placeholder="Descreva a hipótese diagnóstica..."
                    className="min-h-[100px]" value={campos.diagnostico} onChange={mudar("diagnostico")} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="historico_familiar" className="text-base font-semibold">Histórico Familiar</Label>
                     <p className="text-xs text-muted-foreground mb-1">Contexto de saúde mental na família.</p>
                    <Textarea 
                        id="historico_familiar" 
                        name="historico_familiar" 
                        placeholder="Histórico relevante..."
                        className="min-h-[120px]" value={campos.historico_familiar} onChange={mudar("historico_familiar")} />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="uso_medicamentos" className="text-base font-semibold">Uso de Medicamentos</Label>
                    <p className="text-xs text-muted-foreground mb-1">Substâncias utilizadas atualmente.</p>
                    <Textarea 
                        id="uso_medicamentos" 
                        name="uso_medicamentos" 
                        placeholder="Lista de medicamentos e dosagens..."
                        className="min-h-[120px]" value={campos.uso_medicamentos} onChange={mudar("uso_medicamentos")} />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="contatos_emergencia" className="text-base font-semibold">Informações sobre Contatos de Emergência</Label>
                <p className="text-xs text-muted-foreground mb-1">Dados importantes sobre contatos para casos de crise ou risco.</p>
                <Textarea 
                    id="contatos_emergencia" 
                    name="contatos_emergencia" 
                    placeholder="Nome, Telefone, Parentesco..."
                    className="min-h-[80px]" value={campos.contatos_emergencia} onChange={mudar("contatos_emergencia")} />
            </div>

            <div className="flex justify-end pt-4">
                <SubmitButton />
            </div>
        </form>
    </div>
  );
}

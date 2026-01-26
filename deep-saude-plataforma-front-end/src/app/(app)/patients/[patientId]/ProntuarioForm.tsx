"use client";

import React, { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label"; // Ensure this exists or use standard label
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createProntuario, type FormState } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save } from "lucide-react";

// Fallback if Label component doesn't exist (it usually does in shadcn)
// import { Label } from "@/components/ui/label";

const initialState: FormState = { message: "", errors: {}, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <>Salvando...</>
      ) : (
        <><Save className="mr-2 h-4 w-4" /> Salvar Anotação</>
      )}
    </Button>
  );
}

export default function ProntuarioForm({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  // Bind patientId to the action
  const createProntuarioWithId = createProntuario.bind(null, patientId);
  const [state, formAction] = useFormState(createProntuarioWithId, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? "Sucesso" : "Erro",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
      if (state.success) {
        formRef.current?.reset();
      }
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4 border p-4 rounded-md bg-white dark:bg-gray-950 mb-6">
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <FileText className="h-5 w-5" /> Nova Evolução
      </h3>
      
      <div className="space-y-2">
        <Label>Tipo de Registro</Label>
        <RadioGroup defaultValue="sessao" name="tipo" className="flex gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sessao" id="sessao" />
            <Label htmlFor="sessao" className="cursor-pointer">Sessão</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="anotacao" id="anotacao" />
            <Label htmlFor="anotacao" className="cursor-pointer">Anotação Geral</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="conteudo">Conteúdo</Label>
        <Textarea 
          id="conteudo" 
          name="conteudo" 
          placeholder="Descreva a evolução do paciente..." 
          className="min-h-[120px]"
          required
        />
        {state.errors?.conteudo && <p className="text-sm text-red-500">{state.errors.conteudo[0]}</p>}
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

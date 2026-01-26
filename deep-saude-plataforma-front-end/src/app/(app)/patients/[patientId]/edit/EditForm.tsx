'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type FormState } from '../../actions';

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Salvando...
        </>
      ) : (
        <>
          <Save className="mr-2 h-5 w-5" />
          Salvar Alterações
        </>
      )}
    </Button>
  );
}

export default function EditForm({ patient, updateAction }: { patient: any, updateAction: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(updateAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast({ title: "Sucesso!", description: state.message });
      router.push(`/patients/${patient.id}`);
      router.refresh(); 
    } else if (state.message && !state.success) {
      toast({ title: "Erro ao Salvar", description: state.message, variant: "destructive" });
    }
  }, [state, router, toast, patient.id]);

  return (
    <form action={formAction} className="space-y-6">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input id="nome" name="nome" defaultValue={patient.nome} required />
            {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="data_nascimento">Data de Nascimento</Label>
            <Input id="data_nascimento" name="data_nascimento" type="date" defaultValue={patient.data_nascimento} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="email">Endereço de E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={patient.email || ''} />
            {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Número de Telefone</Label>
            <Input id="telefone" name="telefone" type="tel" defaultValue={patient.telefone || ''} />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="endereco">Endereço</Label>
          <Textarea id="endereco" name="endereco" defaultValue={patient.endereco || ''} className="min-h-[100px]" />
        </div>

        <div className="flex justify-end pt-4">
          <SubmitButton />
        </div>
    </form>
  )
}

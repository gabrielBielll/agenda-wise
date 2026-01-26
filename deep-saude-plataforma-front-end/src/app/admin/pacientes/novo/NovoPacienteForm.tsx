"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createPaciente, type FormState } from "./actions";

interface Psicologo {
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
  return <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar Paciente"}</Button>;
}

export default function NovoPacienteForm({ psicologos }: { psicologos: Psicologo[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPaciente, initialState);

  useEffect(() => {
    if (state.success) {
      toast({ title: "Sucesso!", description: state.message });
      router.push("/admin/pacientes");
    } else if (state.message && !state.success) {
      toast({ title: "Erro ao Salvar", description: state.message, variant: "destructive" });
    }
  }, [state, router, toast]);

  return (
    <form action={formAction}>
      <CardContent className="space-y-4">
        {/* Campo de Seleção para Psicólogo */}
        <div className="space-y-2">
          <Label htmlFor="psicologo_id">Psicólogo Responsável</Label>
          <Select name="psicologo_id">
            <SelectTrigger>
              <SelectValue placeholder="Selecione um psicólogo (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {/* CORREÇÃO APLICADA AQUI */}
              <SelectItem value="none">Nenhum / A designar</SelectItem>
              {psicologos.map((psi) => (
                <SelectItem key={psi.id} value={psi.id}>
                  {psi.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Outros campos do formulário */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo</Label>
            <Input id="nome" name="nome" placeholder="Ex: Ana Silva" />
            {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="data_nascimento">Data de Nascimento</Label>
            <Input id="data_nascimento" name="data_nascimento" type="date" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email (Opcional)</Label>
            <Input id="email" name="email" type="email" placeholder="paciente@email.com" />
            {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone (Opcional)</Label>
            <Input id="telefone" name="telefone" placeholder="(21) 99999-8888" />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="endereco">Endereço (Opcional)</Label>
          <Textarea id="endereco" name="endereco" placeholder="Ex: Rua das Flores, 123..." />
        </div>

        <div className="flex justify-end pt-4">
          <SubmitButton />
        </div>
      </CardContent>
    </form>
  );
}

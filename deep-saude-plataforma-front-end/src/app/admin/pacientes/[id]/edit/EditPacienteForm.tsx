"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { updatePaciente, type FormState } from "./actions";
import { ArrowLeft, UserCog } from "lucide-react";

interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  endereco: string | null;
}

const initialState: FormState = { message: "", errors: {}, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Atualizando..." : "Atualizar Paciente"}</Button>;
}

export default function EditPacienteForm({ paciente }: { paciente: Paciente }) {
  const { toast } = useToast();
  const updatePacienteWithId = updatePaciente.bind(null, paciente.id);
  const [state, formAction] = useFormState(updatePacienteWithId, initialState);

  useEffect(() => {
    if (state.message && !state.success) {
      toast({
        title: "Erro ao Atualizar",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, toast]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admin/pacientes"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2"><UserCog className="h-6 w-6" />Editar Paciente</CardTitle>
            <CardDescription>Atualize os detalhes de {paciente.nome}.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {/* ... (campos do formulário idênticos ao de criação, mas usando defaultValue) ... */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input id="nome" name="nome" defaultValue={paciente.nome} />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" defaultValue={paciente.data_nascimento || ''} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={paciente.email || ''} />
              {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={paciente.telefone || ''} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Textarea id="endereco" name="endereco" defaultValue={paciente.endereco || ''} />
          </div>
          <div className="flex justify-end pt-4"><SubmitButton /></div>
        </CardContent>
      </form>
    </Card>
  );
}

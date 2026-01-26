"use client";

import React, { useEffect, useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { updatePaciente, type FormState } from "./actions";
import { ArrowLeft, UserCog, Save, Eye } from "lucide-react";

interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  psicologo_id?: string | null;
}

interface Psicologo {
  id: string;
  nome: string;
}

const initialState: FormState = { message: "", errors: {}, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="mr-2 h-4 w-4" />
      {pending ? "Salvando..." : "Salvar Alterações"}
    </Button>
  );
}

export default function EditPacienteForm({ 
  paciente, 
  psicologos, 
  readOnly = false 
}: { 
  paciente: Paciente; 
  psicologos: Psicologo[];
  readOnly?: boolean;
}) {
  console.log("EditPacienteForm Props:", { paciente, psicologos, readOnly });
  const { toast } = useToast();
  const updatePacienteWithId = updatePaciente.bind(null, paciente.id);
  const [state, formAction] = useActionState(updatePacienteWithId, initialState);

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
            <CardTitle className="flex items-center gap-2">
              {readOnly ? <Eye className="h-6 w-6" /> : <UserCog className="h-6 w-6" />}
              {readOnly ? "Visualizar Paciente" : "Editar Paciente"}
            </CardTitle>
            <CardDescription>
              {readOnly 
                ? `Visualizando dados de ${paciente.nome}.` 
                : `Atualize os detalhes de ${paciente.nome}.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <form action={readOnly ? undefined : formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input id="nome" name="nome" defaultValue={paciente.nome} disabled={readOnly} />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" defaultValue={paciente.data_nascimento || ''} disabled={readOnly} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={paciente.email || ''} disabled={readOnly} />
              {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={paciente.telefone || ''} disabled={readOnly} />
            </div>
          </div>

          <div className="space-y-2">
             <Label htmlFor="psicologo_id">Psicólogo Responsável</Label>
             <Select name="psicologo_id" defaultValue={paciente.psicologo_id || "none"} disabled={readOnly}>
               <SelectTrigger>
                 <SelectValue placeholder="Selecione um psicólogo..." />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="none">A designar</SelectItem>
                 {psicologos.map((psi) => (
                   <SelectItem key={psi.id} value={psi.id}>
                     {psi.nome}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Textarea id="endereco" name="endereco" defaultValue={paciente.endereco || ''} disabled={readOnly} />
          </div>
          {!readOnly && (
            <div className="flex justify-end pt-4"><SubmitButton /></div>
          )}
        </CardContent>
      </form>
    </Card>
  );
}

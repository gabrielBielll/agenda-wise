"use client";

import React, { useEffect, useActionState } from "react";
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
import { Save } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface Paciente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  psicologo_id?: string | null;
  status?: string | null;
}

interface Psicologo {
  id: string;
  nome: string;
}

const initialState: FormState = { message: "", errors: {}, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
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
  const { toast } = useToast();
  const updatePacienteWithId = updatePaciente.bind(null, paciente.id);
  const [state, formAction] = useActionState(updatePacienteWithId, initialState);

  /**
   * ## A-022 — por que estes campos são controlados
   *
   * `<form action={formAction}>` **reseta os campos descontrolados quando a ação
   * termina, e não distingue sucesso de falha.** Em tela de edição o reset não
   * esvazia: devolve os campos ao `defaultValue`, isto é, **aos dados antigos**.
   * A alteração some e o formulário fica com cara de intacto — o que é pior de
   * notar do que um campo em branco, porque nada parece errado.
   *
   * Com `value`/`onChange` (e `onValueChange` no `Select`) o React reaplica o que
   * foi digitado depois do reset. Mesma causa e mesmo conserto da A-010.
   */
  const [campos, setCampos] = React.useState({
    nome: paciente.nome ?? "",
    data_nascimento: paciente.data_nascimento || '',
    telefone: paciente.telefone || '',
    email: paciente.email || '',
    endereco: paciente.endereco || '',
    status: paciente.status || "ativo",
    psicologo_id: paciente.psicologo_id || "none",
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));

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
    <div className="quiet-page max-w-4xl">
      <AdminPageHeader
        eyebrow={readOnly ? "Consulta de cadastro" : "Atualização de cadastro"}
        title={readOnly ? "Detalhes do paciente." : "Cuidado também nos detalhes."}
        description={readOnly ? `Dados atuais de ${paciente.nome}.` : `Atualize as informações de ${paciente.nome} com segurança.`}
        backHref="/admin/pacientes"
      />
    <Card>
      <CardHeader>
        <CardTitle>{readOnly ? "Dados do paciente" : "Editar dados do paciente"}</CardTitle>
        <CardDescription>{readOnly ? "Visualização protegida do cadastro." : "Revise os campos antes de salvar."}</CardDescription>
      </CardHeader>
      <form action={readOnly ? undefined : formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input id="nome" name="nome" disabled={readOnly} value={campos.nome} onChange={mudar("nome")} />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
               <Select name="status" disabled={readOnly} value={campos.status} onValueChange={(v) => setCampos((c) => ({ ...c, status: v }))}>
                 {/* id casa o <Label htmlFor>: `combobox` não tira nome do conteúdo (D-016). */}
                 <SelectTrigger id="status">
                   <SelectValue placeholder="Selecione o status" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="ativo">Ativo</SelectItem>
                   <SelectItem value="inativo">Inativo</SelectItem>
                 </SelectContent>
               </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" disabled={readOnly} value={campos.data_nascimento} onChange={mudar("data_nascimento")} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" disabled={readOnly} value={campos.telefone} onChange={mudar("telefone")} />
            </div>
          </div>
          
          <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" disabled={readOnly} value={campos.email} onChange={mudar("email")} />
              {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
          </div>

          <div className="space-y-2">
             <Label htmlFor="psicologo_id">Psicólogo Responsável</Label>
             <Select name="psicologo_id" disabled={readOnly} value={campos.psicologo_id} onValueChange={(v) => setCampos((c) => ({ ...c, psicologo_id: v }))}>
               {/* id casa o <Label htmlFor>: `combobox` não tira nome do conteúdo (D-016). */}
               <SelectTrigger id="psicologo_id">
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
            <Textarea id="endereco" name="endereco" disabled={readOnly} value={campos.endereco} onChange={mudar("endereco")} />
          </div>
          {!readOnly && (
            <div className="flex justify-end border-t border-border/50 pt-5"><SubmitButton /></div>
          )}
        </CardContent>
      </form>
    </Card>
    </div>
  );
}

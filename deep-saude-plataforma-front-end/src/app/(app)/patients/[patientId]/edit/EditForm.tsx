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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    nome: patient.nome ?? "",
    data_nascimento: patient.data_nascimento ?? "",
    email: patient.email || '',
    telefone: patient.telefone || '',
    endereco: patient.endereco || '',
    status: patient.status || "ativo",
  });
  const mudar =
    (nome: keyof typeof campos) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCampos((c) => ({ ...c, [nome]: e.target.value }));

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
            <Input id="nome" name="nome" required value={campos.nome} onChange={mudar("nome")} />
            {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="data_nascimento">Data de Nascimento</Label>
            <Input id="data_nascimento" name="data_nascimento" type="date" value={campos.data_nascimento} onChange={mudar("data_nascimento")} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="email">Endereço de E-mail</Label>
            <Input id="email" name="email" type="email" value={campos.email} onChange={mudar("email")} />
            {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
          </div>


          <div className="space-y-2">
            <Label htmlFor="telefone">Número de Telefone</Label>
            <Input id="telefone" name="telefone" type="tel" value={campos.telefone} onChange={mudar("telefone")} />
          </div>
          <div className="space-y-2">
             <Label htmlFor="status">Status</Label>
             <Select name="status" value={campos.status} onValueChange={(v) => setCampos((c) => ({ ...c, status: v }))}>
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
        
        <div className="space-y-2">
          <Label htmlFor="endereco">Endereço</Label>
          <Textarea id="endereco" name="endereco" className="min-h-[100px]" value={campos.endereco} onChange={mudar("endereco")} />
        </div>

        <div className="flex justify-end border-t border-border/50 pt-5">
          <SubmitButton />
        </div>
    </form>
  )
}

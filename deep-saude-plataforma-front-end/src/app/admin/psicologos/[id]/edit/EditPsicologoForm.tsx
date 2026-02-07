"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updatePsicologo, type FormState } from "./actions";
import { ArrowLeft, UserCog, Save, Eye } from "lucide-react";

interface Psicologo {
  id: string;
  nome: string;
  email: string;
  cpf?: string;
  telefone?: string;
  data_nascimento?: string;
  endereco?: string;
  crp?: string;
  registro_e_psi?: string;
  abordagem?: string;
  area_de_atuacao?: string;
}

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="mr-2 h-4 w-4" />
      {pending ? "Salvando..." : "Salvar Alterações"}
    </Button>
  );
}

export default function EditPsicologoForm({ 
  psicologo,
  readOnly = false
}: { 
  psicologo: Psicologo;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // Usamos .bind para pré-preencher a action com o ID do psicólogo
  const updatePsicologoWithId = updatePsicologo.bind(null, psicologo.id);
  const [state, formAction] = useFormState(updatePsicologoWithId, initialState);

  useEffect(() => {
    if (state.success) {
      toast({
        title: "Sucesso!",
        description: state.message,
      });
      router.push("/admin/psicologos");
    } else if (state.message && !state.success) {
      toast({
        title: "Erro ao Atualizar",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state, router, toast]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admin/psicologos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              {readOnly ? <Eye className="h-6 w-6" /> : <UserCog className="h-6 w-6" />}
              {readOnly ? "Visualizar Psicólogo" : "Editar Psicólogo"}
            </CardTitle>
            <CardDescription>
              {readOnly ? "Visualize os detalhes do profissional." : "Atualize os detalhes do profissional abaixo."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" defaultValue={psicologo.nome} disabled={readOnly} />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={psicologo.email} disabled={readOnly} />
               {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
            </div>
            {!readOnly && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="senha">Nova Senha (Opcional)</Label>
                <Input 
                  id="senha" 
                  name="senha" 
                  type="password" 
                  placeholder="Mínimo 6 caracteres. Deixe em branco para manter a atual." 
                />
                 {state.errors?.senha && <p className="text-sm font-medium text-destructive">{state.errors.senha[0]}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" name="cpf" defaultValue={psicologo.cpf || ''} placeholder="000.000.000-00" disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={psicologo.telefone || ''} placeholder="(00) 00000-0000" disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" defaultValue={psicologo.data_nascimento || ''} disabled={readOnly} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="crp">CRP</Label>
              <Input id="crp" name="crp" defaultValue={psicologo.crp || ''} placeholder="00/00000" disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="registro_e_psi">Registro e-Psi</Label>
              <Input id="registro_e_psi" name="registro_e_psi" defaultValue={psicologo.registro_e_psi || ''} placeholder="Ex: Cadastro aprovado" disabled={readOnly} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="abordagem">Abordagem Terapêutica</Label>
              <Input id="abordagem" name="abordagem" defaultValue={psicologo.abordagem || ''} placeholder="Ex: TCC, Psicanálise..." disabled={readOnly} />
            </div>
          </div>

          <div className="space-y-2">
               <Label htmlFor="area_de_atuacao">Área de Atuação</Label>
               <Input id="area_de_atuacao" name="area_de_atuacao" defaultValue={psicologo.area_de_atuacao || ''} placeholder="Ex: Infanto-juvenil, Casal..." disabled={readOnly} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço Completo</Label>
            <Input id="endereco" name="endereco" defaultValue={psicologo.endereco || ''} placeholder="Rua, Número, Bairro, Cidade - UF" disabled={readOnly} />
          </div>
          {!readOnly && (
            <div className="flex justify-end pt-4">
              <SubmitButton />
            </div>
          )}
        </CardContent>
      </form>
    </Card>
  );
}

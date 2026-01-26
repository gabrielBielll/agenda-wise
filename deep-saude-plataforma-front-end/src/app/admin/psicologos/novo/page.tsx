"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createPsicologo, type FormState } from "./actions"; // Importe a Server Action
import { ArrowLeft, PlusCircle, UserPlus } from "lucide-react";

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando..." : "Criar Psicólogo"}
    </Button>
  );
}

export default function AdminNovoPsicologoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPsicologo, initialState);

  useEffect(() => {
    if (state.success) {
      toast({
        title: "Sucesso!",
        description: state.message,
      });
      router.push("/admin/psicologos");
    } else if (state.message && !state.success) {
      toast({
        title: "Erro ao Salvar",
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
              <UserPlus className="h-6 w-6" />
              Adicionar Novo Psicólogo
            </CardTitle>
            <CardDescription>
              Preencha os detalhes abaixo para cadastrar um novo profissional.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" placeholder="Ex: Dra. Ana Silva" required />
              {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" placeholder="email@exemplo.com" required />
              {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input id="password" name="password" type="password" required />
              {state.errors?.password && <p className="text-sm font-medium text-destructive">{state.errors.password[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" name="cpf" placeholder="000.000.000-00" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="crp">CRP</Label>
              <Input id="crp" name="crp" placeholder="00/00000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registro_e_psi">Registro e-Psi</Label>
              <Input id="registro_e_psi" name="registro_e_psi" placeholder="Ex: Cadastro aprovado" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="abordagem">Abordagem Terapêutica</Label>
              <Input id="abordagem" name="abordagem" placeholder="Ex: TCC, Psicanálise..." />
            </div>
            <div className="space-y-2">
               <Label htmlFor="area_de_atuacao">Área de Atuação</Label>
               <Input id="area_de_atuacao" name="area_de_atuacao" placeholder="Ex: Infanto-juvenil, Casal..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço Completo</Label>
            <Input id="endereco" name="endereco" placeholder="Rua, Número, Bairro, Cidade - UF" />
          </div>
          <div className="flex justify-end pt-4">
            <SubmitButton />
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

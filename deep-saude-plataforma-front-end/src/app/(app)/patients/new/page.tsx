'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Save, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { createPaciente, type FormState } from '../actions';

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
          Salvar Paciente
        </>
      )}
    </Button>
  );
}

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPaciente, initialState);

  useEffect(() => {
    if (state.success) {
      toast({ title: "Sucesso!", description: state.message });
      router.push('/patients');
    } else if (state.message && !state.success) {
      toast({ title: "Erro ao Salvar", description: state.message, variant: "destructive" });
    }
  }, [state, router, toast]);

  return (
    <div className="quiet-page max-w-3xl">
      <div className="mb-2 flex items-center justify-start">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <p className="page-eyebrow mb-1">Nova jornada</p>
          <h1 className="page-title text-4xl md:text-4xl">Adicionar paciente</h1>
          <p className="page-subtitle">Comece o perfil com as informações essenciais. Você poderá complementar depois.</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="soft-icon mr-3"><UserPlus className="h-5 w-5" /></span> Informações pessoais
          </CardTitle>
          <CardDescription>
            Preencha somente os dados necessários para iniciar o acompanhamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input id="nome" name="nome" placeholder="Nome completo" required />
                {state.errors?.nome && <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_nascimento">Data de Nascimento</Label>
                <Input id="data_nascimento" name="data_nascimento" type="date" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="email">Endereço de E-mail</Label>
                <Input id="email" name="email" type="email" placeholder="nome@exemplo.com" />
                {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Número de Telefone</Label>
                <Input id="telefone" name="telefone" type="tel" placeholder="(00) 00000-0000" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Textarea id="endereco" name="endereco" placeholder="Endereço completo" className="min-h-[100px]" />
            </div>

            <div className="flex justify-end border-t border-border/50 pt-5">
              <SubmitButton />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

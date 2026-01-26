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
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-start mb-6">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="font-headline text-3xl">Adicionar Novo Paciente</h1>
          <p className="text-muted-foreground">Insira os detalhes para o novo perfil do paciente.</p>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <UserPlus className="mr-3 h-7 w-7 text-primary" /> Detalhes do Paciente
          </CardTitle>
          <CardDescription>
            Por favor, preencha todos os campos obrigatórios com precisão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input id="nome" name="nome" placeholder="Ex: João Ninguém" required />
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
                <Input id="email" name="email" type="email" placeholder="Ex: joao.ninguem@example.com" />
                {state.errors?.email && <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Número de Telefone</Label>
                <Input id="telefone" name="telefone" type="tel" placeholder="Ex: +55 (XX) XXXXX-XXXX" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Textarea id="endereco" name="endereco" placeholder="Ex: Rua do Bem-Estar, 123, Cidade da Tranquilidade, UF 12345-678" className="min-h-[100px]" />
            </div>

            <div className="flex justify-end pt-4">
              <SubmitButton />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

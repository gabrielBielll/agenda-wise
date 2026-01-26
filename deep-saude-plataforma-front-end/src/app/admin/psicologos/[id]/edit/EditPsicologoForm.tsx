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
import { ArrowLeft, UserCog } from "lucide-react";

interface Psicologo {
  id: string;
  nome: string;
  email: string;
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
      {pending ? "Atualizando..." : "Atualizar Psicólogo"}
    </Button>
  );
}

export default function EditPsicologoForm({ psicologo }: { psicologo: Psicologo }) {
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
              <UserCog className="h-6 w-6" />
              Editar Psicólogo
            </CardTitle>
            <CardDescription>
              Atualize os detalhes do profissional abaixo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={psicologo.nome} />
            {state.errors?.nome && (
              <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={psicologo.email} />
            {state.errors?.email && (
              <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>
            )}
          </div>
          <div className="flex justify-end pt-4">
            <SubmitButton />
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

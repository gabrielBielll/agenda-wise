"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createPsicologo, type FormState } from "./actions";
import { ArrowLeft, UserPlus } from "lucide-react";

// Schema de validação (deve ser consistente com a Server Action)
const psicologoSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});

type FormValues = z.infer<typeof psicologoSchema>;

const initialState: FormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar Psicólogo"}
    </Button>
  );
}

export default function AdminNovoPsicologoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(createPsicologo, initialState);

  const form = useForm<FormValues>({
    resolver: zodResolver(psicologoSchema),
    defaultValues: {
      nome: "",
      email: "",
      password: "",
    },
  });

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
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" placeholder="Ex: Dra. Ana Silva" />
            {state.errors?.nome && (
              <p className="text-sm font-medium text-destructive">{state.errors.nome[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="email@exemplo.com" />
            {state.errors?.email && (
              <p className="text-sm font-medium text-destructive">{state.errors.email[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" />
            {state.errors?.password && (
              <p className="text-sm font-medium text-destructive">{state.errors.password[0]}</p>
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

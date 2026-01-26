"use client";

import React, { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast"; // Supondo que você tenha useToast de Shadcn/ui
import { handleLogin, type LoginFormState } from "./actions";
import { Building } from "lucide-react"; // Ícone para o título

// Schema Zod precisa ser o mesmo usado na Server Action ou importado dela
const loginFormSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
  clinicCode: z.string().min(3, { message: "O código da clínica deve ter pelo menos 3 caracteres." }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const initialState: LoginFormState = {
  message: "",
  errors: {},
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction] = useFormState(handleLogin, initialState);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
      clinicCode: "",
    },
  });

  useEffect(() => {
    if (state.success) {
      toast({
        title: "Sucesso!",
        description: state.message,
        variant: "default", // ou 'success' se você tiver essa variante
      });
      router.push("/admin/dashboard");
    } else if (state.message && (state.errors?._form || Object.keys(state.errors || {}).length > 0)) {
      // Exibe toast para erros gerais do formulário ou se houver erros de campo específicos vindos do server
      const errorMessage = state.errors?._form?.[0] || state.message || "Erro ao tentar fazer login.";
      toast({
        title: "Erro de Login",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [state, router, toast]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center items-center mb-2">
            <Building className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Login Administrativo</CardTitle>
        <CardDescription>
          Acesse o painel de administrador da Deep Saúde.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              {...form.register("email")}
              aria-invalid={state.errors?.email ? "true" : "false"}
            />
            {state.errors?.email && (
              <p className="text-sm font-medium text-destructive">
                {state.errors.email[0]}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="******"
              {...form.register("password")}
              aria-invalid={state.errors?.password ? "true" : "false"}
            />
            {state.errors?.password && (
              <p className="text-sm font-medium text-destructive">
                {state.errors.password[0]}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="clinicCode">Código da Clínica</Label>
            <Input
              id="clinicCode"
              type="text"
              placeholder="CODIGOCLINICA"
              {...form.register("clinicCode")}
              aria-invalid={state.errors?.clinicCode ? "true" : "false"}
            />
            {state.errors?.clinicCode && (
              <p className="text-sm font-medium text-destructive">
                {state.errors.clinicCode[0]}
              </p>
            )}
          </div>
          {state.errors?._form && (
            <p className="text-sm font-medium text-destructive text-center">
              {state.errors._form[0]}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <SubmitButton />
          <Button variant="link" size="sm" className="w-full" onClick={() => alert("Link 'Esqueci minha senha' clicado.")}>
            Esqueceu sua senha?
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

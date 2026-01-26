"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";

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
import { useToast } from "@/hooks/use-toast";
import { Building, Loader2 } from "lucide-react";

// Schema
const loginFormSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
  clinicCode: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
      clinicCode: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      });

      if (result?.error) {
        toast({
          title: "Erro de Login",
          description: "Credenciais inválidas ou erro no servidor.",
          variant: "destructive",
        });
      } else if (result?.ok) {
        toast({
          title: "Sucesso!",
          description: "Login realizado com sucesso. Redirecionando...",
        });
        // Force hard reload/redirect to ensure middleware catches the new token
        window.location.href = "/admin/dashboard"; 
      }
    } catch (error) {
      toast({
        title: "Erro Inesperado",
        description: "Ocorreu um erro ao tentar fazer login.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="******"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="clinicCode">Código da Clínica</Label>
            <Input
              id="clinicCode"
              type="text"
              placeholder="CODIGOCLINICA"
              {...form.register("clinicCode")}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar na Plataforma"
            )}
          </Button>
          <Button type="button" variant="link" size="sm" className="w-full" onClick={() => alert("Link 'Esqueci minha senha' clicado.")}>
            Esqueceu sua senha?
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

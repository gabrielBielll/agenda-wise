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
import { Leaf, Loader2, ShieldCheck } from "lucide-react";
import { useLoading } from "@/components/LoadingOverlay";

// Schema
const loginFormSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { showLoading, hideLoading } = useLoading();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    showLoading("Autenticando...");

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      });

      if (result?.error) {
        hideLoading();
        toast({
          title: "Erro de Login",
          description: "Credenciais inválidas ou erro no servidor.",
          variant: "destructive",
        });
      } else if (result?.ok) {
        // Mantém o overlay até a nova página carregar (window.location causa reload completo)
        window.location.href = "/admin/dashboard";
      }
    } catch (error) {
      hideLoading();
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
    <Card className="w-full max-w-md border-white/80 bg-white/60 shadow-[0_30px_90px_rgba(74,67,55,.13)]">
      <CardHeader className="space-y-1 p-8 pb-5 text-center">
        <div className="mb-4 flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-[18px_18px_18px_6px] bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(104,113,91,.24)]"><Leaf className="h-6 w-6" /></span>
        </div>
        <p className="page-eyebrow">Deep Saúde</p>
        <CardTitle className="text-3xl">Acesso administrativo</CardTitle>
        <CardDescription>
          Entre para cuidar da operação da clínica.
        </CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="grid gap-4 px-8">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@deepsaude.com.br"
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
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              <><ShieldCheck />Entrar com segurança</>
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

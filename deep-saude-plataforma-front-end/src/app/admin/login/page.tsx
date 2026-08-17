"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn, signOut, useSession } from "next-auth/react";

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
  const { status } = useSession();

  /**
   * A-016 — encerra de verdade a sessão que o backend recusou.
   *
   * ⚠️ Esta porta **não** entrava em laço, ao contrário do que se esperava: ela
   * não tem redirecionamento por `status === 'authenticated'`, então sempre mostra
   * o formulário. A assimetria era o inverso — quem laçava era `/`, a porta da
   * psicóloga.
   *
   * Mas o problema de fundo é o mesmo e é aqui também: chegar com `?expired=true`
   * significa que o backend recusou a sessão, e o cookie do NextAuth **continua
   * válido**. Sem `signOut` a sessão morta fica pendurada — e quem sair desta tela
   * para qualquer rota protegida volta a bater no 401.
   *
   * Ver o comentário maior em `src/app/page.tsx`, incluindo o caso da rotação do
   * `JWT_SECRET`, que é onde isto deixa de ser hipótese.
   */
  // Lido de `window.location` e não com `useSearchParams()` — ver o comentário em
  // `src/app/page.tsx`: lá o `useSearchParams` quebrou o `next build`, e aqui
  // vale o mesmo por ser a outra tela de login prerenderizada.
  const [sessaoExpirou, setSessaoExpirou] = useState(false);

  useEffect(() => {
    setSessaoExpirou(new URLSearchParams(window.location.search).get("expired") === "true");
  }, []);

  useEffect(() => {
    if (sessaoExpirou && status === "authenticated") {
      signOut({ redirect: false });
    }
  }, [sessaoExpirou, status]);

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
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center items-center mb-2">
            <Building className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Login Administrativo</CardTitle>
        <CardDescription>
          Acesse o painel de administrador da Deep Saúde.
        </CardDescription>
        {/* A-016: dizer por que a pessoa voltou para cá, senão ela reentra os
            dados achando que errou a senha na vez anterior. */}
        {sessaoExpirou && (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Sua sessão expirou. Entre novamente para continuar.
          </p>
        )}
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

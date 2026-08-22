"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
    <Card className="w-full max-w-md border-border/70 bg-card/60 shadow-[var(--quiet-shadow-strong)]">
      <CardHeader className="space-y-1 p-8 pb-5 text-center">
        <div className="mb-4 flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-[18px_18px_18px_6px] bg-accent text-accent-foreground shadow-[var(--quiet-shadow-soft)]"><Leaf className="h-6 w-6" /></span>
        </div>
        <p className="page-eyebrow">Agenda Wise</p>
        <CardTitle className="text-3xl">Acesso administrativo</CardTitle>
        <CardDescription>
          Entre para cuidar da operação da clínica.
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
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
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
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
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

          {/* MÓDULO B — login com Google. `callbackUrl` leva o admin ao painel dele;
              se o backend negar (403/401/503), o `signIn` de `auth.ts` redireciona
              para `/?erro=...` com a mensagem certa, sobrepondo este callbackUrl. */}
          <div className="relative w-full py-1">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-[9px] uppercase tracking-[.12em]"><span className="bg-card px-3 text-muted-foreground">Ou continue com</span></div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={() => { showLoading("Conectando com Google..."); signIn("google", { callbackUrl: "/admin/dashboard" }); }}
          >
            <svg className="mr-2 h-5 w-5" aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
            Continuar com Google
          </Button>

          {/* MÓDULO A — recuperação de senha agora existe de verdade (token de uso
              único + e-mail no backend), então o botão desabilitado "em breve"
              virou link para o fluxo real, compartilhado com a tela da psicóloga. */}
          <Button asChild type="button" variant="link" size="sm" className="w-full">
            <Link href="/recuperar-senha">Esqueci minha senha</Link>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

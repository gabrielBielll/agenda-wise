// src/app/page.tsx - Versão completa a ser utilizada
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Leaf, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useLoading } from '@/components/LoadingOverlay';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const { showLoading, hideLoading } = useLoading();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Redirecionar se já estiver autenticado (efeito colateral deve estar no useEffect)
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);

  // Esta função irá acionar o nosso 'CredentialsProvider'
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    showLoading("Autenticando...");

    const result = await signIn('credentials', {
      redirect: false,
      email: email,
      password: password,
    });

    if (result?.error) {
      hideLoading();
      setError("Credenciais inválidas. Verifique seu e-mail e senha.");
    } else if (result?.ok) {
      router.push('/dashboard');
    }
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10"><Leaf className="h-7 w-7 animate-pulse text-primary" /></span>
        <p className="font-headline text-xl">{status === 'loading' ? 'Preparando seu espaço...' : 'Login confirmado, entrando...'}</p>
        <Button variant="outline" onClick={() => signOut()}>
          Sair / Trocar Conta
        </Button>
      </div>
    );
  }

  return (
    <main className="grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <span className="absolute -right-24 -top-32 h-[430px] w-[430px] rounded-full border border-white/10 shadow-[0_0_0_60px_rgba(255,255,255,.025),0_0_0_120px_rgba(255,255,255,.018)]" />
        <span className="absolute -bottom-44 -left-20 h-[390px] w-[390px] rounded-full bg-secondary/15 blur-2xl" />
        <div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-[15px_15px_15px_5px] bg-white/15"><Leaf className="h-5 w-5" /></span><span className="font-headline text-2xl">agenda<em className="text-[#efb393]">wise</em></span></div>
        <div className="relative max-w-xl"><span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] uppercase tracking-[.15em]"><Sparkles className="h-3.5 w-3.5" /> Cuidado também é organização</span><h1 className="font-headline text-6xl font-normal leading-[.98] tracking-[-.04em]">Sua prática clínica,<br/><em className="text-[#efb393]">em equilíbrio.</em></h1><p className="mt-6 max-w-md text-sm leading-relaxed text-white/65">Uma agenda desenhada para diminuir ruído, proteger seu tempo e abrir espaço para o que importa: estar presente.</p></div>
        <div className="relative flex items-center gap-3 text-[10px] text-white/55"><ShieldCheck className="h-4 w-4" /><span>Dados clínicos protegidos com privacidade e cuidado.</span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
      <Card className="w-full max-w-[460px] border-white/80 bg-white/55 shadow-[0_30px_90px_rgba(74,67,55,.12)]">
        <CardHeader className="p-7 pb-4 sm:p-9 sm:pb-5">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-[14px_14px_14px_5px] bg-primary text-primary-foreground"><Leaf className="h-[18px] w-[18px]" /></span><span className="font-headline text-2xl">agenda<em className="text-accent">wise</em></span></div>
          <p className="page-eyebrow mb-2">Bem-vinda de volta</p>
          <CardTitle className="text-4xl">Entre no seu espaço.</CardTitle>
          <CardDescription className="mt-2 leading-relaxed">Sua agenda e seus pacientes estão esperando por você.</CardDescription>
        </CardHeader>
        <CardContent className="px-7 pb-7 sm:px-9 sm:pb-9">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="email@exemplo.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full">Entrar com segurança <ArrowRight /></Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-[9px] uppercase tracking-[.12em]"><span className="bg-[#faf7f1] px-3 text-muted-foreground">Ou continue com</span></div>
          </div>
          
          <Button onClick={() => { showLoading("Conectando com Google..."); signIn('google'); }} variant="outline" className="w-full">
            <svg className="mr-2 h-5 w-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
            Continuar com Google
          </Button>
        </CardContent>
        <CardFooter className="justify-center border-t border-border/40 px-7 py-4">
          <p className="flex items-center justify-center text-[9px] uppercase tracking-[.1em] text-muted-foreground">
            <Lock className="mr-2 h-3.5 w-3.5" /> Ambiente seguro Deep Saúde
          </p>
        </CardFooter>
      </Card>
      </section>
    </main>
  );
}

// src/app/page.tsx - Versão completa a ser utilizada
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Leaf, Lock, ShieldCheck, Sparkles } from "lucide-react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useLoading } from '@/components/LoadingOverlay';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Traduz o código de erro do login com Google (Módulo B) na frase que a pessoa lê.
 * Os códigos são os que o `signIn` de `src/lib/auth.ts` devolve ao negar a entrada.
 */
function mensagemDeErroDeAcesso(codigo: string): string {
  switch (codigo) {
    case 'google_sem_conta':
      return 'Conta não encontrada. Peça ao administrador da clínica para liberar seu acesso.';
    case 'google_invalido':
      return 'Não foi possível validar sua conta Google. Tente entrar novamente.';
    case 'google_indisponivel':
      return 'O login com Google está indisponível no momento. Use e-mail e senha.';
    default:
      return 'Não foi possível concluir o acesso. Tente novamente.';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const { showLoading, hideLoading } = useLoading();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  /**
   * A-016 — `?expired=true` significa "esta sessão acabou", não "navegue".
   *
   * Quem chega aqui com o parâmetro veio de um 401 do backend (via `carregar.ts`)
   * ou do token vencido no middleware. Nos dois casos o **cookie do NextAuth
   * continua válido** — quem recusou foi o backend, e o NextAuth não tem como
   * saber. Então `status` ainda é `authenticated`.
   *
   * Sem este tratamento o `useEffect` abaixo empurrava para `/dashboard`, que
   * levava 401, que mandava para cá de novo: **laço**. A saída existia — o botão
   * "Sair / Trocar Conta" — mas é beco com saída que ninguém adivinha.
   *
   * 🔴 Não é hipótese: é o que acontece na **rotação do `JWT_SECRET`**. Rotacionar
   * não muda o `exp` dos tokens já emitidos, então toda sessão aberta passa a ter
   * validade no futuro e assinatura que não confere — o middleware deixa passar e
   * o backend recusa. Todo mundo logado na hora da rotação cairia no laço.
   */
  /**
   * ⚠️ Lido de `window.location`, e **não** com `useSearchParams()`.
   *
   * Duas razões, e a primeira é dura: `useSearchParams()` num componente cliente
   * faz o `next build` **falhar** nesta página —
   * *"useSearchParams() should be wrapped in a suspense boundary at page /"* —
   * porque ela é prerenderizada estática. Medido: o build quebrou na primeira
   * tentativa.
   *
   * A segunda é o motivo de eu não ter só embrulhado em `<Suspense>`: o embrulho
   * resolve o erro **tirando a página do prerender**, e esta é a tela de login —
   * a primeira coisa que qualquer pessoa vê. Trocar o primeiro paint dela por uma
   * conveniência de API não vale.
   *
   * `null` = ainda não sabemos. Sem esse terceiro estado, o efeito de
   * redirecionamento roda antes da leitura e empurra para `/dashboard` — o laço
   * de volta, pela porta dos fundos.
   */
  const [sessaoExpirou, setSessaoExpirou] = useState<boolean | null>(null);

  /**
   * Avisos que chegam por query string quando a pessoa volta para o login:
   *   - `?redefinida=1`  → acabou de trocar a senha (Módulo A);
   *   - `?erro=google_*` → o login com Google foi negado pelo backend (Módulo B).
   *
   * Lido de `window.location` pelo mesmo motivo do `?expired` acima: `useSearchParams()`
   * quebraria o `next build` desta tela prerenderizada.
   */
  const [avisoAcesso, setAvisoAcesso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    setSessaoExpirou(new URLSearchParams(window.location.search).get('expired') === 'true');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('redefinida') === '1') {
      setAvisoAcesso({ tipo: 'ok', texto: 'Senha redefinida com sucesso. Entre com a nova senha.' });
      return;
    }
    const erro = params.get('erro');
    if (erro) setAvisoAcesso({ tipo: 'erro', texto: mensagemDeErroDeAcesso(erro) });
  }, []);

  useEffect(() => {
    if (sessaoExpirou === null || status !== 'authenticated') return;

    if (sessaoExpirou) {
      // Encerra de verdade, sem redirecionar: o formulário abaixo é o destino.
      signOut({ redirect: false });
      return;
    }

    router.push('/dashboard');
  }, [status, router, sessaoExpirou]);

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

  // Com `?expired=true` a tela de espera não pode aparecer: o `signOut` acima
  // está em curso e o destino é o formulário, não outra rota.
  if (status === 'loading' || (status === 'authenticated' && sessaoExpirou !== true)) {
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
    <main className="relative grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_.95fr]">
      <ThemeToggle className="fixed right-4 top-4 z-20 bg-background/75 lg:right-6 lg:top-6" />
      <section className="relative hidden min-h-screen overflow-hidden bg-accent p-12 text-accent-foreground lg:flex lg:flex-col lg:justify-between">
        <span className="absolute -right-24 -top-32 h-[430px] w-[430px] rounded-full border border-accent-foreground/10" />
        <span className="absolute -bottom-44 -left-20 h-[390px] w-[390px] rounded-full bg-secondary/15 blur-2xl" />
        <div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-[15px_15px_15px_5px] bg-accent-foreground/10"><Leaf className="h-5 w-5" /></span><span className="font-headline text-2xl">agenda<em className="text-secondary">wise</em></span></div>
        <div className="relative max-w-xl"><span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-foreground/15 bg-accent-foreground/10 px-3 py-1.5 text-[10px] uppercase tracking-[.15em]"><Sparkles className="h-3.5 w-3.5" /> Cuidado também é organização</span><h1 className="font-headline text-6xl font-normal leading-[.98] tracking-[-.04em]">Sua prática clínica,<br/><em className="text-secondary">em equilíbrio.</em></h1><p className="mt-6 max-w-md text-sm leading-relaxed text-accent-foreground/70">Uma agenda desenhada para diminuir ruído, proteger seu tempo e abrir espaço para o que importa: estar presente.</p></div>
        <div className="relative flex items-center gap-3 text-[10px] text-accent-foreground/60"><ShieldCheck className="h-4 w-4" /><span>Dados clínicos protegidos com privacidade e cuidado.</span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
      <Card className="w-full max-w-[460px] border-border/70 bg-card/60 shadow-[var(--quiet-shadow-strong)]">
        <CardHeader className="p-7 pb-4 sm:p-9 sm:pb-5">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-[14px_14px_14px_5px] bg-primary text-primary-foreground"><Leaf className="h-[18px] w-[18px]" /></span><span className="font-headline text-2xl">agenda<em className="text-accent">wise</em></span></div>
          <p className="page-eyebrow mb-2">Bem-vinda de volta</p>
          <CardTitle className="text-4xl">Entre no seu espaço.</CardTitle>
          <CardDescription className="mt-2 leading-relaxed">Sua agenda e seus pacientes estão esperando por você.</CardDescription>
          {/* A-016: dizer por que a pessoa voltou para cá. Sem isto ela reentra
              os dados achando que errou a senha na vez anterior.

              ⚠️ Reinserido ao trazer o redesign (8109afc): o layout é dele, este
              aviso é comportamento nosso. Some daqui e o laço de sessão expirada
              volta a ser mudo. */}
          {sessaoExpirou && (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}
          {avisoAcesso && (
            <p
              className={`mt-3 rounded-md px-3 py-2 text-sm ${
                avisoAcesso.tipo === 'ok'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {avisoAcesso.texto}
            </p>
          )}
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
            <div className="flex justify-end">
              <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                <Link href="/recuperar-senha">Esqueci minha senha</Link>
              </Button>
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full">Entrar com segurança <ArrowRight /></Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-[9px] uppercase tracking-[.12em]"><span className="bg-card px-3 text-muted-foreground">Ou continue com</span></div>
          </div>
          
          <Button onClick={() => { showLoading("Conectando com Google..."); signIn('google'); }} variant="outline" className="w-full">
            <svg className="mr-2 h-5 w-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
            Continuar com Google
          </Button>
        </CardContent>
        <CardFooter className="justify-center border-t border-border/40 px-7 py-4">
          <p className="flex items-center justify-center text-[9px] uppercase tracking-[.1em] text-muted-foreground">
            <Lock className="mr-2 h-3.5 w-3.5" /> Ambiente seguro Agenda Wise
          </p>
        </CardFooter>
      </Card>
      </section>
    </main>
  );
}

// src/app/page.tsx - Versão completa a ser utilizada
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Leaf, Lock } from "lucide-react";
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

  useEffect(() => {
    setSessaoExpirou(new URLSearchParams(window.location.search).get('expired') === 'true');
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 gap-4">
        <p className="text-lg">{status === 'loading' ? 'Verificando sessão...' : 'Login confirmado, redirecionando...'}</p>
        <Button variant="outline" onClick={() => signOut()}>
          Sair / Trocar Conta
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center mb-4">
            <Leaf className="h-12 w-12 text-primary" />
            <h1 className="font-headline text-4xl font-bold text-primary ml-2">AgendaWise</h1>
          </div>
          <CardTitle className="font-headline text-2xl">Acesse sua conta</CardTitle>
          <CardDescription className="text-muted-foreground">
            Entre com seu e-mail e senha ou use o Google.
          </CardDescription>
          {/* A-016: dizer por que a pessoa voltou para cá. Sem isto ela reentra
              os dados achando que errou a senha na vez anterior. */}
          {sessaoExpirou && (
            <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}
        </CardHeader>
        <CardContent>
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
            <Button type="submit" className="w-full">Entrar</Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Ou continue com</span></div>
          </div>
          
          <Button onClick={() => { showLoading("Conectando com Google..."); signIn('google'); }} variant="outline" className="w-full">
            <svg className="mr-2 h-5 w-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
            Entrar com Google
          </Button>
        </CardContent>
        <CardFooter>
          <p className="px-8 text-center text-sm text-muted-foreground flex items-center justify-center">
            <Lock className="h-4 w-4 mr-2" /> Login Seguro
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

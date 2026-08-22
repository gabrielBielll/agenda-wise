'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Leaf, MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recuperarSenha } from './actions';

/**
 * MÓDULO A — "Esqueci minha senha".
 *
 * Campos controlados e `disabled` enquanto a server action está pendente
 * (`useTransition`), para não haver duplo-envio. Depois do envio mostramos
 * SEMPRE a mesma mensagem genérica — quem controla essa neutralidade é a action,
 * a tela só a exibe.
 *
 * Usa `useTransition` (React 18) em vez de `useActionState` (React 19): o
 * package.json fixa React 18.3, então o hook novo não existe aqui.
 */
export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return; // trava extra de duplo-envio
    startTransition(async () => {
      const res = await recuperarSenha(email);
      setMensagem(res.mensagem);
    });
  };

  return (
    <Card className="w-full max-w-md border-border/70 bg-card/60 shadow-[var(--quiet-shadow-strong)]">
      <CardHeader className="space-y-1 p-8 pb-5 text-center">
        <div className="mb-4 flex justify-center">
          <span className="grid h-14 w-14 place-items-center rounded-[18px_18px_18px_6px] bg-accent text-accent-foreground shadow-[var(--quiet-shadow-soft)]">
            <Leaf className="h-6 w-6" />
          </span>
        </div>
        <p className="page-eyebrow">Agenda Wise</p>
        <CardTitle className="text-3xl">Esqueci minha senha</CardTitle>
        <CardDescription>
          Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
        </CardDescription>
      </CardHeader>

      {mensagem ? (
        // Estado de confirmação: a mesma mensagem para conta existente ou não.
        <CardContent className="px-8">
          <div className="flex flex-col items-center gap-3 rounded-md bg-muted px-4 py-6 text-center">
            <MailCheck className="h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">{mensagem}</p>
          </div>
        </CardContent>
      ) : (
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4 px-8">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="email@exemplo.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
          </CardContent>
          <CardFooter className="px-8">
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? 'Enviando...' : (<>Enviar link de redefinição <ArrowRight /></>)}
            </Button>
          </CardFooter>
        </form>
      )}

      <CardFooter className="justify-center border-t border-border/40 px-8 py-4">
        <Button asChild variant="link" size="sm">
          <Link href="/">
            <ArrowLeft /> Voltar para o login
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

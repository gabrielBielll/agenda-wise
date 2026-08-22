'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, KeyRound, Leaf } from 'lucide-react';

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
import { redefinirSenha } from './actions';

/**
 * MÓDULO A — formulário de nova senha.
 *
 * Campos controlados e `disabled` durante o `useTransition` (anti-duplo-envio).
 * O `token` vem do Server Component (lido do `searchParams`), nunca daqui.
 *
 * As checagens locais são só as que NÃO dependem do backend: token ausente e
 * confirmação divergente. Tamanho mínimo é regra do servidor — chega como
 * `senha_curta` (422), com mensagem clara. Sucesso volta ao login com um aviso.
 */
export function RedefinirSenhaForm({ token }: { token: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tokenAusente = token.trim() === '';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setErro(null);

    if (tokenAusente) {
      setErro('Link inválido ou incompleto. Peça um novo link de redefinição.');
      return;
    }
    if (senha !== confirma) {
      setErro('As senhas não coincidem. Digite a mesma senha nos dois campos.');
      return;
    }

    startTransition(async () => {
      const res = await redefinirSenha(token, senha);
      if (res.ok) {
        // Volta ao login com um aviso de sucesso (banner lido em `src/app/page.tsx`).
        router.push('/?redefinida=1');
        return;
      }
      if (res.code === 'senha_curta') {
        setErro('A senha escolhida é muito curta. Use uma senha mais longa.');
      } else if (res.code === 'token_invalido') {
        setErro('Este link expirou ou já foi usado. Peça um novo link de redefinição.');
      } else {
        setErro('Não foi possível redefinir a senha agora. Tente novamente em instantes.');
      }
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
        <CardTitle className="text-3xl">Criar nova senha</CardTitle>
        <CardDescription>
          Escolha uma nova senha para acessar sua conta.
        </CardDescription>
      </CardHeader>

      {tokenAusente ? (
        // Sem token não há o que redefinir: dizer isso em vez de mostrar um form
        // que só falharia depois.
        <CardContent className="px-8">
          <div className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
            Link inválido ou incompleto. Peça um novo link de redefinição na tela
            de recuperação de senha.
          </div>
        </CardContent>
      ) : (
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4 px-8">
            <div className="grid gap-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                name="nova-senha"
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirma-senha">Confirme a nova senha</Label>
              <Input
                id="confirma-senha"
                name="confirma-senha"
                type="password"
                required
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                disabled={isPending}
              />
            </div>
            {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}
          </CardContent>
          <CardFooter className="px-8">
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : (<><KeyRound /> Salvar nova senha <ArrowRight /></>)}
            </Button>
          </CardFooter>
        </form>
      )}

      <CardFooter className="justify-center border-t border-border/40 px-8 py-4">
        <Button asChild variant="link" size="sm">
          <Link href="/">Voltar para o login</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

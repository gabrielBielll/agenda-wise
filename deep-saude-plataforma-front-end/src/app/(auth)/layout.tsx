import React from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Layout compartilhado das telas de conta que NÃO são o login em si —
 * recuperar e redefinir senha (Módulo A).
 *
 * Reaproveita o mesmo enquadramento centralizado da tela de admin
 * (`admin/login/layout.tsx`): fundo, círculo de acento e o `ThemeToggle` no
 * canto. Assim as três telas de acesso têm o mesmo vocabulário visual sem
 * reescrever o wrapper em cada página.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 before:absolute before:-right-36 before:-top-40 before:h-[460px] before:w-[460px] before:rounded-full before:border before:border-accent/10 before:shadow-[var(--quiet-shadow)]">
      <ThemeToggle className="fixed right-4 top-4 z-20 bg-background/75 sm:right-6 sm:top-6" />
      {children}
    </div>
  );
}

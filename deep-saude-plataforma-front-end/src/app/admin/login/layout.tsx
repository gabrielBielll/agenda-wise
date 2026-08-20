import React from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AdminLoginLayout({
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

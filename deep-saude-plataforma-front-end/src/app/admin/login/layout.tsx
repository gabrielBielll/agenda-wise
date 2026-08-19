import React from 'react';

export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 before:absolute before:-right-36 before:-top-40 before:h-[460px] before:w-[460px] before:rounded-full before:border before:border-primary/10 before:shadow-[0_0_0_70px_rgba(149,160,132,.035)]">
      {children}
    </div>
  );
}

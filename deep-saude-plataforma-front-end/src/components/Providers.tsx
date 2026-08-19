"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { LoadingProvider } from "@/components/LoadingOverlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="agenda-wise-theme"
      disableTransitionOnChange
    >
      <SessionProvider>
        <LoadingProvider>
          {children}
          <Toaster />
        </LoadingProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

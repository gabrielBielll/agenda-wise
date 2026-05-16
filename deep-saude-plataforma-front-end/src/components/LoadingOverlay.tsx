"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Loader2, Leaf } from "lucide-react";
import { usePathname } from "next/navigation";

interface LoadingContextType {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | null>(null);

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within LoadingProvider");
  return ctx;
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "Carregando...",
  });

  const pathname = usePathname();

  const showLoading = useCallback((message = "Carregando...") => {
    setState({ visible: true, message });
  }, []);

  const hideLoading = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Auto-oculta quando a navegação (rota) for concluída
  useEffect(() => {
    hideLoading();
  }, [pathname, hideLoading]);

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading }}>
      {children}
      {state.visible && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
          role="status"
          aria-label={state.message}
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-2">
              <Leaf className="h-10 w-10 text-primary" />
              <span className="font-headline text-3xl font-bold text-primary">
                Deep Saúde
              </span>
            </div>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-base font-medium text-muted-foreground">
              {state.message}
            </p>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
}

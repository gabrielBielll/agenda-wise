"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
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
  const pathnameRef = useRef(pathname);

  const showLoading = useCallback((message = "Carregando...") => {
    setState({ visible: true, message });
  }, []);

  const hideLoading = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Mantém o ref sempre atualizado para o click handler ter acesso ao pathname atual
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Auto-oculta quando a navegação (rota) for concluída
  useEffect(() => {
    hideLoading();
  }, [pathname, hideLoading]);

  // Intercepta cliques em links internos para mostrar loading automaticamente
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Ignora cliques com teclas modificadoras (abre em nova aba, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Ignora links externos, mailto, tel, etc.
      if (href.startsWith("http") || href.startsWith("//") || href.includes(":")) return;

      // Ignora target="_blank"
      if (anchor.target === "_blank") return;

      // Ignora navegação para a mesma rota atual
      const hrefWithoutHash = href.split("#")[0].split("?")[0];
      if (hrefWithoutHash === pathnameRef.current || hrefWithoutHash === "") return;

      showLoading();
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showLoading]);

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

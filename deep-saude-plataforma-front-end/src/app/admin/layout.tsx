"use client";

import React, { useState, useEffect } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { cn } from "@/lib/utils";
import { Loader2, ServerCrash } from "lucide-react"; // Ícones para o estado de loading e erro
import { usePathname } from "next/navigation";

// Componente para a tela de carregamento e erro
const BackendWakeUpScreen = ({ status }: { status: 'checking' | 'error' }) => (
  <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40 p-4 text-center">
    {status === 'checking' && (
      <>
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold text-foreground">Conectando ao servidor...</h2>
        <p className="text-muted-foreground">Isso pode levar alguns segundos. Estamos tentando novamente para você.</p>
      </>
    )}
    {status === 'error' && (
      <>
        <ServerCrash className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive">Falha ao conectar com o servidor</h2>
        <p className="text-muted-foreground">Não foi possível estabelecer comunicação com a API após algumas tentativas. Por favor, tente novamente mais tarde.</p>
      </>
    )}
  </div>
);

// Função para tentar a conexão com o backend com retentativas
const wakeUpBackendWithRetry = async (retries = 3, delay = 3000): Promise<boolean> => {
  for (let i = 0; i < retries; i++) {
    try {
      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error("A variável de ambiente NEXT_PUBLIC_API_URL não está configurada.");
      }
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/health`;
      // AbortController para definir um timeout na requisição
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos de timeout

      console.log(`Tentativa ${i + 1} de acordar o backend...`);
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(`Backend acordado na tentativa ${i + 1}.`);
        return true;
      }
      console.warn(`Tentativa ${i + 1} falhou com status: ${response.status}`);
    } catch (error) {
      console.error(`Erro na tentativa ${i + 1}:`, error);
    }
    // Espera antes da próxima tentativa, exceto na última
    if (i < retries - 1) {
      await new Promise(res => setTimeout(res, delay));
    }
  }
  return false;
};


export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Estado para controlar o status da conexão com o backend
  const [backendStatus, setBackendStatus] = useState<'checking' | 'awake' | 'error'>('checking');
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  // Efeito para "acordar" o backend quando o layout é montado
  useEffect(() => {
    const checkBackend = async () => {
      const isAwake = await wakeUpBackendWithRetry();
      setBackendStatus(isAwake ? 'awake' : 'error');
    };
    
    // Chama a função de "acordar" com retentativas
    checkBackend();
  }, []); // O array vazio [] garante que isso execute apenas uma vez quando o componente montar

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const pathname = usePathname();

  // Renderiza a tela de carregamento/erro enquanto o backend não está 'awake'
  if (backendStatus !== 'awake') {
    return <BackendWakeUpScreen status={backendStatus} />;
  }

  // Se for a página de login, não mostramos o layout do admin (sidebar/header)
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Se o backend estiver acordado, renderiza o layout normal da aplicação
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex"
      />
      <div
        className={cn(
          "flex flex-col sm:gap-4 sm:py-4 transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "md:ml-14" : "md:ml-64"
        )}
      >
        <AdminHeader />
        <main className="flex-1 gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 mt-14 md:mt-0">
          {children}
        </main>
      </div>
    </div>
  );
}

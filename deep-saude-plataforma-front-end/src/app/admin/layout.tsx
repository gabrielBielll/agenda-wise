"use client";

import React, { useState, useEffect } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { cn } from "@/lib/utils";
import { Loader2, ServerCrash } from "lucide-react"; // Ícones para o estado de loading e erro
import { usePathname } from "next/navigation";

/**
 * 🔴 A-013 na porta de entrada, e ela custou uma noite de "não estou vendo o
 * novo design".
 *
 * ## Duas causas muito diferentes davam a MESMA tela
 *
 * O `wakeUpBackendWithRetry` chama `{NEXT_PUBLIC_API_URL}/api/health` **do
 * navegador**. Ele falha por dois motivos que não se parecem em nada:
 *
 * | causa | esperar resolve? |
 * |---|---|
 * | backend dormindo / fora do ar | **sim** — é para isso que a retentativa existe |
 * | `NEXT_PUBLIC_API_URL` ausente | **nunca** |
 *
 * ⚠️ E a segunda é a mais provável em produção, por um detalhe do Next: uma
 * variável `NEXT_PUBLIC_*` usada em componente de cliente é **embutida no bundle
 * durante o `next build`**, não lida em runtime. Conferido: o valor aparece em
 * `.next/static/chunks/app/admin/layout-*.js`. Se o provedor a define só como
 * variável de execução, o chunk sai com `undefined` e **nenhum reinício
 * conserta** — só um build novo com a variável presente.
 *
 * 🔴 A tela antiga dizia *"tente novamente mais tarde"* nos dois casos. Para o
 * segundo isso é mentira, e é a pior classe de mentira: manda a pessoa esperar
 * por algo que não vai acontecer.
 */
type EstadoDoBackend = 'checking' | 'sem_configuracao' | 'sem_resposta' | 'awake';

const BackendWakeUpScreen = ({ status }: { status: Exclude<EstadoDoBackend, 'awake'> }) => (
  <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-6 text-center">
    {status === 'checking' && (
      <>
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold text-foreground">Conectando ao servidor...</h2>
        <p className="text-muted-foreground">Isso pode levar alguns segundos. Estamos tentando novamente para você.</p>
      </>
    )}
    {status === 'sem_resposta' && (
      <>
        <ServerCrash className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive">O servidor não respondeu</h2>
        <p className="max-w-md text-muted-foreground">
          A aplicação está no ar, mas a API não respondeu depois de algumas tentativas.
          Se o servidor estava dormindo, recarregar em um minuto costuma resolver.
        </p>
      </>
    )}
    {status === 'sem_configuracao' && (
      <>
        <ServerCrash className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive">Esta build saiu sem o endereço da API</h2>
        <p className="max-w-md text-muted-foreground">
          O endereço do servidor é gravado <strong>durante a construção</strong> desta
          página, e esta foi construída sem ele. Recarregar não resolve — é preciso
          construir de novo com <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_API_URL</code> definida
          como variável <strong>de build</strong>.
        </p>
      </>
    )}
  </div>
);

// Função para tentar a conexão com o backend com retentativas
const wakeUpBackendWithRetry = async (retries = 3, delay = 3000): Promise<boolean> => {
  for (let i = 0; i < retries; i++) {
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/health`;
      // AbortController para definir um timeout na requisição
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos de timeout

      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      }
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
  const [backendStatus, setBackendStatus] = useState<EstadoDoBackend>('checking');

  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  // Efeito para "acordar" o backend quando o layout é montado
  useEffect(() => {
    /**
     * ⚠️ A falta da variável é decidida **antes** de qualquer tentativa, e sem
     * `fetch`: não é um erro de rede que pode melhorar: é uma build que saiu
     * incompleta. Tentar três vezes só gastaria nove segundos para chegar à
     * mesma conclusão — e à mensagem errada.
     */
    if (!process.env.NEXT_PUBLIC_API_URL) {
      setBackendStatus('sem_configuracao');
      return;
    }
    const checkBackend = async () => {
      const isAwake = await wakeUpBackendWithRetry();
      setBackendStatus(isAwake ? 'awake' : 'sem_resposta');
    };

    // Chama a função de "acordar" com retentativas
    checkBackend();
  }, []); // O array vazio [] garante que isso execute apenas uma vez quando o componente montar

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const pathname = usePathname();

  /**
   * 🔴 A ORDEM DESTAS DUAS GUARDAS ESTAVA INVERTIDA, e era o defeito visível.
   *
   * A porta do backend vinha **antes** da exceção do login, então `/admin/login`
   * — que é HTML estático, não depende da API para desenhar — ficava atrás de um
   * health check. Resultado: com o backend fora, ou com a build sem
   * `NEXT_PUBLIC_API_URL`, **a tela de login não existia**; havia só um spinner.
   *
   * 📌 O Gabriel passou a noite achando que o redesign dele não tinha subido. O
   * redesign estava lá — era a porta que não abria.
   *
   * ⚠️ A guarda do backend continua valendo para o RESTO do admin, e deve: as
   * outras telas leem dados, e mostrá-las vazias é a A-013 de novo. O login é a
   * única que tem o que dizer sem a API.
   */
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Renderiza a tela de carregamento/erro enquanto o backend não está 'awake'
  if (backendStatus !== 'awake') {
    return <BackendWakeUpScreen status={backendStatus} />;
  }

  // Se o backend estiver acordado, renderiza o layout normal da aplicação
  return (
    <div className="flex min-h-screen w-full flex-col bg-transparent">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex"
      />
      <div
        className={cn(
          "flex flex-col transition-all duration-500 ease-out sm:gap-4 sm:py-4",
          isSidebarCollapsed ? "md:ml-14" : "md:ml-64"
        )}
      >
        <AdminHeader />
        <main className="page-enter mt-14 flex-1 gap-4 p-4 sm:px-7 sm:py-0 md:mt-0 md:gap-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}

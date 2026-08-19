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
 * O `wakeUpBackendWithRetry` chama **`/api/health` em caminho relativo**, que o
 * proxy do `next.config.ts` encaminha ao backend. Ele falha por dois motivos que
 * não se parecem em nada:
 *
 * | causa | esperar resolve? |
 * |---|---|
 * | backend dormindo / fora do ar | **sim** — é para isso que a retentativa existe |
 * | build sem endereço nenhum | **nunca** |
 *
 * 🔴 **E a resposta NÃO distingue as duas.** Eu supus que o proxy apontando para
 * si mesmo devolveria 404, e escrevi uma guarda em cima disso. Medido em 19/08,
 * com o Next na 3000 nos dois cenários:
 *
 * ```
 * proxy -> ele mesmo (build sem variável)   500
 * proxy correto, backend derrubado          500
 * ```
 *
 * A guarda nunca dispararia. Por isso o sinal vem do **tempo de build**:
 * `NEXT_PUBLIC_API_CONFIGURADA` é `'1'` ou `''`, definida no `next.config.ts` a
 * partir de `API_PROXY_TARGET` **ou** `NEXT_PUBLIC_API_URL`.
 *
 * 📌 **A-024 — e esta mudança tem um segundo motivo, maior que a mensagem.**
 * Enquanto esta linha chamava `{NEXT_PUBLIC_API_URL}/api/health`, ela era a
 * **única** chamada do navegador ao backend — e por causa dela o endereço ia
 * embutido no bundle e a porta do backend precisava ficar aberta para a
 * internet. Medido em 19/08: das 28 origens que usam a variável, 27 são código
 * de servidor; só esta rodava no cliente. Com o caminho relativo, nada no
 * navegador conhece o backend, e ele pode viver em rede privada.
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
          página, e esta foi construída sem ele — o pedido voltou para a própria
          aplicação em vez de chegar ao servidor. Recarregar não resolve: é preciso
          construir de novo com{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">API_PROXY_TARGET</code> definida
          como variável <strong>de build</strong>.
        </p>
      </>
    )}
  </div>
);

/**
 * Devolve o estado do backend, distinguindo as duas causas.
 *
 * ⚠️ **404 sai do laço na primeira tentativa, de propósito.** Retentar existe
 * para o backend que está subindo; configuração errada não melhora com espera, e
 * insistir três vezes só faria a pessoa olhar 30 segundos para um spinner antes
 * de receber a única mensagem que ela podia agir.
 */
const consultarBackend = async (
  retries = 3,
  delay = 3000,
): Promise<Exclude<EstadoDoBackend, 'checking'>> => {
  for (let i = 0; i < retries; i++) {
    try {
      // Caminho RELATIVO: quem encaminha é o proxy do `next.config.ts`. Ver o
      // bloco A-024 acima — é o que tira o backend do bundle do navegador.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) return 'awake';
    } catch (error) {
      console.error(`Erro na tentativa ${i + 1}:`, error);
    }
    if (i < retries - 1) {
      await new Promise(res => setTimeout(res, delay));
    }
  }
  return 'sem_resposta';
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
     * ⚠️ A distinção entre "build incompleta" e "backend fora" agora vem da
     * RESPOSTA, não de ler a variável aqui.
     *
     * Antes este bloco checava `process.env.NEXT_PUBLIC_API_URL`, e só conseguia
     * enxergar uma das duas variáveis que importam. Hoje o proxy aceita
     * `API_PROXY_TARGET` **ou** `NEXT_PUBLIC_API_URL` — com qualquer uma das
     * duas presentes ele funciona, e a guarda antiga acusaria falta de
     * configuração numa build perfeitamente boa.
     */
    // A build incompleta é decidida ANTES de qualquer tentativa, e sem `fetch`:
    // não é erro de rede que possa melhorar, é uma build que saiu sem endereço.
    // Tentar três vezes gastaria nove segundos para chegar à mesma conclusão.
    if (!process.env.NEXT_PUBLIC_API_CONFIGURADA) {
      setBackendStatus('sem_configuracao');
      return;
    }

    const checkBackend = async () => {
      const estado = await consultarBackend();
      setBackendStatus(estado);
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

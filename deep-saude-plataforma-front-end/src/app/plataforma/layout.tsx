import React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Casca própria do painel da plataforma.
 *
 * Não reusa `AdminSidebar`/`AdminHeader` de propósito: o `/admin` é o
 * administrador de UMA clínica, e este é o operador da plataforma. São eixos
 * diferentes de autorização, e a navegação misturada é como o eixo se confunde
 * primeiro na cabeça de quem usa e depois no código.
 *
 * Por isso a barra é deliberadamente diferente e o único link de saída volta
 * para o sistema clínico — o operador é um usuário normal de uma clínica normal
 * e continua usando o sistema como qualquer um.
 */
export default function LayoutDaPlataforma({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px_14px_14px_5px] bg-accent text-accent-foreground"><ShieldCheck className="h-5 w-5" /></span>
            <span className="hidden font-headline text-lg tracking-tight min-[430px]:inline sm:text-xl">Operação da plataforma</span>
            <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
              interno
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard" className="flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/45 px-3 text-xs font-semibold text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-card hover:text-primary">
              <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Voltar ao sistema clínico</span><span className="sm:hidden">Voltar</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="p-4 sm:p-7 lg:p-10">{children}</main>
    </div>
  );
}

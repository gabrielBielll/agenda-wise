import React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";

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
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Operação da plataforma</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              interno
            </span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao sistema clínico
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

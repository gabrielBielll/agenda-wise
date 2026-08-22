"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
// União dos dois lados do redesign: `Leaf` é a marca nova (8109afc), `Plug` é a
// entrada "Integrações" da GC-001a. Os dois estão em uso — escolher um lado aqui
// apagaria ou o logotipo dele ou a rota do painel do Google.
import { Home, Users, CalendarDays, DollarSign, BriefcaseMedical, LogOut, Leaf, Plug, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Para tooltips nos ícones
import { SheetClose } from "@/components/ui/sheet";

interface NavLinkItem {
  href: string;
  label: string;
  icon: React.ElementType;
  disabled?: boolean;
}

const mainNavLinks: NavLinkItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: Home },
  { href: "/admin/psicologos", label: "Psicólogos", icon: Users },
  { href: "/admin/pacientes", label: "Pacientes", icon: BriefcaseMedical },
  { href: "/admin/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
  // GC-001a. Sem entrada aqui a tela existe e ninguém a encontra — e o painel
  // que avisa que a integração caiu não pode depender de alguém digitar a URL.
  { href: "/admin/integracoes", label: "Integrações", icon: Plug },
  // GC-016. Mesmo motivo da entrada acima, e com a cicatriz da A-020 logo abaixo
  // como lembrete: a rota existe (`src/app/admin/aparencia/page.tsx`), e foi
  // conferida antes de o link entrar. Link para rota que não existe é 404 que o
  // Next pré-busca sozinho — o defeito aparece antes de alguém clicar.
  { href: "/admin/aparencia", label: "Aparência", icon: Palette },
];

/**
 * A-020 — aqui havia "Configurações" apontando para `/admin/settings`, e essa
 * rota nunca existiu. Medido em 19/08 abrindo o app: o Next pré-buscava o
 * destino de toda tela do admin e recebia 404 em todas; clicar levava à página
 * de erro.
 *
 * ⚠️ Removi em vez de criar a tela, e a escolha é deliberada: inventar uma tela
 * de configurações do admin é decidir o que a clínica configura, e isso é
 * desenho de produto, não conserto de link. Item que promete e entrega 404 é
 * pior que item ausente — a ausência não mente.
 *
 * 📌 O que existe hoje e é configuração de verdade mora em `/admin/integracoes`,
 * que já está na lista principal.
 */
const secondaryNavLinks: NavLinkItem[] = [];

function NavLink({ href, label, icon: Icon, isCollapsed }: NavLinkItem & { isCollapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href));

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className={cn(
              buttonVariants({ variant: isActive ? "default" : "ghost", size: isCollapsed ? "icon" : "default" }),
              "w-full justify-start gap-3 rounded-[13px]",
              isActive && "bg-accent/10 text-accent shadow-none hover:bg-accent/15 hover:text-accent",
              !isActive && "text-muted-foreground hover:bg-accent/10 hover:text-accent",
              isCollapsed && "h-9 w-9"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className={cn("h-5 w-5", isCollapsed && "h-4 w-4")} />
            {!isCollapsed && <span className="truncate">{label}</span>}
            <span className="sr-only">{label}</span>
          </Link>
        </TooltipTrigger>
        {isCollapsed && (
          <TooltipContent side="right" className="flex items-center gap-4">
            {label}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AdminSidebar({ isCollapsed = false, className }: { isCollapsed?: boolean; className?: string }) {
  // isCollapsed será usado para a versão desktop. Para mobile (dentro do Sheet), sempre será "expandido" (isCollapsed=false).
  // No AdminHeader, o conteúdo do Sheet terá os links diretamente, então esta prop é mais para o layout desktop.

  return (
    <aside
      className={cn(
        "group flex h-full flex-col gap-4 border-r border-border/50 bg-card/55 py-4 backdrop-blur-xl data-[collapsed=true]:py-4",
        isCollapsed && "data-[collapsed=true]:w-14", // Largura quando colapsada
        !isCollapsed && "w-64", // Largura quando expandida
        className
      )}
      data-collapsed={isCollapsed}
    >
      <div className={cn("flex items-center gap-2 px-4", isCollapsed && "h-9 justify-center px-2")}>
        <Link href="/admin/dashboard" className="flex items-center gap-2 overflow-hidden">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px_13px_13px_4px] bg-accent text-accent-foreground shadow-[var(--quiet-shadow-soft)]"><Leaf className={cn("h-5 w-5", isCollapsed && "h-4 w-4")} /></span>
          {!isCollapsed && <div><h1 className="font-headline text-xl font-normal">Agenda Wise</h1><p className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">Administração</p></div>}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2">
        {mainNavLinks.map((link) => (
          <NavLink key={link.href} {...link} isCollapsed={isCollapsed} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 px-2">
        {secondaryNavLinks.map((link) => (
          <NavLink key={link.href} {...link} isCollapsed={isCollapsed} />
        ))}
        {/* Botão de logout real */}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isCollapsed ? "icon" : "default"}
                className={cn("w-full justify-start gap-2", isCollapsed && "h-9 w-9")}
                onClick={() => signOut({ callbackUrl: "/admin/login" })}
              >
                <LogOut className={cn("h-5 w-5", isCollapsed && "h-4 w-4")} />
                {!isCollapsed && <span className="truncate">Sair</span>}
                <span className="sr-only">Sair</span>
              </Button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="flex items-center gap-4">
                Sair
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  );
}

// Este é o conteúdo que pode ser usado dentro do Sheet no AdminHeader
export function AdminSidebarSheetContent() {
  const pathname = usePathname();

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-3.5">
        <Link href="/admin/dashboard" className="flex items-center gap-2 overflow-hidden">
          <span className="grid h-9 w-9 place-items-center rounded-[13px_13px_13px_4px] bg-accent text-accent-foreground"><Leaf className="h-4 w-4" /></span>
          <h1 className="font-headline text-xl">Agenda Wise</h1>
        </Link>
      </div>
      <nav className="grid gap-2 p-2 text-base font-medium">
        {mainNavLinks.map((link) => {
          const active = pathname === link.href || (link.href !== "/admin/dashboard" && pathname.startsWith(link.href));
          return (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "w-full justify-start gap-3 rounded-[13px]",
                  active && "bg-accent/10 text-accent hover:bg-accent/15 hover:text-accent",
                  !active && "text-muted-foreground hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <link.icon className="h-5 w-5" />
                {link.label}
              </Link>
            </SheetClose>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-2 border-t border-border/50 p-2 pt-3 text-base font-medium">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
        >
          <LogOut className="h-5 w-5" />
          Sair
        </Button>
      </div>
    </>
  );
}

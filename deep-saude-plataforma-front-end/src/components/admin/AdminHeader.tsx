"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { PanelLeft, PanelLeftClose, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./ThemeToggle";
import { AdminSidebarSheetContent } from './AdminSidebar'; // Importar o conteúdo da sidebar para o Sheet
import { usePathname } from "next/navigation";

const AdminBreadcrumbs = () => {
  const pathname = usePathname();
  const current = pathname.split('/').filter(Boolean).pop()?.replaceAll('-', ' ') || 'dashboard';
  return <nav aria-label="breadcrumb"><ol className="flex items-center gap-2 text-[10px] uppercase tracking-[.1em] text-muted-foreground"><li><Link href="/admin/dashboard" className="transition-colors hover:text-primary">Admin</Link></li><li><span className="text-accent">·</span></li><li aria-current="page" className="capitalize text-foreground">{current}</li></ol></nav>;
};

export default function AdminHeader({
  onDrawerToggle, // Prop para controlar o estado do drawer no layout pai, se necessário
}: {
  onDrawerToggle?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/50 bg-background/85 px-4 backdrop-blur-xl md:static md:mx-7 md:h-auto md:rounded-2xl md:border md:bg-card/45 md:px-5 md:py-3 lg:mx-10">
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="md:hidden">
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Abrir menu administrativo</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(88vw,340px)] p-0">
          <AdminSidebarSheetContent />
        </SheetContent>
      </Sheet>

      <Button size="icon" variant="outline" className="hidden md:inline-flex" onClick={onDrawerToggle} aria-label="Recolher ou expandir menu">
        <PanelLeftClose className="h-5 w-5" />
      </Button>

      <div className="ml-auto hidden items-center gap-2 min-[420px]:flex">
        <AdminBreadcrumbs />
      </div>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="overflow-hidden rounded-full">
            <UserCircle className="h-6 w-6" />
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* TODO(admin-account-pages): habilitar quando as rotas reais de perfil e suporte
              forem definidas. Itens sensíveis não devem aparentar navegação que não existe. */}
          <DropdownMenuItem disabled>Configurações · em breve</DropdownMenuItem>
          <DropdownMenuItem disabled>Suporte · em breve</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/admin/login" })}>
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

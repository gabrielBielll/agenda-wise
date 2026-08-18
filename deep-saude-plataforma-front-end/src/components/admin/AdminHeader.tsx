"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { PanelLeft, Search, Settings, UserCircle } from "lucide-react"; // Adicionando alguns ícones de exemplo
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input"; // Para um campo de busca de exemplo
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./ThemeToggle";
import { AdminSidebarSheetContent } from './AdminSidebar'; // Importar o conteúdo da sidebar para o Sheet
import { usePathname } from "next/navigation";

// Placeholder para Breadcrumbs (será implementado de forma mais robusta depois)
const BreadcrumbsPlaceholder = () => {
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/35 bg-background/75 px-4 backdrop-blur-xl sm:static sm:mx-6 sm:h-auto sm:rounded-2xl sm:border sm:border-white/60 sm:bg-white/35 sm:px-5 sm:py-3 lg:mx-10">
      {/* Trigger da Sidebar para Mobile - Usará o AdminSidebar como conteúdo */}
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden" onClick={onDrawerToggle}>
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs p-0"> {/* Removido padding padrão para o conteúdo do sheet controlar */}
          <AdminSidebarSheetContent />
        </SheetContent>
      </Sheet>

      <div className="relative ml-auto flex-1 md:grow-0">
        {/* Exemplo de campo de busca - pode ser removido ou adaptado */}
        {/* <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
        /> */}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <BreadcrumbsPlaceholder /> {/* Adicionando o placeholder dos breadcrumbs */}
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
          <DropdownMenuItem>Configurações</DropdownMenuItem>
          <DropdownMenuItem>Suporte</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/admin/login" })}>
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

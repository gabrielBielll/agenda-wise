'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutDashboard, CalendarDays, Users, Settings, LogOut, Leaf, Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile'; // Assuming this hook exists

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  tooltip?: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard, tooltip: "Painel" },
  { href: '/calendar', label: 'Calendário', icon: CalendarDays, tooltip: "Calendário" },
  { href: '/patients', label: 'Pacientes', icon: Users, tooltip: "Pacientes" },
  { href: '/settings', label: 'Configurações', icon: Settings, tooltip: "Configurações" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [userInitial, setUserInitial] = useState<string>('AW');

  useEffect(() => {
    // In a real app, fetch user data and set initial
    // For now, mock it
    setUserInitial('AW');
  }, []);


  const handleLogout = () => {
    // Mock logout
    router.push('/');
  };

  return (
    <SidebarProvider defaultOpen={!isMobile} open={!isMobile}>
      <Sidebar>
        <SidebarHeader className="p-4 flex flex-col items-center">
          <Link href="/dashboard" className="flex items-center gap-2 mb-4">
            <Leaf className="w-8 h-8 text-sidebar-primary" />
            <h1 className="font-headline text-2xl font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              AgendaWise
            </h1>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                    tooltip={item.tooltip}
                  >
                    <item.icon />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 mt-auto">
           <div className="group-data-[collapsible=icon]:hidden flex flex-col items-center text-xs text-sidebar-foreground/70">
            <p>&copy; {new Date().getFullYear()} AgendaWise</p>
            <p>Todos os direitos reservados.</p>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur-md px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" /> {/* Hamburger for mobile */}
             <h2 className="font-headline text-xl font-semibold text-foreground hidden sm:block">
              {navItems.find(item => pathname.startsWith(item.href))?.label || 'AgendaWise'}
            </h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src="https://placehold.co/100x100.png" alt="Avatar do Usuário" data-ai-hint="user avatar" />
                  <AvatarFallback className="bg-primary text-primary-foreground">{userInitial}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Usuário AgendaWise</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    usuario@agendawise.com
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Configurações</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

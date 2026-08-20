'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Bell, CalendarDays, ChevronLeft, HeartHandshake, LayoutDashboard,
  Leaf, LogOut, Menu, Plus, Search, Settings, UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useCareMessage } from '@/hooks/use-care-message';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/calendar', label: 'Agenda', icon: CalendarDays },
  { href: '/patients', label: 'Pacientes', icon: UsersRound },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px_14px_14px_5px] bg-accent text-accent-foreground shadow-[var(--quiet-shadow-soft)]">
        <Leaf className="h-[19px] w-[19px]" strokeWidth={1.8} />
      </span>
      {!compact && <span className="font-headline text-[23px] tracking-[-.03em]">agenda<em className="font-normal text-accent">wise</em></span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [expanded, setExpanded] = useState(true);
  const care = useCareMessage();
  const isCalendar = pathname.startsWith('/calendar');
  const activeItem = navItems.find(item => pathname.startsWith(item.href))
    ?? (pathname.startsWith('/settings') ? { label: 'Preferências' } : undefined);
  const userName = session?.user?.name || 'Profissional AgendaWise';
  const userEmail = session?.user?.email || 'Psicóloga clínica';
  const userInitials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AW';

  return (
    <div className="min-h-screen">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/50 bg-card/55 px-[18px] py-6 backdrop-blur-xl transition-[width] duration-500 ease-out md:flex',
        expanded ? 'w-[238px]' : 'w-[92px]'
      )}>
        <div className="flex h-12 items-center justify-between gap-3">
          <Brand compact={!expanded} />
          <button onClick={() => setExpanded(value => !value)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-card/45 text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-card hover:text-primary" aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}>
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        <nav className="mt-11 space-y-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} title={!expanded ? item.label : undefined} className={cn(
                'relative flex h-[50px] items-center gap-3.5 overflow-hidden rounded-[14px] px-[17px] text-sm text-muted-foreground transition-all duration-300 hover:bg-accent/10 hover:text-accent',
                active && 'bg-accent/10 font-semibold text-accent'
              )}>
                {active && <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-accent" />}
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.7} />
                {expanded && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />
        <div className={cn('mb-4 flex min-h-16 items-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-br from-accent/10 to-card/40 p-3', !expanded && 'justify-center')}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-accent shadow-sm"><HeartHandshake className="h-[18px] w-[18px]" /></span>
          {expanded && <div className="min-w-0"><strong className="block truncate text-xs">{care.reminderTitle}</strong><small className="block max-w-[145px] text-[10px] leading-tight text-muted-foreground">{care.reminderBody}</small></div>}
        </div>
        <Link href="/settings" className={cn('flex h-[50px] items-center gap-3.5 rounded-[14px] px-[17px] text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent', pathname.startsWith('/settings') && 'bg-accent/10 font-semibold text-accent')}>
          <Settings className="h-5 w-5 shrink-0" strokeWidth={1.7} />{expanded && <span>Preferências</span>}
        </Link>
        <div className="mt-2 flex items-center gap-2.5 overflow-hidden border-t border-border/50 px-1.5 pt-3">
          <Avatar className="h-10 w-10 shrink-0 border-2 border-card shadow-sm"><AvatarFallback className="bg-accent/10 text-xs font-semibold text-accent">{userInitials}</AvatarFallback></Avatar>
          {expanded && <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{userName}</strong><small className="block truncate text-[10px] text-muted-foreground">{userEmail}</small></div>}
          {expanded && <button onClick={() => signOut({ callbackUrl: '/' })} className="text-muted-foreground transition-colors hover:text-accent" aria-label="Sair"><LogOut className="h-4 w-4" /></button>}
        </div>
      </aside>

      <div className={cn('min-h-screen transition-[margin] duration-500 ease-out md:ml-[92px]', expanded && 'md:ml-[238px]')}>
        <header className="sticky top-0 z-30 flex h-[86px] items-center justify-between border-b border-border/30 bg-background/75 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div>
            <span className="page-eyebrow">ESPAÇO DE CUIDADO</span>
            <h1 className="mt-1 font-headline text-2xl font-normal tracking-[-.02em]">{activeItem?.label || 'AgendaWise'}</h1>
          </div>
          <div className="flex items-center gap-2.5">
            {/* TODO(global-search): ligar ao endpoint de pacientes e abrir uma command palette
                com navegação por teclado. Até lá o controle fica visivelmente indisponível. */}
            <button disabled title="Busca global em breve" className="hidden h-10 w-56 cursor-not-allowed items-center gap-2.5 rounded-xl border border-border/60 bg-card/45 px-3 text-left text-xs text-muted-foreground opacity-70 lg:flex">
              <Search className="h-[17px] w-[17px]" /><span className="flex-1">Buscar paciente...</span><kbd className="rounded-md bg-primary/10 px-1.5 py-1 text-[9px]">⌘ K</kbd>
            </button>
            <ThemeToggle />
            {/* TODO(notification-center): substituir o indicador demonstrativo pela contagem
                retornada pela API e abrir uma lista de lembretes persistidos. */}
            <button disabled title="Central de lembretes em breve" className="relative hidden h-10 w-10 cursor-not-allowed place-items-center rounded-xl border border-border/60 bg-card/45 text-muted-foreground opacity-70 sm:grid" aria-label="Central de lembretes em breve">
              <Bell className="h-[18px] w-[18px]" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full border border-background bg-accent" />
            </button>
            <Button asChild className="hidden sm:inline-flex"><Link href="/calendar?nova=1"><Plus className="h-4 w-4" />Nova sessão</Link></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="md:hidden"><Avatar className="h-10 w-10"><AvatarFallback className="bg-accent/10 text-xs text-accent">{userInitials}</AvatarFallback></Avatar></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuLabel>Minha conta</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/settings">Preferências</Link></DropdownMenuItem><DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>Sair</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main key={pathname} className={cn('page-enter', isCalendar ? 'h-[calc(100vh-86px)] overflow-hidden p-0' : 'p-4 pb-24 sm:p-7 lg:p-10')}>
          {children}
        </main>
      </div>

      <nav className="fixed bottom-3 left-3 right-3 z-40 flex min-h-[62px] items-center justify-around rounded-[18px] border border-border/70 bg-background/90 px-2 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[var(--quiet-shadow)] backdrop-blur-xl md:hidden">
        {navItems.map(item => { const Icon = item.icon; const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)); return <Link key={item.href} href={item.href} className={cn('flex min-w-16 flex-col items-center gap-1 text-[9px] text-muted-foreground transition-colors', active && 'text-accent')}><Icon className="h-[19px] w-[19px]" /><span>{item.label}</span></Link>; })}
        <Link href="/calendar?nova=1" className="-translate-y-3 grid h-12 w-12 place-items-center rounded-[15px] bg-primary text-primary-foreground shadow-[var(--quiet-shadow)]" aria-label="Nova sessão"><Plus className="h-5 w-5" /></Link>
      </nav>
    </div>
  );
}

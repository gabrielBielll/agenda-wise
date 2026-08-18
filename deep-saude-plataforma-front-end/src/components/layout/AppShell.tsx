'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Bell, CalendarDays, ChevronLeft, HeartHandshake, LayoutDashboard,
  Leaf, LogOut, Menu, Plus, Search, Settings, UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px_14px_14px_5px] bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(104,113,91,.22)]">
        <Leaf className="h-[19px] w-[19px]" strokeWidth={1.8} />
      </span>
      {!compact && <span className="font-headline text-[23px] tracking-[-.03em]">agenda<em className="font-normal text-accent">wise</em></span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const care = useCareMessage();
  const isCalendar = pathname.startsWith('/calendar');
  const activeItem = navItems.find(item => pathname.startsWith(item.href));

  return (
    <div className="min-h-screen">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/45 bg-white/55 px-[18px] py-6 backdrop-blur-xl transition-[width] duration-500 ease-out md:flex dark:bg-card/70',
        expanded ? 'w-[238px]' : 'w-[92px]'
      )}>
        <div className="flex h-12 items-center justify-between gap-3">
          <Brand compact={!expanded} />
          <button onClick={() => setExpanded(value => !value)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-white/45 text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-white hover:text-primary dark:bg-card" aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}>
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        <nav className="mt-11 space-y-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} title={!expanded ? item.label : undefined} className={cn(
                'relative flex h-[50px] items-center gap-3.5 overflow-hidden rounded-[14px] px-[17px] text-sm text-muted-foreground transition-all duration-300 hover:bg-primary/5 hover:text-primary',
                active && 'bg-primary/10 font-semibold text-primary'
              )}>
                {active && <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-accent" />}
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.7} />
                {expanded && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />
        <div className={cn('mb-4 flex min-h-16 items-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 to-white/35 p-3', !expanded && 'justify-center')}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-primary shadow-sm dark:bg-card"><HeartHandshake className="h-[18px] w-[18px]" /></span>
          {expanded && <div className="min-w-0"><strong className="block truncate text-xs">{care.reminderTitle}</strong><small className="block max-w-[145px] text-[10px] leading-tight text-muted-foreground">{care.reminderBody}</small></div>}
        </div>
        <Link href="/settings" className={cn('flex h-[50px] items-center gap-3.5 rounded-[14px] px-[17px] text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary', pathname.startsWith('/settings') && 'bg-primary/10 font-semibold text-primary')}>
          <Settings className="h-5 w-5 shrink-0" strokeWidth={1.7} />{expanded && <span>Preferências</span>}
        </Link>
        <div className="mt-2 flex items-center gap-2.5 overflow-hidden border-t border-border/50 px-1.5 pt-3">
          <Avatar className="h-10 w-10 shrink-0 border-2 border-white shadow-sm"><AvatarFallback className="bg-accent/15 text-xs font-semibold text-accent">AW</AvatarFallback></Avatar>
          {expanded && <div className="min-w-0 flex-1"><strong className="block truncate text-xs">AgendaWise</strong><small className="block truncate text-[10px] text-muted-foreground">Psicóloga clínica</small></div>}
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
            <button className="hidden h-10 w-56 items-center gap-2.5 rounded-xl border border-border/60 bg-white/45 px-3 text-left text-xs text-muted-foreground transition-all hover:bg-white/75 lg:flex dark:bg-card/60">
              <Search className="h-[17px] w-[17px]" /><span className="flex-1">Buscar paciente...</span><kbd className="rounded-md bg-primary/10 px-1.5 py-1 text-[9px]">⌘ K</kbd>
            </button>
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border/60 bg-white/45 text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-white hover:text-primary dark:bg-card/60" aria-label="Notificações">
              <Bell className="h-[18px] w-[18px]" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full border border-background bg-accent" />
            </button>
            <Button asChild className="hidden sm:inline-flex"><Link href="/calendar/new"><Plus className="h-4 w-4" />Nova sessão</Link></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="md:hidden"><Avatar className="h-10 w-10"><AvatarFallback className="bg-accent/15 text-xs text-accent">AW</AvatarFallback></Avatar></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuLabel>Minha conta</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/settings">Preferências</Link></DropdownMenuItem><DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>Sair</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main key={pathname} className={cn('page-enter', isCalendar ? 'h-[calc(100vh-86px)] overflow-hidden p-0' : 'p-4 pb-24 sm:p-7 lg:p-10')}>
          {children}
        </main>
      </div>

      <nav className="fixed bottom-3 left-3 right-3 z-40 flex h-[62px] items-center justify-around rounded-[18px] border border-white/75 bg-background/90 px-2 shadow-[0_14px_36px_rgba(65,60,50,.16)] backdrop-blur-xl md:hidden">
        {navItems.map(item => { const Icon = item.icon; const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)); return <Link key={item.href} href={item.href} className={cn('flex min-w-16 flex-col items-center gap-1 text-[9px] text-muted-foreground', active && 'text-primary')}><Icon className="h-[19px] w-[19px]" /><span>{item.label}</span></Link>; })}
        <Link href="/calendar/new" className="-translate-y-3 grid h-12 w-12 place-items-center rounded-[15px] bg-primary text-primary-foreground shadow-[0_9px_24px_rgba(104,113,91,.3)]" aria-label="Nova sessão"><Plus className="h-5 w-5" /></Link>
      </nav>
    </div>
  );
}

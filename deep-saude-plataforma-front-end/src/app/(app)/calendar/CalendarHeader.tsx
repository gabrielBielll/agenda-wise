
import React from 'react';
import { Button } from "@/components/ui/button";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CalendarHeaderProps {
  date: Date;
  setDate: (date: Date) => void;
  view: 'month' | 'week' | 'day';
  setView: (view: 'month' | 'week' | 'day') => void;
  onToday: () => void;
}

export function CalendarHeader({ date, setDate, view, setView, onToday }: CalendarHeaderProps) {
  
  const handlePrev = () => {
    const newDate = new Date(date);
    if (view === 'month') {
      newDate.setMonth(date.getMonth() - 1);
    } else if (view === 'week') {
      newDate.setDate(date.getDate() - 7);
    } else {
      newDate.setDate(date.getDate() - 1);
    }
    setDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(date);
    if (view === 'month') {
      newDate.setMonth(date.getMonth() + 1);
    } else if (view === 'week') {
      newDate.setDate(date.getDate() + 7);
    } else {
      newDate.setDate(date.getDate() + 1);
    }
    setDate(newDate);
  };

  const formatDateRange = () => {
    if (view === 'month') {
      return format(date, "MMMM 'de' yyyy", { locale: ptBR });
    } else if (view === 'day') {
      return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
    } else {
      // Week view logic
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay()); // Sunday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      
      // Check if same month
      if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
          return `${format(startOfWeek, 'd', { locale: ptBR })} a ${format(endOfWeek, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
      } else {
          return `${format(startOfWeek, "d 'de' MMM", { locale: ptBR })} a ${format(endOfWeek, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
      }
    }
  };

  return (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onToday}>
          Hoje
        </Button>
        <Button variant="outline" size="icon" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="ml-2 min-w-48 font-headline text-xl font-normal capitalize tracking-[-.02em] sm:text-2xl">
          {formatDateRange()}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <Select value={view} onValueChange={(v: any) => setView(v)}>
          <SelectTrigger className="w-[125px] bg-white/45">
            <SelectValue placeholder="Visualização" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="day">Dia</SelectItem>
          </SelectContent>
        </Select>
        <Button asChild className="lg:hidden"><Link href="/calendar?nova=1"><CalendarPlus />Nova sessão</Link></Button>
      </div>
    </div>
  );
}

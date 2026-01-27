
import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    if (view === 'month') {
      return date.toLocaleDateString('pt-BR', options);
    } else if (view === 'day') {
      return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    } else {
      // Week view logic
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay()); // Sunday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      
      const startStr = startOfWeek.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
      const endStr = endOfWeek.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0 pb-4">
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="icon" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onToday}>
          Hoje
        </Button>
        <Button variant="outline" size="icon" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="font-headline text-lg sm:text-xl font-semibold capitalize ml-2 w-48 text-center sm:text-left">
          {formatDateRange()}
        </h2>
      </div>

      <div className="flex items-center space-x-2">
        <Select value={view} onValueChange={(v: any) => setView(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Visualização" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="day">Dia</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

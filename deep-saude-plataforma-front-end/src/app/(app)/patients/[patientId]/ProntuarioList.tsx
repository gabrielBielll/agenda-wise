"use client";

import React, { useState, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Search, Calendar as CalendarIcon, FileText } from "lucide-react";
import ProntuarioItem, { Prontuario } from './ProntuarioItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

interface ProntuarioListProps {
  initialProntuarios: Prontuario[];
  patientId: string;
  appointments: any[];
}

export default function ProntuarioList({ initialProntuarios, patientId, appointments }: ProntuarioListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [date, setDate] = useState<DateRange | undefined>();

  const filteredProntuarios = useMemo(() => {
    return initialProntuarios.filter((p) => {
      // Determine the date string displayed to the user and the actual date object for comparison
      const rawDate = p.data_sessao ? new Date(p.data_sessao) : new Date(p.data_registro);
      const displayDate = rawDate.toLocaleString('pt-BR');
      
      const lowerTerm = searchTerm.toLowerCase();
      const contentMatch = p.conteudo.toLowerCase().includes(lowerTerm);
      const typeMatch = p.tipo.toLowerCase().includes(lowerTerm);
      const dateMatch = displayDate.toLowerCase().includes(lowerTerm);
      
      const matchesSearch = !searchTerm || contentMatch || typeMatch || dateMatch;
      
      let matchesDateRange = true;
      if (date?.from) {
        const itemDate = startOfDay(rawDate);
        const fromDate = startOfDay(date.from);
        const toDate = date.to ? endOfDay(date.to) : endOfDay(date.from);
        
        matchesDateRange = isWithinInterval(rawDate, { start: fromDate, end: toDate });
      }

      return matchesSearch && matchesDateRange;
    });
  }, [initialProntuarios, searchTerm, date]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por data, tipo ou conteúdo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex-none">
            <Popover>
            <PopoverTrigger asChild>
                <Button
                id="date"
                variant={"outline"}
                className={cn(
                    "w-full sm:w-[260px] justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                )}
                >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                    date.to ? (
                    <>
                        {format(date.from, "dd/MM/y", { locale: ptBR })} -{" "}
                        {format(date.to, "dd/MM/y", { locale: ptBR })}
                    </>
                    ) : (
                    format(date.from, "dd/MM/y", { locale: ptBR })
                    )
                ) : (
                    <span>Filtrar por data</span>
                )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
                locale={ptBR}
                />
            </PopoverContent>
            </Popover>
        </div>
      </div>

      <ScrollArea className="h-[500px] pr-4">
        {filteredProntuarios.length > 0 ? (
          <div className="space-y-4">
            {filteredProntuarios.map((p) => (
              <ProntuarioItem 
                key={p.id} 
                data={p} 
                patientId={patientId} 
                appointments={appointments} 
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p>
              {searchTerm || date
                ? "Nenhum registro encontrado para os filtros selecionados." 
                : "Nenhum registro encontrado no prontuário."}
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

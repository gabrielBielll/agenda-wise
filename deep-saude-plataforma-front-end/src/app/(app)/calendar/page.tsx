'use client';

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, ExternalLink } from "lucide-react";
import React, { useState } from 'react';

export default function CalendarPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isSynced, setIsSynced] = useState(false); // Mock sync state

  const handleSyncGoogleCalendar = () => {
    // Placeholder for Google Calendar OAuth flow
    setIsSynced(true); 
    // In a real app, show a toast or confirmation
    alert("Sincronização com Google Agenda iniciada (simulado).");
  };
  
  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-headline text-3xl">Meu Calendário</CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Gerencie seus agendamentos e sincronize com o Google Agenda.
              </CardDescription>
            </div>
            <Button className="mt-4 sm:mt-0">
              <PlusCircle className="mr-2 h-5 w-5" /> Novo Agendamento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!isSynced && (
            <div className="mb-6 p-4 bg-accent/20 border border-accent rounded-lg text-center">
              <p className="text-accent-foreground mb-2">Seu Google Agenda ainda não está sincronizado.</p>
              <Button onClick={handleSyncGoogleCalendar} variant="default">
                <ExternalLink className="mr-2 h-4 w-4" /> Sincronizar com Google Agenda
              </Button>
            </div>
          )}
          {isSynced && (
             <div className="mb-6 p-4 bg-green-100 border border-green-600 text-green-700 rounded-lg text-center">
              <p>Sincronizado com sucesso com o Google Agenda (simulado).</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border shadow-md bg-card p-0"
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 p-4",
                  month: "space-y-4 w-full",
                  caption_label: "font-headline text-xl",
                  day: "h-10 w-10 rounded-md hover:bg-secondary",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground rounded-md",
                }}
              />
            </div>
            <div className="md:col-span-1 space-y-4">
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="font-headline text-xl">
                    Agendamentos para {date ? date.toLocaleDateString('pt-BR') : 'data selecionada'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Placeholder for appointments list */}
                  <ul className="space-y-2">
                    <li className="p-3 bg-secondary/50 rounded-md">10:00 - João Ninguém</li>
                    <li className="p-3 bg-secondary/50 rounded-md">14:30 - Joana Silva</li>
                    <li classNamep-3 text-muted-foreground>Não há mais agendamentos para hoje.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

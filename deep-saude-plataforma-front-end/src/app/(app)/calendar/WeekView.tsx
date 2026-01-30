
import React from 'react';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Appointment {
  id: string;
  data_hora_sessao: string;
  duracao?: number;
  nome_paciente: string;
  paciente_id?: string;
  valor_consulta?: number;
  status?: string;
}

interface Bloqueio {
  id: string;
  data_inicio: string;
  data_fim: string;
  motivo?: string;
  dia_inteiro?: boolean;
  recorrencia_id?: string;
}

interface WeekViewProps {
  date: Date;
  appointments: Appointment[];
  bloqueios?: Bloqueio[];
  onAddAppointment: (date: Date, event?: React.MouseEvent, isBlocked?: boolean, bloqueioId?: string) => void;
  onEditAppointment: (appointment: Appointment) => void;
  onDeleteBloqueio?: (id: string, recorrencia_id?: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

export function WeekView({ date, appointments, bloqueios = [], onAddAppointment, onEditAppointment, onDeleteBloqueio }: WeekViewProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
         // Use setTimeout to ensure the DOM is fully rendered before scrolling
         setTimeout(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 6 * 80; 
            }
         }, 100);
    }
  }, []);
  
  // Get days of the current week (Sunday to Saturday)
  const getDaysOfWeek = () => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      return day;
    });
  };

  const days = getDaysOfWeek();

  const getAppointmentsForDayAndHour = (day: Date, hour: number) => {
    return appointments.filter(app => {
      const appDate = new Date(app.data_hora_sessao);
      return appDate.getDate() === day.getDate() && 
             appDate.getMonth() === day.getMonth() && 
             appDate.getFullYear() === day.getFullYear() &&
             appDate.getHours() === hour;
    });
  };

  const getBloqueiosForDayAndHour = (day: Date, hour: number) => {
    return bloqueios.filter(block => {
      const inicio = new Date(block.data_inicio);
      const fim = new Date(block.data_fim);
      const slotStart = new Date(day);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(day);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      
      // Check if block overlaps with this hour slot
      return inicio < slotEnd && fim > slotStart;
    });
  };

  const handleSlotClick = (day: Date, hour: number, event: React.MouseEvent) => {
    const newDate = new Date(day);
    newDate.setHours(hour, 0, 0, 0);
    
    // Check if this slot is blocked
    const hourBloqueios = getBloqueiosForDayAndHour(day, hour);
    const isBlocked = hourBloqueios.length > 0;
    const bloqueioId = isBlocked ? hourBloqueios[0].id : undefined;
    
    onAddAppointment(newDate, event, isBlocked, bloqueioId);
  };

  return (
    <div className="flex flex-col border rounded-md bg-background overflow-hidden h-full">
      {/* Header Row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] divide-x border-b sticky top-0 bg-background z-20">
        <div className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30">
          Hora
        </div>
        {days.map((day, index) => {
            const isToday = day.toDateString() === new Date().toDateString();
            return (
                <div key={index} className={cn("p-2 text-center text-sm font-medium", isToday && "bg-accent/20")}>
                    <div className={cn("text-xs uppercase text-muted-foreground", isToday && "text-primary font-bold")}>
                        {format(day, 'EEE', { locale: ptBR })}
                    </div>
                    <div className={cn("text-lg", isToday && "text-primary font-bold")}>
                        {day.getDate()}
                    </div>
                </div>
            );
        })}
      </div>

      {/* Grid */}
      <div ref={scrollContainerRef} className="grid grid-cols-[60px_repeat(7,1fr)] divide-x overflow-y-auto flex-1">
        {/* Time Column */}
        <div className="divide-y bg-muted/30">
          {HOURS.map(hour => (
            <div key={hour} className="h-20 flex items-start justify-center pt-2 text-xs text-muted-foreground font-medium sticky left-0">
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Days Columns */}
        {days.map((day, dayIndex) => (
          <div key={dayIndex} className="divide-y relative min-w-[120px]">
            {HOURS.map(hour => {
              const hourAppointments = getAppointmentsForDayAndHour(day, hour);
              const hourBloqueios = getBloqueiosForDayAndHour(day, hour);
              const isBlocked = hourBloqueios.length > 0;
              
              return (
                <div 
                  key={hour} 
                  className={cn(
                    "h-20 relative group transition-colors cursor-pointer border-b",
                    isBlocked ? "bg-orange-100/50 dark:bg-orange-900/20" : "hover:bg-accent/5"
                  )}
                  onClick={(e) => handleSlotClick(day, hour, e)}
                >
                  {/* Render Bloqueios */}
                  {hourBloqueios.map(block => {
                    const inicio = new Date(block.data_inicio);
                    const fim = new Date(block.data_fim);
                    const slotStart = new Date(day);
                    slotStart.setHours(hour, 0, 0, 0);
                    const slotEnd = new Date(day);
                    slotEnd.setHours(hour + 1, 0, 0, 0);
                    
                    // Clamping logic to render correctly in this hour slot
                    const effectiveStart = Math.max(inicio.getTime(), slotStart.getTime());
                    const effectiveEnd = Math.min(fim.getTime(), slotEnd.getTime());
                    
                    const topMinutes = (effectiveStart - slotStart.getTime()) / 60000;
                    const topPos = (topMinutes / 60) * 100;
                    
                    const durationMinutes = (effectiveEnd - effectiveStart) / 60000;
                    const height = (durationMinutes / 60) * 100;

                    // Only render if there is actual overlap duration (avoid 0 height or negative)
                    if (durationMinutes <= 0) return null;
                    
                    return (
                      <div
                        key={block.id}
                        className="absolute left-0 right-0 bg-orange-200/80 dark:bg-orange-800/60 border-l-4 border-orange-500 p-1 text-[10px] z-10 overflow-hidden flex items-center gap-1"
                        style={{ top: `${topPos}%`, height: `${height}%`, minHeight: '0px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteBloqueio) {
                            onDeleteBloqueio(block.id, block.recorrencia_id);
                          }
                        }}
                        title={block.motivo || 'Horário bloqueado'}
                      >
                        <span className="font-semibold">🔒</span>
                        <span className="truncate text-orange-800 dark:text-orange-200">
                          {block.motivo || 'Bloqueado'}
                        </span>
                      </div>
                    );
                  })}

                  {/* Render Appointments */}
                  {hourAppointments.map(app => {
                      const appDate = new Date(app.data_hora_sessao);
                      const minutes = appDate.getMinutes();
                      const topPos = (minutes / 60) * 100; // Percentage from top
                      const duration = app.duracao || 50;
                      const height = (duration / 60) * 100;
                      
                      return (
                          <div
                              key={app.id}
                              className={cn(
                                "absolute left-1 right-1 rounded-md p-1 text-[10px] transition-colors cursor-pointer z-10 overflow-hidden border-l-4",
                                app.status === 'cancelado' 
                                  ? "bg-red-100 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/30 opacity-80"
                                  : "bg-primary/10 border-primary text-foreground hover:bg-primary/20"
                              )}
                              style={{ top: `${topPos}%`, height: `${height}%`, minHeight: '20px' }}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  onEditAppointment(app);
                              }}
                              title={`${app.nome_paciente} - ${String(appDate.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`}
                          >
                              <span className="font-semibold block">
                                {String(appDate.getHours()).padStart(2, '0')}:{String(minutes).padStart(2, '0')} - {
                                  (() => {
                                    const end = new Date(appDate.getTime() + duration * 60000);
                                    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
                                  })()
                                }
                              </span>
                              <span className={cn("truncate block font-medium", app.status === 'cancelado' ? "line-through opacity-70" : "text-foreground/90")}>
                                  {app.nome_paciente}
                              </span>
                          </div>
                      );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

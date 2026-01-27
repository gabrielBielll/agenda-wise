
import React from 'react';
import { cn } from "@/lib/utils";

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
}

interface WeekViewProps {
  date: Date;
  appointments: Appointment[];
  bloqueios?: Bloqueio[];
  onAddAppointment: (date: Date, event?: React.MouseEvent) => void;
  onEditAppointment: (appointment: Appointment) => void;
  onDeleteBloqueio?: (id: string) => void;
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
      return inicio < slotEnd && fim > slotStart &&
             inicio.getDate() === day.getDate() &&
             inicio.getMonth() === day.getMonth() &&
             inicio.getFullYear() === day.getFullYear();
    });
  };

  const handleSlotClick = (day: Date, hour: number, event: React.MouseEvent) => {
    const newDate = new Date(day);
    newDate.setHours(hour, 0, 0, 0);
    onAddAppointment(newDate, event);
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
                        {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
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
                    
                    const topMinutes = Math.max(0, (inicio.getTime() - slotStart.getTime()) / 60000);
                    const topPos = (topMinutes / 60) * 100;
                    
                    const durationMinutes = (fim.getTime() - inicio.getTime()) / 60000;
                    const height = Math.min(100 - topPos, (durationMinutes / 60) * 100);
                    
                    return (
                      <div
                        key={block.id}
                        className="absolute left-0 right-0 bg-orange-200/80 dark:bg-orange-800/60 border-l-4 border-orange-500 p-1 text-[10px] z-10 overflow-hidden flex items-center gap-1"
                        style={{ top: `${topPos}%`, height: `${height}%`, minHeight: '20px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteBloqueio && confirm('Remover este bloqueio?')) {
                            onDeleteBloqueio(block.id);
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
                              className="absolute left-1 right-1 rounded-md bg-primary/10 border-l-4 border-primary p-1 text-[10px] hover:bg-primary/20 transition-colors cursor-pointer z-10 overflow-hidden"
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
                              <span className="truncate block font-medium text-foreground/90">
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

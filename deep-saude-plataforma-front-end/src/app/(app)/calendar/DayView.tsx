
import React from 'react';
import { cn } from "@/lib/utils";

interface Appointment {
  id: string;
  data_hora_sessao: string;
  duracao?: number;
  nome_paciente: string;
  paciente_id?: string;
  valor_consulta?: number;
}

interface Bloqueio {
  id: string;
  data_inicio: string;
  data_fim: string;
  motivo?: string;
  dia_inteiro?: boolean;
}

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  bloqueios?: Bloqueio[];
  onAddAppointment: (date: Date, event?: React.MouseEvent) => void;
  onEditAppointment: (appointment: Appointment) => void;
  onDeleteBloqueio?: (id: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

export function DayView({ date, appointments, bloqueios = [], onAddAppointment, onEditAppointment, onDeleteBloqueio }: DayViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
        // Use setTimeout to ensure the DOM is fully rendered before scrolling
        setTimeout(() => {
            // Each hour is h-20 (80px)
            const hourHeight = 80;
            if (containerRef.current) {
                containerRef.current.scrollTop = hourHeight * 6; // Scroll to 6 AM
            }
        }, 100);
    }
  }, []);
  
  const getAppointmentsForHour = (hour: number) => {
    return appointments.filter(app => {
      const appDate = new Date(app.data_hora_sessao);
      return appDate.getDate() === date.getDate() && 
             appDate.getMonth() === date.getMonth() && 
             appDate.getFullYear() === date.getFullYear() &&
             appDate.getHours() === hour;
    });
  };

  const getBloqueiosForHour = (hour: number) => {
    return bloqueios.filter(block => {
      const inicio = new Date(block.data_inicio);
      const fim = new Date(block.data_fim);
      const slotStart = new Date(date);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      
      // Check if block overlaps with this hour slot
      return inicio < slotEnd && fim > slotStart &&
             inicio.getDate() === date.getDate() &&
             inicio.getMonth() === date.getMonth() &&
             inicio.getFullYear() === date.getFullYear();
    });
  };

  const handleSlotClick = (hour: number, event: React.MouseEvent) => {
    const newDate = new Date(date);
    newDate.setHours(hour, 0, 0, 0);
    onAddAppointment(newDate, event);
  };

  return (

    <div ref={containerRef} className="flex flex-col border rounded-md bg-background overflow-y-auto h-full scroll-smooth">
      <div className="grid grid-cols-[60px_1fr] divide-x">
        {/* Time Column */}
        <div className="divide-y bg-muted/30">
          {HOURS.map(hour => (
            <div key={hour} className="h-20 flex items-start justify-center pt-2 text-xs text-muted-foreground font-medium">
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Events Column */}
        <div className="divide-y relative">
          {HOURS.map(hour => {
            const hourAppointments = getAppointmentsForHour(hour);
            const hourBloqueios = getBloqueiosForHour(hour);
            const isBlocked = hourBloqueios.length > 0;
            
            return (
              <div 
                key={hour} 
                className={cn(
                  "h-20 relative group transition-colors cursor-pointer",
                  isBlocked ? "bg-orange-100/50 dark:bg-orange-900/20" : "hover:bg-accent/5"
                )}
                onClick={(e) => handleSlotClick(hour, e)}
              >
                {/* Render Bloqueios */}
                {hourBloqueios.map(block => {
                  const inicio = new Date(block.data_inicio);
                  const fim = new Date(block.data_fim);
                  const slotStart = new Date(date);
                  slotStart.setHours(hour, 0, 0, 0);
                  
                  const topMinutes = Math.max(0, (inicio.getTime() - slotStart.getTime()) / 60000);
                  const topPos = (topMinutes / 60) * 100;
                  
                  const durationMinutes = (fim.getTime() - inicio.getTime()) / 60000;
                  const height = Math.min(100 - topPos, (durationMinutes / 60) * 100);
                  
                  return (
                    <div
                      key={block.id}
                      className="absolute left-0 right-0 bg-orange-200/80 dark:bg-orange-800/60 border-l-4 border-orange-500 p-2 text-xs z-10 overflow-hidden flex items-center gap-2"
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
                            className="absolute left-2 right-2 rounded-md bg-primary/10 border-l-4 border-primary p-1 text-xs hover:bg-primary/20 transition-colors cursor-pointer z-10"
                            style={{ top: `${topPos}%`, height: `${height}%`, minHeight: '20px' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditAppointment(app);
                            }}
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
      </div>
    </div>
  );
}

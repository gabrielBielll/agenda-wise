
import React from 'react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Appointment {
  id: string;
  data_hora_sessao: string;
  duracao?: number;
  nome_paciente: string;
  paciente_id?: string;
  valor_consulta?: number;
}

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  onAddAppointment: (date: Date) => void;
  onEditAppointment: (appointment: Appointment) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

export function DayView({ date, appointments, onAddAppointment, onEditAppointment }: DayViewProps) {
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

  const handleSlotClick = (hour: number) => {
    const newDate = new Date(date);
    newDate.setHours(hour, 0, 0, 0);
    onAddAppointment(newDate);
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
            return (
              <div 
                key={hour} 
                className="h-20 relative group hover:bg-accent/5 transition-colors cursor-pointer"
                onClick={() => handleSlotClick(hour)}
              >
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

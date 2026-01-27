
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

interface WeekViewProps {
  date: Date;
  appointments: Appointment[];
  onAddAppointment: (date: Date) => void;
  onEditAppointment: (appointment: Appointment) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

export function WeekView({ date, appointments, onAddAppointment, onEditAppointment }: WeekViewProps) {
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

  const handleSlotClick = (day: Date, hour: number) => {
    const newDate = new Date(day);
    newDate.setHours(hour, 0, 0, 0);
    onAddAppointment(newDate);
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
              return (
                <div 
                  key={hour} 
                  className="h-20 relative group hover:bg-accent/5 transition-colors cursor-pointer border-b"
                  onClick={() => handleSlotClick(day, hour)}
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


import React from 'react';
import { cn } from "@/lib/utils";
import { paredeDaClinica } from "@/lib/datetime";
import { appointmentStatusAppearance } from "@/lib/appointment-status";
import { janelaAparencia, normalizarTipoJanela } from "@/lib/janela-agenda";
import type { CoresEscolhidas } from "@/lib/cores-agenda";

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
  /** `bloqueio` (proíbe) ou `disponivel` (oferece) — D-024. Ausente = bloqueio. */
  tipo?: string;
}

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  bloqueios?: Bloqueio[];
  onAddAppointment: (date: Date, event?: React.MouseEvent, isBlocked?: boolean, bloqueioId?: string) => void;
  onEditAppointment: (appointment: Appointment) => void;
  /**
   * Clicar numa janela abre a EDIÇÃO dela, não a remoção.
   *
   * 🔴 Mudou em 21/08 a pedido do Gabriel: *"tem que permitir editar horário
   * liberado"*. Antes o clique ia direto para "tem certeza que deseja remover?",
   * então corrigir uma hora errada obrigava a apagar e refazer — e refazer perde
   * a recorrência. O "Remover" continua existindo, agora dentro do diálogo.
   */
  onEditBloqueio?: (block: Bloqueio) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

export function DayView({ date, appointments, bloqueios = [], onAddAppointment, onEditAppointment, onEditBloqueio, cores }: DayViewProps & { cores?: CoresEscolhidas }) {
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
      const appDate = paredeDaClinica(app.data_hora_sessao);
      return appDate.getDate() === date.getDate() && 
             appDate.getMonth() === date.getMonth() && 
             appDate.getFullYear() === date.getFullYear() &&
             appDate.getHours() === hour;
    });
  };

  const getBloqueiosForHour = (hour: number) => {
    return bloqueios.filter(block => {
      const inicio = paredeDaClinica(block.data_inicio);
      const fim = paredeDaClinica(block.data_fim);
      const slotStart = new Date(date);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      
      // Check if block overlaps with this hour slot
      return inicio < slotEnd && fim > slotStart;
    });
  };

  /**
   * 🔴 Só as janelas que PROÍBEM, e é isto que separa os dois sinais na tela.
   *
   * `getBloqueiosForHour` devolve as duas (D-024): as duas são desenhadas. Mas
   * quem decide se o clique agenda ou oferece remover a janela é só o bloqueio.
   * Usar a lista inteira aqui faria clicar num horário OFERECIDO abrir o menu de
   * apagar em vez de marcar a sessão — o oposto exato do que ele significa, e o
   * mesmo erro que o filtro `tipo = 'bloqueio'` evita no backend.
   */
  const getBloqueiosQueProibem = (hour: number) =>
    getBloqueiosForHour(hour).filter(b => normalizarTipoJanela(b.tipo) === 'bloqueio');

  const handleSlotClick = (hour: number, event: React.MouseEvent) => {
    const newDate = new Date(date);
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top));
    const minute = Math.min(45, Math.floor((relativeY / bounds.height) * 4) * 15);
    newDate.setHours(hour, minute, 0, 0);
    
    // Check if this slot is blocked
    const hourBloqueios = getBloqueiosQueProibem(hour);
    const isBlocked = hourBloqueios.length > 0;
    const bloqueioId = isBlocked ? hourBloqueios[0].id : undefined;

    onAddAppointment(newDate, isBlocked ? event : undefined, isBlocked, bloqueioId);
  };

  const handleSlotMenu = (hour: number, event: React.MouseEvent) => {
    event.preventDefault();
    const newDate = new Date(date);
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top));
    const minute = Math.min(45, Math.floor((relativeY / bounds.height) * 4) * 15);
    newDate.setHours(hour, minute, 0, 0);
    const hourBloqueios = getBloqueiosQueProibem(hour);
    onAddAppointment(newDate, event, hourBloqueios.length > 0, hourBloqueios[0]?.id);
  };

  return (

    <div ref={containerRef} className="flex h-full flex-col overflow-y-auto scroll-smooth rounded-[20px] border border-border/70 bg-card/70 shadow-[var(--quiet-shadow-soft)] backdrop-blur-md">
      <div className="grid grid-cols-[60px_1fr] divide-x divide-border/35">
        {/* Time Column */}
        <div className="divide-y divide-border/35 bg-muted/15">
          {HOURS.map(hour => (
            <div key={hour} className="h-20 flex items-start justify-center pt-2 text-xs text-muted-foreground font-medium">
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Events Column */}
        <div className="relative divide-y divide-border/35">
          {HOURS.map(hour => {
            const hourAppointments = getAppointmentsForHour(hour);
            const hourBloqueios = getBloqueiosForHour(hour);
            const isBlocked = getBloqueiosQueProibem(hour).length > 0;
            // A lavagem de fundo mostra a janela dominante: proibição ganha de
            // oferta quando as duas se sobrepõem, porque a proibição é a que
            // muda o que a psicóloga PODE fazer com aquele horário.
            const janelaDaCelula = isBlocked
              ? janelaAparencia('bloqueio')
              : hourBloqueios.length > 0
                ? janelaAparencia(hourBloqueios[0].tipo)
                : null;

            return (
              <div
                key={hour}
                className={cn(
                  "calendar-hour-slot h-20 relative group transition-colors cursor-pointer",
                  janelaDaCelula ? janelaDaCelula.celulaClassName : "hover:bg-accent/5"
                )}
                onClick={(e) => handleSlotClick(hour, e)}
                onContextMenu={(e) => handleSlotMenu(hour, e)}
                title={janelaDaCelula ? janelaDaCelula.label : "Clique para agendar no quarto de hora desejado"}
                aria-label={`${janelaDaCelula ? janelaDaCelula.label : 'Agendar'} às ${String(hour).padStart(2, '0')}:00`}
                data-slot-hour={hour}
              >
                {/* Render Bloqueios */}
                {hourBloqueios.map(block => {
                  const inicio = paredeDaClinica(block.data_inicio);
                  const fim = paredeDaClinica(block.data_fim);
                  const slotStart = new Date(date);
                  slotStart.setHours(hour, 0, 0, 0);
                  const slotEnd = new Date(date);
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
                  
                  const janela = janelaAparencia(block.tipo);

                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "absolute left-2 right-2 rounded-md p-1.5 text-xs z-10 overflow-hidden flex items-center gap-2",
                        janela.blocoClassName
                      )}
                      style={{ top: `${topPos}%`, height: `${height}%`, minHeight: '0px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEditBloqueio) {
                          onEditBloqueio(block);
                        }
                      }}
                      title={block.motivo || janela.label}
                    >
                      {/* 🔴 O glifo é `aria-hidden` e o estado vai no `sr-only` ao
                          lado. Sem esse par, quem usa leitor de tela ouve só o
                          motivo — e "reunião de equipe" não diz se o horário está
                          fechado ou oferecido. É o achado que a `orla` deixou
                          aberto sobre a grade de sessões; aqui ele não nasce. */}
                      <janela.Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="sr-only">{janela.label}: </span>
                      <span className={cn("truncate", janela.textoClassName)}>
                        {block.motivo || janela.rotuloPadrao}
                      </span>
                    </div>
                  );
                })}

                {/* Render Appointments */}
                {hourAppointments.map(app => {
                    const appearance = appointmentStatusAppearance(app.status, cores, { inicio: app.data_hora_sessao, duracao: app.duracao });
                    const appDate = paredeDaClinica(app.data_hora_sessao);
                    const minutes = appDate.getMinutes();
                    const topPos = (minutes / 60) * 100; // Percentage from top
                    const duration = app.duracao || 50;
                    const height = (duration / 60) * 100;

                    return (
                        <div
                            key={app.id}
                            className={cn(
                              "absolute left-2 right-2 rounded-md p-1 text-xs transition-colors cursor-pointer z-10 border-l-4",
                              appearance.eventClassName
                            )}
                            style={{ top: `${topPos}%`, height: `${height}%`, minHeight: '20px' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditAppointment(app);
                            }}
                        >
                            {/* 🔴 O glifo fica na linha do NOME, e não na do horário, e isso
                                não é estética: `e2e/apoio.ts` lê `span.font-semibold` e exige
                                que o texto seja **só** `HH:MM - HH:MM`. Pôr o glifo lá dentro
                                sujou esse texto e derrubou três testes de fuso em 20/08 — o
                                teste estava certo, a minha implementação e que estava. O
                                horário e um dado que outra coisa le; nao e lugar de enfeite. */}
                            <span className="font-semibold block">
                                {String(appDate.getHours()).padStart(2, '0')}:{String(minutes).padStart(2, '0')} - {
                                  (() => {
                                    const end = new Date(appDate.getTime() + duration * 60000);
                                    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
                                  })()
                                }
                            </span>
                            <span className={cn("truncate block font-medium", app.status === 'cancelado' && "line-through opacity-70")}>
                                {appearance.glyph && (
                                /**
                                 * 🔴 O glifo é MAIOR que o nome, de propósito.
                                 *
                                 * O Gabriel olhou a grade e disse: *"aumenta os
                                 * glifos de tamanho pq eles estão muito
                                 * imperceptíveis"*. Estavam mesmo — saíam no
                                 * mesmo tamanho do texto ao lado, e um `■` de
                                 * 12px encostado num nome próprio desaparece.
                                 *
                                 * ⚠️ E isto não é preferência: medido na §13, das
                                 * 462 formas de escolher 5 cores entre as 11,
                                 * NENHUMA deixa os estados distinguíveis por
                                 * luminância. O glifo é o único canal que separa
                                 * os estados — se ele não é visto, o estado não
                                 * é lido, e some justamente para quem já não lia
                                 * a cor.
                                 *
                                 * 📌 `leading-none` e `align-middle` para o
                                 * tamanho maior não empurrar a linha do chip,
                                 * que tem altura fixa por hora.
                                 */
                                <span
                                  aria-hidden="true"
                                  className="mr-1 inline-block align-middle text-[1.15em] font-bold leading-none"
                                >
                                  {appearance.glyph}
                                </span>
                              )}
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

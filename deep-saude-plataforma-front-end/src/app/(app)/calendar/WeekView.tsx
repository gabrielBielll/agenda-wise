
import React from 'react';
import { cn } from "@/lib/utils";
import { paredeDaClinica, agoraNaClinica } from "@/lib/datetime";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

interface WeekViewProps {
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

// Datas vêm de @/lib/datetime. Antes havia aqui um `parseAsLocal` que removia o
// sufixo de fuso na mão, para contornar a coluna TIMESTAMP sem fuso do banco.
// A coluna agora é TIMESTAMPTZ e a API devolve instante de verdade — remover o
// fuso passou a ser justamente o que produz o deslocamento.
//
// Desde 2026-08-15 a grade inteira trabalha em horário de parede da CLÍNICA:
// `paredeDaClinica` devolve um Date cujos getters locais já são o relógio da
// clínica, então todo o `setHours`/`getDate`/`toDateString` daqui continua
// valendo sem mudar de forma. Com o navegador em São Paulo o valor é idêntico ao
// de antes; fora dele, deixa de deslocar. Ver o cabeçalho de lib/datetime.ts.

/**
 * 🔴 Uma constante, e não duas strings iguais.
 *
 * O cabeçalho e o corpo PRECISAM ter trilhos idênticos: se divergirem, os dias
 * do topo param de corresponder às colunas de baixo — e foi exatamente assim que
 * o defeito de 21/08 nasceu, com `1fr` no cabeçalho e `min-w-[120px]` no corpo.
 * Escrever a definição duas vezes é convidar a divergência de volta.
 */
const TRILHOS = "grid-cols-[54px_repeat(7,minmax(120px,1fr))]";

export function WeekView({ date, appointments, bloqueios = [], onAddAppointment, onEditAppointment, onEditBloqueio, cores }: WeekViewProps & { cores?: CoresEscolhidas }) {
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
      const appDate = paredeDaClinica(app.data_hora_sessao);
      const duration = app.duracao || 50;
      const endDate = new Date(appDate.getTime() + duration * 60000);

      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);

      // Skip appointments that end before this day starts
      if (endDate <= dayStart) return false;

      // Render the card once per day, in the first hour slot it appears:
      // - same-day appointments: their actual start hour
      // - cross-day continuations: hour 0 (midnight) of the continuation day
      const isSameDay = appDate.toDateString() === day.toDateString();
      const firstHourOnDay = isSameDay ? appDate.getHours() : 0;

      const slotEnd = new Date(day);
      slotEnd.setHours(hour + 1, 0, 0, 0);

      return hour === firstHourOnDay && appDate < slotEnd;
    });
  };

  const getBloqueiosForDayAndHour = (day: Date, hour: number) => {
    return bloqueios.filter(block => {
      const inicio = paredeDaClinica(block.data_inicio);
      const fim = paredeDaClinica(block.data_fim);
      const slotStart = new Date(day);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(day);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      
      // Check if block overlaps with this hour slot
      return inicio < slotEnd && fim > slotStart;
    });
  };

  /**
   * 🔴 Só as janelas que PROÍBEM — irmã da `getBloqueiosQueProibem` do DayView.
   *
   * As duas grades precisam da mesma distinção, e já houve defeito neste projeto
   * que existia numa e não na outra. Clicar num horário OFERECIDO tem de marcar
   * sessão, não abrir o menu de apagar a janela.
   */
  const getBloqueiosQueProibem = (day: Date, hour: number) =>
    getBloqueiosForDayAndHour(day, hour).filter(b => normalizarTipoJanela(b.tipo) === 'bloqueio');

  const handleSlotClick = (day: Date, hour: number, event: React.MouseEvent) => {
    const newDate = new Date(day);
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top));
    const minute = Math.min(45, Math.floor((relativeY / bounds.height) * 4) * 15);
    newDate.setHours(hour, minute, 0, 0);
    
    // Check if this slot is blocked
    const hourBloqueios = getBloqueiosQueProibem(day, hour);
    const isBlocked = hourBloqueios.length > 0;
    const bloqueioId = isBlocked ? hourBloqueios[0].id : undefined;
    
    // Clique principal cria direto. O menu continua disponível no clique com o
    // botão direito e é o caminho para bloqueio/remoção de bloqueio.
    onAddAppointment(newDate, isBlocked ? event : undefined, isBlocked, bloqueioId);
  };

  const handleSlotMenu = (day: Date, hour: number, event: React.MouseEvent) => {
    event.preventDefault();
    const newDate = new Date(day);
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top));
    const minute = Math.min(45, Math.floor((relativeY / bounds.height) * 4) * 15);
    newDate.setHours(hour, minute, 0, 0);
    const hourBloqueios = getBloqueiosQueProibem(day, hour);
    onAddAppointment(newDate, event, hourBloqueios.length > 0, hourBloqueios[0]?.id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/70 shadow-[var(--quiet-shadow-soft)] backdrop-blur-md">
      {/*
        🔴 UM rolador só, para o cabeçalho e o corpo, e os DOIS com a mesma
        definição de trilhos.

        Antes eram duas grades independentes: o cabeçalho com `repeat(7,1fr)`
        (que encolhe até caber na tela) e o corpo com `min-w-[120px]` por dia
        (que exige 894px). Em qualquer tela menor que isso — todo telefone — o
        corpo transbordava e rolava SOZINHO, com o cabeçalho parado.

        ⚠️ O efeito não era cosmético: os dias do topo deixavam de corresponder às
        colunas de baixo. Uma sessão de hoje aparecia debaixo do rótulo de outro
        dia, e não havia como perceber olhando — a tela mostrava um dia e
        significava outro.
      */}
      <div className="flex-1 overflow-auto">
      {/* Header Row */}
      <div className={"sticky top-0 z-20 grid " + TRILHOS + " divide-x divide-border/40 border-b border-border/40 bg-card/90 backdrop-blur-xl"}>
        <div className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30">
          GMT−3
        </div>
        {days.map((day, index) => {
            const isToday = day.toDateString() === agoraNaClinica().toDateString();
            return (
                <div key={index} className={cn("p-2 text-center text-sm font-medium", isToday && "bg-accent/10")}>
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

      {/* Grid — MESMOS trilhos do cabeçalho, e sem rolador próprio. */}
      <div ref={scrollContainerRef} className={"grid " + TRILHOS + " divide-x divide-border/35"}>
        {/* Time Column */}
        <div className="divide-y divide-border/35 bg-muted/15">
          {HOURS.map(hour => (
            <div key={hour} className="h-20 flex items-start justify-center pt-2 text-xs text-muted-foreground font-medium sticky left-0">
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Days Columns */}
        {days.map((day, dayIndex) => (
          <div key={dayIndex} className="relative divide-y divide-border/35">
            {HOURS.map(hour => {
              const hourAppointments = getAppointmentsForDayAndHour(day, hour);
              const hourBloqueios = getBloqueiosForDayAndHour(day, hour);
              const isBlocked = getBloqueiosQueProibem(day, hour).length > 0;
              // Proibição ganha de oferta quando as duas se sobrepõem: é ela que
              // muda o que a psicóloga PODE fazer com o horário.
              const janelaDaCelula = isBlocked
                ? janelaAparencia('bloqueio')
                : hourBloqueios.length > 0
                  ? janelaAparencia(hourBloqueios[0].tipo)
                  : null;

              return (
                <div
                  key={hour}
                  className={cn(
                    "calendar-hour-slot group relative h-20 cursor-pointer border-b border-border/20 transition-colors",
                    janelaDaCelula ? janelaDaCelula.celulaClassName : "hover:bg-accent/5"
                  )}
                  onClick={(e) => handleSlotClick(day, hour, e)}
                  onContextMenu={(e) => handleSlotMenu(day, hour, e)}
                  title={janelaDaCelula ? janelaDaCelula.label : "Clique para agendar no quarto de hora desejado"}
                  aria-label={`${janelaDaCelula ? janelaDaCelula.label : 'Agendar'} em ${format(day, 'dd/MM/yyyy')} às ${String(hour).padStart(2, '0')}:00`}
                  data-slot-date={format(day, 'yyyy-MM-dd')}
                  data-slot-hour={hour}
                >
                  {/* Render Bloqueios */}
                  {hourBloqueios.map(block => {
                    const inicio = paredeDaClinica(block.data_inicio);
                    const fim = paredeDaClinica(block.data_fim);
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
                    
                    const janela = janelaAparencia(block.tipo);

                    return (
                      <div
                        key={block.id}
                        className={cn(
                          "absolute left-1 right-1 rounded-md p-1 text-[10px] z-10 overflow-hidden flex items-center gap-1",
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
                        {/* Glifo `aria-hidden` + estado no `sr-only` — ver o
                            comentário gêmeo no DayView. */}
                        <janela.Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
                      const duration = app.duracao || 50;
                      const endDate = new Date(appDate.getTime() + duration * 60000);

                      const dayStart = new Date(day);
                      dayStart.setHours(0, 0, 0, 0);
                      const dayMidnight = new Date(day);
                      dayMidnight.setHours(24, 0, 0, 0);

                      // Continuation cards start from 00:00 of this day
                      const isContinuation = appDate < dayStart;
                      const effectiveStart = isContinuation ? dayStart : appDate;
                      const topPos = (effectiveStart.getMinutes() / 60) * 100;

                      // Clamp end to midnight so card never overflows this day's column
                      const effectiveEnd = endDate < dayMidnight ? endDate : dayMidnight;
                      const durationMinutes = (effectiveEnd.getTime() - effectiveStart.getTime()) / 60000;
                      if (durationMinutes <= 0) return null;

                      const startLabel = `${String(appDate.getHours()).padStart(2, '0')}:${String(appDate.getMinutes()).padStart(2, '0')}`;
                      const endLabel = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

                      return (
                          <div
                              key={app.id}
                              className={cn(
                                "absolute left-1 right-1 rounded-md p-1 text-[10px] transition-colors cursor-pointer z-10 overflow-hidden border-l-4",
                                appearance.eventClassName,
                                isContinuation && "opacity-75",
                                !isContinuation && "shadow-sm"
                              )}
                              style={{ top: `${topPos}%`, height: `${(durationMinutes / 60) * 100}%`, minHeight: '20px' }}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  onEditAppointment(app);
                              }}
                              title={`${app.nome_paciente} — ${startLabel} até ${endLabel}`}
                          >
                              {isContinuation ? (
                                <span className="font-semibold block truncate">↩ {app.nome_paciente}</span>
                              ) : (
                                <>
                                  <span className="font-semibold block">{startLabel} - {endLabel}</span>
                                  {/* Ver a nota no DayView: o glifo NAO entra no span do
                                      horario, que o e2e le como dado. */}
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
                                </>
                              )}
                          </div>
                      );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>{/* fim do rolador unico: cabecalho e corpo rolam JUNTOS */}
    </div>
  );
}

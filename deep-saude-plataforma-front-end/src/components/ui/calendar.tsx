"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        // `shrink-0` e `text-center` não são cosmética: `head_row` é flex, e
        // item de flex tem `min-width: auto`, então se o texto do dia for mais
        // largo que `w-9` a célula CRESCE em vez de cortar. O cabeçalho fica
        // mais largo que a grade de dias e as colunas desalinham. Com
        // `shrink-0` a largura passa a ser garantida, independente do que o
        // formatador devolver.
        head_cell:
          "text-muted-foreground rounded-md w-9 shrink-0 text-center font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      locale={ptBR}
      formatters={{
        formatCaption: (date, options) => {
          const month = format(date, "MMMM", { locale: options?.locale });
          const year = format(date, "yyyy", { locale: options?.locale });
          return `${month.charAt(0).toUpperCase() + month.slice(1)} de ${year}`;
        },
        formatWeekdayName: (date, options) => {
          // ⚠️ Era "EEE", com o comentário "returns short day (Seg, Ter, Qua...)".
          // O comentário estava errado para esta versão do date-fns com locale
          // ptBR: "EEE" devolve o nome INTEIRO — Domingo, Segunda, Terça. Daí o
          // cabeçalho do mini-calendário sair embolado.
          //
          //   EEE     -> Domingo, Segunda, Terça, ...
          //   EEEEEE  -> Dom, Seg, Ter, Qua, Qui, Sex, Sab   <- o que se queria
          //   EEEEE   -> D, S, T, Q, Q, S, S
          const str = format(date, "EEEEEE", { locale: options?.locale });
          return str.charAt(0).toUpperCase() + str.slice(1);
        }
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }

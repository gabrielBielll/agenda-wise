(ns deep-saude-backend.tempo
  "Tradução entre horário de parede e instante com fuso.

   Regra do projeto: o frontend fala **horário de parede** ('2026-08-17 14:00:00',
   sem fuso, porque é o que o usuário digitou no input). O banco e o Google
   Calendar falam **instante com offset**. A tradução acontece aqui e em nenhum
   outro lugar.

   Antes deste namespace, a conversão era `java.sql.Timestamp/valueOf` direto no
   handler, que interpreta a string no fuso default da JVM — em container isso é
   UTC, o que desloca toda sessão em 3 horas assim que a coluna virou TIMESTAMPTZ.

   A aritmética de recorrência também vive aqui. Somar `7*24*60*60*1000`
   milissegundos não é 'uma semana depois no mesmo horário': em fuso com horário
   de verão, o horário de parede escorrega uma hora. `ZonedDateTime.plusWeeks`
   opera na linha do tempo local e preserva o horário de parede."
  (:require [clojure.string :as str])
  (:import (java.time LocalDateTime OffsetDateTime ZoneId ZonedDateTime)))

(def fuso-padrao "America/Sao_Paulo")

(defn zona
  "ZoneId a partir do nome do fuso. Nil/vazio cai no fuso padrão."
  ^ZoneId [tz]
  (ZoneId/of (or (not-empty (some-> tz str/trim)) fuso-padrao)))

(def ^:private re-offset #"(?:Z|[+-]\d{2}:?\d{2})$")

(defn parse-instante
  "Interpreta `s` no fuso `tz` e devolve ZonedDateTime.

   Aceita:
     - horário de parede: '2026-08-17 14:00:00' | '2026-08-17T14:00' | com 'T'
     - string já com offset: '2026-08-17T14:00:00-03:00' | '...Z'

   No segundo caso o offset da string manda (é um instante de verdade) e o
   resultado é apenas reapresentado no fuso `tz`."
  ^ZonedDateTime [s tz]
  (when-let [s (some-> s str/trim not-empty)]
    (let [z (zona tz)
          iso (str/replace s #"^(\d{4}-\d{2}-\d{2}) " "$1T")]
      (if (re-find re-offset iso)
        (.withZoneSameInstant (.toZonedDateTime (OffsetDateTime/parse iso)) z)
        (.atZone (LocalDateTime/parse iso) z)))))

(defn ->zdt
  "Normaliza para ZonedDateTime no fuso `tz`.

   Aceita o que circula pelo código: ZonedDateTime, OffsetDateTime,
   java.sql.Timestamp / java.util.Date (o que o driver devolve ao ler uma coluna
   TIMESTAMPTZ) e String de horário de parede."
  ^ZonedDateTime [v tz]
  (let [z (zona tz)]
    (cond
      (nil? v)                        nil
      (instance? ZonedDateTime v)     (.withZoneSameInstant ^ZonedDateTime v z)
      (instance? OffsetDateTime v)    (.atZoneSameInstant ^OffsetDateTime v z)
      (instance? java.util.Date v)    (.atZone (.toInstant ^java.util.Date v) z)
      (instance? java.time.Instant v) (.atZone ^java.time.Instant v z)
      (string? v)                     (parse-instante v tz)
      :else (throw (IllegalArgumentException.
                    (str "Não sei converter para data/hora: " (class v)))))))

(defn ->sql
  "ZonedDateTime -> OffsetDateTime, que é o tipo que o driver do PostgreSQL
   grava em coluna TIMESTAMPTZ sem reinterpretar nada."
  ^OffsetDateTime [^ZonedDateTime zdt]
  (some-> zdt .toOffsetDateTime))

(defn parse-sql
  "Atalho: string de horário de parede -> OffsetDateTime pronto para o JDBC."
  ^OffsetDateTime [s tz]
  (->sql (parse-instante s tz)))

(defn mais-minutos
  "Soma minutos na linha do tempo do **instante** — uma sessão de 50 minutos
   dura 50 minutos reais, mesmo atravessando mudança de fuso."
  ^ZonedDateTime [^ZonedDateTime zdt minutos]
  (.plusMinutes zdt (long minutos)))

(defn com-horario-de
  "Mantém a DATA de `alvo` e adota o HORÁRIO DE PAREDE de `fonte`, no fuso `tz`.

   É o que o modo 'este e os seguintes' faz: o usuário informa um horário novo e
   cada ocorrência futura mantém a própria data. Antes isso era feito com
   java.util.Calendar no fuso default da JVM — em container, UTC."
  ^ZonedDateTime [alvo fonte tz]
  (let [a (->zdt alvo tz)
        f (->zdt fonte tz)]
    (when (and a f)
      (-> a
          (.withHour (.getHour f))
          (.withMinute (.getMinute f))
          (.withSecond 0)
          (.withNano 0)))))

(def ^:private semanas-por-tipo
  {"semanal" 1 "quinzenal" 2})

(defn intervalo-semanas
  "Quantas semanas entre ocorrências. Nil quando não é recorrência reconhecida."
  [tipo]
  (get semanas-por-tipo tipo))

(defn ocorrencias
  "Gera as ocorrências de uma série preservando o horário de parede.

   `inicio` é ZonedDateTime; `tipo` é 'semanal' | 'quinzenal' (qualquer outro
   valor gera ocorrência única). Devolve seq de {:inicio zdt :fim zdt}.

   `.plusWeeks` opera na linha do tempo local (horário de parede preservado) e
   `.plusMinutes` na do instante (duração real preservada). É exatamente a
   combinação que se quer para agendamento."
  [^ZonedDateTime inicio tipo qtd duracao-minutos]
  (let [semanas (intervalo-semanas tipo)
        n (if semanas (max 1 (or qtd 1)) 1)]
    (for [i (range n)]
      (let [ini (if semanas (.plusWeeks inicio (long (* i semanas))) inicio)]
        {:inicio ini
         :fim    (mais-minutos ini duracao-minutos)}))))

(ns deep-saude-backend.google.rrule
  "Tradução da recorrência da plataforma para RRULE do Google, e IDs de evento
   determinísticos.

   Ver docs/GOOGLE_CALENDAR_ARQUITETURA.md — D9 e D10.

   Namespace puro de propósito: nada aqui toca banco nem rede, então dá para
   testar sem credencial do Google."
  (:require [deep-saude-backend.tempo :as tempo])
  (:import (java.math BigInteger)
           (java.nio ByteBuffer)
           (java.util UUID)))

;; ---------------------------------------------------------------------------
;; RRULE
;; ---------------------------------------------------------------------------

(defn ->rrule
  "Recorrência da plataforma -> RRULE.

   Usa COUNT e não UNTIL. A plataforma já materializa exatamente N ocorrências
   em `agendamentos`, então COUNT=N mantém os dois lados alinhados 1:1 — e evita
   a armadilha do UNTIL, que precisa estar em UTC com sufixo Z.

   BYDAY é omitido de propósito: com FREQ=WEEKLY o dia vem do DTSTART, e repetir
   a informação só cria chance de divergência entre os dois.

   Devolve nil quando não há recorrência (sessão avulsa)."
  [tipo qtd]
  (when-let [semanas (tempo/intervalo-semanas tipo)]
    (let [n (or qtd 0)]
      (when (> n 1)
        (str "RRULE:FREQ=WEEKLY"
             (when (> semanas 1) (str ";INTERVAL=" semanas))
             ";COUNT=" n)))))

(defn count-do-rrule
  "Extrai o COUNT de um RRULE. Usado ao encurtar uma série (deletar
   'todas as futuras' vira PATCH no evento-mãe com COUNT menor)."
  [rrule]
  (some-> rrule (->> (re-find #"COUNT=(\d+)")) second parse-long))

(defn com-count
  "Reescreve o COUNT de um RRULE existente."
  [rrule novo-count]
  (when rrule
    (clojure.string/replace rrule #"COUNT=\d+" (str "COUNT=" novo-count))))

;; ---------------------------------------------------------------------------
;; IDs de evento determinísticos (D9)
;; ---------------------------------------------------------------------------
;;
;; O Google aceita `id` gerado pelo cliente no events.insert, desde que use o
;; charset base32hex (0-9 + a-v) e tenha entre 5 e 1024 caracteres.
;;
;; Derivando o ID do UUID da plataforma, o insert vira idempotente: um worker de
;; outbox que morreu depois de escrever no Google mas antes de commitar o etag
;; reprocessa e recebe 409 Duplicate em vez de criar um segundo evento.
;;
;; BigInteger/toString com radix 32 usa exatamente 0-9a-v — o mesmo alfabeto do
;; base32hex. Não é coincidência feliz explorada por acaso: é o alfabeto padrão
;; de dígitos do Java para bases até 36.

(def ^:private prefixo "ds")
(def ^:private largura 26)  ;; 128 bits em base 32 = 26 dígitos

(defn- uuid->bytes ^bytes [^UUID u]
  (-> (ByteBuffer/allocate 16)
      (.putLong (.getMostSignificantBits u))
      (.putLong (.getLeastSignificantBits u))
      (.array)))

(defn evento-id
  "UUID da plataforma -> id de evento do Google, estável e idempotente.

   O ID é único **por agenda**, então o mesmo ID é reutilizável ao reescrever a
   série numa agenda nova — que é o que torna a migração A -> B (D15) um replay
   do outbox em vez de uma migração manual."
  [uuid]
  (let [u (if (instance? UUID uuid) uuid (UUID/fromString (str uuid)))
        s (.toString (BigInteger. 1 (uuid->bytes u)) 32)]
    (str prefixo (apply str (repeat (- largura (count s)) \0)) s)))

(defn id-valido?
  "O Google rejeita id fora do charset base32hex ou fora da faixa de tamanho."
  [id]
  (boolean (and id (re-matches #"[0-9a-v]{5,1024}" id))))

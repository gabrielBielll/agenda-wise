(ns deep-saude-backend.tempo-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.tempo :as tempo])
  (:import (java.time ZoneId)))

(deftest parse-horario-de-parede
  (testing "string do frontend é interpretada no fuso da clínica, não no da JVM"
    (let [zdt (tempo/parse-instante "2026-08-17 14:00:00" "America/Sao_Paulo")]
      (is (= 14 (.getHour zdt)))
      (is (= "2026-08-17T14:00-03:00[America/Sao_Paulo]" (str zdt)))))

  (testing "aceita separador T e segundos omitidos"
    (is (= "2026-08-17T14:00-03:00[America/Sao_Paulo]"
           (str (tempo/parse-instante "2026-08-17T14:00" "America/Sao_Paulo")))))

  (testing "fuso nil cai no padrão"
    (is (= "America/Sao_Paulo" (str (.getZone (tempo/parse-instante "2026-08-17 14:00:00" nil))))))

  (testing "string que já traz offset é tratada como instante, não como parede"
    ;; 17:00Z é o mesmo instante que 14:00-03:00
    (let [zdt (tempo/parse-instante "2026-08-17T17:00:00Z" "America/Sao_Paulo")]
      (is (= 14 (.getHour zdt)))))

  (testing "nil e vazio não explodem"
    (is (nil? (tempo/parse-instante nil "America/Sao_Paulo")))
    (is (nil? (tempo/parse-instante "   " "America/Sao_Paulo")))))

(deftest conversao-para-jdbc
  (testing "->sql produz OffsetDateTime com o offset certo"
    (let [odt (tempo/parse-sql "2026-08-17 14:00:00" "America/Sao_Paulo")]
      (is (= "2026-08-17T14:00-03:00" (str odt))))))

(deftest duracao-da-sessao
  (testing "50 minutos são 50 minutos"
    (let [ini (tempo/parse-instante "2026-08-17 14:00:00" "America/Sao_Paulo")
          fim (tempo/mais-minutos ini 50)]
      (is (= "2026-08-17T14:50-03:00[America/Sao_Paulo]" (str fim))))))

(deftest normalizacao-de-tipos
  (testing "aceita o java.sql.Timestamp que o driver devolve ao ler TIMESTAMPTZ"
    ;; 17:00Z == 14:00-03:00
    (let [ts (java.sql.Timestamp/from (java.time.Instant/parse "2026-08-17T17:00:00Z"))]
      (is (= 14 (.getHour (tempo/->zdt ts "America/Sao_Paulo"))))))

  (testing "aceita OffsetDateTime, ZonedDateTime, Instant e String"
    (doseq [v [(java.time.OffsetDateTime/parse "2026-08-17T17:00:00Z")
               (java.time.ZonedDateTime/parse "2026-08-17T17:00:00Z")
               (java.time.Instant/parse "2026-08-17T17:00:00Z")
               "2026-08-17 14:00:00"]]
      (is (= 14 (.getHour (tempo/->zdt v "America/Sao_Paulo"))) (str "falhou para " (class v)))))

  (testing "nil passa, tipo desconhecido explode em vez de silenciar"
    (is (nil? (tempo/->zdt nil "America/Sao_Paulo")))
    (is (thrown? IllegalArgumentException (tempo/->zdt 42 "America/Sao_Paulo")))))

(deftest transplante-de-horario
  (testing "'este e os seguintes': muda o horário, mantém a data de cada ocorrência"
    (let [alvo  (tempo/parse-instante "2026-09-07 14:00:00" "America/Sao_Paulo")
          fonte (tempo/parse-instante "2026-08-17 16:30:00" "America/Sao_Paulo")
          r     (tempo/com-horario-de alvo fonte "America/Sao_Paulo")]
      (is (= "2026-09-07T16:30-03:00" (str (tempo/->sql r)))
          "data de setembro, horário de agosto")))

  (testing "segundos são zerados, como fazia o Calendar"
    (let [alvo  (tempo/parse-instante "2026-09-07 14:00:45" "America/Sao_Paulo")
          fonte (tempo/parse-instante "2026-08-17 16:30:00" "America/Sao_Paulo")]
      (is (= 0 (.getSecond (tempo/com-horario-de alvo fonte "America/Sao_Paulo"))))))

  (testing "funciona com Timestamp do banco como alvo"
    (let [alvo  (java.sql.Timestamp/from (java.time.Instant/parse "2026-09-07T17:00:00Z"))
          fonte "2026-08-17 16:30:00"
          r     (tempo/com-horario-de alvo fonte "America/Sao_Paulo")]
      (is (= "2026-09-07T16:30-03:00" (str (tempo/->sql r)))))))

(deftest recorrencia-preserva-horario-de-parede
  (testing "semanal em São Paulo: mesmo horário toda semana"
    (let [ini (tempo/parse-instante "2026-08-17 14:00:00" "America/Sao_Paulo")
          occs (tempo/ocorrencias ini "semanal" 4 50)]
      (is (= 4 (count occs)))
      (is (= ["2026-08-17T14:00-03:00" "2026-08-24T14:00-03:00"
              "2026-08-31T14:00-03:00" "2026-09-07T14:00-03:00"]
             (map #(str (tempo/->sql (:inicio %))) occs)))
      (is (every? #(= 14 (.getHour (:inicio %))) occs))))

  (testing "quinzenal pula 14 dias"
    (let [ini (tempo/parse-instante "2026-08-17 14:00:00" "America/Sao_Paulo")
          occs (tempo/ocorrencias ini "quinzenal" 3 50)]
      (is (= ["2026-08-17T14:00-03:00" "2026-08-31T14:00-03:00" "2026-09-14T14:00-03:00"]
             (map #(str (tempo/->sql (:inicio %))) occs)))))

  (testing "tipo desconhecido ou nil gera ocorrência única"
    (let [ini (tempo/parse-instante "2026-08-17 14:00:00" "America/Sao_Paulo")]
      (is (= 1 (count (tempo/ocorrencias ini nil 10 50))))
      (is (= 1 (count (tempo/ocorrencias ini "mensal" 10 50)))))))

(deftest recorrencia-atravessa-horario-de-verao
  ;; Este é o teste que justifica o namespace inteiro.
  ;;
  ;; O Brasil não tem horário de verão hoje, então em São Paulo o bug fica
  ;; dormindo. Usando Nova York (DST termina em 01/11/2026) ele aparece: somar
  ;; 7*24*60*60*1000 milissegundos atravessa a virada e desloca o horário de
  ;; parede em uma hora. `.plusWeeks` não.
  (testing "o horário de parede sobrevive à virada de horário de verão"
    (let [ini  (tempo/parse-instante "2026-10-25 14:00:00" "America/New_York")
          occs (tempo/ocorrencias ini "semanal" 2 50)
          [a b] (map :inicio occs)]
      (is (= 14 (.getHour a)) "antes da virada: 14h EDT")
      (is (= 14 (.getHour b)) "depois da virada: continua 14h, agora EST")
      (is (= "-04:00" (str (.getOffset a))))
      (is (= "-05:00" (str (.getOffset b))))))

  (testing "a aritmética antiga em milissegundos teria escorregado"
    (let [ini    (tempo/parse-instante "2026-10-25 14:00:00" "America/New_York")
          millis (+ (.toEpochMilli (.toInstant ini)) (* 7 24 60 60 1000))
          antigo (.atZone (java.time.Instant/ofEpochMilli millis) (ZoneId/of "America/New_York"))]
      (is (= 13 (.getHour antigo))
          "confirma o bug que estava dormindo: 14h vira 13h na semana seguinte")))

  (testing "a duração continua real mesmo na semana da virada"
    (let [ini (tempo/parse-instante "2026-11-01 01:30:00" "America/New_York")
          fim (tempo/mais-minutos ini 50)]
      (is (= 50 (.toMinutes (java.time.Duration/between ini fim)))))))

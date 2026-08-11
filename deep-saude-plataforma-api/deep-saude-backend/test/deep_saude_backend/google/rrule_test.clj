(ns deep-saude-backend.google.rrule-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.google.rrule :as rrule])
  (:import (java.util UUID)))

(deftest gera-rrule
  (testing "semanal"
    (is (= "RRULE:FREQ=WEEKLY;COUNT=40" (rrule/->rrule "semanal" 40))))

  (testing "quinzenal usa INTERVAL=2"
    (is (= "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=20" (rrule/->rrule "quinzenal" 20))))

  (testing "sem recorrência não gera RRULE"
    (is (nil? (rrule/->rrule nil 40)))
    (is (nil? (rrule/->rrule "mensal" 40)))
    (is (nil? (rrule/->rrule "semanal" 1)) "1 ocorrência é sessão avulsa")
    (is (nil? (rrule/->rrule "semanal" 0)))
    (is (nil? (rrule/->rrule "semanal" nil)))))

(deftest manipula-count
  (testing "lê o COUNT"
    (is (= 40 (rrule/count-do-rrule "RRULE:FREQ=WEEKLY;COUNT=40")))
    (is (= 20 (rrule/count-do-rrule "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=20")))
    (is (nil? (rrule/count-do-rrule nil))))

  (testing "encurtar a série = reescrever o COUNT (deletar 'todas as futuras')"
    (is (= "RRULE:FREQ=WEEKLY;COUNT=12"
           (rrule/com-count "RRULE:FREQ=WEEKLY;COUNT=40" 12)))
    (is (= "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5"
           (rrule/com-count "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=20" 5)))))

(deftest id-de-evento-deterministico
  (let [u (UUID/fromString "4821aaaa-bbbb-cccc-dddd-eeeeffff0000")]

    (testing "mesmo UUID sempre gera o mesmo id — é o que torna o insert idempotente"
      (is (= (rrule/evento-id u) (rrule/evento-id u)))
      (is (= (rrule/evento-id u) (rrule/evento-id (str u))) "aceita UUID ou string"))

    (testing "respeita o charset e o tamanho que o Google exige"
      (is (rrule/id-valido? (rrule/evento-id u)))
      (is (re-matches #"ds[0-9a-v]{26}" (rrule/evento-id u))))

    (testing "UUIDs diferentes geram ids diferentes"
      (is (= 500 (count (into #{} (map (fn [_] (rrule/evento-id (UUID/randomUUID)))
                                       (range 500)))))))

    (testing "largura fixa mesmo para UUID com bits altos zerados"
      (is (= 28 (count (rrule/evento-id (UUID. 0 1)))))
      (is (rrule/id-valido? (rrule/evento-id (UUID. 0 1)))))

    (testing "id inválido é rejeitado"
      (is (not (rrule/id-valido? "TEM-MAIUSCULA")))
      (is (not (rrule/id-valido? "xyz")) "z está fora do base32hex")
      (is (not (rrule/id-valido? nil))))))

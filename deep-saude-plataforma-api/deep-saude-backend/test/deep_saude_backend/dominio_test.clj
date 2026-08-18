(ns deep-saude-backend.dominio-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.dominio :as dominio]))

(deftest aceita-o-vocabulario-correto
  (testing "status de sessão"
    (doseq [v ["agendado" "realizado" "cancelado" "falta"]]
      (is (nil? (dominio/valor-invalido :status v)))))

  (testing "status de pagamento"
    (doseq [v ["pendente" "pago"]]
      (is (nil? (dominio/valor-invalido :status_pagamento v)))))

  (testing "status de repasse"
    (doseq [v ["pendente" "bloqueado" "disponivel" "transferido"]]
      (is (nil? (dominio/valor-invalido :status_repasse v))))))

(deftest rejeita-o-que-corrompia-a-coluna
  (testing "'pago' em status_repasse era o bug: vocabulário de pagamento na coluna de repasse"
    (is (some? (dominio/valor-invalido :status_repasse "pago"))))

  (testing "'transferido' não vale para pagamento do paciente"
    (is (some? (dominio/valor-invalido :status_pagamento "transferido"))))

  (testing "valores livres são recusados"
    (is (some? (dominio/valor-invalido :status "qualquer-coisa")))
    (is (some? (dominio/valor-invalido :status_repasse "")))
    (is (some? (dominio/valor-invalido :status_pagamento "PAGO")) "case sensitive"))

  (testing "a mensagem diz o que é aceito, para o erro ser acionável"
    (let [m (dominio/valor-invalido :status_repasse "pago")]
      (is (re-find #"status_repasse" m))
      (is (re-find #"transferido" m)))))

(deftest campo-ausente-nao-e-erro
  (testing "nil significa 'não mexer neste campo', não 'valor inválido'"
    (is (nil? (dominio/valor-invalido :status nil)))
    (is (nil? (dominio/valor-invalido :status_repasse nil))))

  (testing "campo fora da lista de validados passa reto"
    (is (nil? (dominio/valor-invalido :observacoes "texto livre qualquer")))))

(deftest validacao-do-corpo-inteiro
  (testing "corpo válido passa"
    (is (nil? (dominio/validar {:status "realizado"
                                :status_pagamento "pago"
                                :status_repasse "transferido"
                                :valor_consulta 200}))))

  (testing "corpo sem campos de estado passa"
    (is (nil? (dominio/validar {:valor_consulta 200 :observacoes "x"}))))

  (testing "um campo inválido reprova o corpo inteiro"
    (is (some? (dominio/validar {:status "realizado" :status_repasse "pago"}))))

  (testing "corpo vazio passa"
    (is (nil? (dominio/validar {})))))

(deftest data-de-formulario-nao-derruba-com-campo-vazio
  ;; 🔴 VERMELHO DELIBERADO — achado pelo spec de cadastro da `vale` (0131),
  ;; medido por mim em 18/08.
  ;;
  ;; Um `<input type="date">` não preenchido chega ao servidor como STRING
  ;; VAZIA, não como ausente. Os quatro pontos que gravavam `data_nascimento`
  ;; faziam `(when data_nascimento (Date/valueOf data_nascimento))` — e em
  ;; Clojure a string vazia é VERDADEIRA, então o `when` deixa passar.
  ;;
  ;;   java.sql.Date/valueOf ""  ->  IllegalArgumentException   (medido)
  ;;
  ;; Sem `try` no handler, isso vira 500. Efeito para quem usa: **cadastrar
  ;; paciente sem data de nascimento derrubava a requisição**, e a tela não
  ;; dizia qual campo era — mais um diagnóstico apontando para o lugar errado.
  (testing "campo vazio vira nil, e não exceção"
    (is (nil? (dominio/data-de-formulario ""))
        "string vazia é o que um input de data não preenchido manda"))

  (testing "só espaços também" 
    (is (nil? (dominio/data-de-formulario "   "))))

  (testing "ausente continua nil"
    (is (nil? (dominio/data-de-formulario nil))))

  ;; ⚠️ A guarda do outro lado: uma data de verdade tem que continuar chegando
  ;; ao banco. Conserto que transforma tudo em nil passaria nos três de cima e
  ;; apagaria a data de nascimento de todo mundo em silêncio.
  (testing "data válida continua convertendo"
    (is (= (java.sql.Date/valueOf "1990-05-10")
           (dominio/data-de-formulario "1990-05-10"))))

  ;; ⚠️ E lixo continua sendo erro: engolir "10/05/1990" devolvendo nil
  ;; gravaria paciente sem data sem ninguém saber.
  (testing "formato errado continua lançando, em vez de virar nil calado"
    (is (thrown? IllegalArgumentException (dominio/data-de-formulario "10/05/1990")))))

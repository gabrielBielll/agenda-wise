(ns deep-saude-backend.google.convencao-test
  "O tradutor da convenção. Testes puros: nenhum banco, nenhuma rede."
  (:require [clojure.test :refer [deftest testing is]]
            [deep-saude-backend.google.convencao :as c]
            [deep-saude-backend.dominio :as dominio]))

;; ---------------------------------------------------------------------------
;; 🔴 O par que a 0211 exigiu — e ele é UM teste, não dois
;; ---------------------------------------------------------------------------

(deftest disponivel-nao-vira-bloqueio-e-indisponivel-continua-virando
  ;; 🔴 Os dois lados no mesmo `deftest` de propósito.
  ;;
  ;; "`[DISPONÍVEL]` não vira bloqueio", sozinho, passaria igual se o
  ;; reconhecimento de bloqueio tivesse sumido por inteiro — as duas hipóteses
  ;; dão o mesmo verde. O controle positivo é o `[INDISPONÍVEL]` que CONTINUA
  ;; virando bloqueio.
  ;;
  ;; É a inversão da GC-009: importado pela regra de "externo vira bloqueio", um
  ;; `[DISPONÍVEL]` azul esconderia exatamente as horas que a psicóloga ofereceu.
  ;; Sem erro, sem log — o sintoma seria uma ausência.
  (testing "o horário OFERECIDO é reconhecido como oferta"
    (is (= :disponivel (:estado (c/evento->estado {:summary "[DISPONÍVEL]" :colorId "7"})))))

  (testing "CONTROLE — o horário FECHADO continua virando bloqueio"
    (is (= :bloqueio (:estado (c/evento->estado {:summary "[INDISPONÍVEL]" :colorId "8"}))))))

(deftest o-lookbehind-nunca-deixa-indisponivel-casar-como-disponivel
  ;; O `(?<!IN)` é a linha inteira do arquivo. Sem ele, `INDISPONIVEL` contém
  ;; `DISPONIV` e o oposto passa a valer.
  (testing "o radical NÃO casa dentro de INDISPONIVEL, em nenhuma grafia"
    (doseq [t ["[INDISPONÍVEL]" "INDISPONIVEL" "indisponível" "Indisponivel"
               "[INDISPONÍVEIS]" "  indisponivel  " "INDISPONÍVEL - férias"]]
      (is (false? (c/titulo-anuncia-disponivel? t))
          (str "\"" t "\" foi lido como disponível, e é o oposto"))
      (is (true? (c/titulo-anuncia-bloqueio? t)))))

  (testing "CONTROLE — e casa quando é disponível de verdade"
    (doseq [t ["[DISPONÍVEL]" "DISPONIVEL" "disponível" "[Disponiveis]"
               "disponivel para encaixe" "  DISPONÍVEL  "]]
      (is (true? (c/titulo-anuncia-disponivel? t))
          (str "\"" t "\" NÃO foi lido como disponível, e deveria"))
      (is (false? (c/titulo-anuncia-bloqueio? t)))))

  (testing "e DISPONIB não é DISPONIV — 'disponibilidade' não anuncia nada"
    (is (false? (c/titulo-anuncia-disponivel? "disponibilidade da agenda")))
    (is (false? (c/titulo-anuncia-disponivel? "vou disponibilizar depois")))))

;; ---------------------------------------------------------------------------
;; Ida e volta pelos sete
;; ---------------------------------------------------------------------------

(deftest ida-e-volta-fecha-nos-sete-estados
  (testing "todo estado sai para o Google e volta sendo ele mesmo"
    (doseq [estado c/estados]
      (is (= estado (c/ida-e-volta estado))
          (str "a ida e volta de " estado " não fechou"))))

  (testing "CONTROLE — a ida e volta sabe devolver nil para o que não existe"
    ;; Sem isto, "todos os sete fecharam" também seria o resultado de uma função
    ;; que devolve o próprio argumento sem olhar para nada.
    (is (nil? (c/ida-e-volta :inventado)))
    (is (nil? (c/estado->evento :inventado)))))

(deftest os-sete-cobrem-os-dois-vocabularios-sem-sobra
  ;; A D-024 mantém os dois vocabulários separados de propósito: sessão vira
  ;; linha em `agendamentos`, janela vira linha em `bloqueios_agenda`. Este
  ;; tradutor é o único lugar que os vê juntos, e não pode perder nem inventar.
  (is (= (set (map name c/estados))
         (into (set dominio/status-sessao) dominio/tipo-janela-agenda)))
  (is (= 5 (count (c/estados-de-sessao))))
  (is (= 2 (count (c/estados-de-janela))))
  (is (= 7 (count c/estados)))
  (testing "e todo estado tem um par (título, cor)"
    (doseq [estado c/estados]
      (let [ev (c/estado->evento estado)]
        (is (seq (:titulo ev)) (str estado " sem título"))
        (is (contains? dominio/cores-agenda (:cor ev))
            (str estado " usa cor fora das 11 da D-019"))))))

;; ---------------------------------------------------------------------------
;; 🔴 Os dois canais precisam concordar
;; ---------------------------------------------------------------------------

(deftest titulo-e-cor-em-desacordo-nao-viram-estado
  ;; É isto que faz uma troca acidental de cor NÃO virar mudança de estado.
  ;; Escolher um dos dois em silêncio é como um estado vira outro sem ninguém ver.
  (testing "título diz oferta, cor diz outra coisa → não decide"
    (let [r (c/evento->estado {:summary "[DISPONÍVEL]" :colorId "11"})]
      (is (nil? (:estado r)))
      (is (= :desacordo-titulo-disponivel-cor-nao-azul (:por-que r)))))

  (testing "rótulo nosso com a cor de outro estado → não decide"
    (let [r (c/evento->estado {:summary "[REALIZADA]" :colorId "11"})]
      (is (nil? (:estado r)))
      (is (= :desacordo-titulo-e-cor (:por-que r)))
      (is (= :realizado (:titulo-diz r)))))

  (testing "CONTROLE — concordando, decide"
    (is (= :realizado (:estado (c/evento->estado {:summary "[REALIZADA]" :colorId "10"}))))))

(deftest a-cor-sozinha-nunca-separa-cancelada-de-falta
  ;; As duas compartilham o Tomate na paleta padrão — está escrito no
  ;; `dominio.clj`, e é o mesmo motivo pelo qual a cor não carrega o estado na
  ;; tela. Lá quem separa é o glifo; aqui é o título.
  (let [cor-cancelada (:cor (c/estado->evento :cancelado))
        cor-falta     (:cor (c/estado->evento :falta))]
    (is (= cor-cancelada cor-falta) "se deixarem de compartilhar, este teste avisa")
    (is (= :cancelado (:estado (c/evento->estado {:summary "[CANCELADA]" :colorId "11"}))))
    (is (= :falta     (:estado (c/evento->estado {:summary "[FALTA]"     :colorId "11"}))))))

;; ---------------------------------------------------------------------------
;; A ausência de cor, e o externo
;; ---------------------------------------------------------------------------

(deftest evento-sem-cor-e-aceito-como-azul-padrao
  ;; Lido do `lista-psis`: evento sem `colorId` herda a cor do calendário — o
  ;; "Azul padrão" do documento da Deep. Recusar a ausência faria a plataforma
  ;; ignorar justamente os eventos que a psicóloga criou sem pensar em cor.
  (testing "sem cor, o título de oferta decide"
    (let [r (c/evento->estado {:summary "[DISPONÍVEL]"})]
      (is (= :disponivel (:estado r)))
      (is (= :titulo-disponivel-cor-padrao (:por-que r)))))

  (testing "sem cor, o rótulo nosso também decide"
    (is (= :agendado (:estado (c/evento->estado {:summary "[AGENDADA]" :colorId ""}))))))

(deftest evento-externo-vira-bloqueio-e-cancelado-no-google-nao-vira-nada
  (testing "GC-009 — evento que não é nosso ocupa a agenda"
    (is (= :bloqueio (:estado (c/evento->estado {:summary "Dentista" :colorId "5"}))))
    (is (= :evento-externo-gc-009 (:por-que (c/evento->estado {:summary "Reunião de equipe"})))))

  (testing "cancelado no Google é evento que sumiu — não é `cancelado` nosso"
    ;; Confundir os dois marcaria a SESSÃO como cancelada porque o evento saiu do
    ;; calendário, e cancelar sessão é ato humano que mexe em dinheiro.
    (let [r (c/evento->estado {:summary "[REALIZADA]" :colorId "10" :status "cancelled"})]
      (is (nil? (:estado r)))
      (is (= :evento-cancelado-no-google (:por-que r))))))

;; ---------------------------------------------------------------------------
;; 🔴 A marca de conferência dos colorId
;; ---------------------------------------------------------------------------

(deftest so-pavao-e-blueberry-declaram-colorid-conferido
  ;; §10 de docs/GOOGLE_CORES_E_RECONCILIACAO.md: só estes dois foram
  ;; confirmados, e por leitura do `lista-psis`, não por chamada à API.
  ;; **Errar um id troca um estado por outro, em silêncio** — então quem for
  ;; escrever no Google tem de olhar esta marca.
  ;;
  ;; ⚠️ Este teste é um LEMBRETE, não uma verificação da API. Ele quebra no dia em
  ;; que a GC-008 conferir os outros — e quebrar é o comportamento certo: obriga
  ;; quem conferiu a atualizar o que este arquivo afirma.
  (is (= #{"pavao" "blueberry"}
         (set (keep (fn [[nome {:keys [conferido?]}]] (when conferido? nome)) c/color-ids))))

  (testing "o disponível é o único dos sete cujo colorId está conferido"
    (is (true? (:color-id-conferido? (c/estado->evento :disponivel))))
    (doseq [estado [:agendado :confirmado :realizado :cancelado :falta :bloqueio]]
      (is (false? (:color-id-conferido? (c/estado->evento estado)))
          (str estado " declara colorId conferido, e nenhum foi"))))

  (testing "e todo nome de cor da tabela está nas 11 da D-019"
    (is (= (set (keys c/color-ids)) (set dominio/cores-agenda)))))

(ns deep-saude-backend.google.evento-test
  "O corpo do evento que vai para a agenda de uma psicóloga de verdade.

   ⚠️ **Todo teste deste arquivo roda com o fuso da JVM em Asia/Tokyo**, pelo
   fixture lá embaixo. Não é enfeite: é o caso de controle do defeito que este
   projeto já pagou — em contêiner o fuso default é UTC, e foi assim que toda
   sessão andou 3 horas. Um teste de fuso rodando na mesma zona da clínica
   responde a mesma coisa quando o código está certo e quando está errado, ou
   seja, não mede nada."
  (:require [clojure.string :as str]
            [clojure.test :refer [deftest is testing use-fixtures]]
            [deep-saude-backend.google.convencao :as convencao]
            [deep-saude-backend.google.evento :as evento]
            [deep-saude-backend.google.rrule :as rrule]
            [deep-saude-backend.tempo :as tempo])
  (:import (java.time OffsetDateTime)
           (java.util TimeZone)))

(defn- com-servidor-em-outro-fuso [f]
  (let [antigo (TimeZone/getDefault)]
    (try
      (TimeZone/setDefault (TimeZone/getTimeZone "Asia/Tokyo"))
      (f)
      (finally (TimeZone/setDefault antigo)))))

(use-fixtures :once com-servidor-em-outro-fuso)

(def agendamento-id #uuid "4821aaaa-bbbb-cccc-dddd-eeeeffff0000")
(def paciente-id    #uuid "13700000-0000-0000-0000-000000000001")
(def clinica-id     #uuid "00030000-0000-0000-0000-000000000001")
(def serie-id       #uuid "beefbeef-0000-0000-0000-000000000001")

(def base-agendamento
  {:id               agendamento-id
   :clinica_id       clinica-id
   :paciente_id      paciente-id
   :psicologo_id     #uuid "99900000-0000-0000-0000-000000000001"
   :data_hora_sessao "2026-08-17 14:00:00"
   :duracao          50
   :status           "agendado"})

(defn- corpo
  ([] (corpo base-agendamento "Maria da Silva" "America/Sao_Paulo" nil))
  ([ag] (corpo ag "Maria da Silva" "America/Sao_Paulo" nil))
  ([ag nome fuso opts] (:corpo (evento/agendamento->evento ag nome fuso opts))))

(defn- avisos
  ([ag] (avisos ag "Maria da Silva" "America/Sao_Paulo" nil))
  ([ag nome fuso opts] (:avisos (evento/agendamento->evento ag nome fuso opts))))

(defn- tipos-de-aviso [& args]
  (set (map :tipo (apply avisos args))))

;; ---------------------------------------------------------------------------
;; R-017 — o título é o nome do paciente
;; ---------------------------------------------------------------------------

(deftest summary-e-o-nome-do-paciente
  (testing "R-017 + GC-008: o nome, sem prefixo nenhum"
    (is (= "Maria da Silva" (:summary (corpo)))))

  (testing "espaço em volta não vira parte do nome"
    (is (= "Maria da Silva" (:summary (corpo base-agendamento "  Maria da Silva  "
                                             "America/Sao_Paulo" nil)))))

  (testing "a §7 da spec perdeu, e o teste registra qual das duas está no código"
    ;; A §7 pediria "Sessão — M.S. #137". Se algum dia a decisão virar, é este
    ;; `is` que falha primeiro — de propósito.
    (is (not (str/includes? (:summary (corpo)) "Sessão")))
    (is (not (str/includes? (:summary (corpo)) "#"))))

  (testing "nome vazio é erro de chamador, não evento sem título na agenda de alguém"
    (is (thrown? clojure.lang.ExceptionInfo
                 (corpo base-agendamento "" "America/Sao_Paulo" nil)))
    (is (thrown? clojure.lang.ExceptionInfo
                 (corpo base-agendamento "   " "America/Sao_Paulo" nil)))
    (is (thrown? clojure.lang.ExceptionInfo
                 (corpo base-agendamento nil "America/Sao_Paulo" nil)))))

;; ---------------------------------------------------------------------------
;; 🔴 A marca de origem — D12
;; ---------------------------------------------------------------------------

(deftest origem-em-todo-evento
  (testing "todo estado, com série e sem série, com paleta e sem"
    (doseq [estado ["agendado" "confirmado" "realizado" "cancelado" "falta"
                    nil "estado-que-nao-existe"]
            serie  [nil serie-id]
            paleta [nil {"agendado" "pavao"}]]
      (let [c (corpo (assoc base-agendamento :status estado :recorrencia_id serie)
                     "Maria da Silva" "America/Sao_Paulo" {:paleta paleta})]
        (is (= "plataforma" (get-in c [:extendedProperties :private :origem]))
            (str "sem origem em estado=" estado " serie=" (some? serie)))))))

(deftest sem-a-marca-de-origem-o-proprio-evento-volta-como-bloqueio
  ;; 🔴 O caso de controle que justifica a marca existir.
  ;;
  ;; Como o `summary` é o nome do paciente (R-017), o tradutor de entrada não
  ;; reconhece o título, cai no `:else` e aplica a GC-009: evento externo vira
  ;; bloqueio. Ou seja, sem filtrar por `origem` ANTES de traduzir, a plataforma
  ;; importa a própria sessão como bloqueio e colide com ela mesma.
  ;;
  ;; Este teste afirma o defeito de propósito. Se um dia ele falhar porque o
  ;; tradutor passou a reconhecer nossos eventos por outro caminho, ótimo — mas
  ;; alguém tem de olhar, não descobrir em produção.
  (let [c (corpo)
        lido (convencao/evento->estado {:summary (:summary c) :colorId (:colorId c)})]
    (is (= :bloqueio (:estado lido)))
    (is (= :evento-externo-gc-009 (:por-que lido)))
    (is (= "plataforma" (get-in c [:extendedProperties :private :origem]))
        "e é esta chave que o importador tem de checar antes de traduzir")))

(deftest propriedades-privadas-sao-strings-e-nao-inventam-serie
  (let [priv (get-in (corpo) [:extendedProperties :private])]
    (testing "o Google só guarda string em extendedProperties"
      (is (every? string? (vals priv))))

    (testing "os ids da plataforma viajam junto (spec §4.1)"
      (is (= (str paciente-id) (:pacienteId priv)))
      (is (= (str clinica-id) (:clinicaId priv)))))

  (testing "sessão avulsa não leva serieId — ausência diz 'não tem série'"
    (is (not (contains? (get-in (corpo) [:extendedProperties :private]) :serieId))))

  (testing "sessão de série leva"
    (is (= (str serie-id)
           (get-in (corpo (assoc base-agendamento :recorrencia_id serie-id))
                   [:extendedProperties :private :serieId])))))

(deftest versao-ausente-avisa-em-vez-de-inventar
  (testing "sem contador, a chave não é escrita e o aviso sobe"
    (is (not (contains? (get-in (corpo) [:extendedProperties :private]) :versao)))
    (is (contains? (tipos-de-aviso base-agendamento) :versao-ausente)))

  (testing "com contador, a chave existe e o aviso some — o mesmo instrumento, resposta diferente"
    (let [{:keys [corpo avisos]} (evento/agendamento->evento
                                  base-agendamento "Maria da Silva" "America/Sao_Paulo"
                                  {:versao 7})]
      (is (= "7" (get-in corpo [:extendedProperties :private :versao])))
      (is (not (contains? (set (map :tipo avisos)) :versao-ausente))))))

;; ---------------------------------------------------------------------------
;; D9 — id determinístico
;; ---------------------------------------------------------------------------

(deftest id-deterministico-e-estavel
  (testing "é o mesmo que o rrule/evento-id, e não uma segunda implementação"
    (is (= (rrule/evento-id agendamento-id) (:id (corpo)))))

  (testing "duas montagens do mesmo agendamento dão o mesmo id — é isto que faz o 409 acontecer"
    (is (= (:id (corpo)) (:id (corpo)))))

  (testing "muda o horário, muda o estado, muda o nome: o id NÃO muda"
    (is (= (:id (corpo))
           (:id (corpo (assoc base-agendamento
                              :data_hora_sessao "2027-01-02 08:30:00"
                              :status "realizado")))
           (:id (corpo (assoc base-agendamento :status "cancelado")
                       "Outro Nome" "America/Sao_Paulo" nil)))))

  (testing "agendamento diferente, id diferente"
    (is (not= (:id (corpo))
              (:id (corpo (assoc base-agendamento
                                 :id #uuid "4821aaaa-bbbb-cccc-dddd-eeeeffff0001"))))))

  (testing "o id respeita o charset base32hex que o Google exige"
    (is (rrule/id-valido? (:id (corpo)))))

  (testing "sem id não há idempotência — falha alto em vez de escrever sem ela"
    (is (thrown? clojure.lang.ExceptionInfo (corpo (dissoc base-agendamento :id))))))

;; ---------------------------------------------------------------------------
;; Fuso — o da clínica, nunca o do servidor
;; ---------------------------------------------------------------------------

(deftest horario-vai-no-fuso-da-clinica
  (testing "dateTime com offset e timeZone explícito (spec §4.2)"
    (let [c (corpo)]
      (is (= "2026-08-17T14:00:00-03:00" (get-in c [:start :dateTime])))
      (is (= "America/Sao_Paulo" (get-in c [:start :timeZone])))
      (is (= "2026-08-17T14:50:00-03:00" (get-in c [:end :dateTime])))
      (is (= "America/Sao_Paulo" (get-in c [:end :timeZone])))))

  (testing "o fuso do servidor é Asia/Tokyo neste arquivo e não aparece em lugar nenhum"
    (is (= "Asia/Tokyo" (str (java.time.ZoneId/systemDefault))) "o fixture está valendo")
    (let [c (corpo)]
      (is (not (str/includes? (get-in c [:start :dateTime]) "+09:00")))
      (is (not= "Asia/Tokyo" (get-in c [:start :timeZone])))))

  (testing "clínica em outro fuso: o offset sai do fuso DELA e da data, não de constante"
    ;; Nova York tem horário de verão; São Paulo não tem mais. Mesma parede,
    ;; meses diferentes, offsets diferentes — é isso que prova que o offset é
    ;; calculado e não colado.
    (let [inverno (corpo (assoc base-agendamento :data_hora_sessao "2026-01-15 09:00:00")
                         "Maria da Silva" "America/New_York" nil)
          verao   (corpo (assoc base-agendamento :data_hora_sessao "2026-07-15 09:00:00")
                         "Maria da Silva" "America/New_York" nil)]
      (is (= "2026-01-15T09:00:00-05:00" (get-in inverno [:start :dateTime])))
      (is (= "2026-07-15T09:00:00-04:00" (get-in verao [:start :dateTime])))
      (is (= "America/New_York" (get-in inverno [:start :timeZone])))))

  (testing "instante vindo do JDBC (TIMESTAMPTZ) dá o mesmo corpo que a parede"
    (let [do-driver (OffsetDateTime/parse "2026-08-17T17:00:00Z")]  ;; = 14:00 em SP
      (is (= (get-in (corpo) [:start :dateTime])
             (get-in (corpo (assoc base-agendamento :data_hora_sessao do-driver))
                     [:start :dateTime])))))

  (testing "clínica sem fuso cai no padrão do projeto e AVISA — nunca no fuso da JVM"
    (let [{:keys [corpo avisos]} (evento/agendamento->evento
                                  base-agendamento "Maria da Silva" nil nil)]
      (is (= tempo/fuso-padrao (get-in corpo [:start :timeZone])))
      (is (contains? (set (map :tipo avisos)) :fuso-ausente))))

  (testing "sem início não há evento"
    (is (thrown? clojure.lang.ExceptionInfo
                 (corpo (dissoc base-agendamento :data_hora_sessao))))))

(deftest duracao-define-o-fim
  (testing "usa a duração da linha"
    (is (= "2026-08-17T15:00:00-03:00"
           (get-in (corpo (assoc base-agendamento :duracao 60)) [:end :dateTime]))))

  (testing "linha antiga sem duração usa o mesmo default do banco (50)"
    (is (= "2026-08-17T14:50:00-03:00"
           (get-in (corpo (dissoc base-agendamento :duracao)) [:end :dateTime]))))

  (testing "sessão que atravessa a meia-noite continua sendo 50 minutos reais"
    (is (= "2026-08-18T00:20:00-03:00"
           (get-in (corpo (assoc base-agendamento :data_hora_sessao "2026-08-17 23:30:00"))
                   [:end :dateTime])))))

;; ---------------------------------------------------------------------------
;; Cor — e o aviso que não pode ser engolido
;; ---------------------------------------------------------------------------

(deftest color-id-vem-do-convencao-e-carrega-a-marca-de-conferencia
  (testing "cada estado de sessão sai com o id da tabela"
    (doseq [[estado esperado] {"agendado" "6" "confirmado" "2" "realizado" "10"
                               "cancelado" "11" "falta" "11"}]
      (is (= esperado (:colorId (corpo (assoc base-agendamento :status estado))))
          (str "estado " estado))))

  (testing "status nulo é 'agendado', que é o default do banco"
    (is (= "6" (:colorId (corpo (assoc base-agendamento :status nil))))))

  (testing "🔴 id não conferido AVISA — nove dos onze são palpite"
    (let [aviso (first (filter #(= :color-id-nao-conferido (:tipo %))
                               (avisos base-agendamento)))]
      (is (some? aviso))
      (is (= "tangerina" (:cor aviso)))
      (is (= "6" (:color-id aviso)) "o aviso diz QUAL id é palpite, não só que há um")))

  (testing "e o aviso SOME quando o id é conferido — o instrumento responde diferente"
    ;; Pavão (7) é um dos dois confirmados. Chega aqui pela paleta da clínica.
    (let [{:keys [corpo avisos]} (evento/agendamento->evento
                                  base-agendamento "Maria da Silva" "America/Sao_Paulo"
                                  {:paleta {"agendado" "pavao"} :versao 1})]
      (is (= "7" (:colorId corpo)))
      (is (= [] avisos) "nenhum aviso: cor conferida, versão presente, fuso presente")))

  (testing "a paleta da clínica (GC-016) vence o padrão"
    (is (= "9" (:colorId (corpo base-agendamento "Maria da Silva" "America/Sao_Paulo"
                                {:paleta {"agendado" "blueberry"}})))))

  (testing "estado fora do vocabulário não ganha cor inventada"
    (let [{:keys [corpo avisos]} (evento/agendamento->evento
                                  (assoc base-agendamento :status "status_repasse_por_engano")
                                  "Maria da Silva" "America/Sao_Paulo" nil)]
      (is (not (contains? corpo :colorId)))
      (is (contains? (set (map :tipo avisos)) :estado-desconhecido)))))

(deftest cancelado-avisa-que-a-r017-pede-prefixo
  ;; Não dispara na criação (o estado nasce `agendado`); dispara se alguém reusar
  ;; a função no caminho de atualização, que é quando a decisão precisa existir.
  (is (not (contains? (tipos-de-aviso base-agendamento) :titulo-sem-prefixo-de-cancelamento)))
  (doseq [estado ["cancelado" "falta"]]
    (is (contains? (tipos-de-aviso (assoc base-agendamento :status estado))
                   :titulo-sem-prefixo-de-cancelamento)
        estado)))

;; ---------------------------------------------------------------------------
;; Ida e volta
;; ---------------------------------------------------------------------------

(defn- volta
  "Do corpo do Google de volta para o que a plataforma sabe.

   Existe no teste, e não no código, porque a volta de verdade é a Trilha C:
   aqui só provo que **nada se perde no caminho de ida**."
  [c]
  (let [priv (get-in c [:extendedProperties :private])
        cor->estado (into {} (for [[estado {:keys [cor]}] convencao/convencao
                                   :let [id (:id (convencao/color-ids cor))]]
                               [id estado]))]
    {:paciente-nome (:summary c)
     :paciente-id   (:pacienteId priv)
     :clinica-id    (:clinicaId priv)
     :serie-id      (:serieId priv)
     :inicio        (tempo/parse-instante (get-in c [:start :dateTime])
                                          (get-in c [:start :timeZone]))
     :estado        (cor->estado (:colorId c))}))

(deftest ida-e-volta-nao-perde-nada-do-que-carrega
  (let [ag (assoc base-agendamento :recorrencia_id serie-id :status "confirmado")
        v (volta (corpo ag))]
    (is (= "Maria da Silva" (:paciente-nome v)))
    (is (= (str paciente-id) (:paciente-id v)))
    (is (= (str clinica-id) (:clinica-id v)))
    (is (= (str serie-id) (:serie-id v)))
    (is (= :confirmado (:estado v)))
    (is (= (tempo/parse-instante "2026-08-17 14:00:00" "America/Sao_Paulo")
           (:inicio v))
        "o instante volta igual, e o teste roda com a JVM em Tóquio"))

  (testing "os três estados que a cor distingue sozinha voltam inteiros"
    (doseq [estado [:agendado :confirmado :realizado]]
      (is (= estado (:estado (volta (corpo (assoc base-agendamento
                                                 :status (name estado))))))
          (name estado))))

  (testing "⚠️ cancelado e falta compartilham o Tomate e NÃO voltam distintos"
    ;; Isto é a convenção, não um defeito: quem separa os dois é o motivo, que
    ;; mora na plataforma (R-017, buraco 1). Registrado para ninguém escrever a
    ;; volta achando que a cor decide.
    (let [c (volta (corpo (assoc base-agendamento :status "cancelado")))
          f (volta (corpo (assoc base-agendamento :status "falta")))]
      (is (= (:estado c) (:estado f))))))

;; ---------------------------------------------------------------------------
;; O que o corpo NÃO leva
;; ---------------------------------------------------------------------------

(deftest o-que-nao-entra-no-corpo
  (let [ag (assoc base-agendamento
                  :recorrencia_id serie-id
                  :valor_consulta 250.00M
                  :status_pagamento "pago"
                  :valor_repasse 175.00M
                  :observacoes "paciente relatou crise de ansiedade na quinta")
        c (corpo ag)]
    (testing "a paciente não é convidada"
      (is (not (contains? c :attendees))))

    (testing "Meet fica de fora até alguém medir se conta Gmail comum cria pela API"
      (is (not (contains? c :conferenceData))))

    (testing "RRULE é do evento-mãe (D10), não da ocorrência"
      (is (not (contains? c :recurrence))))

    (testing "🔴 dinheiro e observação clínica NÃO atravessam a fronteira"
      ;; A fronteira da R-019: a agenda carrega quando, com quem e em que estado.
      ;; Valor, pagamento e prontuário são caminho único, e o caminho é a
      ;; plataforma. O agendamento deste teste tem todos eles preenchidos — se
      ;; alguém passar a copiar o mapa inteiro para o corpo, isto acusa.
      (let [texto (pr-str c)]
        (doseq [vazamento ["250" "175" "ansiedade"]]
          (is (not (str/includes? texto vazamento)) vazamento))))

    (testing "extendedProperties.private tem exatamente as chaves da spec §4.1"
      (is (= #{:origem :serieId :pacienteId :clinicaId}
             (set (keys (get-in c [:extendedProperties :private]))))
          "sem :versao porque este chamador não passou contador"))

    (testing "visibility private e transparency opaque (spec §4.1 e §7)"
      (is (= "private" (:visibility c)))
      (is (= "opaque" (:transparency c))))

    (testing "a descrição não carrega dado do paciente"
      (is (not (str/includes? (:description c) "Maria"))))))

(ns deep-saude-backend.google.vinculos-test
  (:require [clojure.test :refer [deftest is testing]]
            [deep-saude-backend.google.vinculos :as v]))

(defn- cal [id role & {:keys [summary primary]}]
  (cond-> {:id id :accessRole role :summary (or summary id)}
    primary (assoc :primary true)))

(defn- vinc [id cal-id status & {:keys [usuario_id access_role]}]
  {:id id :google_calendar_id cal-id :status status
   :usuario_id usuario_id :access_role (or access_role "writer")})

(deftest descobre-agendas-novas
  (testing "agenda com escrita e sem vínculo entra como pendente"
    (let [r (v/reconciliar [(cal "a@group.calendar.google.com" "writer" :summary "Juliana — Atendimentos")] [])]
      (is (= 1 (count (:novos r))))
      (is (= {:google_calendar_id "a@group.calendar.google.com"
              :nome_no_google     "Juliana — Atendimentos"
              :access_role        "writer"
              :topologia          "modelo_a"
              :status             "pendente"}
             (first (:novos r))))))

  (testing "a agenda primary da conta da clínica nunca entra (D2)"
    (let [r (v/reconciliar [(cal "clinica@gmail.com" "owner" :primary true)] [])]
      (is (empty? (:novos r)))
      (is (empty? (:ignorados r)))))

  (testing "agenda somente-leitura não vira vínculo, mas é reportada"
    (let [r (v/reconciliar [(cal "b@group.calendar.google.com" "reader")] [])]
      (is (empty? (:novos r)))
      (is (= 1 (count (:ignorados r))))
      (is (= "sem permissão de escrita" (:motivo (first (:ignorados r)))))))

  (testing "freeBusyReader também é inútil para escrita"
    (is (empty? (:novos (v/reconciliar [(cal "c@g" "freeBusyReader")] [])))))

  (testing "agenda já conhecida não é recriada"
    (let [r (v/reconciliar [(cal "a@g" "writer")] [(vinc 1 "a@g" "ativo" :usuario_id 7)])]
      (is (empty? (:novos r))))))

(deftest detecta-descompartilhamento
  ;; O caso que o card SEC/arquitetura chama de crítico: sem isso a
  ;; sincronização para em silêncio e ninguém percebe.
  (testing "vínculo ativo que sumiu do calendarList vira sem_acesso"
    (let [r (v/reconciliar [] [(vinc 1 "a@g" "ativo" :usuario_id 7)])]
      (is (= 1 (count (:sem-acesso r))))
      (is (= "a@g" (:google_calendar_id (first (:sem-acesso r)))))))

  (testing "vínculo pendente que sumiu também conta"
    (is (= 1 (count (:sem-acesso (v/reconciliar [] [(vinc 1 "a@g" "pendente")]))))))

  (testing "vínculo pausado é decisão humana — reconciliação não mexe"
    (is (empty? (:sem-acesso (v/reconciliar [] [(vinc 1 "a@g" "pausado" :usuario_id 7)])))))

  (testing "vínculo já marcado sem_acesso não é remarcado"
    (is (empty? (:sem-acesso (v/reconciliar [] [(vinc 1 "a@g" "sem_acesso")]))))))

(deftest detecta-reativacao
  (testing "agenda que voltou e já tinha psicólogo volta para ativo"
    (let [r (v/reconciliar [(cal "a@g" "writer")] [(vinc 1 "a@g" "sem_acesso" :usuario_id 7)])]
      (is (= [{:id 1 :status "ativo" :access_role "writer"}] (:reativados r)))))

  (testing "agenda que voltou sem psicólogo mapeado volta para pendente"
    (let [r (v/reconciliar [(cal "a@g" "writer")] [(vinc 1 "a@g" "sem_acesso")])]
      (is (= "pendente" (:status (first (:reativados r))))))))

(deftest detecta-mudanca-de-permissao
  (testing "writer rebaixado para reader é sinalizado como perda de escrita"
    (let [r (v/reconciliar [(cal "a@g" "reader")]
                           [(vinc 1 "a@g" "ativo" :usuario_id 7 :access_role "writer")])]
      (is (= 1 (count (:papel-mudou r))))
      (is (= {:id 1 :de "writer" :para "reader" :perdeu-escrita? true}
             (first (:papel-mudou r))))))

  (testing "writer promovido a owner é mudança, mas não perde escrita"
    (let [r (v/reconciliar [(cal "a@g" "owner")]
                           [(vinc 1 "a@g" "ativo" :usuario_id 7 :access_role "writer")])]
      (is (false? (:perdeu-escrita? (first (:papel-mudou r)))))))

  (testing "papel igual não gera ruído"
    (is (empty? (:papel-mudou (v/reconciliar [(cal "a@g" "writer")]
                                             [(vinc 1 "a@g" "ativo" :access_role "writer")]))))))

(deftest cenario-combinado
  (testing "várias coisas mudando ao mesmo tempo"
    (let [r (v/reconciliar
             [(cal "clinica@gmail.com" "owner" :primary true)
              (cal "nova@g" "writer" :summary "Marina — Atendimentos")
              (cal "voltou@g" "writer")
              (cal "leitura@g" "reader")]
             [(vinc 1 "sumiu@g" "ativo" :usuario_id 7)
              (vinc 2 "voltou@g" "sem_acesso" :usuario_id 8)
              (vinc 3 "pausado@g" "pausado")])]
      (is (= ["nova@g"] (map :google_calendar_id (:novos r))))
      (is (= ["sumiu@g"] (map :google_calendar_id (:sem-acesso r))))
      (is (= [2] (map :id (:reativados r))))
      (is (= ["leitura@g"] (map :google_calendar_id (:ignorados r)))))))

(deftest sugestao-de-vinculo
  (def usuarios
    [{:id 1 :nome "Juliana Silva"  :email "ju@clinica.com" :google_email "juliana@gmail.com"}
     {:id 2 :nome "Marina Souza"   :email "marina@clinica.com"}
     {:id 3 :nome "Carlos Andrade" :email "carlos@clinica.com"}])

  (testing "e-mail verificado batendo com criador de evento é o sinal mais forte"
    (let [s (v/sugerir-usuario {:summary "Agenda X" :criadores #{"juliana@gmail.com"}} usuarios)]
      (is (= 1 (:usuario_id (first s))))
      (is (= :alta (:confianca (first s))))
      (is (re-find #"juliana@gmail.com" (:motivo (first s))))))

  (testing "sem e-mail verificado, o match cai para confiança média"
    (let [s (v/sugerir-usuario {:summary "Agenda X" :criadores #{"marina@clinica.com"}} usuarios)]
      (is (= 2 (:usuario_id (first s))))
      (is (= :media (:confianca (first s))))))

  (testing "nome parecido sozinho é sinal fraco"
    (let [s (v/sugerir-usuario {:summary "Marina — Atendimentos" :criadores #{}} usuarios)]
      (is (= 2 (:usuario_id (first s))))
      (is (= :baixa (:confianca (first s))))))

  (testing "sem nenhum sinal, nenhuma sugestão — melhor não sugerir do que sugerir errado"
    (is (empty? (v/sugerir-usuario {:summary "Agenda da Sala 3" :criadores #{}} usuarios))))

  (testing "e-mail ganha de nome parecido"
    ;; summary parece da Marina, mas os eventos foram criados pela Juliana
    (let [s (v/sugerir-usuario {:summary "Marina — Atendimentos"
                                :criadores #{"juliana@gmail.com"}} usuarios)]
      (is (= 1 (:usuario_id (first s))) "o e-mail verificado tem que vencer o nome"))))

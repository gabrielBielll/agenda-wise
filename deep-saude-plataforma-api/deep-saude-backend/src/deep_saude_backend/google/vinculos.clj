(ns deep-saude-backend.google.vinculos
  "Reconciliação entre o que o Google enxerga (calendarList) e o que a
   plataforma conhece (vinculo_agenda).

   O núcleo é `reconciliar`, que é uma função pura: recebe as duas listas e
   devolve o plano de mudanças. Toda a decisão difícil está aqui, sem banco e
   sem rede — é o que permite testar os casos que importam, incluindo o
   descompartilhamento silencioso, que em produção só apareceria quando um
   paciente batesse na porta no horário errado.

   Ver docs/GOOGLE_CALENDAR_ARQUITETURA.md (D14 e spec 3.2/5.4)."
  (:require [clojure.string :as str]
            [clojure.set :as set]))

;; Só agendas em que a clínica consegue escrever servem. `reader` e
;; `freeBusyReader` aparecem no calendarList mas não aceitam escrita — listá-las
;; como vinculáveis levaria o admin a mapear uma agenda que nunca vai sincronizar.
(def papeis-com-escrita #{"owner" "writer"})

(defn escrevivel? [calendario]
  (contains? papeis-com-escrita (:accessRole calendario)))

(defn reconciliar
  "Plano de mudanças a partir do calendarList do Google e dos vínculos atuais.

   `calendarios` — [{:id :summary :accessRole :primary}]
   `vinculos`    — [{:google_calendar_id :status :usuario_id :access_role ...}]

   Devolve {:novos [...] :reativados [...] :sem-acesso [...] :papel-mudou [...]
            :ignorados [...]}

   Regras:
   - agenda `primary` nunca entra (D2 da spec): é a agenda pessoal da conta da
     clínica, cheia de compromisso que não é sessão;
   - agenda sem permissão de escrita não vira vínculo novo;
   - agenda que sumiu do calendarList e tinha vínculo ativo vira `sem_acesso` —
     alguém descompartilhou, e isso precisa de alarme, não de silêncio;
   - agenda que reapareceu volta de `sem_acesso` para o status anterior;
   - vínculo `pausado` é decisão humana e não é mexido por reconciliação."
  [calendarios vinculos]
  (let [visiveis      (remove :primary calendarios)
        por-id        (into {} (map (juxt :id identity)) visiveis)
        ids-visiveis  (set (keys por-id))
        por-vinculo   (into {} (map (juxt :google_calendar_id identity)) vinculos)
        ids-conhecidos (set (keys por-vinculo))

        ;; Agendas que o Google mostra e nós ainda não conhecemos.
        novos (->> visiveis
                   (remove #(contains? ids-conhecidos (:id %)))
                   (filter escrevivel?)
                   (mapv (fn [c] {:google_calendar_id (:id c)
                                  :nome_no_google     (:summary c)
                                  :access_role        (:accessRole c)
                                  :topologia          "modelo_a"
                                  :status             "pendente"})))

        ;; Sumiram do calendarList, mas tinham vínculo que sincronizava.
        sem-acesso (->> vinculos
                        (filter #(and (not (contains? ids-visiveis (:google_calendar_id %)))
                                      (contains? #{"pendente" "ativo" "orfao"} (:status %))))
                        (mapv #(select-keys % [:id :google_calendar_id :usuario_id])))

        ;; Reapareceram: o compartilhamento foi refeito.
        reativados (->> vinculos
                        (filter #(and (contains? ids-visiveis (:google_calendar_id %))
                                      (= "sem_acesso" (:status %))))
                        (mapv (fn [v]
                                {:id     (:id v)
                                 :status (if (:usuario_id v) "ativo" "pendente")
                                 :access_role (:accessRole (por-id (:google_calendar_id v)))})))

        ;; Continuam visíveis, mas a permissão mudou. Perder escrita é tão grave
        ;; quanto perder acesso: a sincronização passa a falhar em toda escrita.
        papel-mudou (->> vinculos
                         (keep (fn [v]
                                 (let [c (por-id (:google_calendar_id v))]
                                   (when (and c
                                              (not= "sem_acesso" (:status v))
                                              (not= (:access_role v) (:accessRole c)))
                                     {:id          (:id v)
                                      :de          (:access_role v)
                                      :para        (:accessRole c)
                                      :perdeu-escrita? (not (escrevivel? c))}))))
                         vec)

        ignorados (->> visiveis
                       (remove escrevivel?)
                       (remove #(contains? ids-conhecidos (:id %)))
                       (mapv (fn [c] {:google_calendar_id (:id c)
                                      :nome_no_google     (:summary c)
                                      :access_role        (:accessRole c)
                                      :motivo             "sem permissão de escrita"})))]
    {:novos       novos
     :reativados  reativados
     :sem-acesso  sem-acesso
     :papel-mudou papel-mudou
     :ignorados   ignorados}))

;; ---------------------------------------------------------------------------
;; Sugestão de vínculo (spec 5.4)
;; ---------------------------------------------------------------------------
;;
;; ⚠️ Isto SUGERE. Nunca confirma sozinho.
;;
;; Com accessRole=writer não há como descobrir com segurança o dono de uma
;; agenda secundária: o id é xxx@group.calendar.google.com (não é e-mail de
;; pessoa) e o summary é texto livre que o dono edita quando quiser.
;;
;; Vincular a agenda errada expõe o histórico de pacientes de um profissional a
;; outro — quebra de sigilo que não aparece em teste e aparece em auditoria. Por
;; isso a confirmação humana por um admin é obrigatória, e o resultado daqui é
;; apresentado como pergunta, nunca aplicado.

(defn- normalizar [s]
  (-> (or s "") str/lower-case str/trim
      (str/replace #"\s+" " ")))

(defn- similaridade
  "Fração das palavras do nome do usuário que aparecem no texto da agenda."
  [nome texto]
  (let [palavras (->> (str/split (normalizar nome) #" ")
                      (remove #(< (count %) 3))   ;; ignora "de", "da", "e"
                      set)
        alvo (normalizar texto)]
    (if (empty? palavras)
      0.0
      (/ (double (count (filter #(str/includes? alvo %) palavras)))
         (count palavras)))))

(defn sugerir-usuario
  "Ordena os candidatos para uma agenda, do mais provável ao menos.

   `calendario` — {:summary :criadores #{e-mails}}
   `usuarios`   — [{:id :nome :email :google_email}]

   O sinal forte é o e-mail: se algum evento da agenda foi criado por um e-mail
   que bate com o Google verificado de um usuário, é quase certo. O nome no
   summary é sinal fraco e serve só para desempatar."
  [calendario usuarios]
  (let [criadores (set (map normalizar (:criadores calendario)))]
    (->> usuarios
         (map (fn [u]
                (let [emails (set (map normalizar (remove str/blank? [(:google_email u) (:email u)])))
                      bate-email? (boolean (seq (set/intersection criadores emails)))
                      sim (similaridade (:nome u) (:summary calendario))]
                  {:usuario_id (:id u)
                   :nome       (:nome u)
                   :confianca  (cond
                                 (and bate-email? (:google_email u)) :alta
                                 bate-email?                        :media
                                 (>= sim 0.5)                       :baixa
                                 :else                              :nenhuma)
                   :motivo     (cond
                                 bate-email? (str "eventos criados por " (first (set/intersection criadores emails)))
                                 (>= sim 0.5) "nome parecido com o da agenda"
                                 :else nil)
                   :score      (+ (if bate-email? 10.0 0.0)
                                  (if (:google_email u) 1.0 0.0)
                                  sim)})))
         (remove #(= :nenhuma (:confianca %)))
         (sort-by (comp - :score))
         vec)))

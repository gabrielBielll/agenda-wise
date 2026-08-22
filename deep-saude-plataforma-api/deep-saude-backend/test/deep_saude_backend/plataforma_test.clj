(ns deep-saude-backend.plataforma-test
  "Painel do operador da plataforma, e a linha que ele não pode cruzar.

   O sistema passa a ser vendido a outras clínicas, e aparece um papel novo:
   quem administra a **plataforma**, não uma clínica. Ele cria clínica e
   acompanha uso. O risco de um papel assim é conhecido e é o motivo deste
   namespace existir: ele nasce querendo ser chave-mestra.

   Três coisas são provadas aqui, e a terceira é a que importa:

   1. o operador enxerga as clínicas e os números de uso;
   2. quem **não** é operador leva 403 — inclusive `admin_clinica`, que é
      administrador de uma clínica e tem bypass de permissão dentro dela;
   3. **o operador não lê prontuário.** A R-012 diz que prontuário é do
      psicólogo autor, e operar o negócio não é atender. A saída de emergência
      da R-012 é outra flag, em código, e continua sendo a única.

   E uma quarta, contra escalada: **nenhum caminho de código concede a flag.**

   ⚠️ Escrito pela `orla` (Claude na sandbox), que não compila Clojure — Clojars
   é bloqueado pela política de saída do ambiente. O SQL do painel foi
   verificado contra PostgreSQL 16 real; a suíte, não.

   ## Rodar

       TEST_DATABASE_URL='jdbc:postgresql://localhost:5432/deep_teste?user=u&password=p' lein test"
  (:require [clojure.test :refer :all]
            [buddy.sign.jwt :as jwt]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.agendamentos-test :as agtest]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fixture
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def clinica    #uuid "eeeeeeee-0000-0000-0000-00000000000e")
(def operador   #uuid "eeeeeeee-0000-0000-0000-0000000000f1")
(def admin      #uuid "eeeeeeee-0000-0000-0000-0000000000f2")
(def psicologo  #uuid "eeeeeeee-0000-0000-0000-0000000000f3")
(def paciente   #uuid "eeeeeeee-0000-0000-0000-0000000000f4")

(defn- papel-id [nome]
  (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = ?" nome])))

(defn- semear! []
  (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, 'Clinica do Operador')
                     ON CONFLICT (id) DO NOTHING" clinica])
  (doseq [[id nome email papel operador?] [[operador  "Operador" "operador@teste.local"  "admin_clinica" true]
                                           [admin     "Admin"    "admin-p@teste.local"   "admin_clinica" false]
                                           [psicologo "Psi"      "psi-p@teste.local"     "psicologo"     false]]]
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash, plataforma_admin)
                       VALUES (?, ?, ?, ?, ?, 'x', ?) ON CONFLICT (id) DO NOTHING"
                      id clinica (papel-id papel) nome email operador?]))
  (db/execute-one! ["INSERT INTO pacientes (id, clinica_id, nome, psicologo_id)
                     VALUES (?, ?, 'Paciente', ?) ON CONFLICT (id) DO NOTHING"
                    paciente clinica psicologo]))

(defn- limpar! []
  (db/execute-one! ["DELETE FROM prontuarios"])
  (db/execute-one! ["DELETE FROM pacientes WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM usuarios  WHERE clinica_id = ?" clinica])
  (db/execute-one! ["DELETE FROM clinicas  WHERE id = ?" clinica]))

(defn com-banco-de-teste [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      ;; O segredo pertence aos testes que realmente assinam JWT, não ao perfil
      ;; global do Leiningen (que contaminava toda compilação/require).
      (with-redefs [db/datasource (delay ds)
                    core/jwt-secret (delay "segredo-apenas-para-plataforma-test")]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (limpar!)
        (semear!)
        (f)))
    (println (str "\n  [plataforma-test] TEST_DATABASE_URL não definida — "
                  ;; 🔴 T3.1 — símbolo literal; `*ns*` na fixture é `user`, não este ns.
                  (count (filter (comp :test meta val)
                                 (ns-publics 'deep-saude-backend.plataforma-test)))
                  " testes de banco PULADOS.\n"))))

(use-fixtures :once com-banco-de-teste)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers — token de verdade, guarda de verdade
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- token-de
  "Assina um JWT como o login faria. As rotas do painel passam por
   `wrap-jwt-autenticacao`, então testar com `:identity` montado à mão pularia
   justamente a metade que se quer exercitar."
  [usuario-id papel operador?]
  (jwt/sign {:user_id (str usuario-id)
             :clinica_id (str clinica)
             :papel_id (str (papel-id papel))
             :role papel
             :plataforma_admin operador?
             :exp (-> (java.time.Instant/now) (.plusSeconds 600) .getEpochSecond)}
            @core/jwt-secret))

(defn- req [usuario-id papel operador? & [body]]
  (cond-> {:headers {"authorization" (str "Bearer " (token-de usuario-id papel operador?))}}
    body (assoc :body body)))

(defn- como-operador [& [body]] (req operador  "admin_clinica" true  body))
(defn- como-admin    [& [body]] (req admin     "admin_clinica" false body))
(defn- como-psi      [& [body]] (req psicologo "psicologo"     false body))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1. O operador enxerga a plataforma
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest operador-lista-clinicas-com-uso
  (let [resp ((core/wrap-plataforma-admin core/plataforma-listar-clinicas-handler) (como-operador))
        nossa (first (filter #(= clinica (:id %)) (:body resp)))]
    (is (= 200 (:status resp)))
    (is (some? nossa) "a clínica semeada tem que aparecer na lista")
    (testing "traz o uso, que é para o que o painel serve"
      (is (= 3 (:usuarios nossa)))
      (is (= 1 (:pacientes nossa))))
    (testing "⚠️ e NÃO traz nome de paciente — contagem é uso, nome é dado clínico"
      (is (not (contains? nossa :nome))))))

(deftest operador-ve-metricas-da-plataforma
  (let [resp ((core/wrap-plataforma-admin core/plataforma-metricas-handler) (como-operador))]
    (is (= 200 (:status resp)))
    (is (pos? (:clinicas (:body resp))))
    (is (pos? (:operadores (:body resp))))))

(deftest operador-cria-clinica-pelo-painel
  (let [email (str "novo-" (java.util.UUID/randomUUID) "@teste.local")
        resp ((core/wrap-plataforma-admin core/plataforma-criar-clinica-handler)
              (como-operador {:nome_clinica "Clinica Vendida" :nome_admin "Admin Novo"
                              :email_admin email :senha_admin "senha-de-teste-123"}))]
    (is (= 201 (:status resp)))
    (is (some? (get-in resp [:body :clinica :id])))
    (testing "o admin criado NÃO nasce operador da plataforma"
      (is (false? (:plataforma_admin
                   (db/execute-one! ["SELECT plataforma_admin FROM usuarios WHERE email = ?" email])))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2. Quem não é operador não entra
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest admin-de-clinica-nao-e-operador-da-plataforma
  ;; O ponto do desenho. `admin_clinica` tem bypass de permissão DENTRO da
  ;; clínica dele; se o painel reusasse aquele caminho, todo admin de toda
  ;; clínica cliente viraria operador da plataforma.
  (let [resp ((core/wrap-plataforma-admin core/plataforma-listar-clinicas-handler) (como-admin))]
    (is (= 403 (:status resp)))
    (is (= "nao_e_operador_da_plataforma" (:code (:body resp))))))

(deftest psicologo-nao-e-operador-da-plataforma
  (is (= 403 (:status ((core/wrap-plataforma-admin core/plataforma-listar-clinicas-handler) (como-psi))))))

(deftest sem-token-nao-entra
  (is (= 401 (:status ((core/wrap-plataforma-admin core/plataforma-listar-clinicas-handler) {})))))

(deftest flag-forjada-no-token-nao-basta-se-o-segredo-nao-bater
  ;; O token carrega a flag, então a integridade dela é a assinatura. Assinado
  ;; com outro segredo, não passa nem da autenticação.
  (let [token (jwt/sign {:user_id (str operador) :clinica_id (str clinica)
                         :papel_id (str (papel-id "admin_clinica"))
                         :role "admin_clinica" :plataforma_admin true
                         :exp (-> (java.time.Instant/now) (.plusSeconds 600) .getEpochSecond)}
                        "segredo-que-nao-e-o-nosso")
        resp ((core/wrap-plataforma-admin core/plataforma-listar-clinicas-handler)
              {:headers {"authorization" (str "Bearer " token)}})]
    (is (= 401 (:status resp)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 3. A linha que o operador não cruza — R-012
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest operador-da-plataforma-nao-le-prontuario
  ;; ⚠️ O teste mais importante deste arquivo.
  ;;
  ;; Um painel de superadmin é exatamente o lugar onde "já que ele administra
  ;; tudo, deixa ele ver" entra sem ninguém reparar. A R-012 diz que não: o
  ;; prontuário é do psicólogo autor, e a única exceção é a flag em código, que
  ;; é outra e continua desligada.
  (core/criar-prontuario-handler
   {:identity {:clinica_id clinica :user_id psicologo :role "psicologo"}
    :body {:paciente_id (str paciente) :conteudo "Sessão clínica."}})
  (is (= 1 (:c (db/execute-one! ["SELECT count(*) AS c FROM prontuarios"])))
      "o prontuário precisa existir para o teste valer")
  (testing "mesmo sendo operador da plataforma, a leitura é negada"
    (let [resp (core/listar-prontuarios-handler
                {:identity {:clinica_id clinica :user_id operador
                            :role "admin_clinica" :plataforma_admin true}
                 :params {:paciente-id (str paciente)}})]
      (is (= 403 (:status resp))
          "R-012: operar o negócio não é atender — a flag da plataforma não abre prontuário"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 4. Ninguém vira operador por endpoint
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest nenhum-endpoint-concede-a-flag
  ;; A migration promete que a flag só se concede por SQL direto. Promessa em
  ;; comentário não impede nada — este teste tenta a escalada pelo caminho mais
  ;; óbvio: mandar o campo no corpo de criação de usuário.
  (let [email (str "escalada-" (java.util.UUID/randomUUID) "@teste.local")
        resp (core/criar-usuario-handler
              {:identity {:clinica_id clinica :user_id admin :role "admin_clinica"}
               ;; A modalidade de repasse passou a ser obrigatória para psicóloga
               ;; (T2.8b): sem ela, a criação para em 422 antes de exercitar o que
               ;; este teste vigia — que a flag da plataforma no corpo é ignorada.
               :body {:nome "Tentativa" :email email :senha "senha-de-teste-123"
                      :papel "psicologo" :plataforma_admin true
                      :modalidade_repasse "percentual" :percentual_repasse 50}})]
    (is (contains? #{200 201} (:status resp)) "o usuário é criado normalmente")
    (is (false? (:plataforma_admin
                 (db/execute-one! ["SELECT plataforma_admin FROM usuarios WHERE email = ?" email])))
        "o campo do corpo é ignorado — a flag não se concede por requisição")))

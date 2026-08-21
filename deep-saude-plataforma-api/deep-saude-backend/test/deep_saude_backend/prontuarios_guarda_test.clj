(ns deep-saude-backend.prontuarios-guarda-test
  "A tabela de decisão de quem lê prontuário — **sem banco**, de propósito.

   Os testes de `prontuarios_test` cobrem o mesmo terreno com Postgres de
   verdade, e são melhores para isso. Este namespace existe por um motivo
   diferente: **ele roda em qualquer lugar**, inclusive no Termux onde não há
   banco. Sem ele, a única forma de ver a guarda mais sensível do sistema mudar
   de cor é empurrar e esperar o CI — e aí *\"escrevi e o CI passou\"* fica
   indistinguível de *\"escrevi o teste para passar\"*.

   🔴 **A regra que ele codifica é a D-021**, e ela reverte parte da R-012 a
   pedido do Gabriel (*\"a ceo pediu para que o admin possa ver os prontuarios
   sim somente o secretario que nao\"*):

   | quem                              | lê? | por quê |
   |-----------------------------------|-----|---------|
   | psicólogo **autor**               | sim | R-012, sempre foi |
   | **admin da clínica**              | sim | **D-021** — novo |
   | admin **que opera a plataforma**  | não | R-012: operar o negócio não é atender |
   | secretário                        | não | a migration nunca lhe deu a permissão |
   | outro psicólogo da mesma clínica  | não | R-012 exclui explicitamente |

   ⚠️ **A terceira linha é a que quase escapou.** O operador da plataforma tem
   papel `admin_clinica` na própria clínica — liberar \"admin\" sem olhar a flag
   o liberaria junto, e derrubaria a garantia que `plataforma_test` chama de *\"o
   teste mais importante deste arquivo\"*. O Gabriel decidiu que a CEO falava do
   admin da clínica, não de quem opera a plataforma.

   📌 E a tabela é testada **inteira**, não só as linhas que mudaram: guarda
   vista só liberando pode estar liberando tudo."
  (:require [clojure.test :refer :all]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.prontuarios :as prontuarios]))

(def ^:private clinica  (java.util.UUID/randomUUID))
(def ^:private autor    (java.util.UUID/randomUUID))
(def ^:private admin    (java.util.UUID/randomUUID))
(def ^:private outro    (java.util.UUID/randomUUID))
(def ^:private paciente (java.util.UUID/randomUUID))

;; ⚠️ `admin` e `autor` PRECISAM ser pessoas diferentes. Na primeira versão deste
;; arquivo eu usei o mesmo id nos dois, e a leitura do admin caía no ramo "é o
;; autor": dava 200 e não gravava acesso, exatamente como o esperado — pelo
;; motivo errado. O teste concordava com o código sem exercitar a regra nova.

(defn- pedido
  [usuario-id papel & {:keys [plataforma?]}]
  {:identity (cond-> {:clinica_id clinica :user_id usuario-id :role papel}
               plataforma? (assoc :plataforma_admin true))
   :params   {:paciente-id (str paciente)}})

(defn- ler
  "Roda `listar-handler` contra um banco de mentira e devolve
   `[resposta acessos-gravados]`. `acessos` são os parâmetros de cada INSERT em
   `acesso_prontuario` — é assim que a auditoria é medida por efeito, e não pela
   leitura ter dado 200."
  ([req] (ler req false))
  ([req super-admin-le?]
   (let [acessos (atom [])]
     (with-redefs
       [db/datasource     (delay :sem-banco)
        db/execute-query! (fn [_] [{:id (java.util.UUID/randomUUID) :conteudo "conteúdo clínico"}])
        db/execute-one!
        (fn [sql-params]
          (let [sql (str (first sql-params))]
            (cond
              (re-find #"INSERT INTO acesso_prontuario" sql)
              (do (swap! acessos conj (vec (rest sql-params))) nil)

              (re-find #"FROM pacientes" sql)
              {:id paciente :psicologo_id autor}

              :else nil)))]
       [(prontuarios/listar-handler req super-admin-le?) @acessos]))))

(defn- motivo-gravado [acessos]
  (last (first acessos)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; A tabela de decisão, inteira
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest quem-le-prontuario
  (testing "psicólogo autor — lê, e NÃO gera registro de acesso"
    (let [[resp acessos] (ler (pedido autor "psicologo"))]
      (is (= 200 (:status resp)))
      (is (empty? acessos)
          "auditar o autor lendo o próprio registro enche a tabela de ruído e
           esconde o acesso que importa")))

  (testing "🔴 D-021 — admin da clínica lê"
    (let [[resp _] (ler (pedido admin "admin_clinica"))]
      (is (= 200 (:status resp))
          "D-021: a CEO pediu que o admin da clínica visse os prontuários")))

  (testing "🔴 admin que opera a plataforma NÃO lê, mesmo tendo papel de admin"
    (let [[resp acessos] (ler (pedido outro "admin_clinica" :plataforma? true))]
      (is (= 403 (:status resp))
          "R-012 continua: operar o negócio não é atender. A D-021 é sobre quem
           administra a clínica, não sobre quem opera a plataforma")
      (is (empty? acessos) "leitura negada não grava acesso")))

  (testing "secretário não lê"
    (let [[resp _] (ler (pedido outro "secretario"))]
      (is (= 403 (:status resp)))))

  (testing "outro psicólogo da mesma clínica não lê"
    (let [[resp acessos] (ler (pedido outro "psicologo"))]
      (is (= 403 (:status resp))
          "R-012 exclui explicitamente outro psicólogo da mesma clínica")
      (is (empty? acessos)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; A auditoria — o que sustenta a D-021
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest acesso-de-quem-nao-e-o-autor-fica-registrado
  ;; 🔴 Enquanto só a flag de super-admin abria a porta, registrar era exceção.
  ;; Com o admin lendo de ROTINA, o registro passa a ser o que sustenta a regra:
  ;; a R-012 deixou de proibir e passou a rastrear, e rastreamento que não grava
  ;; é a mesma promessa vazia do `migrations_completed`.
  (testing "o admin lendo deixa rastro, com motivo próprio"
    (let [[resp acessos] (ler (pedido admin "admin_clinica"))]
      (is (= 200 (:status resp)))
      (is (= 1 (count acessos)) "leitura de não-autor tem que gravar exatamente um acesso")
      (is (= "admin_clinica" (motivo-gravado acessos))
          "motivo próprio: misturar com `flag_super_admin` faria a auditoria
           perder justamente o que ela existe para separar — rotina de emergência")))

  (testing "a saída de emergência continua tendo motivo distinto"
    ;; O caso agora precisa de um papel que NÃO passe sozinho, senão a flag não
    ;; é decisiva e o teste deixa de medir a saída de emergência. Por isso é o
    ;; `outro` psicólogo, e não mais o admin.
    (let [[resp acessos] (ler (pedido outro "psicologo") true)]
      (is (= 200 (:status resp)) "com a flag ligada, a leitura alheia passa")
      (is (= 1 (count acessos)))
      (is (= "flag_super_admin" (motivo-gravado acessos))
          "emergência e rotina não podem cair no mesmo balde")))

  (testing "CONTROLE — o autor lendo com a flag ligada continua sem gravar"
    ;; Se este passasse a gravar, a tabela encheria de ruído e o teste acima
    ;; ficaria verde sem provar nada.
    (let [[_ acessos] (ler (pedido autor "psicologo") true)]
      (is (empty? acessos)))))

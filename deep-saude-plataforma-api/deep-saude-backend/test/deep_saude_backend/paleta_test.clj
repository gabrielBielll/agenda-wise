(ns deep-saude-backend.paleta-test
  "GC-016 — a paleta de cores por clínica.

   🔴 **O que estes testes protegem não é a cor, é a AUSÊNCIA de linha.**

   O desenho escolhido guarda no banco só o que a clínica escolheu, e mescla com
   o padrão na leitura. A alternativa — semear 5 linhas por clínica — é a que
   traz de volta o defeito da **A-026**: lá, `provisionar-clinica` não ligava
   `pagamento_automatico`, clínica nova nascia sem a configuração, e a
   sincronização respondia \"concluída\" tendo feito nada.

   Por isso o primeiro teste aqui é **clínica sem nenhuma linha**, e ele é o mais
   importante do arquivo: se ele quebrar, existe clínica sem cor — e a agenda
   dela pinta o quê?

   Sem `TEST_DATABASE_URL` os testes são pulados, como nos outros namespaces de
   banco."
  (:require [clojure.test :refer :all]
            [environ.core :refer [env]]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [deep-saude-backend.core :as core]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.dominio :as dominio]
            [deep-saude-backend.paleta :as paleta]
            [deep-saude-backend.agendamentos-test :as agtest]))

(def clinica   #uuid "aaaaaaaa-0000-0000-0000-00000000010a")
(def outra     #uuid "aaaaaaaa-0000-0000-0000-00000000010b")
(def admin     #uuid "aaaaaaaa-0000-0000-0000-0000000001c9")
(def secretario #uuid "aaaaaaaa-0000-0000-0000-0000000001c5")

(defn- semear! []
  (let [padmin (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'admin_clinica'"]))
        psec   (:id (db/execute-one! ["SELECT id FROM papeis WHERE nome_papel = 'secretario'"]))]
    (doseq [[id nome] [[clinica "Clinica Paleta"] [outra "Clinica Vizinha"]]]
      (db/execute-one! ["INSERT INTO clinicas (id, nome_da_clinica) VALUES (?, ?)
                         ON CONFLICT (id) DO NOTHING" id nome]))
    (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                       VALUES (?, ?, ?, 'Admin Paleta', 'admin.paleta@teste.local', 'x')
                       ON CONFLICT (id) DO NOTHING" admin clinica padmin])
    (when psec
      (db/execute-one! ["INSERT INTO usuarios (id, clinica_id, papel_id, nome, email, senha_hash)
                         VALUES (?, ?, ?, 'Sec Paleta', 'sec.paleta@teste.local', 'x')
                         ON CONFLICT (id) DO NOTHING" secretario clinica psec]))))

(defn- limpar! [] (db/execute-one! ["DELETE FROM paleta_clinica"]))

(defn com-banco-de-teste [f]
  (if-let [url (env :test-database-url)]
    (let [ds (jdbc/get-datasource {:jdbcUrl url})]
      (with-redefs [db/datasource (delay ds)]
        (#'agtest/exigir-banco-de-teste! url)
        (migratus/migrate (core/migratus-config))
        (limpar!)
        (semear!)
        (f)))
    (println (str "\n  [paleta-test] TEST_DATABASE_URL não definida — "
                  ;; 🔴 T3.1 — símbolo literal; `*ns*` na fixture é `user`, não este ns.
                  (count (filter (comp :test meta val)
                                 (ns-publics 'deep-saude-backend.paleta-test)))
                  " testes de banco PULADOS.\n"))))

(defn entre-testes [f] (if (env :test-database-url) (do (limpar!) (f)) (f)))
(use-fixtures :once com-banco-de-teste)
(use-fixtures :each entre-testes)

(defn- como [usuario-id papel]
  {:identity {:clinica_id clinica :user_id usuario-id :role papel
              :papel_id (:id (db/execute-one!
                              ["SELECT papel_id AS id FROM usuarios WHERE id = ?" usuario-id]))}})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O padrão, que é o que impede clínica sem cor
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest clinica-sem-nenhuma-linha-tem-paleta-completa
  ;; 🔴 O teste mais importante deste arquivo. Se ele quebrar, existe clínica cuja
  ;; agenda não sabe com que cor pintar — e o defeito seria invisível até alguém
  ;; abrir a tela de uma clínica recém-criada.
  (is (zero? (:c (db/execute-one! ["SELECT count(*) AS c FROM paleta_clinica"])))
      "pré-condição: a tabela tem que estar vazia para o teste valer")
  (let [p (paleta/paleta-da-clinica clinica)]
    (is (= dominio/status-sessao (set (keys p)))
        "a paleta efetiva cobre os CINCO estados, mesmo sem nenhuma linha gravada")
    (is (= dominio/paleta-padrao p)
        "sem escolha, a paleta é exatamente o Padrão Agenda Wise")
    (is (every? dominio/cores-agenda (vals p))
        "toda cor do padrão pertence ao vocabulário — senão a tela receberia um nome que não sabe pintar")))

(deftest escolher-uma-cor-nao-mexe-nas-outras
  (paleta/definir-cor! clinica "agendado" "banana")
  (let [p (paleta/paleta-da-clinica clinica)]
    (is (= "banana" (get p "agendado")))
    (is (= (dissoc dominio/paleta-padrao "agendado") (dissoc p "agendado"))
        "os outros quatro continuam no padrão — a escolha é por estado, não por paleta inteira")
    (is (= 1 (:c (db/execute-one! ["SELECT count(*) AS c FROM paleta_clinica"])))
        "só o que foi escolhido vira linha: a ausência é que significa 'usa o padrão'")))

(deftest escolher-de-novo-troca-em-vez-de-duplicar
  (paleta/definir-cor! clinica "agendado" "banana")
  (paleta/definir-cor! clinica "agendado" "pavao")
  (is (= "pavao" (get (paleta/paleta-da-clinica clinica) "agendado")))
  (is (= 1 (:c (db/execute-one! ["SELECT count(*) AS c FROM paleta_clinica"])))
      "upsert, não insert: duas escolhas do mesmo estado não podem virar duas linhas"))

(deftest voltar-ao-padrao-APAGA-a-linha
  ;; 📌 Apagar, e não gravar a cor padrão. Gravar deixaria a tabela dizendo que a
  ;; clínica escolheu — e some a diferença entre "escolheu o padrão" e "nunca
  ;; escolheu", que é o que a tela precisa para saber o que marcar.
  (paleta/definir-cor! clinica "cancelado" "uva")
  (paleta/voltar-ao-padrao! clinica "cancelado")
  (is (= dominio/paleta-padrao (paleta/paleta-da-clinica clinica)))
  (is (zero? (:c (db/execute-one! ["SELECT count(*) AS c FROM paleta_clinica"])))
      "voltar ao padrão não deixa linha para trás"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; O vocabulário fechado — servidor, não cliente
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest cor-fora-do-vocabulario-e-recusada
  (let [r (paleta/definir-cor! clinica "agendado" "roxo-neon")]
    (is (:erro r) "cor livre é o que a D-019 proíbe — e proibir no cliente não é proibir")
    (is (re-find #"roxo-neon" (:erro r)) "a mensagem tem que dizer QUAL valor foi recusado")
    (is (zero? (:c (db/execute-one! ["SELECT count(*) AS c FROM paleta_clinica"])))
        "recusa não pode gravar nada")))

(deftest estado-fora-do-vocabulario-e-recusado
  (let [r (paleta/definir-cor! clinica "arquivado" "banana")]
    (is (:erro r))
    (is (re-find #"arquivado" (:erro r)))))

(deftest o-banco-recusa-por-baixo-do-handler
  ;; ⚠️ A guarda do `dominio.clj` devolve mensagem legível, e é ela que o usuário
  ;; vê. O CHECK da migration é a rede embaixo: protege escrita que NÃO passe
  ;; pelo handler. Sem este teste, a rede existiria sem ninguém saber se pega.
  (is (thrown? Exception
               (db/execute-one! ["INSERT INTO paleta_clinica (clinica_id, estado, cor)
                                  VALUES (?, 'agendado', 'roxo-neon')" clinica]))
      "o CHECK da migration tem que recusar cor fora do vocabulário")
  (is (thrown? Exception
               (db/execute-one! ["INSERT INTO paleta_clinica (clinica_id, estado, cor)
                                  VALUES (?, 'arquivado', 'banana')" clinica]))
      "e estado fora do vocabulário também"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Isolamento e permissão
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest a-paleta-de-uma-clinica-nao-vaza-para-a-outra
  (paleta/definir-cor! clinica "realizado" "lavanda")
  (is (= "lavanda" (get (paleta/paleta-da-clinica clinica) "realizado")))
  (is (= "manjericao" (get (paleta/paleta-da-clinica outra) "realizado"))
      "a vizinha continua no padrão — cor é por clínica, e isolamento é a regra da casa"))

(deftest secretario-le-mas-nao-escreve
  ;; Ler é de todo mundo: a agenda pinta com a paleta, então quem vê agenda
  ;; precisa dela. Escrever é configuração da clínica.
  ;; ⚠️ A pré-condição existe porque o `wrap-checar-permissao` devolve 403 também
  ;; quando NÃO ACHA o papel na identidade — e aí o teste passaria pelo motivo
  ;; errado, medindo "usuário mal semeado" em vez de "permissão negada".
  (is (some? (get-in (como secretario "secretario") [:identity :papel_id]))
      "o secretário precisa ter papel de verdade, senão o 403 abaixo não é o 403 que eu quero")
  (is (= 200 (:status (paleta/listar-handler (como secretario "secretario"))))
      "o secretário lê a paleta — a agenda dele pinta com ela")
  (let [resp ((core/wrap-checar-permissao paleta/definir-handler "gerenciar_configuracoes_clinica")
              (assoc (como secretario "secretario") :body {:estado "agendado" :cor "banana"}))]
    (is (= 403 (:status resp))
        "o secretário NÃO troca a cor da clínica inteira")))

(deftest admin-escreve
  (let [resp ((core/wrap-checar-permissao paleta/definir-handler "gerenciar_configuracoes_clinica")
              (assoc (como admin "admin_clinica") :body {:estado "agendado" :cor "banana"}))]
    (is (= 200 (:status resp)))
    (is (= "banana" (get-in resp [:body :paleta "agendado"]))
        "a resposta devolve a paleta efetiva, para a tela não precisar recarregar")))

(deftest escolhidas-diz-o-que-a-clinica-escolheu-e-nao-o-que-ela-usa
  ;; 🔴 A diferenca entre `paleta` e `escolhidas` e o que a agenda precisa para
  ;; nao mudar a aparencia de quem nunca abriu a tela: sem escolha, ela pinta com
  ;; os tokens da plataforma; com escolha, com a cor do Google.
  ;;
  ;; ⚠️ E o caso que obriga o campo a existir e este: a clinica escolher, DE
  ;; PROPOSITO, a mesma cor do padrao. Comparando por valor, o front concluiria
  ;; "nao escolheu" — e o efeito seria a escolha dela nao valer.
  (is (empty? (:escolhidas (:body (paleta/listar-handler (como admin "admin_clinica")))))
      "sem linha nenhuma, nada foi escolhido")
  (paleta/definir-cor! clinica "agendado" (get dominio/paleta-padrao "agendado"))
  (let [body (:body (paleta/listar-handler (como admin "admin_clinica")))]
    (is (= {"agendado" (get dominio/paleta-padrao "agendado")} (:escolhidas body))
        "escolher a cor do padrao CONTA como escolha")
    (is (= dominio/paleta-padrao (:paleta body))
        "e a paleta efetiva continua igual ao padrao — os dois campos dizem coisas diferentes")))

(deftest o-catalogo-vem-junto-para-a-tela-nao-duplicar-o-vocabulario
  (let [body (:body (paleta/listar-handler (como admin "admin_clinica")))]
    (is (= 11 (count (:cores body))) "as onze do Google, nem mais nem menos")
    (is (= dominio/paleta-padrao (:padrao body))
        "a tela precisa saber qual é o padrão para marcar 'voltar ao padrão'")))

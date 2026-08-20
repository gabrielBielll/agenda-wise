(ns deep-saude-backend.google.handlers-test
  "A regra que decide se o painel GRITA.

   🔴 Este arquivo existe por causa de um achado da 0113, e o achado só apareceu
   porque a `vale` perguntou **como testar a faixa** em vez de dar por pronta.

   O modo de falha desta integração é o **silêncio**: alguém apaga ou
   descompartilha a agenda no Google e nada na tela muda de tamanho. Por isso a
   tela do GC-001a levanta uma faixa vermelha em vez de um rótulo cinza — e por
   isso ela **obedece** a `precisa-atencao?` em vez de rededuzir a regra.

   Obedecer estava certo. A regra é que estava curta: olhava `sem_acesso` e
   esquecia `orfao`. Como a faixa inteira fica atrás de `precisa_atencao`, a
   frase *\"a agenda sumiu da conta do Google\"* — que a tela sabe escrever — era
   **inalcançável**.

   ⚠️ Nenhum teste aqui toca banco, de propósito: a regra estava embutida num
   handler que consultava banco, e foi exatamente isso que a deixou sem teste
   por todo esse tempo."
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.google.api :as api]
            [deep-saude-backend.google.handlers :as handlers]
            [deep-saude-backend.google.oauth :as oauth]))

(deftest guardar-state-remove-expirados-antes-de-criar-o-novo
  (let [consultas (atom [])]
    (with-redefs [db/execute-one! (fn [query]
                                    (swap! consultas conj query)
                                    {:update-count 1})]
      (handlers/guardar-state!
       "state-novo"
       #uuid "aaaaaaaa-4000-0000-0000-000000000001"
       #uuid "aaaaaaaa-4000-0000-0000-000000000002"))
    (is (= 2 (count @consultas)))
    (is (clojure.string/includes? (ffirst @consultas)
                                  "DELETE FROM google_oauth_state"))
    (is (clojure.string/includes? (first (second @consultas))
                                  "INSERT INTO google_oauth_state"))))

(deftest callback-oauth-recusa-state-invalido-antes-de-falar-com-google
  (let [trocas (atom [])]
    (with-redefs [handlers/consumir-state! (constantly nil)
                  oauth/trocar-codigo (fn [config]
                                        (swap! trocas conj config)
                                        {:status 200 :json {:access_token "nao-deveria-existir"}})]
      (let [resp (handlers/callback-handler
                  {:identity {:clinica_id #uuid "aaaaaaaa-2000-0000-0000-000000000001"
                              :user_id #uuid "aaaaaaaa-2000-0000-0000-000000000002"}
                   :params {:code "codigo-do-atacante"
                            :state "state-do-atacante"}})]
        (is (= 400 (:status resp)))
        (is (= "oauth_state_invalido" (get-in resp [:body :code])))
        (is (empty? @trocas)
            "state invalido precisa parar antes da troca e de qualquer gravacao")))))

(deftest callback-oauth-exige-state
  (let [trocas (atom [])]
    (with-redefs [oauth/trocar-codigo #(swap! trocas conj %)]
      (let [resp (handlers/callback-handler
                  {:identity {:clinica_id #uuid "aaaaaaaa-3000-0000-0000-000000000001"
                              :user_id #uuid "aaaaaaaa-3000-0000-0000-000000000002"}
                   :params {:code "codigo-sem-state"}})]
        (is (= 400 (:status resp)))
        (is (= "oauth_state_obrigatorio" (get-in resp [:body :code])))
        (is (empty? @trocas))))))

(deftest sincronizacao-nao-sorteia-uma-conexao-quando-a-clinica-tem-varias
  (let [clinica #uuid "aaaaaaaa-1000-0000-0000-000000000001"
        chamadas (atom [])]
    (with-redefs [handlers/conexoes-da-clinica
                  (constantly [{:id 1 :usuario_id #uuid "aaaaaaaa-1000-0000-0000-000000000011"}
                               {:id 2 :usuario_id #uuid "aaaaaaaa-1000-0000-0000-000000000012"}])
                  handlers/conexao-da-clinica (constantly {:id 1})
                  handlers/access-token-valido #(str "token-" (:id %))
                  api/listar-calendarios
                  (fn [token]
                    (swap! chamadas conj token)
                    (if (= token "token-2")
                      {:erro true :detalhe "falha medida"}
                      {:calendarios []}))]
      (let [resp (handlers/sincronizar-agendas-handler
                  {:identity {:clinica_id clinica}})]
        (is (= 502 (:status resp)))
        (is (= #{"token-1" "token-2"} (set @chamadas))
            "as N conexões precisam votar; uma linha arbitrária não representa a clínica")))))

(deftest sugestao-une-criadores-vistos-pelas-conexoes-da-clinica
  (let [clinica #uuid "bbbbbbbb-1000-0000-0000-000000000001"
        vinculo #uuid "bbbbbbbb-1000-0000-0000-000000000002"
        chamadas (atom [])]
    (with-redefs [db/execute-one!
                  (constantly {:id vinculo :google_calendar_id "agenda@google"
                               :nome_no_google "Agenda Ana"})
                  db/execute-query!
                  (fn [q]
                    (if (clojure.string/includes? (str (first q)) "google_conexao")
                      [{:id 1 :usuario_id #uuid "bbbbbbbb-1000-0000-0000-000000000011"}
                       {:id 2 :usuario_id #uuid "bbbbbbbb-1000-0000-0000-000000000012"}]
                      [{:id #uuid "bbbbbbbb-1000-0000-0000-000000000021"
                        :nome "Ana" :email "ana@local"}]))
                  handlers/access-token-valido #(str "token-" (:id %))
                  api/listar-eventos-recentes
                  (fn [token calendar-id & {:keys [quota-user]}]
                    (swap! chamadas conj [token calendar-id quota-user])
                    {:criadores #{(str token "@google.local")}})]
      (let [resp (handlers/sugerir-vinculo-handler
                  {:identity {:clinica_id clinica}
                   :params {:id (str vinculo)}})]
        (is (= 200 (:status resp)))
        (is (= #{"token-1" "token-2"} (set (map first @chamadas))))
        (is (= 2 (count @chamadas))
            "a sugestão não pode depender do token de uma psicóloga sorteada")))))

(def ativa {:status "ativa"})

(deftest status-da-psicologa-usa-apenas-a-identidade-e-a-regra-compartilhada
  (let [clinica #uuid "dddddddd-0000-0000-0000-000000000001"
        usuario #uuid "dddddddd-0000-0000-0000-000000000002"
        conexao {:status "ativa" :google_account_email "psi@google.local"}
        consultas (atom [])]
    (with-redefs [handlers/conexao-do-usuario
                  (fn [clinica-id usuario-id]
                    (is (= clinica clinica-id))
                    (is (= usuario usuario-id))
                    conexao)
                  db/execute-query!
                  (fn [query]
                    (swap! consultas conj query)
                    [{:status "orfao"}])
                  handlers/precisa-atencao?
                  (fn [recebida vinculos]
                    (is (= conexao recebida))
                    (is (= [{:status "orfao"}] vinculos))
                    :regra-compartilhada)]
      (let [resp (handlers/status-conexao-propria-handler
                  {:identity {:clinica_id clinica :user_id usuario}})]
        (is (= 200 (:status resp)))
        (is (= {:conectada true
                :status_conexao "ativa"
                :conta "psi@google.local"
                :agendas [{:status "orfao"}]
                :precisa_atencao :regra-compartilhada}
               (:body resp)))
        (is (= usuario (last (first @consultas)))
            "a consulta termina no user_id do JWT, não em um alvo do corpo")))))

(deftest painel-do-admin-nao-pode-calar-quando-uma-das-conexoes-quebra
  ;; 🔴 VERMELHO DELIBERADO — defeito que o GC-012 abriu na tela do GC-001a.
  ;;
  ;; Antes do GC-012 havia UMA conexão por clínica, e `conexao-da-clinica` fazia
  ;; `SELECT * FROM google_conexao WHERE clinica_id = ?` com `execute-one!`. Com
  ;; uma linha, "a primeira" e "a única" eram a mesma coisa.
  ;;
  ;; Agora há **uma por psicóloga**, e a consulta não tem `ORDER BY`: ela devolve
  ;; uma linha **arbitrária**. O `status-handler` do admin usa essa linha para
  ;; `conta`, `status_conexao`, `ultimo_erro` e — o que importa — para a metade de
  ;; conexão do `precisa_atencao`.
  ;;
  ;; ⚠️ Resultado: clínica com três psicólogas, uma com a conexão `invalida`. Se o
  ;; banco devolver uma das `ativa`, **a faixa não sobe**. A sincronização daquela
  ;; psicóloga morreu e o painel diz que está tudo bem.
  ;;
  ;; É a mesma família que a gente fechou duas vezes hoje (o `orfao` e o
  ;; fail-open), voltando por uma porta nova: não pela regra, e sim pelo **dado
  ;; que a regra recebe**. A regra continua certa; ela é chamada com uma amostra.
  ;;
  ;; 📌 Este teste afirma o mínimo defensável e nada além: **se QUALQUER conexão
  ;; da clínica estiver quebrada, o painel grita.** Como mostrar isso na tela — a
  ;; conta de quem, quantas — é decisão de produto, e está perguntada na 0137.
  ;; ⚠️ O stub é na CAMADA DE BANCO, não numa função de busca. A primeira versão
  ;; deste teste redefinia uma `conexoes-da-clinica` que só existiria depois do
  ;; conserto — ou seja, presumia a forma da correção antes de ela ser decidida.
  ;; Assim o teste descreve o mundo (três linhas na tabela) e deixa em aberto
  ;; COMO o handler vai olhá-las.
  (let [clinica #uuid "eeeeeeee-0000-0000-0000-000000000001"
        ;; A ordem imita o pior caso realista: o banco devolve primeiro uma sadia.
        conexoes [{:status "ativa"    :google_account_email "a@google.local"}
                  {:status "invalida" :google_account_email "b@google.local"}
                  {:status "ativa"    :google_account_email "c@google.local"}]
        sql-de (fn [q] (str (first q)))]
    (with-redefs [db/execute-one!
                  (fn [q]
                    (if (clojure.string/includes? (sql-de q) "google_conexao")
                      (first conexoes)   ; é isto que `execute-one!` faz: a primeira de N
                      nil))
                  db/execute-query!
                  (fn [q]
                    (if (clojure.string/includes? (sql-de q) "google_conexao")
                      conexoes
                      [{:status "ativo" :total 3}]))]
      (let [resp (handlers/status-handler {:identity {:clinica_id clinica}})]
        (is (= 200 (:status resp)))
        (is (= 3 (get-in resp [:body :conexoes_total])))
        (is (= 2 (get-in resp [:body :conexoes_ativas])))
        (is (= ["b@google.local"]
               (mapv :google_account_email
                     (get-in resp [:body :conexoes_com_problema]))))
        (is (true? (:precisa_atencao (:body resp)))
            (str "uma das conexões da clínica está `invalida` e o painel ficou mudo — "
                 "o handler olha UMA linha arbitrária de N, e a que ele sorteou estava sadia"))))))

(deftest conexao-quebrada-sempre-grita
  (testing "conexão inválida grita mesmo com todas as agendas saudáveis"
    (is (handlers/precisa-atencao? {:status "invalida"} [{:status "ativo"}])))

  (testing "conexão ativa e agendas saudáveis ficam quietas"
    (is (not (handlers/precisa-atencao? ativa [{:status "ativo"} {:status "pendente"}]))))

  (testing "clínica que nunca conectou não grita — não é falha, é ausência"
    (is (not (handlers/precisa-atencao? nil [])))))

(deftest agenda-quebrada-grita
  (testing "sem_acesso grita — descompartilhada no Google"
    (is (handlers/precisa-atencao? ativa [{:status "ativo"} {:status "sem_acesso"}])))

  ;; 🔴 ESTE É O ACHADO DA 0113.
  ;;
  ;; `orfao` é a agenda que sumiu da conta do Google. A tela marca os dois como
  ;; graves e escreve a frase para os dois — mas a faixa toda fica atrás de
  ;; `precisa_atencao`, e a regra só olhava `sem_acesso`.
  ;;
  ;; Resultado: clínica com conexão ativa e uma agenda apagada no Google ficava
  ;; com a faixa MUDA. As sessões param de chegar e a tela diz que está tudo bem
  ;; — que é a A-013 (tela que mente sobre falha) num terceiro endereço.
  (testing "orfao grita — a agenda foi apagada no Google e as sessões pararam"
    (is (handlers/precisa-atencao? ativa [{:status "ativo"} {:status "orfao"}])))

  (testing "os dois juntos gritam"
    (is (handlers/precisa-atencao? ativa [{:status "orfao"} {:status "sem_acesso"}]))))

(deftest status-inofensivos-nao-gritam
  ;; ⚠️ A guarda do outro lado, e ela importa tanto quanto: faixa que aparece
  ;; sem motivo é ignorada em duas semanas, e aí não serve nem quando o motivo
  ;; existe. `pausado` é escolha da clínica; `convite_pendente` é espera normal.
  (testing "pausado é decisão de alguém, não falha"
    (is (not (handlers/precisa-atencao? ativa [{:status "pausado"}]))))

  (testing "convite_pendente é espera normal"
    (is (not (handlers/precisa-atencao? ativa [{:status "convite_pendente"}]))))

  (testing "status conhecido e inofensivo continua mudo"
    (is (not (handlers/precisa-atencao? ativa [{:status "pendente"}])))))

(deftest status-que-ninguem-previu-grita
  ;; 🔴 VERMELHO DELIBERADO — e ele contradiz uma decisão da `orla`, de propósito.
  ;;
  ;; A versão anterior deste arquivo afirmava o contrário:
  ;;
  ;;     (testing "status desconhecido não grita sozinho"
  ;;       ;; Gritar por padrão faria todo status novo virar alarme
  ;;       (is (not (handlers/precisa-atencao? ativa [{:status "status_que_nao_existe"}]))))
  ;;
  ;; O argumento é real — fadiga de alarme existe. Mas ele não cobre o que
  ;; acabou de acontecer **neste mesmo commit**: a 0114 corrigiu um defeito que
  ;; era, exatamente, um status grave fora da lista de graves. Aquele teste
  ;; transformava esse modo de falha em comportamento **esperado**: o próximo
  ;; `orfao` some igual, e agora com um teste verde dizendo que está certo.
  ;;
  ;; ## As duas metades da mesma função discordavam
  ;;
  ;;   conexão -> (not= "ativa" status)          fail-CLOSED: novo status grita
  ;;   agendas -> (contains? #{graves} status)   fail-OPEN:   novo status silencia
  ;;
  ;; Mesma função, mesmo propósito, defaults opostos. Qualquer que seja o certo,
  ;; os dois lados têm que ser o mesmo.
  ;;
  ;; ## Por que fail-closed, e não é preferência
  ;;
  ;; As duas falhas não custam a mesma coisa:
  ;;
  ;;   alarme à toa  -> alguém vê, reclama, e o conserto é UMA entrada no
  ;;                    conjunto de benignos. Custa um dia e é barulhento.
  ;;   silêncio      -> ninguém vê. Descobre-se quando uma clínica perceber que
  ;;                    faz semanas que não chega sessão.
  ;;
  ;; É a mesma assimetria da A-013, e é a mesma escolha que a V-1 fez no
  ;; `middleware.ts` — deny-by-default. O preço daquela decisão foi a A-017, que
  ;; trancou o secretário fora de tudo: **descoberta em um dia, porque era alta**.
  ;;
  ;; ⚠️ E o vocabulário é FECHADO — a migration `20260811100200-google-integracao`
  ;; lista os seis. Quem inventa um sétimo está editando a migration; obrigá-lo a
  ;; declarar se ele é benigno é uma linha, e o esquecimento passa a ser alto em
  ;; vez de mudo.
  (testing "um status grave que ninguém previu não pode passar em silêncio"
    (is (handlers/precisa-atencao? ativa [{:status "ativo"} {:status "revogado_pelo_google"}])
        "status fora do vocabulário conhecido ficou mudo — é o mesmo buraco que engoliu o `orfao`"))

  (testing "e um erro de digitação no status também grita, em vez de sumir"
    (is (handlers/precisa-atencao? ativa [{:status "sem_aceso"}])
        "um typo em `sem_acesso` desligava a faixa sem nenhum sinal")))

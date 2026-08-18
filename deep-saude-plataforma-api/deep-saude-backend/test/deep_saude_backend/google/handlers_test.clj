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
            [deep-saude-backend.google.handlers :as handlers]))

(def ativa {:status "ativa"})

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

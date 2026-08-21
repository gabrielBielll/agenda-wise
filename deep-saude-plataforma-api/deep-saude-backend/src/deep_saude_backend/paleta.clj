(ns deep-saude-backend.paleta
  "GC-016 — a cor de cada estado da agenda, por clínica.

   ## A forma, e por que ela é assim

   **A cor é função de (estado, clínica).** Não existe coluna de cor no
   agendamento: são no máximo 5 linhas por clínica, e a tabela quente não muda.

   🔴 **A tabela guarda só o que foi ESCOLHIDO.** Quem nunca abriu a tela não tem
   linha, e a leitura mescla com o `dominio/paleta-padrao`. A ausência de linha
   **é** a informação *\"usa o padrão\"*.

   ⚠️ Isso é resposta direta à **A-026**: lá, `provisionar-clinica` não ligava
   `pagamento_automatico`, clínica nova nascia sem a configuração e ninguém sabia
   que a configuração existia. Se a paleta dependesse de o provisionamento
   lembrar de semear, o mesmo defeito voltaria com outra roupa. **Aqui não há o
   que lembrar** — nenhuma clínica pode estar sem paleta, porque o padrão não
   mora no banco.

   📌 **Voltar ao padrão é APAGAR a linha**, não gravar a cor padrão. Gravar
   deixaria a tabela dizendo que a clínica escolheu, e a diferença entre
   *\"escolheu o padrão\"* e *\"nunca escolheu\"* é justamente o que a tela precisa
   para saber o que mostrar como marcado.

   ## O que esta paleta NÃO faz

   🔴 **Ela não carrega o estado.** Medido em 2026-08-20 (§13 de
   `docs/GOOGLE_CORES_E_RECONCILIACAO.md`): das **462** formas de escolher 5
   cores entre as 11, **nenhuma** deixa os cinco estados distinguíveis por
   luminância — 14 pares colapsam no tema claro e 24 no escuro.

   Quem carrega o estado é o **glifo**, no `appointment-status.ts`. A cor carrega
   o reconhecimento (a convenção do Google). Por isso trocar a paleta é seguro:
   **não existe escolha que quebre a leitura**, porque a leitura nunca dependeu
   da cor."
  (:require [clojure.string :as str]
            [deep-saude-backend.db :refer [execute-query! execute-one!]]
            [deep-saude-backend.dominio :as dominio]
            [taoensso.timbre :as log]))

(defn paleta-da-clinica
  "A paleta efetiva: o padrão, com as escolhas da clínica por cima.

   Devolve sempre os cinco estados — nunca um mapa parcial. Uma tela que
   recebesse mapa parcial teria de inventar o resto, e cada tela inventaria de um
   jeito, que é como `status_repasse` acabou com cinco valores de três
   vocabulários."
  [clinica-id]
  (let [escolhidas (into {} (map (juxt :estado :cor))
                        (execute-query!
                         ["SELECT estado, cor FROM paleta_clinica WHERE clinica_id = ?"
                          clinica-id]))]
    (merge dominio/paleta-padrao escolhidas)))

(defn- validar
  "nil quando está tudo certo; a mensagem para o 422 quando não está."
  [estado cor]
  (or (when-not (contains? dominio/status-sessao estado)
        (str "Estado inválido: '" estado "'. Aceitos: "
             (str/join ", " (sort dominio/status-sessao)) "."))
      (dominio/valor-invalido :cor cor)))

(defn definir-cor!
  "Grava a escolha da clínica para um estado. Upsert: escolher de novo troca.

   ⚠️ A validação é do servidor, e não do cliente. O `CHECK` da migration é a
   rede embaixo — ele protege escrita que não passe por aqui, mas quem devolve
   mensagem legível é esta função."
  [clinica-id estado cor]
  (if-let [erro (validar estado cor)]
    {:erro erro}
    (do
      (execute-one!
       ["INSERT INTO paleta_clinica (clinica_id, estado, cor)
              VALUES (?, ?, ?)
         ON CONFLICT (clinica_id, estado)
         DO UPDATE SET cor = EXCLUDED.cor, definida_em = now()"
        clinica-id estado cor])
      (log/with-context {:estado estado :cor cor}
        (log/info "paleta_cor_definida"))
      {:ok true})))

(defn voltar-ao-padrao!
  "Apaga a escolha da clínica para um estado — volta ao Padrão Deep Saúde.

   📌 Apagar, e não gravar a cor padrão: ver a docstring do namespace."
  [clinica-id estado]
  (if-let [erro (when-not (contains? dominio/status-sessao estado)
                  (str "Estado inválido: '" estado "'."))]
    {:erro erro}
    (do
      (execute-one! ["DELETE FROM paleta_clinica WHERE clinica_id = ? AND estado = ?"
                     clinica-id estado])
      {:ok true})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Handlers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn escolhas-da-clinica
  "Só o que a clínica ESCOLHEU — sem a mescla com o padrão.

   🔴 Isto não é o mesmo que `paleta-da-clinica`, e a diferença importa na tela.
   A agenda pinta com os tokens da plataforma quando a clínica não escolheu nada,
   e com a cor do Google quando escolheu. Sem saber **quais** foram escolhidas, o
   front teria de adivinhar comparando com o padrão — e comparar por valor erra
   no caso em que a clínica escolhe, de propósito, a mesma cor do padrão."
  [clinica-id]
  (into {} (map (juxt :estado :cor))
        (execute-query!
         ["SELECT estado, cor FROM paleta_clinica WHERE clinica_id = ?" clinica-id])))

(defn listar-handler
  "A paleta efetiva, o que foi escolhido, o catálogo e o padrão.

   Os quatro de uma vez para a tela não duplicar nenhum — vocabulário duplicado é
   como `status_repasse` acabou com cinco valores vindos de três lugares."
  [request]
  (let [clinica-id (get-in request [:identity :clinica_id])]
    {:status 200
     :body {:paleta     (paleta-da-clinica clinica-id)
            :escolhidas (escolhas-da-clinica clinica-id)
            :cores      (vec (sort dominio/cores-agenda))
            :padrao     dominio/paleta-padrao}}))

(defn definir-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        {:keys [estado cor]} (:body request)
        resultado (definir-cor! clinica-id estado cor)]
    (if-let [erro (:erro resultado)]
      {:status 422 :body {:erro erro}}
      {:status 200 :body {:paleta (paleta-da-clinica clinica-id)}})))

(defn voltar-ao-padrao-handler [request]
  (let [clinica-id (get-in request [:identity :clinica_id])
        estado (get-in request [:params :estado])
        resultado (voltar-ao-padrao! clinica-id estado)]
    (if-let [erro (:erro resultado)]
      {:status 422 :body {:erro erro}}
      {:status 200 :body {:paleta (paleta-da-clinica clinica-id)}})))

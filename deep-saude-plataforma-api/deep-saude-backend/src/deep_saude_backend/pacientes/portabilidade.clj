(ns deep-saude-backend.pacientes.portabilidade
  "Exportação e importação segura do cadastro de pacientes.

   O módulo nunca executa SQL recebido. O formato SQL de exportação traz um
   envelope JSON identificado pelo formato (não é assinatura criptográfica) que a interface lê e
   converte em registros; a API recebe somente mapas já parseados e aplica sua
   própria validação antes de tocar no banco.

   Prontuários e sessões não entram aqui. Eles têm regras de sigilo, autoria e
   imutabilidade próprias; misturá-los a um importador de cadastro permitiria
   fabricar histórico clínico em massa."
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [deep-saude-backend.db :as db]
            [deep-saude-backend.dominio :as dominio]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [next.jdbc.sql :as sql]
            [taoensso.timbre :as log])
  (:import (java.nio.charset StandardCharsets)
           (java.time Instant)
           (java.util Base64 UUID)))

(def ^:private schema-portabilidade "agenda-wise/pacientes@1")
(def ^:private max-registros-por-lote 100)

(def ^:private campos-portateis
  [:agenda_wise_id :nome :email :telefone :data_nascimento :endereco
   :avatar_url :psicologo_email :historico_familiar :uso_medicamentos
   :diagnostico :contatos_emergencia :status :nota_fiscal :origem
   :vencimento_pagamento :tipo_pagamento])

(def ^:private campos-do-banco
  [:nome :email :telefone :data_nascimento :endereco :avatar_url
   :historico_familiar :uso_medicamentos :diagnostico :contatos_emergencia
   :status :nota_fiscal :origem :vencimento_pagamento :tipo_pagamento])

(def ^:private limites-de-texto
  {:nome 255 :email 255 :telefone 50 :data_nascimento 10 :endereco 10000
   :avatar_url 4000 :psicologo_email 255 :historico_familiar 20000
   :uso_medicamentos 20000 :diagnostico 20000 :contatos_emergencia 10000
   :status 10 :origem 50 :vencimento_pagamento 100 :tipo_pagamento 20})

(defn- valor-textual [valor]
  (cond
    (nil? valor) ""
    (instance? java.time.temporal.TemporalAccessor valor) (str valor)
    :else (str valor)))

(defn- paciente-portatil [paciente]
  (array-map
   :agenda_wise_id (some-> (:id paciente) str)
   :nome (:nome paciente)
   :email (:email paciente)
   :telefone (:telefone paciente)
   :data_nascimento (some-> (:data_nascimento paciente) str)
   :endereco (:endereco paciente)
   :avatar_url (:avatar_url paciente)
   :psicologo_email (:psicologo_email paciente)
   :historico_familiar (:historico_familiar paciente)
   :uso_medicamentos (:uso_medicamentos paciente)
   :diagnostico (:diagnostico paciente)
   :contatos_emergencia (:contatos_emergencia paciente)
   :status (:status paciente)
   :nota_fiscal (boolean (:nota_fiscal paciente))
   :origem (:origem paciente)
   :vencimento_pagamento (:vencimento_pagamento paciente)
   :tipo_pagamento (:tipo_pagamento paciente)))

(defn- pacientes-visiveis [identity]
  (let [clinica-id (:clinica_id identity)
        usuario-id (:user_id identity)
        papel (:role identity)
        base "SELECT p.*, u.email AS psicologo_email
                FROM pacientes p
                LEFT JOIN usuarios u ON u.id = p.psicologo_id
               WHERE p.clinica_id = ?"]
    (if (or (= papel "admin_clinica") (= papel "secretario"))
      (db/execute-query! [(str base " ORDER BY lower(p.nome), p.id") clinica-id])
      (db/execute-query! [(str base " AND p.psicologo_id = ? ORDER BY lower(p.nome), p.id")
                          clinica-id usuario-id]))))

(defn- proteger-formula-de-planilha [valor]
  ;; CSV costuma ser aberto no Excel/Sheets. Uma célula iniciada por =, +, - ou
  ;; @ pode virar fórmula e executar uma URL/comando ao abrir. JSON e SQL
  ;; preservam o valor exato; o CSV ganha apóstrofo de segurança, removido pelo
  ;; importador da própria AgendaWise.
  (let [texto (valor-textual valor)]
    (if (re-find #"^[=+\-@]" texto) (str "'" texto) texto)))

(defn- escapar-csv [valor]
  (str "\"" (str/replace (proteger-formula-de-planilha valor) "\"" "\"\"") "\""))

(defn- csv [pacientes]
  (let [cabecalho (str/join "," (map name campos-portateis))
        linhas (map (fn [paciente]
                      (str/join "," (map #(escapar-csv (get paciente %)) campos-portateis)))
                    pacientes)]
    ;; BOM deixa acentos legíveis no Excel sem exigir escolha manual de UTF-8.
    (str "\uFEFF" cabecalho "\r\n" (str/join "\r\n" linhas) (when (seq linhas) "\r\n"))))

(defn- sql-literal [valor]
  (cond
    (nil? valor) "NULL"
    (true? valor) "TRUE"
    (false? valor) "FALSE"
    :else (str "'" (str/replace (str valor) "'" "''") "'")))

(defn- sql-portatil [pacientes envelope-json]
  (let [marcador (.encodeToString (Base64/getEncoder)
                                  (.getBytes envelope-json StandardCharsets/UTF_8))
        colunas [:id :clinica_id :nome :email :telefone :data_nascimento :endereco
                 :avatar_url :psicologo_id :historico_familiar :uso_medicamentos
                 :diagnostico :contatos_emergencia :status :nota_fiscal :origem
                 :vencimento_pagamento :tipo_pagamento]
        linhas (map
                (fn [paciente]
                  (let [valores (map #(sql-literal (get paciente %)) colunas)]
                    (str "INSERT INTO pacientes (" (str/join ", " (map name colunas)) ")\n"
                         "VALUES (" (str/join ", " valores) ")\n"
                         "ON CONFLICT (id) DO NOTHING;")))
                pacientes)]
    (str "-- AgendaWise — backup de pacientes\n"
         "-- Contém dados pessoais e clínicos. Guarde em local protegido.\n"
         "-- AGENDAWISE_PORTABLE_JSON_BASE64 " marcador "\n"
         "BEGIN;\n\n"
         (str/join "\n\n" linhas)
         (when (seq linhas) "\n\n")
         "COMMIT;\n")))

(defn exportar-handler [request]
  (let [formato (some-> (or (get-in request [:params :formato])
                            (get-in request [:query-params "formato"]))
                        str/lower-case)
        permitidos #{"csv" "json" "sql"}]
    (if-not (contains? permitidos formato)
      {:status 422
       :body {:erro "Escolha um formato válido: csv, json ou sql."
              :code "patient_export_format_invalid"}}
      (let [brutos (pacientes-visiveis (:identity request))
            portateis (mapv paciente-portatil brutos)
            envelope (array-map :schema schema-portabilidade
                                :exportado_em (str (Instant/now))
                                :quantidade (count portateis)
                                :pacientes portateis)
            envelope-json (json/generate-string envelope {:pretty true})
            conteudo (case formato
                       "csv" (csv portateis)
                       "json" envelope-json
                       "sql" (sql-portatil brutos envelope-json))
            mime (case formato
                   "csv" "text/csv; charset=utf-8"
                   "json" "application/json; charset=utf-8"
                   "sql" "application/sql; charset=utf-8")
            data (str (java.time.LocalDate/now))
            nome-arquivo (str "agenda-wise-pacientes-" data "." formato)]
        (log/with-context {:auditoria "exportacao_pacientes"
                           :clinica_id (str (get-in request [:identity :clinica_id]))
                           :usuario_id (str (get-in request [:identity :user_id]))
                           :formato formato
                           :quantidade (count portateis)}
          (log/info "patient_export_completed"))
        {:status 200
         :headers {"Content-Type" mime
                   "Content-Disposition" (str "attachment; filename=\"" nome-arquivo "\"")
                   "Cache-Control" "no-store"
                   "X-Content-Type-Options" "nosniff"}
         :body conteudo}))))

(defn- texto-normalizado [valor _limite]
  (when (some? valor)
    (let [texto (str/trim (str valor))]
      (when-not (str/blank? texto)
        texto))))

(defn- uuid-seguro [valor]
  (when-let [texto (texto-normalizado valor 100)]
    (try (UUID/fromString texto) (catch IllegalArgumentException _ nil))))

(defn- booleano-seguro [valor]
  (cond
    (or (true? valor) (false? valor)) valor
    (nil? valor) nil
    (contains? #{"true" "1" "sim" "yes"} (str/lower-case (str/trim (str valor)))) true
    (contains? #{"false" "0" "nao" "não" "no"} (str/lower-case (str/trim (str valor)))) false
    :else ::invalido))

(defn- normalizar-registro [indice registro]
  (let [linha (or (:linha_arquivo registro) (+ indice 2))
        nome (texto-normalizado (:nome registro) 255)
        email (some-> (texto-normalizado (:email registro) 255) str/lower-case)
        data-texto (texto-normalizado (:data_nascimento registro) 10)
        data (try (dominio/data-de-formulario data-texto)
                  (catch IllegalArgumentException _ ::invalida))
        status (or (some-> (texto-normalizado (:status registro) 10) str/lower-case) "ativo")
        nota-fiscal (booleano-seguro (:nota_fiscal registro))
        id-texto (or (:agenda_wise_id registro) (:id registro))
        id-origem (uuid-seguro id-texto)
        erros-tamanho (keep (fn [[campo limite]]
                              (when (and (contains? registro campo)
                                         (> (count (str (get registro campo))) limite))
                                {:linha linha :campo (name campo)
                                 :erro (str "Use no máximo " limite " caracteres.")}))
                            limites-de-texto)
        psicologo-email (some-> (texto-normalizado (:psicologo_email registro) 255) str/lower-case)
        erros (cond-> (vec erros-tamanho)
                (str/blank? nome)
                (conj {:linha linha :campo "nome" :erro "Nome é obrigatório."})
                (and email (not (re-matches #"^[^\s@]+@[^\s@]+\.[^\s@]+$" email)))
                (conj {:linha linha :campo "email" :erro "E-mail inválido."})
                (and psicologo-email (not (re-matches #"^[^\s@]+@[^\s@]+\.[^\s@]+$" psicologo-email)))
                (conj {:linha linha :campo "psicologo_email" :erro "E-mail da psicóloga inválido."})
                (= data ::invalida)
                (conj {:linha linha :campo "data_nascimento" :erro "Use uma data válida no formato AAAA-MM-DD."})
                (not (contains? #{"ativo" "inativo"} status))
                (conj {:linha linha :campo "status" :erro "Status deve ser ativo ou inativo."})
                (= nota-fiscal ::invalido)
                (conj {:linha linha :campo "nota_fiscal" :erro "Use sim/não ou true/false."})
                (and (some? id-texto) (nil? id-origem))
                (conj {:linha linha :campo "agenda_wise_id" :erro "Identificador AgendaWise inválido."}))
        dados-base {:nome nome
                    :email email
                    :telefone (texto-normalizado (:telefone registro) 50)
                    :data_nascimento (when-not (= data ::invalida) data)
                    :endereco (texto-normalizado (:endereco registro) 10000)
                    :avatar_url (texto-normalizado (:avatar_url registro) 4000)
                    :historico_familiar (texto-normalizado (:historico_familiar registro) 20000)
                    :uso_medicamentos (texto-normalizado (:uso_medicamentos registro) 20000)
                    :diagnostico (texto-normalizado (:diagnostico registro) 20000)
                    :contatos_emergencia (texto-normalizado (:contatos_emergencia registro) 10000)
                    :status status
                    :nota_fiscal (when-not (= nota-fiscal ::invalido) nota-fiscal)
                    :origem (texto-normalizado (:origem registro) 50)
                    :vencimento_pagamento (texto-normalizado (:vencimento_pagamento registro) 100)
                    :tipo_pagamento (texto-normalizado (:tipo_pagamento registro) 20)}
        ;; Não apagar campos de um cadastro existente quando uma planilha
        ;; parcial não trouxe a coluna. Nome e status são sempre materializados
        ;; porque têm default/obrigatoriedade no contrato.
        presentes (conj (set (filter #(contains? registro %) campos-do-banco)) :nome)
        dados (select-keys dados-base presentes)]
    {:linha linha
     :id-origem id-origem
     :email email
     :psicologo-email psicologo-email
     :dados dados
     :erros erros}))

(defn- contexto-do-lote [tx clinica-id]
  {:psicologos (into {}
                     (keep (fn [{:keys [email id]}]
                             (when email [(str/lower-case email) id])))
                     (jdbc/execute! tx
                                    ["SELECT u.id, u.email
                                        FROM usuarios u
                                        JOIN papeis p ON p.id = u.papel_id
                                       WHERE u.clinica_id = ? AND p.nome_papel = 'psicologo'"
                                     clinica-id]
                                    {:builder-fn rs/as-unqualified-lower-maps}))
   :pacientes (jdbc/execute! tx
                             ["SELECT id, email, psicologo_id FROM pacientes WHERE clinica_id = ?"
                              clinica-id]
                             {:builder-fn rs/as-unqualified-lower-maps})})

(defn- planejar-lote [tx identidade registros estrategia]
  (let [clinica-id (:clinica_id identidade)
        usuario-id (:user_id identidade)
        papel (:role identidade)
        {:keys [psicologos pacientes]} (contexto-do-lote tx clinica-id)
        por-id (into {} (map (juxt :id clojure.core/identity) pacientes))
        por-email (into {}
                        (keep (fn [p]
                                (when-let [email (:email p)]
                                  [(str/lower-case email) p]))
                              pacientes))]
    (reduce
     (fn [{:keys [vistos] :as estado} registro]
       (let [chaves (cond-> []
                      (:id-origem registro) (conj (str "id:" (:id-origem registro)))
                      (:email registro) (conj (str "email:" (:email registro))))
             repetido? (some #(contains? vistos %) chaves)
             existente-por-id (get por-id (:id-origem registro))
             existente-por-email (get por-email (:email registro))
             referencias-divergentes? (and existente-por-id existente-por-email
                                          (not= (:id existente-por-id) (:id existente-por-email)))
             existente (or existente-por-id existente-por-email)
             proprio? (or (not= papel "psicologo")
                          (nil? existente)
                          (= usuario-id (:psicologo_id existente)))
             email-psi (:psicologo-email registro)
             psicologo-id (if (= papel "psicologo")
                            usuario-id
                            (get psicologos email-psi))
             erro (cond
                    repetido?
                    {:linha (:linha registro) :campo "email" :erro "Registro repetido no mesmo arquivo."}
                    referencias-divergentes?
                    {:linha (:linha registro) :campo "agenda_wise_id" :erro "O identificador e o e-mail apontam para pacientes diferentes."}
                    (not proprio?)
                    {:linha (:linha registro) :campo "email" :erro "Este paciente já pertence a outro profissional da clínica."}
                    (and email-psi (nil? psicologo-id))
                    {:linha (:linha registro) :campo "psicologo_email" :erro "Psicóloga não encontrada nesta clínica."}
                    :else nil)
             acao (cond
                    erro nil
                    (and existente (= estrategia "ignorar_existentes")) :ignorar
                    existente :atualizar
                    :else :criar)
             dados (cond-> (:dados registro)
                     (= acao :criar) (assoc :clinica_id clinica-id)
                     (and (= acao :criar) (not (contains? (:dados registro) :status))) (assoc :status "ativo")
                     (or (= papel "psicologo") email-psi) (assoc :psicologo_id psicologo-id))]
         (cond-> (-> estado
                     (update :vistos into chaves))
           erro (update :erros conj erro)
           acao (update :planos conj {:acao acao :existente existente :dados dados}))))
     {:vistos #{} :erros [] :planos []}
     registros)))

(defn- contagens [planos]
  {:novos (count (filter #(= :criar (:acao %)) planos))
   :atualizaveis (count (filter #(= :atualizar (:acao %)) planos))
   :ignorados (count (filter #(= :ignorar (:acao %)) planos))})

(defn importar-handler [request]
  (let [registros-brutos (get-in request [:body :registros])
        estrategia (or (get-in request [:body :estrategia]) "ignorar_existentes")
        validar-apenas? (true? (get-in request [:body :validar_apenas]))]
    (cond
      (not (vector? registros-brutos))
      {:status 422 :body {:erro "Envie registros como uma lista JSON."
                          :code "patient_import_records_required"}}

      (empty? registros-brutos)
      {:status 422 :body {:erro "O lote de importação está vazio."
                          :code "patient_import_empty"}}

      (> (count registros-brutos) max-registros-por-lote)
      {:status 413 :body {:erro (str "Envie no máximo " max-registros-por-lote " pacientes por lote.")
                          :code "patient_import_batch_too_large"
                          :limite max-registros-por-lote}}

      (not (contains? #{"ignorar_existentes" "atualizar_existentes"} estrategia))
      {:status 422 :body {:erro "Estratégia de importação inválida."
                          :code "patient_import_strategy_invalid"}}

      :else
      (let [normalizados (mapv normalizar-registro (range) registros-brutos)
            erros-locais (vec (mapcat :erros normalizados))]
        (if (seq erros-locais)
          {:status 422 :body {:erro "Há registros que precisam ser corrigidos."
                              :code "patient_import_validation_failed"
                              :erros erros-locais}}
          (try
            (jdbc/with-transaction [tx @db/datasource]
              (let [{:keys [erros planos]} (planejar-lote tx (:identity request) normalizados estrategia)
                    resumo (contagens planos)]
                (if (seq erros)
                  {:status 422 :body (merge {:erro "Há conflitos que precisam ser corrigidos."
                                             :code "patient_import_conflict"
                                             :erros erros}
                                            resumo)}
                  (do
                    (when-not validar-apenas?
                      (doseq [{:keys [acao existente dados]} planos]
                        (case acao
                          :criar (sql/insert! tx :pacientes dados)
                          :atualizar (sql/update! tx :pacientes dados
                                                  {:id (:id existente)
                                                   :clinica_id (get-in request [:identity :clinica_id])})
                          :ignorar nil)))
                    (log/with-context {:auditoria (if validar-apenas?
                                                   "pre_validacao_importacao_pacientes"
                                                   "importacao_pacientes")
                                       :clinica_id (str (get-in request [:identity :clinica_id]))
                                       :usuario_id (str (get-in request [:identity :user_id]))
                                       :quantidade (count planos)
                                       :novos (:novos resumo)
                                       :atualizaveis (:atualizaveis resumo)
                                       :ignorados (:ignorados resumo)}
                      (log/info "patient_import_batch_processed"))
                    {:status 200
                     :body (merge {:valido true
                                   :validar_apenas validar-apenas?
                                   :processados (count planos)}
                                  resumo)}))))
            (catch java.sql.SQLException e
              (log/error e "patient_import_database_failed")
              {:status 409
               :body {:erro "A base mudou durante a importação. Revise a prévia e tente novamente."
                      :code "patient_import_concurrent_change"}})))))))

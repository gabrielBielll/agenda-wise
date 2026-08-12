;; Verificador estático de referências entre namespaces do projeto.
;;
;; Não dá para carregar os namespaces que dependem do Clojars neste ambiente,
;; então este script lê o código-fonte: coleta o que cada namespace DEFINE e o
;; que cada namespace CHAMA via alias, e cruza os dois. Pega exatamente a classe
;; de erro que edições de texto introduzem — nome errado, alias errado, número
;; de argumentos errado.
(require '[clojure.java.io :as io] '[clojure.string :as str])

(defn formas [arquivo]
  (with-open [r (java.io.PushbackReader. (io/reader arquivo))]
    (let [eof (Object.)]
      (loop [acc []]
        (let [f (read {:eof eof :read-cond :allow} r)]
          (if (identical? f eof) acc (recur (conj acc f))))))))

(defn arglist-count [args]
  (if (some #{'&} args) :variadica (count args)))

(defn definicoes
  "Nome -> conjunto de aridades (ou #{:variadica}) para cada defn/def do arquivo."
  [fs]
  (into {}
        (for [f fs
              :when (and (seq? f) (contains? '#{defn defn- def defonce} (first f)))]
          (let [nome (second f)]
            (if (contains? '#{def defonce} (first f))
              [nome :valor]
              (let [corpo (drop 2 f)
                    corpo (if (string? (first corpo)) (rest corpo) corpo)   ;; docstring
                    corpo (if (map? (first corpo)) (rest corpo) corpo)      ;; metadata
                    prim (first corpo)]
                [nome (cond
                        (vector? prim) #{(arglist-count prim)}
                        (seq? prim) (set (keep #(when (and (seq? %) (vector? (first %)))
                                                  (arglist-count (first %)))
                                               corpo))
                        :else :desconhecida)]))))))

(defn aliases
  "Alias -> namespace, a partir do :require do ns."
  [fs]
  (let [ns-form (first (filter #(and (seq? %) (= 'ns (first %))) fs))
        reqs (->> ns-form (filter seq?) (filter #(= :require (first %))) first rest)]
    (into {} (for [r reqs
                   :when (vector? r)
                   :let [[nom & opts] r
                         o (apply hash-map opts)]
                   :when (:as o)]
               [(:as o) nom]))))

(def arquivos (->> (concat (file-seq (io/file "src")) (file-seq (io/file "test")))
                   (filter #(.endsWith (.getName %) ".clj"))
                   (map str) sort))

(def por-arquivo (into {} (for [a arquivos] [a (formas a)])))

(def ns-de-arquivo
  (into {} (for [[a fs] por-arquivo
                 :let [n (some #(when (and (seq? %) (= 'ns (first %))) (second %)) fs)]
                 :when n]
             [a n])))

(def defs-por-ns
  (into {} (for [[a fs] por-arquivo :when (ns-de-arquivo a)]
             [(ns-de-arquivo a) (definicoes fs)])))

(def problemas (atom []))

(defn anda [f visitar]
  (when (coll? f)
    (when (seq? f) (visitar f))
    (doseq [x (if (map? f) (mapcat identity f) f)] (anda x visitar))))

(doseq [[arquivo fs] por-arquivo
        :let [al (aliases fs)]]
  (doseq [f fs]
    (anda f
      (fn [forma]
        (let [h (first forma)]
          (when (and (symbol? h) (namespace h))
            (when-let [alvo-ns (get al (symbol (namespace h)))]
              (when-let [alvo-defs (get defs-por-ns alvo-ns)]
                (let [nome (symbol (name h))
                      aridades (get alvo-defs nome ::ausente)
                      n-args (dec (count forma))]
                  (cond
                    (= ::ausente aridades)
                    (swap! problemas conj
                           (format "%s: %s/%s não existe em %s" arquivo (namespace h) nome alvo-ns))

                    (and (set? aridades)
                         (not (contains? aridades n-args))
                         (not (contains? aridades :variadica)))
                    (swap! problemas conj
                           (format "%s: %s chamado com %d args; aceita %s"
                                   arquivo h n-args (sort (filter number? aridades))))))))))))))

;; Símbolos usados como valor (não em posição de chamada) também precisam existir
(doseq [[arquivo fs] por-arquivo
        :let [al (aliases fs)]]
  (anda fs (fn [_] nil))
  (let [usados (atom #{})]
    (anda fs (fn [forma] (doseq [x forma :when (and (symbol? x) (namespace x))] (swap! usados conj x))))
    (doseq [s @usados
            :let [alvo-ns (get al (symbol (namespace s)))]
            :when (and alvo-ns (get defs-por-ns alvo-ns))]
      (when (= ::ausente (get (get defs-por-ns alvo-ns) (symbol (name s)) ::ausente))
        (swap! problemas conj (format "%s: %s não existe em %s" arquivo s alvo-ns))))))

(let [ps (distinct @problemas)]
  (if (seq ps)
    (do (println "PROBLEMAS ENCONTRADOS:") (doseq [p ps] (println "  " p)) (System/exit 1))
    (do (println "Todas as referências entre namespaces do projeto resolvem, com aridade compatível.")
        (println (count arquivos) "arquivos,"
                 (reduce + (map (comp count val) defs-por-ns)) "definições."))))

(ns deep-saude-backend.limites
  "Rate limiting e limite de payload.

   Sem limite de tentativas, o login é força bruta livre: a senha de qualquer
   conta é só uma questão de tempo e banda. E sem limite de corpo, um POST
   grande o suficiente derruba a instância antes de qualquer handler rodar.

   Implementação em memória, de propósito: resolve o caso real (uma instância,
   ataque de uma origem) sem introduzir Redis. ⚠️ A contrapartida é que o
   contador é POR INSTÂNCIA — ao escalar horizontalmente, o limite efetivo
   multiplica pelo número de instâncias. Quando isso importar, o lugar de
   trocar é aqui, e só aqui."
  (:require [clojure.string :as str]
            [taoensso.timbre :as log]))

;; chave -> {:janela-inicio millis :tentativas n}
(defonce ^:private contadores (atom {}))

(defn- agora [] (System/currentTimeMillis))

(defn- limpar-antigos!
  "Remove janelas vencidas para o mapa não crescer indefinidamente com IPs que
   apareceram uma vez."
  [estado t janela-ms]
  (into {} (remove (fn [[_ v]] (> (- t (:janela-inicio v)) janela-ms)) estado)))

(defn registrar!
  "Registra uma tentativa. Devolve {:permitido? bool :restantes n :espera-s n}."
  [chave {:keys [max-tentativas janela-ms]}]
  (let [t (agora)
        novo (swap! contadores
                    (fn [estado]
                      (let [estado (if (> (count estado) 10000)
                                     (limpar-antigos! estado t janela-ms)
                                     estado)
                            atual (get estado chave)]
                        (if (or (nil? atual) (> (- t (:janela-inicio atual)) janela-ms))
                          (assoc estado chave {:janela-inicio t :tentativas 1})
                          (update-in estado [chave :tentativas] inc)))))
        {:keys [janela-inicio tentativas]} (get novo chave)]
    {:permitido? (<= tentativas max-tentativas)
     :restantes  (max 0 (- max-tentativas tentativas))
     :espera-s   (max 0 (int (/ (- janela-ms (- t janela-inicio)) 1000)))}))

(defn liberar!
  "Zera o contador de uma chave. Chamado em login bem-sucedido: quem acertou a
   senha não deve ficar preso pelo contador das tentativas anteriores."
  [chave]
  (swap! contadores dissoc chave))

(defn ip-do-request
  "IP de origem. Considera X-Forwarded-For porque em produção a aplicação fica
   atrás de proxy/CDN e o remote-addr seria sempre o do proxy.

   ⚠️ X-Forwarded-For é forjável por quem fala direto com a aplicação. Serve
   para limitar tráfego normal, não para bloquear um atacante determinado —
   para isso o lugar é a borda (WAF/CDN)."
  [request]
  (or (some-> (get-in request [:headers "x-forwarded-for"])
              (str/split #",")
              first
              str/trim
              not-empty)
      (:remote-addr request)
      "desconhecido"))

(defn wrap-rate-limit
  "Limita requisições por IP (mais um sufixo opcional, ex.: o e-mail tentado)."
  [handler {:keys [max-tentativas janela-ms nome chave-extra]
            :or {max-tentativas 10 janela-ms 60000 nome "endpoint"}}]
  (fn [request]
    (let [chave (str nome ":" (ip-do-request request)
                     (when chave-extra (str ":" (chave-extra request))))
          {:keys [permitido? espera-s]} (registrar! chave {:max-tentativas max-tentativas
                                                           :janela-ms janela-ms})]
      (if permitido?
        (handler request)
        (do
          (log/with-context {:endpoint nome}
            (log/warn "rate_limit_blocked"))
          {:status 429
           :headers {"Retry-After" (str espera-s)}
           :body {:erro "Muitas tentativas. Tente novamente em instantes."
                  :code "rate_limited"
                  :retry_after_s espera-s}})))))

(def ^:const tamanho-maximo-padrao (* 256 1024)) ;; 256 KB

(defn- input-stream-limitado
  "Envolve `in` para abortar a leitura assim que ela passar de `maximo` bytes.

   🔴 O corte tem que ser na LEITURA, não só no header. `Content-Length` é o
   atalho quando existe — mas com `Transfer-Encoding: chunked` ele não existe, e
   aí a única defesa é contar o que já foi lido. Sem isto, um corpo em chunks
   passava inteiro para o parser de JSON e era desserializado na memória — na
   rota de login, pública e sem auth, um POST derruba a instância."
  ^java.io.InputStream [^java.io.InputStream in ^long maximo]
  (let [lidos (java.util.concurrent.atomic.AtomicLong. 0)
        estourou! (fn []
                    (throw (ex-info "Corpo da requisição excede o limite permitido."
                                    {::payload-excedido true})))]
    (proxy [java.io.FilterInputStream] [in]
      (read
        ([]
         (let [b (proxy-super read)]
           (when (and (not= b -1) (> (.incrementAndGet lidos) maximo)) (estourou!))
           b))
        ([buf off len]
         (let [n (proxy-super read buf off len)]
           (when (and (pos? n) (> (.addAndGet lidos (long n)) maximo)) (estourou!))
           n))))))

(defn wrap-limite-payload
  "Recusa corpos acima do limite antes de gastar memória interpretando-os.

   Duas linhas de defesa, porque uma só não fecha:
   1. `Content-Length`, quando declarado e já grande, é recusado de imediato —
      é o atalho barato.
   2. o `:body` é envolvido num InputStream que aborta ao passar do limite na
      LEITURA. É o que pega `Transfer-Encoding: chunked`, onde não há header
      para inspecionar. O estouro vira 413 aqui mesmo, não um 500 do parser.

   Vem antes do `wrap-json-body` de propósito: é ele que lê o corpo, e é a leitura
   dele que o InputStream acima interrompe."
  ([handler] (wrap-limite-payload handler tamanho-maximo-padrao))
  ([handler maximo]
   (fn [request]
     ;; Header malformado não pode derrubar a requisição: quem controla o
     ;; header é o cliente, então `Long/parseLong` cru vira um jeito trivial de
     ;; provocar 500. Ilegível é tratado como ausente — e aí a linha 2 protege.
     (let [declarado (try
                       (some-> (get-in request [:headers "content-length"])
                               (Long/parseLong))
                       (catch NumberFormatException _ nil))
           resposta-413 {:status 413
                         :body {:erro "Corpo da requisição excede o limite permitido."
                                :code "payload_muito_grande"
                                :limite_bytes maximo}}]
       (if (and declarado (> declarado maximo))
         resposta-413
         (let [request' (if-let [body (:body request)]
                          (assoc request :body (input-stream-limitado body maximo))
                          request)]
           (try
             (handler request')
             (catch clojure.lang.ExceptionInfo e
               (if (::payload-excedido (ex-data e))
                 resposta-413
                 (throw e))))))))))

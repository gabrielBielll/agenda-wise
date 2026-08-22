(ns deep-saude-backend.email
  "Ponto de extensão de envio de e-mail transacional.

   Existe por causa da recuperação de senha: o handler precisa mandar um e-mail
   com o link de redefinição, mas o provedor real (Resend, SMTP, ...) ainda não
   está plugado. Este namespace é o encaixe — dormant-but-ready, o mesmo padrão
   da integração com o Google: o código já chama `enviar-email!`, e no dia em que
   a credencial existir no ambiente o envio passa a acontecer sem tocar em quem
   chama.

   🔴 NENHUMA credencial mora aqui. Ela é LIDA do ambiente na hora do uso, nunca
   escrita no código, nunca logada. Ver o bloco marcado dentro de `enviar-email!`
   — é ali, e só ali, que o Gabriel pluga o serviço depois."
  (:require [clojure.string :as str]
            [environ.core :refer [env]]
            [taoensso.timbre :as log]))

(defn configurado?
  "Há provedor de e-mail configurado? É a diferença entre 'mandei' e 'não havia
   como mandar'. O handler de recuperação responde genérico nos dois casos, de
   propósito, mas o log precisa poder distinguir os dois mundos."
  []
  (not (str/blank? (env :email-provider))))

(defn email-de-recuperacao
  "Assunto e corpo do e-mail de redefinição de senha, com o link dentro.

   Separado do transporte (`enviar-email!`) para o FORMATO ter um lugar só. O
   link é montado por quem tem o token (auth_recuperacao) e chega pronto aqui."
  [{:keys [nome link]}]
  {:assunto "Redefinição de senha"
   :corpo (str "Olá" (when-not (str/blank? nome) (str ", " nome)) ".\n\n"
               "Recebemos um pedido para redefinir a sua senha. Use o link abaixo "
               "para escolher uma nova. Ele vale por 30 minutos e só pode ser "
               "usado uma vez:\n\n"
               link "\n\n"
               "Se você não pediu isto, ignore este e-mail — sua senha continua "
               "a mesma.")})

(defn- entregar!
  "A entrega de verdade — o `cond` do provedor. É chamada por `enviar-email!`
   DENTRO de um `future`, fora do caminho do request, de propósito (ver lá).

   ⚠️ Contrato deliberado: se NÃO houver provedor configurado, loga
   `email_nao_configurado` em warn e RETORNA SEM ERRO. A recuperação de senha
   depende disto — ela sempre responde a mesma coisa, com ou sem e-mail saindo,
   para não virar um oráculo de 'esta conta existe'. Estourar aqui vazaria essa
   informação pela porta dos fundos (um 500 só quando a conta existe)."
  [{:keys [para assunto corpo link] :as _mensagem}]
  (let [provedor (some-> (env :email-provider) str str/trim str/lower-case)]
    (cond
      (str/blank? provedor)
      (do
        ;; 🔵 Estado normal HOJE: ninguém plugou provedor ainda. Não é erro.
        (log/warn "email_nao_configurado")
        {:enviado false :motivo "nao_configurado"})

      ;; ═══════════════════════════════════════════════════════════════════════
      ;; 🔴 AQUI ENTRA A CREDENCIAL DO PROVEDOR DE E-MAIL — E SÓ AQUI.
      ;;
      ;; Gabriel: quando for plugar o envio de verdade, é NESTE `cond` que entra
      ;; o ramo do provedor. A chave é sempre LIDA do ambiente, nunca escrita no
      ;; código e nunca logada. Variáveis esperadas:
      ;;
      ;;   EMAIL_PROVIDER = "resend"  -> RESEND_API_KEY      (env :resend-api-key)
      ;;   EMAIL_PROVIDER = "smtp"    -> SMTP_HOST/PORT/USER/PASS
      ;;                                 (env :smtp-host) (env :smtp-port)
      ;;                                 (env :smtp-user) (env :smtp-pass)
      ;;
      ;; Esboço do ramo Resend, a implementar quando a chave existir (precisa de
      ;; um cliente HTTP; o projeto já traz cheshire para o JSON):
      ;;
      ;;   (= provedor "resend")
      ;;   (let [chave (env :resend-api-key)]          ; <- credencial, só do ambiente
      ;;     (if (str/blank? chave)
      ;;       (do (log/error "email_provider_sem_credencial")   ; nomeado, não o valor
      ;;           {:enviado false :motivo "sem_credencial"})
      ;;       (do (http-post "https://api.resend.com/emails"
      ;;                      {:headers {"Authorization" (str "Bearer " chave)}
      ;;                       :body (json {:from "..." :to para
      ;;                                    :subject assunto :text corpo})})
      ;;           {:enviado true})))
      ;;
      ;; 🔴 Nunca `(log/info chave)`, nunca um valor-padrão de chave no `or`.
      ;; ═══════════════════════════════════════════════════════════════════════
      :else
      (do
        ;; O provedor foi nomeado no ambiente, mas o ramo real ainda não foi
        ;; escrito (sem chave para testar contra o serviço). Falha fechada e
        ;; barulhenta: melhor um log claro do que fingir que enviou.
        (log/warn "email_provedor_nao_implementado" {:provedor provedor})
        {:enviado false :motivo "provedor_nao_implementado"}))))

(defn enviar-email!
  "Despacha o envio FORA do caminho do request e devolve na hora. A entrega em si
   é `entregar!`, que roda num `future`.

   🔴 Por que assíncrono, e não um detalhe de performance: quando um provedor real
   (Resend/SMTP) estiver ligado, a latência do HTTP para ele aconteceria SÓ quando
   a conta existe — o `recuperar` faz o trabalho de envio apenas no ramo 'a conta
   existe'. Isso viraria um cronômetro que denuncia e-mails cadastrados, justo o
   que a recuperação existe para NÃO fazer (a mesma razão da resposta genérica).
   Despachando fora do request, a resposta sai no mesmo tempo, exista a conta ou
   não. O resíduo — as poucas idas ao banco a mais no ramo 'existe' — é fraco e já
   contido pelo rate limit; a latência de rede do provedor, que é o sinal forte,
   sai do caminho aqui.

   A pessoa já recebeu a resposta genérica antes desta entrega; por isso uma falha
   de entrega NÃO pode voltar para ela (vazaria que a conta existe) — fica só no
   log, alto. Não devolve `{:enviado ...}` porque, no ato, ainda não se sabe: o
   contrato passou a ser 'despachei'."
  [mensagem]
  (future
    (try
      (entregar! mensagem)
      (catch Exception e
        (log/error e "email_envio_falhou"))))
  {:despachado true})

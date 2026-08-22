(ns deep-saude-backend.sessao
  "Emissão de sessão autenticada: o JWT do backend e o corpo que o acompanha.

   Extraído de core.clj por um motivo ESTRUTURAL, o mesmo que tirou o db.clj de
   lá. O login com conta Google (`auth-google`) precisa emitir EXATAMENTE a mesma
   sessão que o `/api/auth/login`. Mas `core` já depende de `auth-google` para
   registrar a rota — deixar a emissão dentro de `core` obrigaria `auth-google` a
   depender de `core` de volta, o ciclo de carga que este namespace-folha evita.

   🔴 Uma única definição do que é 'uma sessão'. Duplicar o formato do token em
   dois lugares é exatamente como as duas verdades divergem: um login ganha um
   claim novo, o outro não, e ninguém percebe até um dos dois se comportar
   diferente. Aqui há um só lugar para mudar, e os dois logins mudam juntos."
  (:require [environ.core :refer [env]]
            [buddy.sign.jwt :as jwt]
            [taoensso.timbre :as log]))

(def jwt-secret
  ;; Carregar o namespace também acontece durante AOT e nos testes. Configuração
  ;; de runtime não pode tornar esses dois caminhos dependentes do ambiente de
  ;; produção; o -main força este delay antes de abrir banco ou porta.
  ;;
  ;; (Estava em core.clj até a extração desta emissão de sessão; core.clj passa a
  ;;  referenciar este mesmo delay por alias, então nada muda para quem já lia
  ;;  `core/jwt-secret`.)
  (delay
    (if-let [secret (env :jwt-secret)]
      ;; ⚠️ Não logar nem pedaço do segredo.
      (do (log/info "jwt_secret_loaded") secret)
      (do
        (log/error "jwt_secret_missing")
        (throw (Exception. "FATAL: A variável de ambiente :jwt-secret não está configurada! A aplicação será encerrada."))))))

(def duracao-do-token-s
  "Quanto vale um token do backend: 1 hora.

   ⚠️ **Curto de propósito, e agora renovável.** Até 21/08 não havia renovação
   nenhuma — o front guardava o token no login e nunca o atualizava. Passada a
   hora, o middleware do Next expulsava para o login **em toda navegação**.

   O Gabriel relatou assim: *\"eu fui logar e quando clico na agenda toda vez a
   aplicação me faz voltar para a tela de login\"*. Não era ambiente local: uma
   psicóloga num dia de trabalho era derrubada de hora em hora, no meio do que
   estivesse fazendo."
  3600)

(defn emitir-sessao
  "Monta a resposta 200 de autenticação: o MESMO JWT e o MESMO corpo que o login
   sempre devolveu. `usuario` é a linha de `usuarios`; `papel` é a linha de
   `papeis` que traz `:nome_papel`.

   📌 O `:email` do corpo sai de `(:email usuario)`. No login clássico isso é
   idêntico ao e-mail digitado (o SELECT casou por ele); no login com Google é o
   e-mail da CONTA cadastrada, não o que veio no token — que é o correto."
  [usuario papel]
  (let [claims {:user_id    (:id usuario)
                :clinica_id (:clinica_id usuario)
                :papel_id   (:papel_id usuario)
                :role       (:nome_papel papel)
                ;; Operador da plataforma. Eixo separado do papel: o superadmin
                ;; continua sendo usuário de uma clínica, e esta flag só abre
                ;; /api/plataforma/*. `boolean` porque a coluna pode vir nil de
                ;; linha criada antes da migration.
                :plataforma_admin (boolean (:plataforma_admin usuario))
                ;; 🔴 Quando a SESSÃO começou — não quando este token foi emitido.
                ;; É o que permite renovar o token sem deixar a sessão viva para
                ;; sempre: a renovação carrega este carimbo adiante e recusa
                ;; depois do teto. Ver `renovar-sessao-handler`.
                :sessao_iniciada_em (.getEpochSecond (java.time.Instant/now))
                :exp        (-> (java.time.Instant/now) (.plusSeconds duracao-do-token-s) .getEpochSecond)}
        token (jwt/sign claims @jwt-secret)]
    {:status 200 :body {:message "Usuário autenticado com sucesso."
                        :token   token
                        :user    {:id         (:id usuario)
                                  :nome       (:nome usuario)
                                  :email      (:email usuario)
                                  :clinica_id (:clinica_id usuario)
                                  :papel_id   (:papel_id usuario)
                                  :role       (:nome_papel papel)}}}))

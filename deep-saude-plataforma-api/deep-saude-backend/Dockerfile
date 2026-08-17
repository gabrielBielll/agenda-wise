# Dois estágios: o primeiro compila o uberjar, o segundo só o executa.
#
# A versão anterior era um estágio só, `FROM clojure:lein-2.11.2`, terminando em
# `CMD ["lein", "ring", "server-headless"]` — o servidor do plugin de
# DESENVOLVIMENTO. Isso levava para o ar o Leiningen, o código-fonte e o `.m2`
# inteiro dentro da imagem, e — o que importa mais — fazia o caminho de boot em
# produção ser diferente do que a suíte exercita.
#
# ⚠️ E não era só cosmético: `lein ring server-headless` inicializa pelo
# `:ring {:init ...}` do project.clj, enquanto `java -jar` entra pelo `-main`.
# São dois caminhos de partida diferentes para a mesma aplicação. Agora só
# existe um, e é o que roda em produção.

# ---------- Estágio 1: build ----------
FROM clojure:temurin-21-lein-2.11.2 AS build

WORKDIR /build

# project.clj sozinho primeiro: enquanto as dependências não mudarem, o Docker
# reaproveita a camada do `lein deps` e não baixa o mundo a cada commit.
COPY project.clj .
RUN lein deps

COPY . .

# O perfil :uberjar do project.clj já traz :aot :all e direct-linking=true.
#
# ⚠️ O JWT_SECRET abaixo é para COMPILAR, e a necessidade dele é um defeito
# registrado como **A-015**: `:aot :all` compila `core.clj`, compilar um
# namespace executa as formas de topo dele, e o `(def jwt-secret ...)` lança
# quando a variável não existe. Sem isto o `lein uberjar` morre — foi o CI que
# mostrou, na primeira vez que alguém tentou construir o artefato de produção.
#
# 🔴 **Este valor NUNCA chega no que roda.** Ele vive só neste estágio, e o
# estágio de execução abaixo começa de outra imagem — não herda ENV nenhum. Se
# algum dia alguém juntar os dois estágios num só, esta linha vira um segredo
# conhecido em produção: **junte os estágios e você criou uma porta dos fundos.**
RUN JWT_SECRET='placeholder-de-compilacao-nao-e-segredo' lein uberjar && \
    cp target/uberjar/deep-saude-backend-*-standalone.jar /build/app.jar

# ---------- Estágio 2: execução ----------
# Só a JRE. Sem Leiningen, sem código-fonte, sem ~/.m2.
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Usuário sem privilégio: container que roda como root é privilégio de graça
# para quem conseguir execução dentro dele.
RUN addgroup -S deep && adduser -S -G deep deep

COPY --from=build --chown=deep:deep /build/app.jar /app/app.jar

USER deep

# A aplicação lê PORT do ambiente (core.clj) e cai em 3000. O provedor
# (Render/Northflank/App Runner) injeta a dele.
ENV PORT=3000
EXPOSE 3000

# `exec` implícito: o java vira PID 1 e recebe o SIGTERM do orquestrador direto,
# em vez de morrer por timeout quando o provedor reinicia o serviço.
#
# 🟡 Uma dependência implícita que fica registrada: `-main` chama
# `run-jetty` com `:join? false` e termina. O processo só continua vivo porque
# as threads do Jetty não são daemon. Funciona, e é assim que está rodando —
# mas se algum dia o servidor sair na frente do container, é aqui que se olha.
CMD ["java", "-jar", "/app/app.jar"]

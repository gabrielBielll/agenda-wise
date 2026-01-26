# Usa a imagem base do seu outro projeto, que sabemos que funciona no Render.
FROM clojure:lein-2.11.2

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia o arquivo de projeto primeiro para aproveitar o cache do Docker
COPY project.clj .

# Baixa as dependências
RUN lein deps

# Copia o restante do código da aplicação
COPY . .

# Expõe a porta que o servidor irá rodar.
# Nossa aplicação está configurada para usar a variável de ambiente PORT ou 3000 como padrão.
EXPOSE 3000

# Comando para iniciar o servidor.
# O `lein-ring` é inteligente e usará automaticamente a variável de ambiente $PORT fornecida pelo Render.
CMD ["lein", "ring", "server-headless"]

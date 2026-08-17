
# Imagem do FRONT. É a única — havia uma segunda em
# `deep-saude-plataforma-front-end/Dockerfile`, quase idêntica, e ela foi
# apagada em 17/08 por dois motivos: duas imagens quase iguais garantem que uma
# vai envelhecer sem ninguém notar, e aquela **não construía** — copiava
# `/app/public`, que não existe neste projeto.
#
# ⚠️ O contexto de build é a RAIZ do repositório, não a pasta do front. Ao
# apontar o Northflank/App Runner, o `context` é `.` e o `dockerfile` é este.

# 1. Base image
# Node 22 para bater com o CI (`.github/workflows/ci.yml`). Estava em `node:18`,
# que saiu do suporte em abril de 2025 — a imagem testada não era a que rodava.
FROM node:22-alpine AS base

# 2. Dependencies
FROM base AS deps
WORKDIR /app
# Ajuste: Copia apenas os arquivos do frontend, mas a partir da raiz do contexto
COPY deep-saude-plataforma-front-end/package.json deep-saude-plataforma-front-end/package-lock.json* ./
RUN npm ci

# 3. Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Ajuste: Copia todo o código do frontend para a pasta de trabalho
COPY deep-saude-plataforma-front-end .

# Aceitar variáveis de build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# 4. Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# COPY --from=builder /app/public ./public

# Set permissions
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

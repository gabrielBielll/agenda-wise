
# 1. Base image
FROM node:18-alpine AS base

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

COPY --from=builder /app/public ./public

# Set permissions
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ---- Etapa 1: compila o TypeScript ----
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Etapa 2: imagem final, só com o necessário para rodar ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY docs ./docs

# Não rodar como root dentro do container.
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Aplica as migrations e sobe a API. O "exec" faz o Node receber o SIGTERM
# do Docker direto, para o encerramento gracioso funcionar.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]

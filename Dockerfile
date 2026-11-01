FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm ci --prefix web && npm --prefix web run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node server/scripts/migrate.js && node app.cjs"]

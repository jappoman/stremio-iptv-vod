FROM node:20-alpine

WORKDIR /app

# build riproducibile con il lockfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV PORT=7000
EXPOSE 7000

CMD ["node", "src/index.js"]

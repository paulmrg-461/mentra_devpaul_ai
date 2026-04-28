# tsx handles ESM<->CJS interop for @mentra/sdk (CJS) in an ESM project
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]

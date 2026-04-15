# STAGE 1 - Build
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# melhor prática npm
RUN npm ci

COPY . .

RUN npm run build


# STAGE 2 - Runtime
FROM node:18-alpine

WORKDIR /usr/src/app

# apenas produção
COPY package*.json ./
RUN npm ci --omit=dev

# app buildado
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/src/main.js"]
FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci           # 安装 devDeps,默认 NODE_ENV 为 development

COPY . .
RUN npm run build    # 或 npx tsc

FROM node:24-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
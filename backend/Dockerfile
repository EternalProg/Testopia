FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm install --ignore-scripts

COPY tsconfig.base.json ./
COPY shared shared
COPY backend backend
RUN npm run build --workspace=@testopia/shared && npm run build --workspace=@testopia/backend

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/src/db/migrations ./backend/dist/db/migrations
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]

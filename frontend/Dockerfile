FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm install --ignore-scripts

COPY tsconfig.base.json ./
COPY shared shared
COPY frontend frontend
RUN npm run build --workspace=@practice-works/shared && npm run build --workspace=@practice-works/frontend

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

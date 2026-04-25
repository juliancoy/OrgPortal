FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_PIDP_BASE_URL=/pidp
ARG VITE_DATA_SOURCE=mock
ARG VITE_API_BASE_URL=/api/governance
ARG VITE_PUBLIC_BASE=/

ENV VITE_PIDP_BASE_URL=${VITE_PIDP_BASE_URL}
ENV VITE_DATA_SOURCE=${VITE_DATA_SOURCE}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_PUBLIC_BASE=${VITE_PUBLIC_BASE}

RUN npx vite build

FROM node:24-alpine AS runtime

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs

EXPOSE 8080

CMD ["node", "server.mjs"]

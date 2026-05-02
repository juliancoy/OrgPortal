FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV CI=1

CMD ["npm", "run", "test:e2e"]

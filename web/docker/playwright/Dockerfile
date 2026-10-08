FROM node:22-bookworm

# Install the browser matching package-lock.json instead of a drifting image tag.

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci && npx playwright install --with-deps chromium

COPY web/ ./
COPY shared/ ../shared/

ENV CI=1

CMD ["npm", "run", "test:e2e"]

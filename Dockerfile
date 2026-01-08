FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for TypeScript build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/index.js"]
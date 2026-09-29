FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Default Environment Variables
ENV PORT=3005 \
    NODE_ENV=production \
    DATA_DIR=/app/data

# Persist cache and history
VOLUME ["/app/data"]

EXPOSE 3005

# Run as non-root node user
USER node

CMD ["node", "server.js"]

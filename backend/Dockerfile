FROM node:26-alpine

# Install OpenSSL libraries required by Prisma, PostgreSQL client tools, and ffmpeg for video thumbnails
RUN apk add --no-cache openssl libc6-compat postgresql-client ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema and config first (for better layer caching)
COPY prisma ./prisma
COPY prisma.config.* ./

# Generate Prisma Client with all binary targets
RUN npx prisma generate

# Copy rest of source code
COPY . .

# Make startup script executable and ensure Unix line endings
RUN sed -i 's/\r$//' scripts/migrate-and-start.sh && chmod +x scripts/migrate-and-start.sh

# Create non-root user, give ownership of app dir, and switch to it
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    mkdir -p /app/data && \
    chown -R appuser:nodejs /app
USER appuser

# Expose port
EXPOSE 5000

# Set entrypoint
ENTRYPOINT ["scripts/migrate-and-start.sh"]

# Start command
CMD ["npm", "run", "dev"]

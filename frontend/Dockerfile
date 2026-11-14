FROM node:26-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create non-root user, give ownership of app dir, and switch to it
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:nodejs /app
USER appuser

# Expose port
EXPOSE 3000

# Start command (overridden in docker-compose for dev)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

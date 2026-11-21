import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import logger from './logger';

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create the adapter
const adapter = new PrismaPg(pool);

// Initialize Prisma Client with the adapter
const prismaClient = new PrismaClient({
  adapter,
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

const prisma = prismaClient;

/**
 * Checks the database connection and retries if it fails.
 * Useful for Docker environments where the database might take time to start.
 */
export async function checkDatabaseConnection(retries = 5, interval = 5000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      // Test the connection by running a simple query
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection successful');
      return;
    } catch (error) {
      const isLastRetry = i === retries - 1;
      const delay = interval;

      logger.warn(`Database connection attempt ${i + 1} failed. ${isLastRetry ? 'Final attempt.' : `Retrying in ${delay / 1000}s...`}`);

      if (isLastRetry) {
        logger.error('Could not connect to the database after multiple attempts.');
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Log queries in development
if (process.env.NODE_ENV === 'development') {
  // Prisma query event type
  interface PrismaQueryEvent {
    query: string;
    params: string;
    duration: number;
    target: string;
  }

  prismaClient.$on('query', (e: PrismaQueryEvent) => {
    logger.debug('Query: ' + e.query);
    logger.debug('Duration: ' + e.duration + 'ms');
  });
}

export default prisma;

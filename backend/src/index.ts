import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from './config';
import logger from './config/logger';
import { initCronJobs } from './config/cron';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import prisma, { checkDatabaseConnection } from './config/database';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import tripRoutes from './routes/trip.routes';
import locationRoutes from './routes/location.routes';
import photoRoutes from './routes/photo.routes';
import photoAlbumRoutes from './routes/photoAlbum.routes';
import activityRoutes from './routes/activity.routes';
import transportationRoutes from './routes/transportation.routes';
import lodgingRoutes from './routes/lodging.routes';
import journalEntryRoutes from './routes/journalEntry.routes';
import tagRoutes from './routes/tag.routes';
import companionRoutes from './routes/companion.routes';
import immichRoutes from './routes/immich.routes';
import weatherRoutes from './routes/weather.routes';
import checklistRoutes from './routes/checklist.routes';
import searchRoutes from './routes/search.routes';
import backupRoutes from './routes/backup.routes';
import entityLinkRoutes from './routes/entityLink.routes';
import collaborationRoutes from './routes/collaboration.routes';
import flightTrackingRoutes from './routes/flightTracking.routes';
import packingSuggestionRoutes from './routes/packingSuggestion.routes';
import travelDocumentRoutes from './routes/travelDocument.routes';
import languagePhraseRoutes from './routes/languagePhrase.routes';
import userInvitationRoutes from './routes/userInvitation.routes';
import tripSeriesRoutes from './routes/tripSeries.routes';

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const app: Application = express();

// Security middleware
const isProduction = config.nodeEnv === 'production';

// Build CSP directives - tighter in production, relaxed in development
// Note: In Docker, Nginx serves the frontend and these headers only apply to API
// responses. They are kept correct for completeness and non-Docker deployments.
const cspDirectives = {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  'img-src': isProduction
    ? ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://*.basemaps.cartocdn.com']
    : ["'self'", 'data:', 'blob:', 'http://localhost:5000', 'https://*.tile.openstreetmap.org', 'https://*.basemaps.cartocdn.com'],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'connect-src': isProduction
    ? ["'self'", 'https://nominatim.openstreetmap.org']
    : ["'self'", 'http://localhost:5000', 'ws://localhost:5173', 'https://nominatim.openstreetmap.org'],
  'worker-src': ["'self'", 'blob:'],
  'frame-ancestors': ["'none'"],
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: cspDirectives,
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
// CORS configuration - use CORS_ORIGIN env var in production
// Validate each origin is a well-formed URL (http/https, no trailing slash, no path)
function validateCorsOrigins(origins: string[]): string[] {
  return origins.filter((origin) => {
    // Must start with http:// or https://
    if (!/^https?:\/\//i.test(origin)) {
      logger.warn(`Invalid CORS origin ignored (must start with http:// or https://): ${origin}`);
      return false;
    }
    try {
      const parsed = new URL(origin);
      // Must not have a path (other than /)
      if (parsed.pathname !== '/') {
        logger.warn(`Invalid CORS origin ignored (must not contain a path): ${origin}`);
        return false;
      }
      // Must not have a trailing slash in the original string
      if (origin.endsWith('/')) {
        logger.warn(`Invalid CORS origin ignored (must not have trailing slash): ${origin}`);
        return false;
      }
      return true;
    } catch {
      logger.warn(`Invalid CORS origin ignored (malformed URL): ${origin}`);
      return false;
    }
  });
}

const rawCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:5173'];

const corsOptions = {
  origin: validateCorsOrigins(rawCorsOrigins),
  credentials: true,
  exposedHeaders: ['Set-Cookie'],
};
app.use(cors(corsOptions));

// Rate limiting - stricter limits for auth routes to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register attempts per 15 minutes
  message: 'Too many authentication attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Separate rate limiter for silent-refresh (more lenient as it's called on every page load)
const silentRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Allow 60 requests per 15 minutes (4 per minute for page navigation)
  message: 'Too many refresh attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Apply silent-refresh rate limiter before auth limiter (more specific route first)
app.use('/api/auth/silent-refresh', silentRefreshLimiter);
// Apply stricter rate limiting to other auth routes
app.use('/api/auth', authLimiter);
app.use('/api', limiter);

// Body parsing middleware - must be BEFORE CSRF validation so req.cookies is populated
// Large limit only for backup/restore routes (which send full JSON backups)
app.use('/api/backup', express.json({ limit: '100mb' }));
app.use('/api/backup', express.urlencoded({ extended: true, limit: '100mb' }));
// Reasonable default limit for all other routes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// CSRF validation for defense-in-depth (prevents cross-site request forgery)
// Auth routes are excluded since they bootstrap the CSRF token
import { validateCsrf } from './utils/csrf';
import { verifyAccessToken, verifyRefreshToken } from './utils/jwt';
import { isBlacklisted } from './services/tokenBlacklist.service';
import { getRefreshTokenFromCookie } from './utils/cookies';
app.use('/api', validateCsrf);

// Authenticate access to uploaded files
// Supports Bearer token (programmatic fetch) and refresh token cookie (browser <img> tags)
const authenticateFileAccess = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Try Authorization header first (for programmatic fetch calls)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      verifyAccessToken(token);
      next();
      return;
    }

    // Fall back to refresh token cookie (for browser <img src> requests)
    const refreshToken = getRefreshTokenFromCookie(req.cookies);
    if (refreshToken && !isBlacklisted(refreshToken)) {
      verifyRefreshToken(refreshToken);
      next();
      return;
    }

    // No valid authentication — return 404 to avoid leaking file existence
    res.status(404).json({ status: 'error', message: 'Not found' });
  } catch {
    // Invalid/expired token — return 404 to avoid leaking file existence
    res.status(404).json({ status: 'error', message: 'Not found' });
  }
};

// Serve uploaded files with authentication
app.use('/uploads', authenticateFileAccess, express.static(config.upload.dir, {
  index: false, // Don't serve directory indexes
}));

// Catch-all for files not found under /uploads — return 404 without leaking path info
app.use('/uploads', (_req: Request, res: Response) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    // Also check database health
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      timestamp: new Date().toISOString() 
    });
  }
});

// API routes
app.get('/api', (_req, res) => {
  res.json({
    message: "Travel Life API",
    version: packageJson.version,
    status: 'running',
  });
});

// Version endpoint
app.get('/api/version', (_req, res) => {
  res.json({
    version: packageJson.version,
    name: packageJson.name,
  });
});

// API route handlers
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/albums', photoAlbumRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/transportation', transportationRoutes);
app.use('/api/lodging', lodgingRoutes);
app.use('/api/journal', journalEntryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/companions', companionRoutes);
app.use('/api/immich', immichRoutes);
app.use('/api', weatherRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/trips/:tripId/links', entityLinkRoutes);
app.use('/api', collaborationRoutes);
app.use('/api', flightTrackingRoutes);
app.use('/api', packingSuggestionRoutes);
app.use('/api/travel-documents', travelDocumentRoutes);
app.use('/api', languagePhraseRoutes);
app.use('/api/user-invitations', userInvitationRoutes);
app.use('/api/trip-series', tripSeriesRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize cron jobs
initCronJobs();

// Setup Swagger documentation
setupSwagger(app);

// Start server
const startServer = async () => {
  try {
    const PORT = config.port;

    // Check database connection before starting the server
    // Increased retries for TrueNAS environment
    await checkDatabaseConnection(10, 5000);

    app.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
      logger.info(`Base URL: ${config.baseUrl}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown helper
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop token blacklist cleanup interval to allow clean exit
    const { stopCleanupInterval } = await import('./services/tokenBlacklist.service');
    stopCleanupInterval();

    // Close database connection
    await prisma.$disconnect();
    logger.info('Database connection closed.');
  } catch (error) {
    logger.error('Error during database disconnect:', error);
  }

  process.exit(0);
};

// Global handlers for unhandled errors outside Express middleware
process.on('unhandledRejection', (reason: unknown) => {
  // Extract error details if reason is an Error object
  if (reason instanceof Error) {
    logger.error('Unhandled promise rejection:', {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    });
  } else {
    logger.error('Unhandled promise rejection:', reason);
  }
});

process.on('uncaughtException', async (error: Error) => {
  logger.error('Uncaught exception — shutting down:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  try {
    // Attempt to close database connection before exiting
    await prisma.$disconnect();
    logger.info('Database connection closed during shutdown.');
  } catch (disconnectError) {
    logger.error('Error closing database during shutdown:', disconnectError);
  }

  process.exit(1);
});

// Handle termination signals for graceful shutdown (e.g., Docker stop, Kubernetes pod termination)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

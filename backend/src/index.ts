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
import { resolveCurrentPasswordVersion } from './middleware/auth';
import prisma, { checkDatabaseConnection } from './config/database';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import tripRoutes from './routes/trip.routes';
import locationRoutes from './routes/location.routes';
import photoRoutes from './routes/photo.routes';
import photoAlbumRoutes from './routes/photoAlbum.routes';
import activityRoutes from './routes/activity.routes';
import customItemRoutes from './routes/customItem.routes';
import transportationRoutes from './routes/transportation.routes';
import lodgingRoutes from './routes/lodging.routes';
import journalEntryRoutes from './routes/journalEntry.routes';
import tagRoutes from './routes/tag.routes';
import companionRoutes from './routes/companion.routes';
import immichRoutes from './routes/immich.routes';
import weatherRoutes from './routes/weather.routes';
import checklistRoutes from './routes/checklist.routes';
import airportRoutes from './routes/airport.routes';
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
import aiRoutes from './routes/ai.routes';
import pdfImportRoutes from './routes/pdfImport.routes';
import calendarRoutes from './routes/calendar.routes';
import memoriesRoutes from './routes/memories.routes';
import publicShareRoutes from './routes/share.routes';
import { generalRateLimiter } from './middleware/rateLimit';
import expenseRoutes, { budgetSummaryRouter } from './routes/expense.routes';
import bookingDeadlineRoutes, { upcomingDeadlinesRouter } from './routes/bookingDeadline.routes';
import foodLogRoutes, { foodLogSearchRouter } from './routes/foodLog.routes';
import savedLinkRoutes, { tripSavedLinksRouter } from './routes/savedLink.routes';
import pushRoutes from './routes/push.routes';
import mobileRoutes from './routes/mobile.routes';
import emergencyInfoRoutes from './routes/emergencyInfo.routes';
import { pdfImportService } from './services/pdfImport.service';
import emailIngestService from './services/emailIngest.service';

// Read version from package.json
let packageJson: { version: string; name: string };
try {
  packageJson = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf-8')
  );
} catch {
  logger.warn('Could not read package.json, using fallback version');
  packageJson = { version: 'unknown', name: 'travel-life-backend' };
}

const app: Application = express();

// Trust first proxy (Nginx in Docker) so express-rate-limit reads X-Forwarded-For correctly
app.set('trust proxy', 1);

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
  return origins
    .map((origin) => origin.replace(/\/+$/, '')) // Auto-trim trailing slashes
    .filter((origin) => {
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
  // These read-only routes are hit on every login page load and have their own
  // (more lenient) limiter; without this skip both limiters would count them.
  skip: (req) =>
    req.originalUrl.startsWith('/api/auth/silent-refresh') ||
    req.originalUrl.startsWith('/api/auth/oidc/config'),
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
// OIDC config is fetched on every login page load - use the lenient limiter
app.use('/api/auth/oidc/config', silentRefreshLimiter);
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
import { validateCsrf } from './security/csrf';
import { verifyAccessToken, verifyRefreshToken } from './auth/jwt';
import { isBlacklisted } from './services/tokenBlacklist.service';
import { getRefreshTokenFromCookie } from './http/cookies';
import { JwtPayload } from './types/auth.types';
import { Prisma } from '@prisma/client';
app.use('/api', validateCsrf);

// Every failure under /uploads answers 404 so the route never reveals whether a
// file exists, who owns it, or why access was refused.
const uploadNotFound = (res: Response): void => {
  res.status(404).json({ status: 'error', message: 'Not found' });
};

// Reuses the SAME passwordVersion cache as the API path (middleware/auth.ts).
// Keeping a second cache here meant `invalidatePasswordVersionCache` on password
// change cleared one and left the other serving a stale version, so a token
// invalidated by a password change could still unlock /uploads.
const passwordVersionMatches = async (payload: JwtPayload): Promise<boolean> => {
  const dbVersion = await resolveCurrentPasswordVersion(payload.userId);
  if (dbVersion === undefined) return false; // user no longer exists
  return (payload.passwordVersion ?? 0) === dbVersion;
};

// Authenticate access to uploaded files
// Supports Bearer token (programmatic fetch) and refresh token cookie (browser <img> tags)
const authenticateFileAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let payload: JwtPayload | null = null;

    // Try Authorization header first (for programmatic fetch calls)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (isBlacklisted(token)) {
        uploadNotFound(res);
        return;
      }
      payload = verifyAccessToken(token);
    } else {
      // Fall back to refresh token cookie (for browser <img src> requests)
      const refreshToken = getRefreshTokenFromCookie(req.cookies);
      if (refreshToken && !isBlacklisted(refreshToken)) {
        payload = verifyRefreshToken(refreshToken);
      }
    }

    // No valid authentication, or a token invalidated by a password change
    if (!payload || !(await passwordVersionMatches(payload))) {
      uploadNotFound(res);
      return;
    }

    req.user = payload;
    next();
  } catch {
    // Invalid/expired token — return 404 to avoid leaking file existence
    uploadNotFound(res);
  }
};

// Positive authorization decisions are cached briefly so a gallery of thumbnails
// does not issue one query per image on every render. Denials are never cached,
// so newly granted access takes effect immediately.
const uploadAuthCache = new Map<string, number>();
const UPLOAD_AUTH_TTL_MS = 60_000;
const UPLOAD_AUTH_CACHE_MAX = 5000;

// Owner, collaborator, or public trip — the same rule verifyTripAccessWithPermission
// applies to the JSON representation of these entities.
const tripReadFilter = (userId: number): Prisma.TripWhereInput => ({
  OR: [
    { userId },
    { collaborators: { some: { userId } } },
    { privacyLevel: 'Public' },
  ],
});

/**
 * Resolve an uploads-relative path back to the row that owns it and decide
 * whether this user may read it. Every branch is a single indexed-by-nothing
 * lookup on an exact stored path, so traversal cannot match anything.
 */
const canReadUpload = async (userId: number, relPath: string): Promise<boolean> => {
  // Photo/companion/trip rows store the public URL form, PDF imports store the
  // uploads-relative form.
  const storedUrl = `/uploads/${relPath}`;

  switch (relPath.split('/')[0]) {
    case 'photos':
    case 'videos':
    case 'thumbnails': {
      const photo = await prisma.photo.findFirst({
        where: {
          OR: [{ localPath: storedUrl }, { thumbnailPath: storedUrl }],
          trip: tripReadFilter(userId),
        },
        select: { id: true },
      });
      return photo !== null;
    }
    case 'covers': {
      const trip = await prisma.trip.findFirst({
        where: {
          AND: [
            { OR: [{ coverImagePath: storedUrl }, { coverImageThumbnailPath: storedUrl }] },
            tripReadFilter(userId),
          ],
        },
        select: { id: true },
      });
      return trip !== null;
    }
    case 'avatars': {
      // Companions are user-owned but their avatars render for anyone who can
      // read a trip the companion is assigned to.
      const companion = await prisma.travelCompanion.findFirst({
        where: {
          avatarUrl: storedUrl,
          OR: [
            { userId },
            { tripAssignments: { some: { trip: tripReadFilter(userId) } } },
          ],
        },
        select: { id: true },
      });
      if (companion !== null) return true;

      const self = await prisma.user.findFirst({
        where: { id: userId, avatarUrl: storedUrl },
        select: { id: true },
      });
      return self !== null;
    }
    case 'pdfs': {
      const pdfImport = await prisma.pdfImport.findFirst({
        where: { storedPath: relPath, userId },
        select: { id: true },
      });
      return pdfImport !== null;
    }
    default:
      // Anything with no owning row (e.g. the multer temp dir) is not servable.
      return false;
  }
};

// Per-file authorization. Authentication alone let any logged-in user read any
// other user's uploads by path.
const authorizeFileAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    uploadNotFound(res);
    return;
  }

  let relPath: string;
  try {
    relPath = decodeURIComponent(req.path).replace(/^\/+/, '');
  } catch {
    // Malformed percent-encoding
    uploadNotFound(res);
    return;
  }

  if (!relPath || relPath.includes('\0') || relPath.split('/').includes('..')) {
    uploadNotFound(res);
    return;
  }

  const cacheKey = `${userId}:${relPath}`;
  const cachedUntil = uploadAuthCache.get(cacheKey);
  if (cachedUntil !== undefined && cachedUntil > Date.now()) {
    next();
    return;
  }

  let allowed: boolean;
  try {
    allowed = await canReadUpload(userId, relPath);
  } catch (error) {
    logger.error('Upload authorization check failed:', error);
    uploadNotFound(res);
    return;
  }

  if (!allowed) {
    uploadNotFound(res);
    return;
  }

  if (uploadAuthCache.size >= UPLOAD_AUTH_CACHE_MAX) uploadAuthCache.clear();
  uploadAuthCache.set(cacheKey, Date.now() + UPLOAD_AUTH_TTL_MS);
  next();
};

// Serve uploaded files with authentication and per-file authorization
app.use('/uploads', authenticateFileAccess, authorizeFileAccess, express.static(config.upload.dir, {
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
// Before the generic /api/trips router and the per-resource trip routers, so
// its exact paths (e.g. /expenses/parse-receipt) are matched first.
app.use('/api/trips/:tripId', mobileRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/albums', photoAlbumRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/custom-items', customItemRoutes);
app.use('/api/transportation', transportationRoutes);
app.use('/api/lodging', lodgingRoutes);
app.use('/api/journal', journalEntryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/companions', companionRoutes);
app.use('/api/immich', immichRoutes);
app.use('/api', weatherRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/airports', airportRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/trips/:tripId/links', entityLinkRoutes);
app.use('/api/trips/:tripId/expenses', expenseRoutes);
app.use('/api/trips/:tripId/deadlines', bookingDeadlineRoutes);
app.use('/api/deadlines', upcomingDeadlinesRouter);
app.use('/api/trips/:tripId/food-log', foodLogRoutes);
app.use('/api/food-log', foodLogSearchRouter);
app.use('/api/trips/:tripId', budgetSummaryRouter);
app.use('/api/trips/:tripId/emergency-info', emergencyInfoRoutes);
app.use('/api/saved-links', savedLinkRoutes);
app.use('/api/trips/:tripId/saved-links', tripSavedLinksRouter);
app.use('/api', collaborationRoutes);
app.use('/api', flightTrackingRoutes);
app.use('/api', packingSuggestionRoutes);
app.use('/api/travel-documents', travelDocumentRoutes);
app.use('/api', languagePhraseRoutes);
app.use('/api/user-invitations', userInvitationRoutes);
app.use('/api/trip-series', tripSeriesRoutes);
app.use('/api/trips/:tripId/ai', aiRoutes);
app.use('/api/pdf-imports', pdfImportRoutes);
// Unauthenticated iCal subscription feed — the secret token in the URL is the credential
app.use('/api/calendar', calendarRoutes);
app.use('/api/memories', memoriesRoutes);
// Public share routes — unauthenticated by design (access controlled by the
// unguessable share token); rate limited per IP to deter token guessing
app.use('/api/public', generalRateLimiter, publicShareRoutes);
app.use('/api/push', pushRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize cron jobs
initCronJobs();

// Setup Swagger documentation — development only. The UI is mounted outside the
// /api rate limiter and CSRF check and has no auth of its own, so publishing the
// full API surface anonymously in production is not acceptable.
if (config.nodeEnv !== 'production') {
  setupSwagger(app);
}

// Start server
const startServer = async () => {
  try {
    const PORT = config.port;

    // Check database connection before starting the server
    // Increased retries for TrueNAS environment
    await checkDatabaseConnection(10, 5000);

    // Reset any PDF imports stuck in PARSING from a previous server crash
    await pdfImportService.resetStaleParsing();

    // Same for email ingests stuck mid-flight
    await emailIngestService.resetStaleProcessing();

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

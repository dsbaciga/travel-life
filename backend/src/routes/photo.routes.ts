import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { photoController } from '../controllers/photo.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Temp directory for uploaded files before processing
const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'temp');

// Track whether uploads are available
let uploadsAvailable = true;

// Ensure temp directory exists (handle permission errors gracefully)
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  try {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  } catch (err) {
    // On TrueNAS/NAS systems with bind mounts, we may not have write permissions
    // The startup script already warned about this - don't crash, just continue
    console.warn(`⚠ Cannot create temp upload directory: ${(err as Error).message}`);
    console.warn('  Photo uploads will be unavailable until directory permissions are fixed.');
    uploadsAvailable = false;
  }
}

// Configure multer for disk storage to avoid memory issues with large video files
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      // Generate unique filename with original extension (crypto-secure randomness)
      const timestamp = Date.now();
      const random = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname);
      cb(null, `temp-${timestamp}-${random}${ext}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size (for videos)
  },
  fileFilter: (_req, file, cb) => {
    // Accept images and videos (preliminary check based on mimetype)
    // Content validation using magic bytes happens in the service layer
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  },
});

// Middleware to check if uploads are available
const checkUploadsAvailable = (_req: Request, res: Response, next: NextFunction): void => {
  if (!uploadsAvailable) {
    res.status(503).json({
      status: 'error',
      message: 'Photo uploads are temporarily unavailable. The upload directory is not writable. Please check server logs for permission fix instructions.',
    });
    return;
  }
  next();
};

// All routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/photos/upload:
 *   post:
 *     summary: Upload a new photo or video
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Image or video file (max 500MB)
 *               tripId:
 *                 type: integer
 *               caption:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               takenAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Photo or video uploaded
 */
router.post('/upload', checkUploadsAvailable, upload.single('photo'), photoController.uploadPhoto);

/**
 * @openapi
 * /api/photos/immich:
 *   post:
 *     summary: Link a photo from Immich
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, immichAssetId]
 *             properties:
 *               tripId:
 *                 type: integer
 *               immichAssetId:
 *                 type: string
 *               caption:
 *                 type: string
 *     responses:
 *       201:
 *         description: Photo linked
 */
router.post('/immich', photoController.linkImmichPhoto);

/**
 * Middleware to extend timeout for long-running batch operations
 */
const extendTimeout = (req: Request, res: Response, next: NextFunction) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); // 5 minutes
  next();
};

/**
 * @openapi
 * /api/photos/immich/batch:
 *   post:
 *     summary: Link multiple photos from Immich in a batch
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, assets]
 *             properties:
 *               tripId:
 *                 type: integer
 *               assets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [immichAssetId]
 *                   properties:
 *                     immichAssetId:
 *                       type: string
 *                     caption:
 *                       type: string
 *                     takenAt:
 *                       type: string
 *                       format: date-time
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *     responses:
 *       201:
 *         description: Batch linking results
 */
router.post('/immich/batch', extendTimeout, photoController.linkImmichPhotosBatch);

/**
 * @openapi
 * /api/photos/trip/{tripId}:
 *   get:
 *     summary: Get all photos for a specific trip
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of photos
 */
router.get('/trip/:tripId', photoController.getPhotosByTrip);

/**
 * @openapi
 * /api/photos/trip/{tripId}/immich-asset-ids:
 *   get:
 *     summary: Get all Immich asset IDs for a specific trip
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of Immich asset IDs
 */
router.get('/trip/:tripId/immich-asset-ids', photoController.getImmichAssetIdsByTrip);

/**
 * @openapi
 * /api/photos/trip/{tripId}/unsorted:
 *   get:
 *     summary: Get photos not assigned to any album in a trip
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of unsorted photos
 */
router.get('/trip/:tripId/unsorted', photoController.getUnsortedPhotosByTrip);

/**
 * @openapi
 * /api/photos/{id}:
 *   get:
 *     summary: Get a photo by ID
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Photo details
 *   put:
 *     summary: Update photo metadata
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               caption:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               takenAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Photo updated
 *   delete:
 *     summary: Delete a photo
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Photo deleted
 */
router.get('/:id', photoController.getPhotoById);
router.put('/:id', photoController.updatePhoto);
router.delete('/:id', photoController.deletePhoto);

/**
 * @openapi
 * /api/photos/trip/{tripId}/date-groupings:
 *   get:
 *     summary: Get photo date groupings (dates and counts for lazy loading)
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Date groupings with photo counts
 */
router.get('/trip/:tripId/date-groupings', photoController.getPhotoDateGroupings);

/**
 * @openapi
 * /api/photos/trip/{tripId}/by-date/{date}:
 *   get:
 *     summary: Get photos for a specific date
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Photos for the specified date
 */
router.get('/trip/:tripId/by-date/:date', photoController.getPhotosByDate);

/**
 * @openapi
 * /api/photos/trip/{tripId}/suggest-albums:
 *   get:
 *     summary: Get smart album suggestions based on photo clustering
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of album suggestions
 */
router.get('/trip/:tripId/suggest-albums', photoController.getAlbumSuggestions);

/**
 * @openapi
 * /api/photos/trip/{tripId}/accept-suggestion:
 *   post:
 *     summary: Accept an album suggestion and create the album
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, photoIds]
 *             properties:
 *               name:
 *                 type: string
 *               photoIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Album created from suggestion
 */
router.post('/trip/:tripId/accept-suggestion', photoController.acceptAlbumSuggestion);

export default router;

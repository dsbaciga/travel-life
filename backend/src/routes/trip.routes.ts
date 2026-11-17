import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { tripController } from '../controllers/trip.controller';
import { shareController } from '../controllers/share.controller';
import { authenticate } from '../middleware/auth';
import { config } from '../config';

const router = Router();

// Temp directory for uploaded cover images before processing
const TEMP_UPLOAD_DIR = path.join(path.resolve(config.upload.dir), 'temp');

// Ensure temp directory exists (bind mounts on NAS systems may deny writes — don't
// crash the server; the upload route will surface the error instead)
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  try {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.warn(`⚠ Cannot create temp upload directory: ${(err as Error).message}`);
    console.warn('  Trip cover image uploads will be unavailable until directory permissions are fixed.');
  }
}

// Cover images are uploaded to disk first, then re-encoded by the service layer.
// Content is validated with magic bytes there — the mimetype check here is preliminary.
const uploadCoverImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const random = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname);
      cb(null, `temp-cover-${Date.now()}-${random}${ext}`);
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB — covers are single stills, not videos
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// All trip routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/trips:
 *   post:
 *     summary: Create a new trip
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTripInput'
 *     responses:
 *       201:
 *         description: Trip created successfully
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Get all trips for the current user
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by trip status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title or description
 *     responses:
 *       200:
 *         description: List of trips
 */
router.post('/', tripController.createTrip);
router.get('/', tripController.getTrips);

/**
 * @openapi
 * /api/trips/{id}:
 *   get:
 *     summary: Get a trip by ID
 *     tags: [Trips]
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
 *         description: Trip details
 *       404:
 *         description: Trip not found
 *   put:
 *     summary: Update a trip
 *     tags: [Trips]
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
 *         description: Trip updated
 *   delete:
 *     summary: Delete a trip
 *     tags: [Trips]
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
 *         description: Trip deleted
 */
router.get('/:id', tripController.getTripById);
router.put('/:id', tripController.updateTrip);
router.delete('/:id', tripController.deleteTrip);

// Cover photo routes
// PUT /cover-photo picks an existing trip photo; POST /cover-image uploads a standalone
// image that never enters the trip's photo library. Setting either one clears the other.
router.put('/:id/cover-photo', tripController.updateCoverPhoto);
router.post('/:id/cover-image', uploadCoverImage.single('image'), tripController.uploadCoverImage);
router.delete('/:id/cover-image', tripController.deleteCoverImage);

// Trip validation routes
router.get('/:id/validate', tripController.validateTrip);
router.get('/:id/validation-status', tripController.getValidationStatus);
router.post('/:id/validation/dismiss', tripController.dismissValidationIssue);
router.post('/:id/validation/restore', tripController.restoreValidationIssue);

// Trip duplication route
router.post('/:id/duplicate', tripController.duplicateTrip);

// Public share link management (owner only; enforced in share.service)
router.post('/:id/share', shareController.enableShare);
router.post('/:id/share/rotate', shareController.rotateShareToken);
router.delete('/:id/share', shareController.disableShare);

export default router;

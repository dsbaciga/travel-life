import { Router } from 'express';
import { aiController } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimit';

const router = Router({ mergeParams: true });

// authenticate must run BEFORE aiLimiter so the limiter can key off req.user.id.
router.use(authenticate);
router.use(aiLimiter);

// Trip-scoped AI routes — mounted at /api/trips/:tripId/ai
router.get('/link-suggestions', aiController.getLinkSuggestions);
router.post('/journal-summary', aiController.generateJournalSummary);
router.post('/journal-day-draft', aiController.generateJournalDayDraft);

export default router;

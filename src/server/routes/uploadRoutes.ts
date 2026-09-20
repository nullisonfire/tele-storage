import { Router, Request, Response } from 'express';
import { requireAuth, requireApproved } from '../../auth/authorization';
import { uploadService } from '../../services/uploadService';
import { logger } from '../../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(requireApproved);

/**
 * GET /api/upload/session/active
 * Get currently active upload session for the user
 */
router.get('/session/active', async (req: Request, res: Response) => {
  try {
    const session = await uploadService.getActiveSession(req.user!.id);
    res.json({ session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upload/session/start
 * Enables upload ingestion mode for a destination directory
 */
router.post('/session/start', async (req: Request, res: Response) => {
  const { destinationDirectory } = req.body;
  if (!destinationDirectory) {
    res.status(400).json({ error: 'destinationDirectory is required' });
    return;
  }

  try {
    const session = await uploadService.startUploadSession(req.user!.id, destinationDirectory);
    res.json({ success: true, session });
  } catch (err: any) {
    logger.error({ err, userId: req.user?.id }, 'Failed to start upload session');
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/upload/session/complete
 * Completes and locks the active upload session (User clicks "Done" on browser/mini-app)
 */
router.post('/session/complete', async (req: Request, res: Response) => {
  try {
    const session = await uploadService.completeUploadSession(req.user!.id);
    res.json({ success: true, session });
  } catch (err: any) {
    logger.error({ err, userId: req.user?.id }, 'Failed to complete upload session');
    res.status(400).json({ error: err.message });
  }
});

export default router;

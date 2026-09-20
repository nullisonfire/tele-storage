import { Router, Request, Response } from 'express';
import { requireAuth, requireApproved, requireAdmin } from '../../auth/authorization';
import { accessService } from '../../services/accessService';
import { mediaService } from '../../services/mediaService';
import { telegramApiService } from '../../telegram/telegramApi';

const router = Router();

// All admin routes strictly require authentication, approval, and admin role
router.use(requireAuth);
router.use(requireApproved);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await accessService.getAllUsers();
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/access/pending
 */
router.get('/access/pending', async (req: Request, res: Response) => {
  try {
    const pending = await accessService.getPendingUsers();
    res.json({ pending });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/access/:id/approve
 */
router.post('/access/:id/approve', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  try {
    const user = await accessService.approveUser(userId);
    await telegramApiService.notifyUserStatusChange(userId, 'approved');
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/access/:id/reject
 */
router.post('/access/:id/reject', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  try {
    const user = await accessService.rejectUser(userId);
    await telegramApiService.notifyUserStatusChange(userId, 'rejected');
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/access/:id/ban
 */
router.post('/access/:id/ban', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  try {
    const user = await accessService.banUser(userId);
    await telegramApiService.notifyUserStatusChange(userId, 'banned');
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/access/:id/unban
 */
router.post('/access/:id/unban', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  try {
    const user = await accessService.unbanUser(userId);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/admin/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await mediaService.getStorageStats();
    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

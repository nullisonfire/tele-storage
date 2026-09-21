import { Router, Request, Response } from 'express';
import fs from 'fs';
import { requireAuth, requireApproved, requireAdmin } from '../../auth/authorization';
import { accessService } from '../../services/accessService';
import { mediaService } from '../../services/mediaService';
import { telegramApiService } from '../../telegram/telegramApi';
import { db } from '../../database/jsonDatabase';
import { config } from '../../config';
import { logger } from '../../utils/logger';

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

/**
 * POST /api/admin/backup
 * Creates database backup and sends JSON file directly to configured admin Telegram IDs.
 */
router.post('/backup', async (req: Request, res: Response) => {
  try {
    const backupFilePath = await db.createBackup();
    const rawData = await db.getRawData();
    const stats = await fs.promises.stat(backupFilePath);

    const meta = {
      usersCount: Object.keys(rawData.users || {}).length,
      mediaCount: Object.keys(rawData.media || {}).length,
      directoriesCount: Object.keys(rawData.directories || {}).length,
      sizeBytes: stats.size,
    };

    const delivery = await telegramApiService.sendDatabaseBackupToAdmins(backupFilePath, meta);

    res.json({
      success: true,
      backupFile: backupFilePath,
      meta,
      delivery,
      message: `Database backup created successfully (${(meta.sizeBytes / 1024).toFixed(1)} KB) and dispatched to admin ID(s): ${delivery.sentTo.join(', ') || 'None'}.`,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create/send database backup');
    res.status(500).json({ error: err.message || 'Failed to create and send backup' });
  }
});

/**
 * GET /api/admin/backup/download
 * Download current database JSON directly
 */
router.get('/backup/download', async (req: Request, res: Response) => {
  try {
    const rawData = await db.getRawData();
    const jsonStr = JSON.stringify(rawData, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `database-backup-${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(jsonStr);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to stream database backup download');
    res.status(500).json({ error: err.message || 'Failed to download backup' });
  }
});

/**
 * POST /api/admin/restore
 * Imports and restores database from provided JSON payload.
 */
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { databaseJson } = req.body;
    let dataToRestore: any;

    if (typeof databaseJson === 'string') {
      try {
        dataToRestore = JSON.parse(databaseJson);
      } catch (parseErr: any) {
        res.status(400).json({ error: `Invalid JSON syntax: ${parseErr.message}` });
        return;
      }
    } else if (typeof databaseJson === 'object' && databaseJson !== null) {
      dataToRestore = databaseJson;
    } else {
      res.status(400).json({ error: 'Missing databaseJson in request body' });
      return;
    }

    // Basic structure validation
    if (!dataToRestore || typeof dataToRestore !== 'object') {
      res.status(400).json({ error: 'Restored database must be a JSON object' });
      return;
    }

    const result = await db.restoreDatabase(dataToRestore);

    res.json({
      success: true,
      message: `Database successfully restored! Restored ${result.mediaCount} media items, ${result.directoriesCount} folders, and ${result.usersCount} users.`,
      result,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to restore database from JSON');
    res.status(500).json({ error: err.message || 'Failed to restore database' });
  }
});

export default router;

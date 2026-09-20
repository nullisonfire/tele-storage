import { Router, Request, Response } from 'express';
import { requireAuth, requireApproved } from '../../auth/authorization';
import { directoryService } from '../../services/directoryService';
import { mediaService } from '../../services/mediaService';
import { searchService } from '../../services/searchService';
import { normalizePath } from '../../filesystem/paths';
import { MediaType } from '../../types';

const router = Router();

// All filesystem endpoints require valid session and approved status
router.use(requireAuth);
router.use(requireApproved);

/**
 * GET /api/fs/list
 * Browse directories and files with filtering, sorting, and pagination
 */
router.get('/list', async (req: Request, res: Response) => {
  const targetPath = (req.query.path as string) || '/';
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 30;
  const sortBy = req.query.sortBy as any;
  const filterType = req.query.filterType as any;

  try {
    const listResult = await directoryService.list(targetPath, {
      page,
      pageSize,
      sortBy,
      filterType,
    });
    res.json(listResult);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Directory not found' });
  }
});

/**
 * POST /api/fs/mkdir
 * Create a new folder
 */
router.post('/mkdir', async (req: Request, res: Response) => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    res.status(400).json({ error: 'Folder path is required' });
    return;
  }

  try {
    const created = await directoryService.mkdir(targetPath, req.user!.id);
    res.json({ success: true, directory: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/fs/rename
 * Rename directory
 */
router.post('/rename', async (req: Request, res: Response) => {
  const { path: targetPath, newName } = req.body;
  if (!targetPath || !newName) {
    res.status(400).json({ error: 'Path and newName are required' });
    return;
  }

  try {
    const renamed = await directoryService.rename(targetPath, newName);
    res.json({ success: true, directory: renamed });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/fs/move
 * Move media file or directory
 */
router.post('/move', async (req: Request, res: Response) => {
  const { id, targetDirectory, type } = req.body;
  if (!id || !targetDirectory) {
    res.status(400).json({ error: 'id and targetDirectory are required' });
    return;
  }

  try {
    if (type === 'file') {
      const moved = await mediaService.move(id, targetDirectory);
      res.json({ success: true, media: moved });
    } else {
      res.status(400).json({ error: 'Moving whole directories is not supported via this endpoint' });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/fs/item
 * Delete file or directory
 */
router.delete('/item', async (req: Request, res: Response) => {
  const { id, path: targetPath, type } = req.body;

  try {
    if (type === 'directory') {
      if (!targetPath) {
        res.status(400).json({ error: 'Directory path is required' });
        return;
      }
      await directoryService.delete(targetPath, true);
      res.json({ success: true, message: 'Directory deleted' });
    } else {
      if (!id) {
        res.status(400).json({ error: 'File ID is required' });
        return;
      }
      await mediaService.deleteFromLibrary(id);
      res.json({ success: true, message: 'File removed from library' });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/fs/search
 */
router.get('/search', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 30;

  try {
    const result = await searchService.search(query, page, pageSize);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fs/favorites
 */
router.get('/favorites', async (req: Request, res: Response) => {
  try {
    const favorites = await mediaService.getFavorites();
    res.json({ favorites });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fs/recent
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const recent = await mediaService.getRecentViews(30);
    res.json({ recent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fs/pin
 */
router.post('/pin', async (req: Request, res: Response) => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    res.status(400).json({ error: 'Path is required' });
    return;
  }
  const isPinned = await directoryService.togglePin(targetPath);
  res.json({ success: true, isPinned });
});

/**
 * GET /api/fs/pinned
 */
router.get('/pinned', async (req: Request, res: Response) => {
  const pinned = await directoryService.getPinnedDirectories();
  res.json({ pinned });
});

export default router;

import { Router, Request, Response } from 'express';
import JSZip from 'jszip';
import { requireAuth, requireApproved } from '../../auth/authorization';
import { mediaService } from '../../services/mediaService';
import { telegramApiService } from '../../telegram/telegramApi';
import { mtprotoService } from '../../telegram/mtprotoService';
import { MediaItem } from '../../types';
import { logger } from '../../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(requireApproved);

/**
 * GET /api/media/:id
 * Get single media details
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const media = await mediaService.getMedia(id);
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  // Record recent view
  await mediaService.recordRecentView(id);

  res.json({ media });
});

/**
 * POST /api/media/:id/rename
 */
router.post('/:id/rename', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newName } = req.body;
  if (!newName) {
    res.status(400).json({ error: 'New filename is required' });
    return;
  }

  try {
    const updated = await mediaService.rename(id, newName);
    res.json({ success: true, media: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/media/:id/favorite
 */
router.post('/:id/favorite', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const isFavorite = await mediaService.toggleFavorite(id);
    res.json({ success: true, isFavorite });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/media/:id/download
 * Direct download of a single media item.
 * - Files <= 20MB are strictly routed to the standard Telegram Bot API.
 * - Files > 20MB are routed to the MTProto client to bypass Bot API limits without risking account restrictions.
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  const { id } = req.params;
  const media = await mediaService.getMedia(id);
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  // Hybrid Routing: Check if file exceeds the 20MB Bot API limit
  const isOver20MB = mtprotoService.isOver20MB(media.size);

  if (isOver20MB) {
    logger.info(
      { id, name: media.name, size: media.size },
      'Routing file >20MB to MTProto client for download'
    );

    if (!mtprotoService.isConfigured()) {
      res.status(413).json({
        error: `File "${media.name}" (${(media.size / (1024 * 1024)).toFixed(1)}MB) exceeds Telegram Bot API's 20MB download limit. Configure TELEGRAM_API_ID and TELEGRAM_API_HASH to enable MTProto downloads for files over 20MB.`,
        requiresMtproto: true,
        fileSize: media.size,
      });
      return;
    }

    try {
      res.setHeader('Content-Type', media.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(media.name)}"`);
      if (media.size) res.setHeader('Content-Length', media.size);
      res.setHeader('X-Telegram-Transport', 'MTProto');

      await mtprotoService.streamFileOver20MB(media, res);
      return;
    } catch (err: any) {
      logger.error({ err, id, name: media.name }, 'MTProto download failed');
      if (!res.headersSent) {
        res.status(500).json({ error: `MTProto download error: ${err.message}` });
      }
      return;
    }
  }

  // Files <= 20MB: strictly route via standard Telegram Bot API
  const downloadResult = await telegramApiService.getFileDownloadResult(media.telegram.file_id);

  // If Bot API returned 'file is too big' (size metadata in DB was inaccurate or <=20MB nominal), fallback to MTProto
  if (downloadResult.isTooBig) {
    logger.info({ id, name: media.name }, 'Bot API reported file is too big, falling back to MTProto');
    if (!mtprotoService.isConfigured()) {
      res.status(413).json({
        error: `Telegram Bot API reported this file exceeds the 20MB download limit. Configure TELEGRAM_API_ID and TELEGRAM_API_HASH to enable MTProto downloads.`,
        requiresMtproto: true,
        fileSize: media.size,
      });
      return;
    }

    try {
      res.setHeader('Content-Type', media.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(media.name)}"`);
      if (media.size) res.setHeader('Content-Length', media.size);
      res.setHeader('X-Telegram-Transport', 'MTProto-Fallback');

      await mtprotoService.streamFileOver20MB(media, res);
      return;
    } catch (err: any) {
      logger.error({ err, id }, 'MTProto fallback download failed');
      if (!res.headersSent) {
        res.status(500).json({ error: `MTProto download error: ${err.message}` });
      }
      return;
    }
  }

  if (!downloadResult.url) {
    // If not available from Telegram (e.g. simulated or missing bot token), deliver metadata response
    res.status(404).json({ error: 'Unable to resolve file from Telegram servers. Ensure bot token is configured.' });
    return;
  }

  try {
    const fileRes = await fetch(downloadResult.url);
    if (!fileRes.ok || !fileRes.body) {
      res.status(502).json({ error: 'Failed to download file from Telegram Bot API' });
      return;
    }

    res.setHeader('Content-Type', media.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(media.name)}"`);
    if (media.size) res.setHeader('Content-Length', media.size);
    res.setHeader('X-Telegram-Transport', 'BotAPI');

    const { Readable } = await import('stream');
    Readable.fromWeb(fileRes.body as any).pipe(res);
  } catch (err: any) {
    logger.error({ err, id }, 'Failed to stream media file download');
    res.status(500).json({ error: 'Error downloading file from Telegram' });
  }
});

/**
 * POST /api/media/download-zip
 * Multi-file batch download packaged directly into a ZIP archive for browser download
 */
router.post('/download-zip', async (req: Request, res: Response) => {
  const { ids, zipName } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array is required' });
    return;
  }

  try {
    const zip = new JSZip();
    const mediaItems = await Promise.all(ids.map((id: string) => mediaService.getMedia(id)));
    const validItems = mediaItems.filter(Boolean) as MediaItem[];

    if (validItems.length === 0) {
      res.status(404).json({ error: 'No media items found for the provided IDs' });
      return;
    }

    const usedNames = new Set<string>();

    for (const media of validItems) {
      let fileName = media.name;
      let counter = 1;
      while (usedNames.has(fileName)) {
        const dot = media.name.lastIndexOf('.');
        if (dot > 0) {
          fileName = `${media.name.substring(0, dot)} (${counter})${media.name.substring(dot)}`;
        } else {
          fileName = `${media.name} (${counter})`;
        }
        counter++;
      }
      usedNames.add(fileName);

      // Route >20MB files to MTProto, and <=20MB files to Bot API
      if (mtprotoService.isOver20MB(media.size)) {
        if (mtprotoService.isConfigured()) {
          try {
            const buffer = await mtprotoService.downloadFileOver20MB(media);
            zip.file(fileName, buffer);
            continue;
          } catch (mtprotoErr) {
            logger.warn({ mtprotoErr, fileId: media.telegram.file_id }, 'Failed to fetch >20MB media via MTProto for zip');
          }
        }
      } else {
        const downloadResult = await telegramApiService.getFileDownloadResult(media.telegram.file_id);
        if (downloadResult.isTooBig && mtprotoService.isConfigured()) {
          try {
            const buffer = await mtprotoService.downloadFileOver20MB(media);
            zip.file(fileName, buffer);
            continue;
          } catch (mtprotoErr) {
            logger.warn({ mtprotoErr, fileId: media.telegram.file_id }, 'Failed to fetch fallback media via MTProto for zip');
          }
        } else if (downloadResult.url) {
          try {
            const fileRes = await fetch(downloadResult.url);
            if (fileRes.ok) {
              const arrayBuffer = await fileRes.arrayBuffer();
              zip.file(fileName, arrayBuffer);
              continue;
            }
          } catch (fetchErr) {
            logger.warn({ fetchErr, fileId: media.telegram.file_id }, 'Failed to fetch telegram media chunk for zip');
          }
        }
      }

      // Fallback text entry if direct stream could not be fetched
      zip.file(fileName, `Offline media metadata: ${media.name} (${media.size} bytes)`);
    }

    const content = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const outZipName = zipName ? `${zipName.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}.zip` : `media_download_${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outZipName)}"`);
    res.setHeader('Content-Length', content.length);
    res.send(content);
  } catch (err: any) {
    logger.error({ err }, 'Failed to generate ZIP download archive');
    res.status(500).json({ error: 'Failed to build ZIP file' });
  }
});

/**
 * GET /api/media/folder-zip
 * Download all files within a specific folder as a single ZIP archive
 */
router.get('/folder-zip', async (req: Request, res: Response) => {
  const folderPath = (req.query.path as string) || '/';

  try {
    const allMedia = await mediaService.getAllMedia();
    const folderMedia = allMedia.filter((m: MediaItem) => m.directory === folderPath);

    if (folderMedia.length === 0) {
      res.status(404).json({ error: 'No files found in this folder to zip' });
      return;
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const media of folderMedia) {
      let fileName = media.name;
      let counter = 1;
      while (usedNames.has(fileName)) {
        const dot = media.name.lastIndexOf('.');
        if (dot > 0) {
          fileName = `${media.name.substring(0, dot)} (${counter})${media.name.substring(dot)}`;
        } else {
          fileName = `${media.name} (${counter})`;
        }
        counter++;
      }
      usedNames.add(fileName);

      // Route >20MB files to MTProto, and <=20MB files to Bot API
      if (mtprotoService.isOver20MB(media.size)) {
        if (mtprotoService.isConfigured()) {
          try {
            const buffer = await mtprotoService.downloadFileOver20MB(media);
            zip.file(fileName, buffer);
            continue;
          } catch (mtprotoErr) {
            logger.warn({ mtprotoErr, fileId: media.telegram.file_id }, 'Failed to fetch telegram media chunk via MTProto for folder zip');
          }
        }
      } else {
        const downloadResult = await telegramApiService.getFileDownloadResult(media.telegram.file_id);
        if (downloadResult.isTooBig && mtprotoService.isConfigured()) {
          try {
            const buffer = await mtprotoService.downloadFileOver20MB(media);
            zip.file(fileName, buffer);
            continue;
          } catch (mtprotoErr) {
            logger.warn({ mtprotoErr, fileId: media.telegram.file_id }, 'Failed to fetch fallback media via MTProto for folder zip');
          }
        } else if (downloadResult.url) {
          try {
            const fileRes = await fetch(downloadResult.url);
            if (fileRes.ok) {
              const arrayBuffer = await fileRes.arrayBuffer();
              zip.file(fileName, arrayBuffer);
              continue;
            }
          } catch (fetchErr) {
            logger.warn({ fetchErr, fileId: media.telegram.file_id }, 'Failed to fetch telegram media chunk for folder zip');
          }
        }
      }

      zip.file(fileName, `Offline media metadata: ${media.name} (${media.size} bytes)`);
    }

    const content = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const folderSlug = folderPath === '/' ? 'root' : folderPath.replace(/[\/\\]+/g, '_').replace(/^_+/, '');
    const outZipName = `${folderSlug}_files.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outZipName)}"`);
    res.setHeader('Content-Length', content.length);
    res.send(content);
  } catch (err: any) {
    logger.error({ err, folderPath }, 'Failed to generate folder zip');
    res.status(500).json({ error: 'Failed to build folder zip' });
  }
});

function getPreviewMime(fileName: string, storedMime?: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    aac: 'audio/aac',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    ts: 'text/plain; charset=utf-8',
    tsx: 'text/plain; charset=utf-8',
    jsx: 'text/plain; charset=utf-8',
    json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    py: 'text/plain; charset=utf-8',
    php: 'text/plain; charset=utf-8',
    sh: 'text/plain; charset=utf-8',
    bash: 'text/plain; charset=utf-8',
    sql: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    yml: 'text/yaml; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeMap[ext] || storedMime || 'application/octet-stream';
}

/**
 * GET /api/media/:id/thumbnail
 * Streams media thumbnail (or smaller image) for grid cards
 */
router.get('/:id/thumbnail', async (req: Request, res: Response) => {
  const { id } = req.params;
  const media = await mediaService.getMedia(id);
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  const targetFileId = media.telegram.thumbnail_file_id || media.telegram.file_id;
  const streamUrl = await telegramApiService.getFileDownloadUrl(targetFileId);
  if (!streamUrl) {
    res.status(404).json({ error: 'Thumbnail not available' });
    return;
  }

  try {
    const fileRes = await fetch(streamUrl);
    if (!fileRes.ok || !fileRes.body) {
      res.status(502).json({ error: 'Failed to fetch thumbnail from Telegram' });
      return;
    }

    res.setHeader('Content-Type', media.telegram.thumbnail_file_id ? 'image/jpeg' : (media.mime_type || 'image/jpeg'));
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');

    const { Readable } = await import('stream');
    Readable.fromWeb(fileRes.body as any).pipe(res);
  } catch (err: any) {
    logger.error({ err, id }, 'Failed to stream thumbnail');
    res.status(500).json({ error: 'Error streaming thumbnail' });
  }
});

/**
 * GET /api/media/:id/preview
 * Streams actual media file with Range support for video/audio seeking and in-browser preview.
 * - Files <= 20MB are streamed through the standard Telegram Bot API.
 * - Files > 20MB are streamed via MTProto iterDownload with full byte range seeking.
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  const { id } = req.params;
  const media = await mediaService.getMedia(id);
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  const isOver20MB = mtprotoService.isOver20MB(media.size);

  if (isOver20MB) {
    logger.info(
      { id, name: media.name, size: media.size },
      'Routing file >20MB to MTProto client for preview streaming'
    );

    if (!mtprotoService.isConfigured()) {
      res.status(413).json({
        error: `File "${media.name}" (${(media.size / (1024 * 1024)).toFixed(1)}MB) exceeds Telegram Bot API's 20MB preview limit. Configure TELEGRAM_API_ID and TELEGRAM_API_HASH in settings to stream files over 20MB via MTProto.`,
        requiresMtproto: true,
        fileSize: media.size,
      });
      return;
    }

    try {
      const contentType = getPreviewMime(media.name, media.mime_type);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.name)}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Telegram-Transport', 'MTProto');

      let start = 0;
      let end = media.size > 0 ? media.size - 1 : undefined;

      if (req.headers.range && media.size > 0) {
        const parts = req.headers.range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10) || 0;
        end = parts[1] ? parseInt(parts[1], 10) : media.size - 1;
        if (end >= media.size) end = media.size - 1;

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${media.size}`);
        res.setHeader('Content-Length', chunkSize);
      } else {
        res.status(200);
        if (media.size) res.setHeader('Content-Length', media.size);
      }

      await mtprotoService.streamFileOver20MB(media, res, { start, end });
      return;
    } catch (err: any) {
      logger.error({ err, id, name: media.name }, 'MTProto preview stream failed');
      if (!res.headersSent) {
        res.status(500).json({ error: `MTProto streaming error: ${err.message}` });
      }
      return;
    }
  }

  // Files <= 20MB: strictly route via standard Telegram Bot API
  const downloadResult = await telegramApiService.getFileDownloadResult(media.telegram.file_id);

  if (downloadResult.isTooBig) {
    logger.info({ id, name: media.name }, 'Bot API reported file is too big for preview, falling back to MTProto');
    if (!mtprotoService.isConfigured()) {
      res.status(413).json({
        error: `Telegram Bot API reported this file exceeds the 20MB preview limit. Configure TELEGRAM_API_ID and TELEGRAM_API_HASH to enable MTProto streaming.`,
        requiresMtproto: true,
        fileSize: media.size,
      });
      return;
    }

    try {
      const contentType = getPreviewMime(media.name, media.mime_type);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.name)}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Telegram-Transport', 'MTProto-Fallback');

      let start = 0;
      let end = media.size > 0 ? media.size - 1 : undefined;

      if (req.headers.range && media.size > 0) {
        const parts = req.headers.range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10) || 0;
        end = parts[1] ? parseInt(parts[1], 10) : media.size - 1;
        if (end >= media.size) end = media.size - 1;

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${media.size}`);
        res.setHeader('Content-Length', chunkSize);
      } else {
        res.status(200);
        if (media.size) res.setHeader('Content-Length', media.size);
      }

      await mtprotoService.streamFileOver20MB(media, res, { start, end });
      return;
    } catch (err: any) {
      logger.error({ err, id }, 'MTProto fallback preview stream failed');
      if (!res.headersSent) {
        res.status(500).json({ error: `MTProto streaming error: ${err.message}` });
      }
      return;
    }
  }

  if (!downloadResult.url) {
    res.status(404).json({ error: 'Preview stream not available' });
    return;
  }

  try {
    const requestHeaders: Record<string, string> = {};
    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const fileRes = await fetch(downloadResult.url, {
      headers: requestHeaders,
    });

    if (!fileRes.ok && fileRes.status !== 206) {
      res.status(fileRes.status || 502).json({ error: 'Failed to fetch file from Telegram' });
      return;
    }

    const contentType = getPreviewMime(media.name, media.mime_type);
    res.status(fileRes.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.name)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Telegram-Transport', 'BotAPI');

    const contentRange = fileRes.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }
    const contentLength = fileRes.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (!fileRes.body) {
      res.end();
      return;
    }

    const { Readable } = await import('stream');
    Readable.fromWeb(fileRes.body as any).pipe(res);
  } catch (err: any) {
    logger.error({ err, id }, 'Failed to stream media preview');
    res.status(500).json({ error: 'Error streaming preview' });
  }
});

/**
 * GET /api/media/:id/text
 * Returns text content for code/script/markdown preview
 */
router.get('/:id/text', async (req: Request, res: Response) => {
  const { id } = req.params;
  const media = await mediaService.getMedia(id);
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  if (media.size > 5 * 1024 * 1024) {
    res.status(413).json({ error: 'File is too large for inline text preview (max 5MB)' });
    return;
  }

  const streamUrl = await telegramApiService.getFileDownloadUrl(media.telegram.file_id);
  if (!streamUrl) {
    res.status(404).json({ error: 'File download URL unavailable' });
    return;
  }

  try {
    const fileRes = await fetch(streamUrl);
    if (!fileRes.ok) {
      res.status(502).json({ error: 'Failed to retrieve file from Telegram' });
      return;
    }

    const text = await fileRes.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (err: any) {
    logger.error({ err, id }, 'Failed to fetch media text content');
    res.status(500).json({ error: 'Error reading text content' });
  }
});

export default router;

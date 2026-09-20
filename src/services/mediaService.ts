import crypto from 'crypto';
import { db } from '../database/jsonDatabase';
import { MediaItem, MediaType, StorageStats } from '../types';
import { normalizePath, sanitizeFilename } from '../filesystem/paths';
import { logger } from '../utils/logger';
import { enrichTelegramMetadata } from '../telegram/fileIdHelper';

export class MediaService {
  /**
   * Generates a unique filename in the directory to avoid overwrites.
   * e.g. photo.jpg -> photo (2).jpg -> photo (3).jpg
   */
  public async getUniqueFilename(directory: string, desiredName: string): Promise<string> {
    const normDir = normalizePath(directory);
    const cleanName = sanitizeFilename(desiredName);
    const allMedia = await db.getAllMedia();
    const existingNames = new Set(
      allMedia
        .filter((m) => normalizePath(m.directory) === normDir)
        .map((m) => m.name.toLowerCase())
    );

    if (!existingNames.has(cleanName.toLowerCase())) {
      return cleanName;
    }

    const dotIdx = cleanName.lastIndexOf('.');
    const base = dotIdx > 0 ? cleanName.substring(0, dotIdx) : cleanName;
    const ext = dotIdx > 0 ? cleanName.substring(dotIdx) : '';

    let counter = 2;
    while (existingNames.has(`${base} (${counter})${ext}`.toLowerCase())) {
      counter++;
    }

    return `${base} (${counter})${ext}`;
  }

  public async createMedia(item: Omit<MediaItem, 'id' | 'created_at' | 'updated_at'>): Promise<MediaItem> {
    const normDir = normalizePath(item.directory);
    const uniqueName = await this.getUniqueFilename(normDir, item.name);
    const now = Date.now();

    const media: MediaItem = {
      ...item,
      id: crypto.randomUUID(),
      name: uniqueName,
      directory: normDir,
      created_at: now,
      updated_at: now,
    };

    await db.saveMedia(media);
    logger.info({ id: media.id, name: media.name, dir: media.directory, size: media.size }, 'Created media item');
    return media;
  }

  public async getMedia(id: string): Promise<MediaItem | null> {
    const item = await db.getMedia(id);
    if (!item) return null;
    if (item.telegram) {
      enrichTelegramMetadata(item.telegram);
    }
    return item;
  }

  public async getAllMedia(): Promise<MediaItem[]> {
    return db.getAllMedia();
  }

  public async rename(id: string, newName: string): Promise<MediaItem> {
    const media = await db.getMedia(id);
    if (!media) throw new Error(`Media not found: ${id}`);

    const uniqueName = await this.getUniqueFilename(media.directory, newName);
    media.name = uniqueName;
    media.updated_at = Date.now();

    await db.saveMedia(media);
    logger.info({ id, newName: media.name }, 'Media renamed');
    return media;
  }

  public async move(id: string, targetDirectory: string): Promise<MediaItem> {
    const media = await db.getMedia(id);
    if (!media) throw new Error(`Media not found: ${id}`);

    const normTarget = normalizePath(targetDirectory);
    const uniqueName = await this.getUniqueFilename(normTarget, media.name);

    media.directory = normTarget;
    media.name = uniqueName;
    media.updated_at = Date.now();

    await db.saveMedia(media);
    logger.info({ id, to: normTarget }, 'Media moved');
    return media;
  }

  /**
   * Delete media from library (logical database only by default)
   */
  public async deleteFromLibrary(id: string): Promise<void> {
    const media = await db.getMedia(id);
    if (!media) throw new Error(`Media not found: ${id}`);
    await db.deleteMedia(id);
    logger.info({ id, name: media.name }, 'Media deleted from library');
  }

  /**
   * Toggle favorite
   */
  public async toggleFavorite(id: string): Promise<boolean> {
    const media = await db.getMedia(id);
    if (!media) throw new Error(`Media not found: ${id}`);

    const isFav = await db.write((data) => {
      const idx = data.favorites.indexOf(id);
      if (idx >= 0) {
        data.favorites.splice(idx, 1);
        media.is_favorite = false;
        data.media[id] = media;
        return false;
      } else {
        data.favorites.push(id);
        media.is_favorite = true;
        data.media[id] = media;
        return true;
      }
    });

    return isFav;
  }

  public async getFavorites(): Promise<MediaItem[]> {
    const favIds = await db.read((d) => d.favorites);
    const result: MediaItem[] = [];
    for (const id of favIds) {
      const item = await db.getMedia(id);
      if (item) result.push(item);
    }
    return result;
  }

  public async recordRecentView(id: string): Promise<void> {
    await db.write((data) => {
      data.recent_media = data.recent_media.filter((r) => r.media_id !== id);
      data.recent_media.unshift({ media_id: id, viewed_at: Date.now() });
      if (data.recent_media.length > 50) {
        data.recent_media = data.recent_media.slice(0, 50);
      }
    });
  }

  public async getRecentViews(limit: number = 20): Promise<MediaItem[]> {
    const recents = await db.read((d) => d.recent_media);
    const result: MediaItem[] = [];
    for (const r of recents.slice(0, limit)) {
      const item = await db.getMedia(r.media_id);
      if (item) result.push(item);
    }
    return result;
  }

  /**
   * Compute comprehensive storage statistics for admin dashboard
   */
  public async getStorageStats(): Promise<StorageStats> {
    const allDirs = await db.getAllDirectories();
    const allMedia = await db.getAllMedia();

    let totalSizeBytes = 0;
    const typeCounts: Record<MediaType, number> = {
      image: 0,
      video: 0,
      document: 0,
      audio: 0,
      other: 0,
    };

    const dirSizes: Record<string, { count: number; size: number }> = {};
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let recentUploadsCount = 0;

    for (const item of allMedia) {
      totalSizeBytes += item.size || 0;
      typeCounts[item.media_type] = (typeCounts[item.media_type] || 0) + 1;

      const d = item.directory;
      if (!dirSizes[d]) dirSizes[d] = { count: 0, size: 0 };
      dirSizes[d].count++;
      dirSizes[d].size += item.size || 0;

      if (item.created_at > oneDayAgo) {
        recentUploadsCount++;
      }
    }

    const largest = Object.entries(dirSizes)
      .map(([path, stat]) => ({ path, file_count: stat.count, total_size: stat.size }))
      .sort((a, b) => b.total_size - a.total_size)
      .slice(0, 5);

    return {
      total_files: allMedia.length,
      total_directories: allDirs.length,
      total_size_bytes: totalSizeBytes,
      type_counts: typeCounts,
      largest_directories: largest,
      recent_uploads_count: recentUploadsCount,
    };
  }
}

export const mediaService = new MediaService();

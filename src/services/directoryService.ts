import crypto from 'crypto';
import { db } from '../database/jsonDatabase';
import { DirectoryItem, DirectoryListResult, MediaItem, MediaType } from '../types';
import { normalizePath, getParentPath, getDirectoryName, sanitizeFilename } from '../filesystem/paths';
import { logger } from '../utils/logger';

export interface ListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'newest' | 'oldest' | 'size' | 'type';
  filterType?: 'all' | MediaType;
}

export class DirectoryService {
  /**
   * Create directory. Automatically creates parent directories recursively.
   */
  public async mkdir(targetPath: string, createdBy: number = 0): Promise<DirectoryItem> {
    const normalized = normalizePath(targetPath);
    if (normalized === '/') {
      return (await db.getDirectory('/'))!;
    }

    const existing = await db.getDirectory(normalized);
    if (existing) {
      return existing;
    }

    // Ensure parent directory exists first
    const parent = getParentPath(normalized);
    if (parent && parent !== '/') {
      await this.mkdir(parent, createdBy);
    }

    const now = Date.now();
    const newDir: DirectoryItem = {
      id: crypto.randomUUID(),
      name: getDirectoryName(normalized),
      path: normalized,
      parent_path: parent || '/',
      created_at: now,
      updated_at: now,
      created_by: createdBy,
    };

    await db.saveDirectory(newDir);
    logger.info({ path: normalized }, 'Created directory');
    return newDir;
  }

  /**
   * List contents of a directory with sorting and pagination.
   */
  public async list(targetPath: string, options: ListOptions = {}): Promise<DirectoryListResult> {
    const norm = normalizePath(targetPath);
    const dir = await db.getDirectory(norm);
    if (!dir && norm !== '/') {
      throw new Error(`Directory not found: ${norm}`);
    }

    const allDirs = await db.getAllDirectories();
    const allMedia = await db.getAllMedia();

    // Direct subdirectories: parent_path equals current path
    let childDirs = allDirs.filter((d) => d.parent_path === norm && d.path !== norm);
    childDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Media in this exact directory
    let files = allMedia.filter((m) => normalizePath(m.directory) === norm);

    // Apply filter
    if (options.filterType && options.filterType !== 'all') {
      files = files.filter((m) => m.media_type === options.filterType);
    }

    // Apply sorting
    const sortBy = options.sortBy || 'newest';
    files.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'newest':
          return b.created_at - a.created_at;
        case 'oldest':
          return a.created_at - b.created_at;
        case 'size':
          return b.size - a.size;
        case 'type':
          return a.media_type.localeCompare(b.media_type);
        default:
          return b.created_at - a.created_at;
      }
    });

    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, options.pageSize || 30);
    const totalFiles = files.length;
    const totalPages = Math.ceil(totalFiles / pageSize) || 1;

    const startIndex = (page - 1) * pageSize;
    const paginatedFiles = files.slice(startIndex, startIndex + pageSize);

    return {
      current_path: norm,
      parent_path: getParentPath(norm),
      directories: childDirs,
      files: paginatedFiles,
      total_files_in_dir: totalFiles,
      page,
      page_size: pageSize,
      total_pages: totalPages,
    };
  }

  /**
   * Rename directory and cascades to all child directories and files.
   */
  public async rename(targetPath: string, newName: string): Promise<DirectoryItem> {
    const norm = normalizePath(targetPath);
    if (norm === '/') {
      throw new Error('Cannot rename root directory');
    }

    const cleanName = sanitizeFilename(newName);
    if (!cleanName) {
      throw new Error('Invalid directory name');
    }

    const dir = await db.getDirectory(norm);
    if (!dir) {
      throw new Error(`Directory not found: ${norm}`);
    }

    const parent = dir.parent_path;
    const newPath = normalizePath(`${parent}/${cleanName}`);

    if (newPath === norm) {
      return dir;
    }

    const existingTarget = await db.getDirectory(newPath);
    if (existingTarget) {
      throw new Error(`A directory named "${cleanName}" already exists in ${parent}`);
    }

    await db.write((data) => {
      // 1. Update directory itself
      delete data.directories[norm];
      dir.name = cleanName;
      dir.path = newPath;
      dir.updated_at = Date.now();
      data.directories[newPath] = dir;

      // 2. Cascade update child directory paths
      for (const d of Object.values(data.directories)) {
        if (d.path.startsWith(norm + '/')) {
          const subPath = d.path.substring(norm.length);
          const updatedPath = newPath + subPath;
          delete data.directories[d.path];
          d.path = updatedPath;
          if (d.parent_path.startsWith(norm)) {
            d.parent_path = newPath + d.parent_path.substring(norm.length);
          }
          d.updated_at = Date.now();
          data.directories[updatedPath] = d;
        }
      }

      // 3. Cascade update files
      for (const m of Object.values(data.media)) {
        if (m.directory === norm) {
          m.directory = newPath;
          m.updated_at = Date.now();
        } else if (m.directory.startsWith(norm + '/')) {
          m.directory = newPath + m.directory.substring(norm.length);
          m.updated_at = Date.now();
        }
      }
    });

    logger.info({ from: norm, to: newPath }, 'Directory renamed');
    return dir;
  }

  /**
   * Delete directory.
   */
  public async delete(targetPath: string, recursive: boolean = true): Promise<void> {
    const norm = normalizePath(targetPath);
    if (norm === '/') {
      throw new Error('Cannot delete root directory');
    }

    const dir = await db.getDirectory(norm);
    if (!dir) {
      throw new Error(`Directory not found: ${norm}`);
    }

    await db.write((data) => {
      // Remove this directory
      delete data.directories[norm];

      if (recursive) {
        // Remove child directories
        for (const [p, d] of Object.entries(data.directories)) {
          if (p.startsWith(norm + '/')) {
            delete data.directories[p];
          }
        }
        // Remove media items in this directory and its children
        for (const [id, m] of Object.entries(data.media)) {
          if (m.directory === norm || m.directory.startsWith(norm + '/')) {
            delete data.media[id];
            data.favorites = data.favorites.filter((favId) => favId !== id);
            data.recent_media = data.recent_media.filter((item) => item.media_id !== id);
          }
        }
      }
    });

    logger.info({ path: norm }, 'Directory deleted');
  }

  public async getPinnedDirectories(): Promise<DirectoryItem[]> {
    const raw = await db.read((d) => d.pinned_directories);
    const dirs: DirectoryItem[] = [];
    for (const p of raw) {
      const d = await db.getDirectory(p);
      if (d) dirs.push(d);
    }
    return dirs;
  }

  public async togglePin(path: string): Promise<boolean> {
    const norm = normalizePath(path);
    return db.write((data) => {
      const idx = data.pinned_directories.indexOf(norm);
      if (idx >= 0) {
        data.pinned_directories.splice(idx, 1);
        return false;
      } else {
        data.pinned_directories.push(norm);
        return true;
      }
    });
  }
}

export const directoryService = new DirectoryService();

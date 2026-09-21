import fs from 'fs';
import path from 'path';
import { IDatabase } from './database';
import { DatabaseSchema, UserRecord, DirectoryItem, MediaItem, AuthSession, UploadSession } from '../types';
import { createEmptyDatabase, migrateDatabase } from './schema';
import { config } from '../config';
import { logger } from '../utils/logger';
import { normalizePath } from '../filesystem/paths';

export class JsonDatabase implements IDatabase {
  private filePath: string;
  private tmpPath: string;
  private backupsDir: string;
  private memoryCache: DatabaseSchema | null = null;
  private writeQueue: Promise<any> = Promise.resolve();
  private isInitialized = false;

  constructor(filePath?: string) {
    this.filePath = filePath || config.storage.dbPath;
    this.tmpPath = `${this.filePath}.tmp`;
    this.backupsDir = path.join(path.dirname(this.filePath), 'backups');
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure directories exist
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.mkdir(this.backupsDir, { recursive: true });

    // Load or initialize data
    this.memoryCache = await this.loadSafe();

    // Ensure root directory exists
    if (!this.memoryCache.directories['/']) {
      const now = Date.now();
      this.memoryCache.directories['/'] = {
        id: 'dir-root',
        name: '/',
        path: '/',
        parent_path: '/',
        created_at: now,
        updated_at: now,
        created_by: 0,
      };
      await this.persist();
    }

    this.isInitialized = true;
    logger.info({ path: this.filePath, users: Object.keys(this.memoryCache.users).length, files: Object.keys(this.memoryCache.media).length }, 'JSON Database initialized');
  }

  private async loadSafe(): Promise<DatabaseSchema> {
    // 1. Try reading standard file
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = await fs.promises.readFile(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return migrateDatabase(parsed);
      } catch (err) {
        logger.error({ err, path: this.filePath }, 'Corrupt database file encountered, trying recovery');
      }
    }

    // 2. Try reading .tmp file if standard file failed
    if (fs.existsSync(this.tmpPath)) {
      try {
        const rawTmp = await fs.promises.readFile(this.tmpPath, 'utf-8');
        const parsedTmp = JSON.parse(rawTmp);
        logger.warn('Successfully recovered database from .tmp file');
        return migrateDatabase(parsedTmp);
      } catch (err) {
        logger.error({ err }, 'Failed to recover from .tmp file');
      }
    }

    // 3. Try reading latest backup
    try {
      if (fs.existsSync(this.backupsDir)) {
        const files = await fs.promises.readdir(this.backupsDir);
        const backups = files.filter((f) => f.endsWith('.json')).sort().reverse();
        if (backups.length > 0) {
          const latestBackupPath = path.join(this.backupsDir, backups[0]);
          const rawBackup = await fs.promises.readFile(latestBackupPath, 'utf-8');
          logger.warn({ backup: backups[0] }, 'Restoring database from latest backup');
          return migrateDatabase(JSON.parse(rawBackup));
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to restore database from backup');
    }

    // 4. Default to empty database
    logger.info('Creating fresh empty database');
    return createEmptyDatabase();
  }

  /**
   * Atomic file persist with write mutex and temporary file rename
   */
  private async persist(): Promise<void> {
    if (!this.memoryCache) return;

    const dataSnapshot = JSON.stringify(this.memoryCache, null, 2);

    // Enqueue write sequentially
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        // Write to temporary file first
        await fs.promises.writeFile(this.tmpPath, dataSnapshot, 'utf-8');
        // Atomically replace destination
        await fs.promises.rename(this.tmpPath, this.filePath);
      } catch (err) {
        logger.error({ err }, 'Error during atomic database persist');
        throw err;
      }
    });

    await this.writeQueue;
  }

  public async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupsDir, `database-${timestamp}.json`);
    const data = await this.getRawData();
    await fs.promises.writeFile(backupFile, JSON.stringify(data, null, 2), 'utf-8');
    logger.info({ backupFile }, 'Database backup created');
    return backupFile;
  }

  public async restoreDatabase(data: any): Promise<{ usersCount: number; mediaCount: number; directoriesCount: number }> {
    await this.init();
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup data format: expected a JSON object');
    }

    // Automatically create a safety backup before applying the restore
    try {
      await this.createBackup();
    } catch (backupErr) {
      logger.warn({ backupErr }, 'Could not create safety pre-restore backup');
    }

    // Migrate & sanitize data
    const migrated = migrateDatabase(data);

    // Apply atomically to memory and file
    await this.write((db) => {
      db.version = migrated.version;
      db.users = migrated.users;
      db.directories = migrated.directories;
      db.media = migrated.media;
      db.favorites = migrated.favorites;
      db.recent_media = migrated.recent_media;
      db.pinned_directories = migrated.pinned_directories;
      // Note: sessions and upload_sessions can be preserved or merged
      db.sessions = migrated.sessions || db.sessions;
      db.upload_sessions = migrated.upload_sessions || db.upload_sessions;
    });

    const usersCount = Object.keys(migrated.users).length;
    const mediaCount = Object.keys(migrated.media).length;
    const directoriesCount = Object.keys(migrated.directories).length;

    logger.info({ usersCount, mediaCount, directoriesCount }, 'Database successfully restored from JSON backup');

    return { usersCount, mediaCount, directoriesCount };
  }

  public async read<T>(selector: (data: DatabaseSchema) => T): Promise<T> {
    await this.init();
    return selector(this.memoryCache!);
  }

  public async write<T>(mutator: (data: DatabaseSchema) => T | Promise<T>): Promise<T> {
    await this.init();
    const result = await mutator(this.memoryCache!);
    await this.persist();
    return result;
  }

  public async getRawData(): Promise<DatabaseSchema> {
    await this.init();
    return JSON.parse(JSON.stringify(this.memoryCache!));
  }

  // User Operations
  public async getUser(userId: number): Promise<UserRecord | null> {
    return this.read((db) => db.users[userId.toString()] || null);
  }

  public async getUserByUsername(username: string): Promise<UserRecord | null> {
    const clean = username.toLowerCase().replace(/^@/, '');
    return this.read((db) => {
      for (const u of Object.values(db.users)) {
        if (u.username && u.username.toLowerCase().replace(/^@/, '') === clean) {
          return u;
        }
      }
      return null;
    });
  }

  public async saveUser(user: UserRecord): Promise<void> {
    await this.write((db) => {
      db.users[user.id.toString()] = { ...user, updated_at: Date.now() };
    });
  }

  public async getAllUsers(): Promise<UserRecord[]> {
    return this.read((db) => Object.values(db.users));
  }

  public async deleteUser(userId: number): Promise<void> {
    await this.write((db) => {
      delete db.users[userId.toString()];
    });
  }

  // Directory Operations
  public async getDirectory(path: string): Promise<DirectoryItem | null> {
    const norm = normalizePath(path);
    return this.read((db) => db.directories[norm] || null);
  }

  public async saveDirectory(directory: DirectoryItem): Promise<void> {
    const norm = normalizePath(directory.path);
    await this.write((db) => {
      db.directories[norm] = {
        ...directory,
        path: norm,
        updated_at: Date.now(),
      };
    });
  }

  public async deleteDirectory(path: string): Promise<void> {
    const norm = normalizePath(path);
    await this.write((db) => {
      delete db.directories[norm];
    });
  }

  public async getAllDirectories(): Promise<DirectoryItem[]> {
    return this.read((db) => Object.values(db.directories));
  }

  // Media Operations
  public async getMedia(mediaId: string): Promise<MediaItem | null> {
    return this.read((db) => db.media[mediaId] || null);
  }

  public async saveMedia(media: MediaItem): Promise<void> {
    await this.write((db) => {
      db.media[media.id] = { ...media, updated_at: Date.now() };
    });
  }

  public async deleteMedia(mediaId: string): Promise<void> {
    await this.write((db) => {
      delete db.media[mediaId];
      db.favorites = db.favorites.filter((id) => id !== mediaId);
      db.recent_media = db.recent_media.filter((item) => item.media_id !== mediaId);
    });
  }

  public async getAllMedia(): Promise<MediaItem[]> {
    return this.read((db) => Object.values(db.media));
  }

  // Session Operations
  public async getSession(token: string): Promise<AuthSession | null> {
    return this.read((db) => {
      const session = db.sessions[token];
      if (!session) return null;
      if (session.expires_at < Date.now()) {
        return null;
      }
      return session;
    });
  }

  public async saveSession(session: AuthSession): Promise<void> {
    await this.write((db) => {
      db.sessions[session.token] = session;
    });
  }

  public async deleteSession(token: string): Promise<void> {
    await this.write((db) => {
      delete db.sessions[token];
    });
  }

  public async cleanExpiredSessions(): Promise<void> {
    await this.write((db) => {
      const now = Date.now();
      for (const [token, sess] of Object.entries(db.sessions)) {
        if (sess.expires_at < now) {
          delete db.sessions[token];
        }
      }
    });
  }

  // Upload Session Operations
  public async getUploadSession(sessionId: string): Promise<UploadSession | null> {
    return this.read((db) => db.upload_sessions[sessionId] || null);
  }

  public async getUserActiveUploadSession(userId: number): Promise<UploadSession | null> {
    const timeoutMs = config.storage.uploadTimeoutMinutes * 60 * 1000;
    const now = Date.now();

    return this.read((db) => {
      for (const session of Object.values(db.upload_sessions)) {
        if (session.user_id === userId && session.status === 'active') {
          if (now - session.last_activity > timeoutMs) {
            session.status = 'expired';
            return null;
          }
          return session;
        }
      }
      return null;
    });
  }

  public async saveUploadSession(session: UploadSession): Promise<void> {
    await this.write((db) => {
      db.upload_sessions[session.id] = session;
    });
  }
}

// Global Singleton database instance
export const db = new JsonDatabase();

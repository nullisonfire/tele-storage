import { DatabaseSchema, UserRecord, DirectoryItem, MediaItem, AuthSession, UploadSession } from '../types';

export interface IDatabase {
  init(): Promise<void>;
  read<T>(selector: (data: DatabaseSchema) => T): Promise<T>;
  write<T>(mutator: (data: DatabaseSchema) => T | Promise<T>): Promise<T>;
  getRawData(): Promise<DatabaseSchema>;
  createBackup(): Promise<string>;
  restoreDatabase(data: any): Promise<{ usersCount: number; mediaCount: number; directoriesCount: number }>;

  // User operations
  getUser(userId: number): Promise<UserRecord | null>;
  saveUser(user: UserRecord): Promise<void>;
  getAllUsers(): Promise<UserRecord[]>;

  // Directory operations
  getDirectory(path: string): Promise<DirectoryItem | null>;
  saveDirectory(directory: DirectoryItem): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  getAllDirectories(): Promise<DirectoryItem[]>;

  // Media operations
  getMedia(mediaId: string): Promise<MediaItem | null>;
  saveMedia(media: MediaItem): Promise<void>;
  deleteMedia(mediaId: string): Promise<void>;
  getAllMedia(): Promise<MediaItem[]>;

  // Session operations
  getSession(token: string): Promise<AuthSession | null>;
  saveSession(session: AuthSession): Promise<void>;
  deleteSession(token: string): Promise<void>;
  cleanExpiredSessions(): Promise<void>;

  // Upload Session operations
  getUploadSession(sessionId: string): Promise<UploadSession | null>;
  getUserActiveUploadSession(userId: number): Promise<UploadSession | null>;
  saveUploadSession(session: UploadSession): Promise<void>;
}

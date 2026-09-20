export type AuthorizationState = 'unknown' | 'pending' | 'approved' | 'rejected' | 'banned';

export type UserRole = 'admin' | 'user';

export type MediaType = 'image' | 'video' | 'document' | 'audio' | 'other';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface UserRecord {
  id: number; // Telegram User ID
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  role: UserRole;
  auth_state: AuthorizationState;
  created_at: number;
  updated_at: number;
  last_active_at: number;
  current_directory: string;
}

export interface TelegramMediaMetadata {
  file_id: string;
  file_unique_id?: string;
  media_id?: string; // MTProto Document/Photo ID (e.g. 6158919545537963552)
  access_hash?: string; // MTProto Access Hash (e.g. -8174310789117284616)
  file_reference?: string; // MTProto File Reference hex string
  dc_id?: number; // Datacenter ID
  source_chat_id: number;
  source_message_id: number;
  thumbnail_file_id?: string;
  width?: number;
  height?: number;
  duration?: number;
  performer?: string;
  title?: string;
}

export interface MediaItem {
  id: string; // Internal UUID
  name: string;
  media_type: MediaType;
  mime_type: string;
  size: number;
  directory: string; // Normalized logical path e.g. "/Cox Tour/Photos"
  telegram: TelegramMediaMetadata;
  created_at: number;
  updated_at: number;
  uploaded_by: number; // Telegram User ID
  is_favorite?: boolean;
  album_id?: string;
  tags?: string[];
  description?: string;
}

export interface DirectoryItem {
  id: string; // Internal UUID
  name: string;
  path: string; // Full normalized path, e.g. "/Cox Tour/Photos"
  parent_path: string; // e.g. "/Cox Tour" or "/"
  created_at: number;
  updated_at: number;
  created_by: number;
  is_pinned?: boolean;
  color?: string;
}

export interface UploadSession {
  id: string;
  user_id: number;
  destination_directory: string;
  start_time: number;
  last_activity: number;
  status: 'active' | 'completed' | 'expired';
  files_count: number;
}

export interface AuthSession {
  token: string;
  user_id: number;
  role: UserRole;
  created_at: number;
  expires_at: number;
  user_agent?: string;
  ip?: string;
}

export interface DatabaseSchema {
  version: number;
  users: Record<string, UserRecord>;
  directories: Record<string, DirectoryItem>;
  media: Record<string, MediaItem>;
  sessions: Record<string, AuthSession>;
  upload_sessions: Record<string, UploadSession>;
  favorites: string[]; // Media IDs
  recent_media: Array<{ media_id: string; viewed_at: number }>;
  pinned_directories: string[]; // Directory paths
}

export interface StorageStats {
  total_files: number;
  total_directories: number;
  total_size_bytes: number;
  type_counts: Record<MediaType, number>;
  largest_directories: Array<{ path: string; file_count: number; total_size: number }>;
  recent_uploads_count: number;
}

export interface DirectoryListResult {
  current_path: string;
  parent_path: string | null;
  directories: DirectoryItem[];
  files: MediaItem[];
  total_files_in_dir: number;
  page: number;
  page_size: number;
  total_pages: number;
}

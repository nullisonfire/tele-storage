import { DirectoryListResult, MediaItem, StorageStats, UserRecord, UploadSession } from './types';

export interface MeResponse {
  authenticated: boolean;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    role: 'admin' | 'user';
    auth_state: 'unknown' | 'pending' | 'approved' | 'rejected' | 'banned';
    current_directory: string;
  };
  status: 'unauthorized' | 'unknown' | 'pending' | 'approved' | 'rejected' | 'banned';
  isAdmin?: boolean;
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/me');
  return res.json();
}

export async function authWithMiniApp(initData: string): Promise<any> {
  const res = await fetch('/api/auth/telegram-miniapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  return res.json();
}

export async function requestAccess(): Promise<any> {
  const res = await fetch('/api/auth/request-access', {
    method: 'POST',
  });
  return res.json();
}

export async function logoutUser(): Promise<any> {
  const res = await fetch('/api/auth/logout', { method: 'POST' });
  return res.json();
}

export async function listDirectory(
  path: string = '/',
  page: number = 1,
  pageSize: number = 30,
  sortBy: string = 'newest',
  filterType: string = 'all'
): Promise<DirectoryListResult> {
  const params = new URLSearchParams({
    path,
    page: page.toString(),
    pageSize: pageSize.toString(),
    sortBy,
    filterType,
  });
  const res = await fetch(`/api/fs/list?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to list directory');
  }
  return res.json();
}

export async function createFolder(path: string): Promise<any> {
  const res = await fetch('/api/fs/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create folder');
  }
  return res.json();
}

export async function renameDirectory(path: string, newName: string): Promise<any> {
  const res = await fetch('/api/fs/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, newName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to rename directory');
  }
  return res.json();
}

export async function deleteDirectoryItem(path: string): Promise<any> {
  const res = await fetch('/api/fs/item', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'directory' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete directory');
  }
  return res.json();
}

export async function deleteFileItem(id: string): Promise<any> {
  const res = await fetch('/api/fs/item', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, type: 'file' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete file');
  }
  return res.json();
}

export async function renameFile(id: string, newName: string): Promise<any> {
  const res = await fetch(`/api/media/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to rename file');
  }
  return res.json();
}

export async function moveFile(id: string, targetDirectory: string): Promise<any> {
  const res = await fetch('/api/fs/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, targetDirectory, type: 'file' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to move file');
  }
  return res.json();
}

export async function toggleFavorite(id: string): Promise<{ isFavorite: boolean }> {
  const res = await fetch(`/api/media/${id}/favorite`, { method: 'POST' });
  return res.json();
}

export async function searchFiles(query: string, page: number = 1): Promise<any> {
  const res = await fetch(`/api/fs/search?q=${encodeURIComponent(query)}&page=${page}`);
  return res.json();
}

// Upload Session Management (Browser / Mini-App driven)
export async function startUploadSession(destinationDirectory: string): Promise<{ success: boolean; session: UploadSession }> {
  const res = await fetch('/api/upload/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinationDirectory }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to start upload session');
  }
  return res.json();
}

export async function getActiveUploadSession(): Promise<{ session: UploadSession | null }> {
  const res = await fetch('/api/upload/session/active');
  return res.json();
}

export async function completeUploadSession(): Promise<{ success: boolean; session: UploadSession | null }> {
  const res = await fetch('/api/upload/session/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to complete upload session');
  }
  return res.json();
}

// Browser-Side ZIP Downloads
export async function downloadSelectedZip(ids: string[], zipName?: string): Promise<void> {
  const res = await fetch('/api/media/download-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, zipName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Failed to download zip');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName ? `${zipName}.zip` : `media_download_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function downloadFolderZip(folderPath: string): Promise<void> {
  const res = await fetch(`/api/media/folder-zip?path=${encodeURIComponent(folderPath)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Failed to download folder zip');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const folderSlug = folderPath === '/' ? 'root' : folderPath.replace(/[\/\\]+/g, '_').replace(/^_+/, '');
  a.download = `${folderSlug}_files.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// Admin APIs
export async function fetchAdminStats(): Promise<{ stats: StorageStats }> {
  const res = await fetch('/api/admin/stats');
  return res.json();
}

export async function fetchAdminUsers(): Promise<{ users: UserRecord[] }> {
  const res = await fetch('/api/admin/users');
  return res.json();
}

export async function fetchPendingAccess(): Promise<{ pending: UserRecord[] }> {
  const res = await fetch('/api/admin/access/pending');
  return res.json();
}

export async function approveAccess(userId: number): Promise<any> {
  const res = await fetch(`/api/admin/access/${userId}/approve`, { method: 'POST' });
  return res.json();
}

export async function rejectAccess(userId: number): Promise<any> {
  const res = await fetch(`/api/admin/access/${userId}/reject`, { method: 'POST' });
  return res.json();
}

export async function banAccess(userId: number): Promise<any> {
  const res = await fetch(`/api/admin/access/${userId}/ban`, { method: 'POST' });
  return res.json();
}

export async function unbanAccess(userId: number): Promise<any> {
  const res = await fetch(`/api/admin/access/${userId}/unban`, { method: 'POST' });
  return res.json();
}

export async function triggerDatabaseBackup(): Promise<{
  success: boolean;
  backupFile: string;
  meta: { usersCount: number; mediaCount: number; directoriesCount: number; sizeBytes: number };
  delivery: { sentTo: number[]; failed: number[] };
  message: string;
}> {
  const res = await fetch('/api/admin/backup', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to create database backup');
  }
  return data;
}

export async function restoreDatabaseJson(databaseJson: string | object): Promise<{
  success: boolean;
  message: string;
  result: { usersCount: number; mediaCount: number; directoriesCount: number };
}> {
  const res = await fetch('/api/admin/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ databaseJson }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to restore database');
  }
  return data;
}

// Telegram MTProto Sending APIs
export async function sendMediaToTelegram(
  id: string,
  options?: { targetChat?: string | number; caption?: string }
): Promise<{ success: boolean; messageId?: number; chat?: string; filename?: string; error?: string }> {
  const res = await fetch(`/api/media/${id}/send-telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send to Telegram');
  }
  return data;
}

export async function sendBatchToTelegram(
  ids: string[],
  options?: { targetChat?: string | number; captionPrefix?: string }
): Promise<{ success: boolean; sentCount: number; totalCount: number; chat?: string; results: any[]; error?: string }> {
  const res = await fetch('/api/media/send-telegram-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, ...options }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send batch to Telegram');
  }
  return data;
}


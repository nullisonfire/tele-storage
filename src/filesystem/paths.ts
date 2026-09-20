/**
 * Robust logical path parsing and normalization for personal Telegram media manager.
 * Prevents traversal outside logical root '/' and handles Unicode, spaces, emojis.
 */

export function normalizePath(inputPath: string): string {
  if (!inputPath || inputPath.trim() === '') {
    return '/';
  }

  // Replace backslashes with forward slashes
  let clean = inputPath.replace(/\\/g, '/');

  // Split path into segments
  const rawSegments = clean.split('/');
  const resolvedSegments: string[] = [];

  for (const segment of rawSegments) {
    const trimmed = segment.trim();
    if (!trimmed || trimmed === '.') {
      continue;
    }
    if (trimmed === '..') {
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
      // Cannot escape above root /
      continue;
    }
    resolvedSegments.push(trimmed);
  }

  if (resolvedSegments.length === 0) {
    return '/';
  }

  return '/' + resolvedSegments.join('/');
}

export function getParentPath(path: string): string | null {
  const norm = normalizePath(path);
  if (norm === '/') {
    return null;
  }
  const lastSlash = norm.lastIndexOf('/');
  if (lastSlash === 0) {
    return '/';
  }
  return norm.substring(0, lastSlash);
}

export function getDirectoryName(path: string): string {
  const norm = normalizePath(path);
  if (norm === '/') {
    return 'Home';
  }
  const segments = norm.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'Home';
}

export function resolvePath(currentWorkingDir: string, targetPath: string): string {
  const normTarget = targetPath.trim();
  if (normTarget.startsWith('/')) {
    return normalizePath(normTarget);
  }
  const normCurrent = normalizePath(currentWorkingDir);
  return normalizePath(`${normCurrent}/${normTarget}`);
}

export function sanitizeFilename(filename: string): string {
  if (!filename || filename.trim() === '') {
    return 'unnamed_file';
  }
  // Trim and strip null bytes and slashes, preserve spaces, Unicode, Bengali, Chinese, etc.
  const cleaned = filename.replace(/[\/\0]/g, '').trim();
  return cleaned || 'unnamed_file';
}

export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return '';
  }
  return filename.substring(lastDot + 1).toLowerCase();
}

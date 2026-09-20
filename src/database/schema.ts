import { DatabaseSchema } from '../types';

export const CURRENT_SCHEMA_VERSION = 1;

export function createEmptyDatabase(): DatabaseSchema {
  return {
    version: CURRENT_SCHEMA_VERSION,
    users: {},
    directories: {
      '/': {
        id: 'root-dir-id',
        name: 'Home',
        path: '/',
        parent_path: '',
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by: 0,
      },
    },
    media: {},
    sessions: {},
    upload_sessions: {},
    favorites: [],
    recent_media: [],
    pinned_directories: ['/'],
  };
}

export function migrateDatabase(data: any): DatabaseSchema {
  if (!data || typeof data !== 'object') {
    return createEmptyDatabase();
  }

  const current = data as Partial<DatabaseSchema>;
  const version = current.version || 1;

  const migrated: DatabaseSchema = {
    version: CURRENT_SCHEMA_VERSION,
    users: current.users || {},
    directories: current.directories || {},
    media: current.media || {},
    sessions: current.sessions || {},
    upload_sessions: current.upload_sessions || {},
    favorites: Array.isArray(current.favorites) ? current.favorites : [],
    recent_media: Array.isArray(current.recent_media) ? current.recent_media : [],
    pinned_directories: Array.isArray(current.pinned_directories) ? current.pinned_directories : ['/'],
  };

  // Ensure root directory exists
  if (!migrated.directories['/']) {
    migrated.directories['/'] = {
      id: 'root-dir-id',
      name: 'Home',
      path: '/',
      parent_path: '',
      created_at: Date.now(),
      updated_at: Date.now(),
      created_by: 0,
    };
  }

  return migrated;
}

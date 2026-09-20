import dotenv from 'dotenv';
import path from 'path';

if (typeof dotenv !== 'undefined' && typeof dotenv.config === 'function') {
  try {
    dotenv.config();
  } catch {
    // Ignore dotenv error in non-Node environments
  }
}

const parseAdminTokens = (raw?: string): { ids: number[]; usernames: string[] } => {
  if (!raw) return { ids: [], usernames: [] };
  const ids: number[] = [];
  const usernames: string[] = [];
  raw.split(',').map((s) => s.trim()).forEach((s) => {
    if (!s) return;
    const n = Number(s);
    if (!isNaN(n) && n > 0) {
      ids.push(n);
    } else {
      usernames.push(s.toLowerCase().replace(/^@/, ''));
    }
  });
  return { ids, usernames };
};

const adminTokens = parseAdminTokens(process.env.ADMIN_IDS);

const normalizeUrl = (url?: string, defaultUrl: string = 'http://localhost:3000'): string => {
  if (!url) return defaultUrl;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const rawAppUrl = normalizeUrl(process.env.APP_URL, 'http://localhost:3000');
const rawRedirectUri = process.env.TELEGRAM_OIDC_REDIRECT_URI
  ? normalizeUrl(process.env.TELEGRAM_OIDC_REDIRECT_URI)
  : `${rawAppUrl.replace(/\/+$/, '')}/auth/callback`;

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: 3000,
  appUrl: rawAppUrl,

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    mode: (process.env.TELEGRAM_BOT_MODE === 'webhook' ? 'webhook' : 'polling') as 'webhook' | 'polling',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ? normalizeUrl(process.env.TELEGRAM_WEBHOOK_URL) : '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    storageGroupId: Number(process.env.TELEGRAM_STORAGE_GROUP_ID) || 0,
    adminIds: adminTokens.ids,
    adminUsernames: adminTokens.usernames,
    mtproto: {
      apiId: Number(process.env.TELEGRAM_API_ID) || 0,
      apiHash: process.env.TELEGRAM_API_HASH || '',
      sessionString: process.env.TELEGRAM_SESSION_STRING || process.env.TELEGRAM_MTPROTO_SESSION || '',
    },
  },

  oidc: {
    clientId: process.env.TELEGRAM_OIDC_CLIENT_ID || '',
    clientSecret: process.env.TELEGRAM_OIDC_CLIENT_SECRET || '',
    redirectUri: rawRedirectUri,
    authEndpoint: 'https://oauth.telegram.org/auth',
    tokenEndpoint: 'https://oauth.telegram.org/token',
    jwksUri: 'https://oauth.telegram.org/.well-known/jwks.json',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'dev_session_secret_key_84920482049284',
    cookieName: 'tmm_session',
    maxAgeDays: 30,
  },

  storage: {
    dbPath: process.env.DB_PATH || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? path.resolve(process.cwd(), 'data', 'database.json') : './data/database.json'),
    dataDir: typeof process !== 'undefined' && typeof process.cwd === 'function' ? path.resolve(process.cwd(), 'data') : './data',
    backupsDir: typeof process !== 'undefined' && typeof process.cwd === 'function' ? path.resolve(process.cwd(), 'data', 'backups') : './data/backups',
    uploadTimeoutMinutes: Number(process.env.UPLOAD_TIMEOUT_MINUTES) || 30,
    pageSize: Number(process.env.PAGE_SIZE) || 30,
  },

  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export function isAdminUser(userId: number, username?: string): boolean {
  if (config.telegram.adminIds.includes(userId)) return true;
  if (username && config.telegram.adminUsernames.includes(username.toLowerCase().replace(/^@/, ''))) return true;
  return false;
}

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as jose from 'jose';
import { db } from '../database/jsonDatabase';
import { config } from '../config';
import { TelegramUser } from '../types';
import { logger } from '../utils/logger';

interface PendingOidcState {
  state: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  createdAt: number;
}

// In-memory pending state store with TTL & persistent disk backup
const pendingStates = new Map<string, PendingOidcState>();
const oidcStateFile = path.resolve(process.cwd(), 'data', 'oidc_pending_states.json');

function loadPersistedStates(): void {
  try {
    if (fs.existsSync(oidcStateFile)) {
      const raw = fs.readFileSync(oidcStateFile, 'utf-8');
      const data: Record<string, PendingOidcState> = JSON.parse(raw);
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes
      for (const [key, val] of Object.entries(data)) {
        if (now - val.createdAt < maxAge) {
          pendingStates.set(key, val);
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

function savePersistedStates(): void {
  try {
    const data: Record<string, PendingOidcState> = {};
    for (const [key, val] of pendingStates.entries()) {
      data[key] = val;
    }
    const dir = path.dirname(oidcStateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(oidcStateFile, JSON.stringify(data), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

// Initial load of any previously persisted states
loadPersistedStates();

function cleanupExpiredStates() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  let changed = false;
  for (const [key, item] of pendingStates.entries()) {
    if (now - item.createdAt > maxAge) {
      pendingStates.delete(key);
      changed = true;
    }
  }
  if (changed) savePersistedStates();
}

// Telegram JWKS remote key set
let telegramJWKS: any = null;
function getTelegramJWKS() {
  if (!telegramJWKS) {
    telegramJWKS = jose.createRemoteJWKSet(new URL(config.oidc.jwksUri));
  }
  return telegramJWKS;
}

export class TelegramOidcService {
  /**
   * Generates high-entropy PKCE code verifier and S256 challenge.
   */
  public generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Build Telegram OIDC authorization URL.
   */
  public createAuthorizationUrl(customRedirectUri?: string): { url: string; state: string; redirectUri: string } {
    cleanupExpiredStates();

    const state = crypto.randomBytes(24).toString('base64url');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const { codeVerifier, codeChallenge } = this.generatePkce();

    // Prefer explicit custom redirect URI, then configured redirectUri
    const redirectUri = customRedirectUri || config.oidc.redirectUri;
    const clientId = config.oidc.clientId || config.telegram.botUsername?.replace(/^@/, '') || 'telegram_media_manager_bot';

    const stateEntry: PendingOidcState = {
      state,
      codeVerifier,
      nonce,
      redirectUri,
      createdAt: Date.now(),
    };

    pendingStates.set(state, stateEntry);
    savePersistedStates();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `${config.oidc.authEndpoint}?${params.toString()}`,
      state,
      redirectUri,
    };
  }

  /**
   * Exchange authorization code for tokens and validate ID token via Telegram JWKS.
   */
  public async handleCallback(code: string, state: string, reqRedirectUri?: string): Promise<TelegramUser> {
    cleanupExpiredStates();
    loadPersistedStates(); // Re-read in case written by parallel or previous worker

    const pending = pendingStates.get(state);
    if (!pending) {
      logger.warn({ state }, 'OIDC state parameter not found in pending states store');
      throw new Error(
        'Login session expired or invalid state parameter. Please return to the login screen and click "Log in with Telegram" again.'
      );
    }
    pendingStates.delete(state);
    savePersistedStates();

    // Determine client credentials:
    // In Telegram OIDC, client_id is bot username without '@' and client_secret is the bot token
    const clientId = config.oidc.clientId || config.telegram.botUsername?.replace(/^@/, '');
    const clientSecret = config.oidc.clientSecret || config.telegram.botToken;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Telegram OIDC credentials missing: Please configure TELEGRAM_BOT_TOKEN & TELEGRAM_BOT_USERNAME, or TELEGRAM_OIDC_CLIENT_ID & TELEGRAM_OIDC_CLIENT_SECRET in .env'
      );
    }

    const redirectUri = reqRedirectUri || pending.redirectUri || config.oidc.redirectUri;

    // Server-to-server token exchange
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: pending.codeVerifier,
    });

    logger.info({ tokenEndpoint: config.oidc.tokenEndpoint, clientId, redirectUri }, 'Initiating Telegram OIDC token exchange');

    const tokenRes = await fetch(config.oidc.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error({ status: tokenRes.status, errText }, 'Telegram OIDC token exchange failed');
      let errorMessage = `Telegram token exchange failed (${tokenRes.status})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error_description || parsed.error) {
          errorMessage = `${parsed.error_description || parsed.error} (${tokenRes.status})`;
        }
      } catch {
        if (errText) errorMessage = `${errText.slice(0, 100)} (${tokenRes.status})`;
      }
      throw new Error(errorMessage);
    }

    const tokenData = (await tokenRes.json()) as { id_token: string; access_token?: string };
    if (!tokenData.id_token) {
      throw new Error('No id_token received from Telegram OIDC token endpoint');
    }

    // Validate ID Token using Telegram JWKS
    const JWKS = getTelegramJWKS();
    const { payload } = await jose.jwtVerify(tokenData.id_token, JWKS, {
      issuer: 'https://oauth.telegram.org',
    });

    if (payload.nonce && payload.nonce !== pending.nonce) {
      throw new Error('OIDC nonce mismatch (replay protection)');
    }

    // Extract actual Telegram User / Chat ID:
    // In Telegram OIDC / OAuth, payload.id is the numeric Telegram user/chat ID (e.g. 5189261047).
    // payload.sub can be an opaque 64-bit ID or 20-digit snowflake (such as 17530705350241712000), which is NOT the chat ID.
    // We only store the actual Telegram chat ID.
    let telegramUserId = 0;
    const usernameClaim = (payload.preferred_username as string) || (payload.username as string) || '';

    // 1. Try explicit ID claims that represent the real Telegram user/chat ID
    const explicitCandidates = [
      (payload as any).id,
      (payload as any).chat_id,
      (payload as any).user_id,
      (payload as any).telegram_id,
      (payload as any).user?.id,
      (payload as any).user?.chat_id,
      (tokenData as any).id,
      (tokenData as any).chat_id,
      (tokenData as any).user_id,
      (tokenData as any).user?.id,
    ];

    for (const cand of explicitCandidates) {
      if (cand !== undefined && cand !== null && cand !== '') {
        const n = Number(cand);
        // Valid Telegram user/chat IDs are positive integers < 1e12 (<= 52-bit integers, typically 6-10 digits)
        if (!isNaN(n) && n > 0 && n < 1e12) {
          telegramUserId = n;
          break;
        }
      }
    }

    // 2. Check if a user with this username already exists in our database
    if (!telegramUserId && usernameClaim) {
      const existing = await db.getUserByUsername(usernameClaim);
      if (existing && existing.id < 1e12) {
        telegramUserId = existing.id;
      }
    }

    // 3. If payload.sub is within the valid Telegram chat ID range (< 1e12)
    if (!telegramUserId && payload.sub) {
      const subNum = Number(payload.sub);
      if (!isNaN(subNum) && subNum > 0 && subNum < 1e12) {
        telegramUserId = subNum;
      }
    }

    // 4. Try resolving via Telegram Bot API getChat if username is available
    if (!telegramUserId && usernameClaim) {
      try {
        const { getTelegramBot } = await import('../telegram/telegramApi');
        const bot = getTelegramBot();
        if (bot) {
          const chat = await bot.api.getChat('@' + usernameClaim.replace(/^@/, ''));
          if (chat && chat.id && Math.abs(chat.id) < 1e12) {
            telegramUserId = Math.abs(chat.id);
          }
        }
      } catch (err) {
        logger.debug({ err, usernameClaim }, 'Could not resolve chat ID via bot getChat');
      }
    }

    if (!telegramUserId || isNaN(telegramUserId)) {
      throw new Error('Could not resolve actual Telegram chat ID from authentication payload');
    }

    const user: TelegramUser = {
      id: telegramUserId,
      first_name: (payload.first_name as string) || (payload.name as string) || (payload.given_name as string) || `Telegram User ${telegramUserId}`,
      last_name: (payload.last_name as string) || (payload.family_name as string) || '',
      username: usernameClaim,
      photo_url: (payload.picture as string) || '',
    };

    logger.info({ userId: user.id, username: user.username }, 'Telegram OIDC login verified successfully');
    return user;
  }
}

export const telegramOidcService = new TelegramOidcService();

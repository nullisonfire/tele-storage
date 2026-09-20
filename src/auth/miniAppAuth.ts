import crypto from 'crypto';
import { TelegramUser } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface MiniAppValidationResult {
  valid: boolean;
  user?: TelegramUser;
  authDate?: number;
  error?: string;
}

/**
 * Cryptographically validates official Telegram Mini App initData.
 * Algorithm:
 * 1. Parse URL-encoded query string into key-value pairs
 * 2. Extract and remove the 'hash' parameter
 * 3. Sort remaining keys alphabetically
 * 4. Create data-check-string with "key=value\n"
 * 5. Compute secret_key = HMAC-SHA256("WebAppData", botToken)
 * 6. Compute calculated_hash = HMAC-SHA256(secret_key, data-check-string)
 * 7. Compare calculated_hash with received 'hash' in constant time
 * 8. Verify auth_date freshness to prevent replay attacks (24 hour threshold)
 */
export function validateTelegramMiniAppInitData(initDataRaw: string, botTokenOverride?: string): MiniAppValidationResult {
  if (!initDataRaw || initDataRaw.trim() === '') {
    return { valid: false, error: 'Empty initData provided' };
  }

  const token = botTokenOverride || config.telegram.botToken;
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN not configured for initData validation');
    return { valid: false, error: 'Telegram Bot Token not configured on server' };
  }

  try {
    const params = new URLSearchParams(initDataRaw);
    const receivedHash = params.get('hash');
    if (!receivedHash) {
      return { valid: false, error: 'Missing hash parameter in initData' };
    }

    // Remove hash from parameters
    params.delete('hash');

    // Sort parameters alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckArr: string[] = [];
    for (const key of keys) {
      const val = params.get(key);
      if (val !== null) {
        dataCheckArr.push(`${key}=${val}`);
      }
    }
    const dataCheckString = dataCheckArr.join('\n');

    // Compute secret key: HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();

    // Compute expected hash: HMAC_SHA256(secret_key, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // Constant-time comparison
    if (calculatedHash.length !== receivedHash.length) {
      return { valid: false, error: 'Cryptographic signature mismatch' };
    }

    const isHashValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'hex'),
      Buffer.from(receivedHash, 'hex')
    );

    if (!isHashValid) {
      return { valid: false, error: 'Cryptographic signature mismatch' };
    }

    // Check auth_date for replay attack protection (max 24 hours)
    const authDateStr = params.get('auth_date');
    const authDate = authDateStr ? Number(authDateStr) : 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = 86400; // 24 hours

    if (!authDate || nowSec - authDate > maxAgeSec) {
      return { valid: false, error: 'initData has expired (replay protection)' };
    }

    // Parse user object
    const userRaw = params.get('user');
    if (!userRaw) {
      return { valid: false, error: 'Missing user object in initData' };
    }

    const parsedUser = JSON.parse(userRaw) as TelegramUser;
    if (!parsedUser || !parsedUser.id) {
      return { valid: false, error: 'Invalid user payload in initData' };
    }

    return {
      valid: true,
      user: parsedUser,
      authDate,
    };
  } catch (err: any) {
    logger.error({ err }, 'Error during Telegram Mini App initData validation');
    return { valid: false, error: err.message || 'Validation error' };
  }
}

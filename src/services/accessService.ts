import { db } from '../database/jsonDatabase';
import { UserRecord, AuthorizationState, TelegramUser } from '../types';
import { isAdminUser } from '../config';
import { logger } from '../utils/logger';

export class AccessService {
  /**
   * Look up or initialize a user record.
   * If user is an admin from ADMIN_IDS, they are automatically approved.
   */
  public async getOrCreateUser(tgUser: TelegramUser): Promise<UserRecord> {
    const existing = await db.getUser(tgUser.id);
    const now = Date.now();
    const isAdmin = isAdminUser(tgUser.id, tgUser.username);

    if (existing) {
      let updated = false;
      // If user is designated as admin in env, promote immediately
      if (isAdmin && (existing.role !== 'admin' || existing.auth_state !== 'approved')) {
        existing.role = 'admin';
        existing.auth_state = 'approved';
        updated = true;
      }
      // Update profile info if changed
      if (
        existing.first_name !== tgUser.first_name ||
        existing.last_name !== tgUser.last_name ||
        existing.username !== tgUser.username ||
        existing.photo_url !== tgUser.photo_url
      ) {
        existing.first_name = tgUser.first_name;
        existing.last_name = tgUser.last_name;
        existing.username = tgUser.username;
        existing.photo_url = tgUser.photo_url;
        updated = true;
      }

      existing.last_active_at = now;
      await db.saveUser(existing);
      return existing;
    }

    const newUser: UserRecord = {
      id: tgUser.id,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name,
      username: tgUser.username,
      language_code: tgUser.language_code,
      photo_url: tgUser.photo_url,
      role: isAdmin ? 'admin' : 'user',
      auth_state: isAdmin ? 'approved' : 'unknown',
      created_at: now,
      updated_at: now,
      last_active_at: now,
      current_directory: '/',
    };

    await db.saveUser(newUser);
    logger.info({ userId: tgUser.id, username: tgUser.username, state: newUser.auth_state }, 'Created user record');
    return newUser;
  }

  /**
   * Request access. Transitions from 'unknown' or 'rejected' to 'pending'.
   * Cannot request access if 'banned'.
   */
  public async requestAccess(userId: number): Promise<{ success: boolean; state: AuthorizationState; message: string }> {
    const user = await db.getUser(userId);
    if (!user) {
      return { success: false, state: 'unknown', message: 'User not found' };
    }

    if (user.auth_state === 'banned') {
      return { success: false, state: 'banned', message: '⛔ You are permanently banned from this bot.' };
    }

    if (user.auth_state === 'approved') {
      return { success: true, state: 'approved', message: '✅ You are already authorized.' };
    }

    if (user.auth_state === 'pending') {
      return { success: true, state: 'pending', message: '⏳ Your access request has already been sent and is waiting for admin approval.' };
    }

    user.auth_state = 'pending';
    user.updated_at = Date.now();
    await db.saveUser(user);

    logger.info({ userId: user.id, username: user.username }, 'Access requested by user');
    return { success: true, state: 'pending', message: '⏳ Access request submitted. Waiting for admin approval.' };
  }

  public async approveUser(userId: number): Promise<UserRecord> {
    const user = await db.getUser(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    user.auth_state = 'approved';
    user.updated_at = Date.now();
    await db.saveUser(user);
    logger.info({ userId }, 'User approved');
    return user;
  }

  public async rejectUser(userId: number): Promise<UserRecord> {
    const user = await db.getUser(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    user.auth_state = 'rejected';
    user.updated_at = Date.now();
    await db.saveUser(user);
    logger.info({ userId }, 'User rejected');
    return user;
  }

  public async banUser(userId: number): Promise<UserRecord> {
    const user = await db.getUser(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    user.auth_state = 'banned';
    user.updated_at = Date.now();
    await db.saveUser(user);
    logger.info({ userId }, 'User banned');
    return user;
  }

  public async unbanUser(userId: number): Promise<UserRecord> {
    const user = await db.getUser(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    user.auth_state = 'rejected'; // Reset to rejected so they can request again
    user.updated_at = Date.now();
    await db.saveUser(user);
    logger.info({ userId }, 'User unbanned');
    return user;
  }

  public async getPendingUsers(): Promise<UserRecord[]> {
    const all = await db.getAllUsers();
    return all.filter((u) => u.auth_state === 'pending');
  }

  public async getAllUsers(): Promise<UserRecord[]> {
    return db.getAllUsers();
  }
}

export const accessService = new AccessService();

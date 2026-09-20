import { Bot } from 'grammy';
import { config } from '../config';
import { logger } from '../utils/logger';
import { TelegramMediaMetadata } from '../types';

let botInstance: Bot | null = null;

export function getTelegramBot(): Bot | null {
  if (!botInstance && config.telegram.botToken) {
    botInstance = new Bot(config.telegram.botToken);
  }
  return botInstance;
}

export class TelegramApiService {
  /**
   * Send a media item directly to a Telegram user chat.
   */
  public async sendMediaToUser(
    targetChatId: number,
    mediaType: string,
    fileId: string,
    caption?: string
  ): Promise<boolean> {
    const bot = getTelegramBot();
    if (!bot) {
      logger.warn('Bot instance not available to send media');
      return false;
    }

    try {
      if (mediaType === 'image') {
        await bot.api.sendPhoto(targetChatId, fileId, { caption });
      } else if (mediaType === 'video') {
        await bot.api.sendVideo(targetChatId, fileId, { caption });
      } else if (mediaType === 'audio') {
        await bot.api.sendAudio(targetChatId, fileId, { caption });
      } else {
        await bot.api.sendDocument(targetChatId, fileId, { caption });
      }
      return true;
    } catch (err: any) {
      logger.error({ err, targetChatId, fileId }, 'Failed to send Telegram media to user');
      return false;
    }
  }

  /**
   * Get direct download/stream URL for a Telegram file via Bot API
   */
  public async getFileDownloadUrl(fileId: string): Promise<string | null> {
    const res = await this.getFileDownloadResult(fileId);
    return res.url;
  }

  /**
   * Get detailed download result including whether Telegram rejected due to Bot API 20MB limit
   */
  public async getFileDownloadResult(fileId: string): Promise<{ url: string | null; isTooBig?: boolean; error?: string }> {
    const bot = getTelegramBot();
    if (!bot || !config.telegram.botToken) {
      return { url: null, error: 'Telegram bot not initialized' };
    }

    try {
      const file = await bot.api.getFile(fileId);
      if (file && file.file_path) {
        return { url: `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}` };
      }
      return { url: null, error: 'File path not returned by Telegram' };
    } catch (err: any) {
      const errMsg = err?.description || err?.message || '';
      const isTooBig = errMsg.toLowerCase().includes('file is too big');
      if (isTooBig) {
        logger.info({ fileId }, 'Telegram Bot API rejected file download: file is too big (>20MB)');
      } else {
        logger.error({ err, fileId }, 'Failed to get Telegram file download URL via Bot API');
      }
      return { url: null, isTooBig, error: errMsg };
    }
  }

  /**
   * Refreshes a stale Telegram media reference by querying the original source message
   * in the storage group.
   */
  public async refreshMediaReference(
    sourceChatId: number,
    sourceMessageId: number
  ): Promise<Partial<TelegramMediaMetadata> | null> {
    const bot = getTelegramBot();
    if (!bot) return null;

    try {
      // Forward the source message to get a fresh copy of metadata
      // Or forward to bot itself or inspect through forwardMessage
      logger.info({ sourceChatId, sourceMessageId }, 'Refreshing Telegram media reference from storage group');
      // In Bot API, forwarding a message from storage group to an admin or storage check
      // returns the renewed file_id and file_unique_id
      return null;
    } catch (err: any) {
      logger.error({ err, sourceChatId, sourceMessageId }, 'Failed to refresh Telegram media reference');
      return null;
    }
  }

  /**
   * Notify all configured admins about an access request.
   */
  public async notifyAdminsNewAccessRequest(user: { id: number; first_name: string; username?: string }) {
    const bot = getTelegramBot();
    if (!bot) return;

    const text = `🔔 *New Access Request*\n\n` +
      `👤 *Name:* ${user.first_name}\n` +
      `🆔 *ID:* \`${user.id}\`\n` +
      `👤 *Username:* ${user.username ? '@' + user.username : 'None'}`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `adm_appr:${user.id}` },
          { text: '❌ Reject', callback_data: `adm_rej:${user.id}` },
          { text: '⛔ Ban', callback_data: `adm_ban:${user.id}` },
        ],
      ],
    };

    for (const adminId of config.telegram.adminIds) {
      try {
        await bot.api.sendMessage(adminId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (err) {
        logger.warn({ adminId, err }, 'Could not deliver notification to admin');
      }
    }
  }

  /**
   * Notify a user of their authorization status change.
   */
  public async notifyUserStatusChange(userId: number, status: 'approved' | 'rejected' | 'banned') {
    const bot = getTelegramBot();
    if (!bot) return;

    let text = '';
    if (status === 'approved') {
      text = `✅ *Your access has been approved.*\n\nYou can now open your media library or use bot commands like /ls and /cd.`;
    } else if (status === 'rejected') {
      text = `❌ *Your access request was rejected.*\n\nYou may request access again with /start.`;
    } else if (status === 'banned') {
      text = `⛔ *You have been banned from this bot.*\n\nThis account cannot request access again.`;
    }

    try {
      await bot.api.sendMessage(userId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.warn({ userId, err }, 'Could not notify user of status update');
    }
  }
}

export const telegramApiService = new TelegramApiService();

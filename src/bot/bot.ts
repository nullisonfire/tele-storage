import { Bot, InlineKeyboard } from 'grammy';
import { config, isAdminUser } from '../config';
import { accessService } from '../services/accessService';
import { uploadService } from '../services/uploadService';
import { telegramApiService } from '../telegram/telegramApi';
import { logger } from '../utils/logger';

/**
 * Sets up Telegram Bot handlers.
 * Solely handles authentication, access approval workflow, and storage group media ingestion.
 * All user-facing management, navigation, preview, and download are handled browser-side.
 */
export function setupTelegramBot(bot: Bot): void {
  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, 'Error occurred in Telegram bot handler');
  });

  // Middleware: Extract / Upsert user using their actual Telegram chat ID
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      await accessService.getOrCreateUser({
        id: ctx.from.id,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        language_code: ctx.from.language_code,
      });
    }
    await next();
  });

  // Command: /start (Authentication & Mini App Launcher)
  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const user = await accessService.getOrCreateUser({
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username,
      language_code: from.language_code,
    });

    if (user.auth_state === 'banned') {
      await ctx.reply('⛔ *Access Denied*\n\nThis account is banned from accessing this application.', {
        parse_mode: 'Markdown',
      });
      return;
    }

    if (user.auth_state === 'unknown' || user.auth_state === 'rejected') {
      const keyboard = new InlineKeyboard().text('🔐 Request Access', 'req_access');
      await ctx.reply(
        '🔒 *Authorization Required*\n\nThis media library requires administrative approval before access is granted.\n\nTap below to request access:',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return;
    }

    if (user.auth_state === 'pending') {
      await ctx.reply(
        '⏳ *Access Request Pending*\n\nYour request has been submitted to the administrator and is waiting for review.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // User is approved: Provide direct Mini App entry
    const keyboard = new InlineKeyboard().webApp('📂 Open Media Library', config.appUrl);

    await ctx.reply(
      `👋 *Welcome, ${user.first_name}*\n\n` +
      `Your account is authenticated and approved.\n\n` +
      `All media management (browsing, previewing, uploading, and downloading) is handled directly in the browser / Mini App interface.\n\n` +
      `Tap below to launch your media manager:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // Callback: Request Access
  bot.callbackQuery('req_access', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const res = await accessService.requestAccess(from.id);
    await ctx.answerCallbackQuery({ text: res.message.replace(/[*_`]/g, '') });

    if (res.state === 'pending') {
      await ctx.editMessageText(
        '⏳ *Your access request has been sent to the administrator.*\n\nYou will receive a notification once reviewed.',
        { parse_mode: 'Markdown' }
      );
      // Notify admins
      await telegramApiService.notifyAdminsNewAccessRequest({
        id: from.id,
        first_name: from.first_name,
        username: from.username,
      });
    }
  });

  // Admin Approval Callbacks (Approve, Reject, Ban)
  bot.callbackQuery(/^adm_(appr|rej|ban):(\d+)$/, async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId || !isAdminUser(fromId)) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
      return;
    }

    const match = ctx.match;
    const action = match[1];
    const targetUserId = Number(match[2]);

    try {
      if (action === 'appr') {
        await accessService.approveUser(targetUserId);
        await ctx.answerCallbackQuery({ text: 'User approved' });
        await ctx.editMessageText(`✅ *User ${targetUserId} approved.*`, { parse_mode: 'Markdown' });
        await telegramApiService.notifyUserStatusChange(targetUserId, 'approved');
      } else if (action === 'rej') {
        await accessService.rejectUser(targetUserId);
        await ctx.answerCallbackQuery({ text: 'User rejected' });
        await ctx.editMessageText(`❌ *User ${targetUserId} rejected.*`, { parse_mode: 'Markdown' });
        await telegramApiService.notifyUserStatusChange(targetUserId, 'rejected');
      } else if (action === 'ban') {
        await accessService.banUser(targetUserId);
        await ctx.answerCallbackQuery({ text: 'User banned permanently' });
        await ctx.editMessageText(`⛔ *User ${targetUserId} permanently banned.*`, { parse_mode: 'Markdown' });
        await telegramApiService.notifyUserStatusChange(targetUserId, 'banned');
      }
    } catch (err: any) {
      logger.error({ err }, 'Error processing admin callback');
      await ctx.answerCallbackQuery({ text: err.message || 'Action failed', show_alert: true });
    }
  });

  // Silent Background Storage Ingestion:
  // When an approved user enables upload from the browser/mini-app,
  // files they post in the configured storage group are ingested into their active session.
  bot.on(['message:photo', 'message:video', 'message:document', 'message:audio'], async (ctx) => {
    if (config.telegram.storageGroupId && ctx.chat.id === config.telegram.storageGroupId) {
      const ingested = await uploadService.ingestTelegramMediaMessage(ctx.message);
      if (ingested) {
        logger.info({ msgId: ctx.message.message_id, from: ctx.from?.id }, 'Media captured and saved from storage group');
      }
    }
  });
}

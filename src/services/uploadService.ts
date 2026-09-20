import crypto from 'crypto';
import { db } from '../database/jsonDatabase';
import { UploadSession, MediaType, TelegramMediaMetadata } from '../types';
import { directoryService } from './directoryService';
import { mediaService } from './mediaService';
import { accessService } from './accessService';
import { config } from '../config';
import { normalizePath } from '../filesystem/paths';
import { logger } from '../utils/logger';
import { enrichTelegramMetadata } from '../telegram/fileIdHelper';

export class UploadService {
  /**
   * Start upload mode for a user.
   * Creates or activates an upload session targeted at destinationDirectory.
   */
  public async startUploadSession(userId: number, destinationDirectory: string): Promise<UploadSession> {
    const user = await db.getUser(userId);
    if (!user || user.auth_state !== 'approved') {
      throw new Error('User is not authorized for uploads');
    }

    const norm = normalizePath(destinationDirectory);
    // Ensure destination directory exists
    await directoryService.mkdir(norm, userId);

    const now = Date.now();
    // Invalidate any existing active session
    const existing = await db.getUserActiveUploadSession(userId);
    if (existing) {
      existing.status = 'completed';
      await db.saveUploadSession(existing);
    }

    const session: UploadSession = {
      id: crypto.randomUUID(),
      user_id: userId,
      destination_directory: norm,
      start_time: now,
      last_activity: now,
      status: 'active',
      files_count: 0,
    };

    await db.saveUploadSession(session);
    logger.info({ userId, dir: norm, sessionId: session.id }, 'Upload session activated');
    return session;
  }

  public async getActiveSession(userId: number): Promise<UploadSession | null> {
    return db.getUserActiveUploadSession(userId);
  }

  public async completeUploadSession(userId: number): Promise<UploadSession | null> {
    const session = await db.getUserActiveUploadSession(userId);
    if (!session) {
      return null;
    }
    session.status = 'completed';
    session.last_activity = Date.now();
    await db.saveUploadSession(session);
    logger.info({ userId, dir: session.destination_directory, count: session.files_count }, 'Upload session completed');
    return session;
  }

  /**
   * Ingest a media message from the configured Telegram storage group.
   */
  public async ingestTelegramMediaMessage(message: any): Promise<boolean> {
    const chatId = message.chat?.id;
    const fromId = message.from?.id;

    // 1. Verify message comes from the configured storage group
    if (config.telegram.storageGroupId && chatId !== config.telegram.storageGroupId) {
      logger.debug({ chatId, expected: config.telegram.storageGroupId }, 'Message not from storage group, ignoring');
      return false;
    }

    if (!fromId) return false;

    // 2. Verify user is approved
    const user = await db.getUser(fromId);
    if (!user || user.auth_state !== 'approved') {
      logger.warn({ fromId }, 'Received storage group upload from unauthorized user');
      return false;
    }

    // 3. Verify user has an active upload session
    const session = await db.getUserActiveUploadSession(fromId);
    if (!session) {
      logger.warn({ fromId }, 'Received storage group upload but user has no active upload session');
      return false;
    }

    // 4. Extract media metadata from message
    const extracted = this.extractMediaFromMessage(message);
    if (!extracted) {
      return false;
    }

    // 5. Enrich telegram metadata with MTProto parameters (media_id, access_hash, file_reference, dc_id)
    const enrichedTelegram = enrichTelegramMetadata(extracted.telegram);

    // 6. Store media record
    await mediaService.createMedia({
      name: extracted.name,
      media_type: extracted.media_type,
      mime_type: extracted.mime_type,
      size: extracted.size,
      directory: session.destination_directory,
      telegram: enrichedTelegram,
      uploaded_by: fromId,
      album_id: message.media_group_id,
    });

    // 6. Update session activity
    session.last_activity = Date.now();
    session.files_count++;
    await db.saveUploadSession(session);

    return true;
  }

  private extractMediaFromMessage(message: any): {
    name: string;
    media_type: MediaType;
    mime_type: string;
    size: number;
    telegram: TelegramMediaMetadata;
  } | null {
    const chatId = message.chat.id;
    const msgId = message.message_id;

    // Photo (Telegram provides multiple sizes, largest is last)
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      const thumb = message.photo[0];
      return {
        name: `IMG_${msgId}.jpg`,
        media_type: 'image',
        mime_type: 'image/jpeg',
        size: largest.file_size || 1024 * 1024,
        telegram: {
          file_id: largest.file_id,
          file_unique_id: largest.file_unique_id,
          source_chat_id: chatId,
          source_message_id: msgId,
          thumbnail_file_id: thumb?.file_id,
          width: largest.width,
          height: largest.height,
        },
      };
    }

    // Video
    if (message.video) {
      const vid = message.video;
      return {
        name: vid.file_name || `VID_${msgId}.mp4`,
        media_type: 'video',
        mime_type: vid.mime_type || 'video/mp4',
        size: vid.file_size || 5 * 1024 * 1024,
        telegram: {
          file_id: vid.file_id,
          file_unique_id: vid.file_unique_id,
          source_chat_id: chatId,
          source_message_id: msgId,
          thumbnail_file_id: vid.thumbnail?.file_id,
          width: vid.width,
          height: vid.height,
          duration: vid.duration,
        },
      };
    }

    // Audio
    if (message.audio) {
      const aud = message.audio;
      return {
        name: aud.file_name || `${aud.performer || 'Audio'} - ${aud.title || msgId}.mp3`,
        media_type: 'audio',
        mime_type: aud.mime_type || 'audio/mpeg',
        size: aud.file_size || 3 * 1024 * 1024,
        telegram: {
          file_id: aud.file_id,
          file_unique_id: aud.file_unique_id,
          source_chat_id: chatId,
          source_message_id: msgId,
          duration: aud.duration,
          performer: aud.performer,
          title: aud.title,
        },
      };
    }

    // Document / generic file
    if (message.document) {
      const doc = message.document;
      const mime = doc.mime_type || 'application/octet-stream';
      let type: MediaType = 'document';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('video/')) type = 'video';
      else if (mime.startsWith('audio/')) type = 'audio';

      return {
        name: doc.file_name || `DOC_${msgId}`,
        media_type: type,
        mime_type: mime,
        size: doc.file_size || 1024,
        telegram: {
          file_id: doc.file_id,
          file_unique_id: doc.file_unique_id,
          source_chat_id: chatId,
          source_message_id: msgId,
          thumbnail_file_id: doc.thumbnail?.file_id,
        },
      };
    }

    return null;
  }
}

export const uploadService = new UploadService();

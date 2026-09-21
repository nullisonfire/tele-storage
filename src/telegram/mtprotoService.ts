import { Response } from 'express';
import { TelegramClient, helpers, Api, utils, sessions } from 'telegram';
import { config } from '../config';
import { MediaItem } from '../types';
import { logger } from '../utils/logger';
import { enrichTelegramMetadata } from './fileIdHelper';

const { StringSession } = sessions;

// Monkey-patch GramJS bug in utils.getFileInfo:
// GramJS fails when passed a Message instance because it attempts
// `if (fileLocation instanceof Api.MessageMediaDocument)` without first re-assigning
// `fileLocation = fileLocation.media`, triggering an unrecoverable cast exception.
const originalGetFileInfo = utils.getFileInfo;
(utils as any).getFileInfo = function (fileLocation: any) {
  if (fileLocation && (fileLocation instanceof Api.Message || fileLocation.className === 'Message')) {
    fileLocation = fileLocation.media;
  }
  return originalGetFileInfo.call(this, fileLocation);
};

/**
 * Telegram Bot API strictly limits file downloads via getFile to 20 MB.
 * Files larger than 20 MB fail with "400 Bad Request: file is too big".
 */
export const BOT_API_MAX_DOWNLOAD_SIZE = 20 * 1024 * 1024; // 20 MB in bytes

export interface StreamRangeOptions {
  start?: number;
  end?: number;
}

export class MtprotoService {
  private client: TelegramClient | null = null;
  private connectingPromise: Promise<TelegramClient | null> | null = null;
  private idleTimeoutId: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs: number = 3 * 60 * 1000; // Disconnect after 3 minutes idle to prevent account restrictions

  /**
   * Check if a file size exceeds the Telegram Bot API 20MB limit.
   * Only files that return true MUST be routed to MTProto.
   */
  public isOver20MB(fileSize: number): boolean {
    return fileSize > BOT_API_MAX_DOWNLOAD_SIZE;
  }

  /**
   * Checks whether MTProto client credentials are configured.
   */
  public isConfigured(): boolean {
    return (
      Boolean(config.telegram.mtproto.apiId) &&
      Boolean(config.telegram.mtproto.apiHash)
    );
  }

  /**
   * Get active connection status.
   */
  public isConnected(): boolean {
    return Boolean(this.client && this.client.connected);
  }

  /**
   * Reset or refresh the idle disconnection timer.
   * Disconnecting after idle periods minimizes active session presence
   * and prevents Telegram flood/account restrictions.
   */
  private touchActivity() {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    this.idleTimeoutId = setTimeout(async () => {
      if (this.client) {
        logger.info('Disconnecting idle MTProto client to prevent Telegram account restrictions');
        try {
          await this.client.disconnect();
        } catch (err) {
          logger.warn({ err }, 'Error during idle MTProto client disconnection');
        } finally {
          this.client = null;
          this.connectingPromise = null;
        }
      }
    }, this.idleTimeoutMs);
  }

  /**
   * Lazily initializes and connects the MTProto client ONLY when requested.
   * Never connects on startup.
   */
  public async getClient(): Promise<TelegramClient> {
    if (!this.isConfigured()) {
      throw new Error(
        'Telegram MTProto is not configured. TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables are required to download files over 20MB.'
      );
    }

    if (this.client && this.client.connected) {
      this.touchActivity();
      return this.client;
    }

    if (this.connectingPromise) {
      const activeClient = await this.connectingPromise;
      if (activeClient) {
        this.touchActivity();
        return activeClient;
      }
    }

    this.connectingPromise = (async () => {
      const apiId = config.telegram.mtproto.apiId;
      const apiHash = config.telegram.mtproto.apiHash;
      const sessionString = config.telegram.mtproto.sessionString;
      const stringSession = new StringSession(sessionString);

      logger.info({ apiId }, 'Initializing lazy Telegram MTProto client for >20MB media transfer');

      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 3,
        autoReconnect: true,
        useWSS: false,
      });

      await client.connect();

      const isAuthorized = await client.checkAuthorization();
      if (!isAuthorized) {
        if (config.telegram.botToken) {
          logger.info('Authenticating MTProto client with Telegram Bot Token');
          await client.start({
            botAuthToken: config.telegram.botToken,
          });
        } else {
          logger.warn('MTProto client connected but not authorized (no session string or bot token provided)');
        }
      }

      this.client = client;
      this.touchActivity();
      return client;
    })();

    try {
      const client = await this.connectingPromise;
      if (!client) {
        throw new Error('Failed to obtain connected MTProto client');
      }
      return client;
    } finally {
      this.connectingPromise = null;
    }
  }

  /**
   * Resolve chat ID and message ID for a media item.
   */
  private resolveChatAndMessageId(media: MediaItem): { chatId: number; messageId: number } {
    const chatId = media.telegram.source_chat_id || config.telegram.storageGroupId;
    const messageId = media.telegram.source_message_id;

    if (!chatId) {
      throw new Error(`Cannot locate Telegram storage chat for file "${media.name}". Source chat ID or storageGroupId is missing.`);
    }

    if (!messageId) {
      throw new Error(`Cannot locate Telegram message ID for file "${media.name}". Original storage message ID is required.`);
    }

    return { chatId, messageId };
  }

  /**
   * Fetches the Telegram message containing the media item.
   */
  private async getMediaMessage(client: TelegramClient, media: MediaItem): Promise<any> {
    const { chatId, messageId } = this.resolveChatAndMessageId(media);

    logger.debug({ chatId, messageId, name: media.name }, 'Fetching Telegram message via MTProto');
    const messages = await client.getMessages(chatId, { ids: [messageId] });
    const message = Array.isArray(messages) ? messages[0] : messages;

    if (!message) {
      throw new Error(`Message #${messageId} in chat ${chatId} does not exist on Telegram`);
    }

    if (!message.media) {
      throw new Error(
        `Message #${messageId} in chat ${chatId} does not contain media (class: ${message.className || typeof message})`
      );
    }

    return message;
  }

  /**
   * Extract explicit InputFileLocation and datacenter ID from a Telegram message or media object.
   * GramJS's `utils.getFileInfo` contains a bug when passed a full Api.Message object,
   * failing with "Cannot cast Message to any kind of InputFileLocation".
   * Unwrapping the media explicitly into an Api.InputDocumentFileLocation or
   * Api.InputPhotoFileLocation completely resolves this error and preserves the correct DC ID.
   */
  public extractInputFileLocation(messageOrMedia: any): {
    fileLocation: any;
    dcId?: number;
    fileSize?: any;
  } {
    // 1. Unwrap Message / MessageMedia / WebPage containers safely without relying solely on instanceof
    let target = messageOrMedia?.media !== undefined ? messageOrMedia.media : messageOrMedia;

    if (target?.webpage) {
      target = target.webpage.document || target.webpage.photo || target.webpage;
    }

    if (target?.document) {
      target = target.document;
    }

    if (target?.photo) {
      target = target.photo;
    }

    // 2. If it is already a constructed InputFileLocation (e.g. InputDocumentFileLocation)
    if (
      target?.SUBCLASS_OF_ID === 354669666 ||
      target instanceof Api.InputDocumentFileLocation ||
      target instanceof Api.InputPhotoFileLocation
    ) {
      return {
        fileLocation: target,
        dcId: target.dcId,
        fileSize: target.size,
      };
    }

    // 3. Document check: has id, accessHash, fileReference, and represents a document
    if (
      target?.id !== undefined &&
      target?.accessHash !== undefined &&
      target?.fileReference !== undefined &&
      (target?.mimeType !== undefined ||
        target?.attributes !== undefined ||
        target?.className === 'Document' ||
        target instanceof Api.Document)
    ) {
      return {
        fileLocation: new Api.InputDocumentFileLocation({
          id: target.id,
          accessHash: target.accessHash,
          fileReference: target.fileReference,
          thumbSize: '',
        }),
        dcId: target.dcId,
        fileSize: target.size,
      };
    }

    // 4. Photo check: has id, accessHash, fileReference, and sizes array
    if (
      target?.id !== undefined &&
      target?.accessHash !== undefined &&
      target?.fileReference !== undefined &&
      (target?.sizes !== undefined ||
        target?.className === 'Photo' ||
        target instanceof Api.Photo)
    ) {
      const largestSize =
        target.sizes && target.sizes.length > 0
          ? target.sizes[target.sizes.length - 1]
          : null;
      return {
        fileLocation: new Api.InputPhotoFileLocation({
          id: target.id,
          accessHash: target.accessHash,
          fileReference: target.fileReference,
          thumbSize:
            largestSize && 'type' in largestSize
              ? (largestSize as any).type
              : '',
        }),
        dcId: target.dcId,
        fileSize: largestSize
          ? (utils as any)._photoSizeByteCount(largestSize)
          : undefined,
      };
    }

    // 5. Generic target that has required id, accessHash, fileReference
    if (
      target?.id !== undefined &&
      target?.accessHash !== undefined &&
      target?.fileReference !== undefined
    ) {
      return {
        fileLocation: new Api.InputDocumentFileLocation({
          id: target.id,
          accessHash: target.accessHash,
          fileReference: target.fileReference,
          thumbSize: '',
        }),
        dcId: target.dcId,
        fileSize: target.size,
      };
    }

    // 6. Fallback: only invoke getFileInfo if target is NOT a Message
    if (target && target.className !== 'Message' && !(target instanceof Api.Message)) {
      try {
        const info = utils.getFileInfo(target);
        if (info && info.location) {
          return {
            fileLocation: info.location,
            dcId: info.dcId,
            fileSize: info.size,
          };
        }
      } catch (err: any) {
        logger.warn(
          { err: err.message, className: target.className },
          'GramJS getFileInfo fallback failed on media target'
        );
      }
    }

    throw new Error(
      `Unable to extract Telegram InputFileLocation from media object (className: ${
        target?.className || typeof target
      }). Make sure the original storage message is accessible.`
    );
  }

  /**
   * Resolves the MTProto InputFileLocation for a media item.
   *
   * Direct Credential Path (No Personal Account Required / Zero Ban Risk):
   * Uses raw MTProto credentials: media_id (document ID), access_hash, file_reference, and dc_id
   * either already stored in media.telegram or decoded on the fly from the Bot API file_id.
   * This path constructs Api.InputDocumentFileLocation directly, completely bypassing
   * chat message lookups, personal account dependencies, and GramJS casting issues.
   *
   * Fallback Path:
   * Queries the chat message via client.getMessages if raw credentials cannot be resolved.
   */
  public async resolveFileLocation(
    client: TelegramClient,
    media: MediaItem
  ): Promise<{
    fileLocation: any;
    dcId: number;
    fileSize?: any;
    msgData?: [any, number];
  }> {
    // 1. Enrich metadata with decoded file_id parameters if not yet present
    enrichTelegramMetadata(media.telegram);

    const { media_id, access_hash, file_reference, dc_id } = media.telegram;

    if (media_id && access_hash) {
      logger.info(
        {
          id: media.id,
          name: media.name,
          media_id,
          hasRef: Boolean(file_reference),
          dc_id,
        },
        'Using direct MTProto credentials (no personal account session needed)'
      );

      const fileLocation = new Api.InputDocumentFileLocation({
        id: helpers.returnBigInt(media_id),
        accessHash: helpers.returnBigInt(access_hash),
        fileReference: file_reference
          ? Buffer.from(file_reference, 'hex')
          : Buffer.alloc(0),
        thumbSize: '',
      });

      const effectiveDcId = typeof dc_id === 'number' && dc_id > 0 ? dc_id : 4;

      return {
        fileLocation,
        dcId: effectiveDcId,
        fileSize: media.size,
      };
    }

    // 2. Fallback to Telegram chat message lookup
    logger.info(
      { id: media.id, name: media.name },
      'Falling back to Telegram chat message query for MTProto credentials'
    );
    const message = await this.getMediaMessage(client, media);
    const { fileLocation, dcId, fileSize } = this.extractInputFileLocation(message);
    const msgData: [any, number] | undefined =
      message.inputChat && message.id ? [message.inputChat, message.id] : undefined;

    return {
      fileLocation,
      dcId: dcId || 4,
      fileSize: fileSize || media.size,
      msgData,
    };
  }

  /**
   * Download the complete contents of a file > 20MB into memory as a Buffer.
   * Used for ZIP packaging and batch downloads.
   */
  public async downloadFileOver20MB(media: MediaItem): Promise<Buffer> {
    if (!this.isOver20MB(media.size)) {
      logger.warn(
        { size: media.size, name: media.name },
        'Attempted to download a <=20MB file via MTProto. This should be handled via Bot API to protect account limits.'
      );
    }

    const client = await this.getClient();
    this.touchActivity();

    const { fileLocation, dcId, fileSize, msgData } =
      await this.resolveFileLocation(client, media);

    logger.info(
      { id: media.id, name: media.name, size: media.size, dcId },
      'Downloading >20MB media via MTProto client'
    );

    const requestSize = 512 * 1024;
    const downloadIter = client.iterDownload({
      file: fileLocation,
      dcId,
      fileSize: helpers.returnBigInt(media.size || fileSize || 0),
      offset: helpers.returnBigInt(0),
      requestSize,
      msgData,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of downloadIter) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    this.touchActivity();
    return buffer;
  }

  /**
   * Stream a file > 20MB directly to an Express response with Range support.
   * Used for downloads and audio/video preview playback.
   */
  public async streamFileOver20MB(
    media: MediaItem,
    res: Response,
    options?: StreamRangeOptions
  ): Promise<void> {
    if (!this.isOver20MB(media.size)) {
      logger.warn(
        { size: media.size, name: media.name },
        'Attempted to stream a <=20MB file via MTProto. This should be handled via Bot API to protect account limits.'
      );
    }

    const client = await this.getClient();
    this.touchActivity();

    const { fileLocation, dcId, fileSize, msgData } =
      await this.resolveFileLocation(client, media);

    const startOffset = options?.start || 0;
    const endOffset = options?.end !== undefined ? options.end : (media.size > 0 ? media.size - 1 : undefined);
    const totalBytesToStream = endOffset !== undefined ? endOffset - startOffset + 1 : undefined;

    logger.info(
      {
        id: media.id,
        name: media.name,
        size: media.size,
        startOffset,
        endOffset,
        totalBytesToStream,
        dcId,
      },
      'Streaming >20MB media via MTProto iterDownload'
    );

    // 512KB chunk size for smooth throughput
    const requestSize = 512 * 1024;
    const downloadIter = client.iterDownload({
      file: fileLocation,
      dcId,
      fileSize: helpers.returnBigInt(media.size || fileSize || 0),
      offset: helpers.returnBigInt(startOffset),
      requestSize,
      msgData,
    });

    let bytesSent = 0;
    let clientDisconnected = false;

    res.on('close', () => {
      clientDisconnected = true;
    });

    try {
      for await (const chunk of downloadIter) {
        if (clientDisconnected || res.writableEnded || res.destroyed) {
          break;
        }

        let slice = chunk;
        if (totalBytesToStream !== undefined) {
          const remaining = totalBytesToStream - bytesSent;
          if (remaining <= 0) break;
          if (slice.length > remaining) {
            slice = slice.slice(0, remaining);
          }
        }

        const canContinue = res.write(slice);
        bytesSent += slice.length;

        if (!canContinue && !clientDisconnected) {
          await new Promise<void>((resolve) => {
            res.once('drain', resolve);
          });
        }

        if (totalBytesToStream !== undefined && bytesSent >= totalBytesToStream) {
          break;
        }
      }

      if (!res.writableEnded && !clientDisconnected) {
        res.end();
      }
    } finally {
      this.touchActivity();
    }
  }

  /**
   * Send a media item immediately to a Telegram chat via MTProto session using its
   * media_id, access_hash, and file_reference credentials.
   */
  public async sendMediaUsingMTProto(
    media: MediaItem,
    options?: {
      targetChat?: string | number;
      caption?: string;
    }
  ): Promise<{ success: boolean; messageId?: number; chat?: string; error?: string }> {
    enrichTelegramMetadata(media.telegram);
    const { media_id, access_hash, file_reference } = media.telegram;

    if (!media_id || !access_hash) {
      throw new Error(`Missing MTProto document credentials (media_id / access_hash) for ${media.name}`);
    }

    const client = await this.getClient();
    this.touchActivity();

    // Determine target peer
    const target = options?.targetChat ?? config.telegram.storageGroupId ?? 'me';
    let peer: any;
    const targetStr = String(target).trim();
    if (targetStr.toLowerCase() === 'me' || targetStr.toLowerCase() === 'self') {
      peer = 'me';
    } else if (/^-?\d+$/.test(targetStr)) {
      peer = helpers.returnBigInt(targetStr);
    } else {
      peer = targetStr;
    }

    const fileRefBuffer = file_reference ? Buffer.from(file_reference, 'hex') : Buffer.alloc(0);
    const caption = options?.caption ?? media.name;

    logger.info(
      {
        mediaId: media.id,
        name: media.name,
        target: targetStr,
        media_id,
        access_hash,
        hasFileReference: Boolean(file_reference),
      },
      'Sending media immediately via MTProto session'
    );

    // If media is an image (and not svg), try sending as photo first, with document fallback
    const isImage = media.media_type === 'image' && !media.name.toLowerCase().endsWith('.svg');
    let sentMessage: any;

    if (isImage) {
      try {
        const inputPhoto = new Api.InputPhoto({
          id: helpers.returnBigInt(media_id),
          accessHash: helpers.returnBigInt(access_hash),
          fileReference: fileRefBuffer,
        });
        sentMessage = await client.sendFile(peer, {
          file: inputPhoto as any,
          caption,
        });
      } catch (photoErr: any) {
        logger.warn(
          { photoErr: photoErr.message, mediaId: media.id },
          'Photo send attempt failed, retrying with InputDocument'
        );
        const inputDoc = new Api.InputDocument({
          id: helpers.returnBigInt(media_id),
          accessHash: helpers.returnBigInt(access_hash),
          fileReference: fileRefBuffer,
        });
        sentMessage = await client.sendFile(peer, {
          file: inputDoc as any,
          caption,
        });
      }
    } else {
      const inputDoc = new Api.InputDocument({
        id: helpers.returnBigInt(media_id),
        accessHash: helpers.returnBigInt(access_hash),
        fileReference: fileRefBuffer,
      });
      sentMessage = await client.sendFile(peer, {
        file: inputDoc as any,
        caption,
      });
    }

    this.touchActivity();

    return {
      success: true,
      messageId: sentMessage?.id,
      chat: targetStr,
    };
  }

  /**
   * Explicitly disconnect the MTProto client immediately (e.g. during graceful server shutdown).
   */
  public async disconnect(): Promise<void> {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err) {
        logger.warn({ err }, 'Error during explicit MTProto disconnect');
      } finally {
        this.client = null;
        this.connectingPromise = null;
      }
    }
  }
}

export const mtprotoService = new MtprotoService();

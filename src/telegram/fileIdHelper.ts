import { decodeFileId } from 'tg-file-id';
import { TelegramMediaMetadata } from '../types';
import { logger } from '../utils/logger';

export interface ParsedFileId {
  mediaId: string;
  accessHash: string;
  fileReference?: string;
  dcId?: number;
  fileType?: string;
}

/**
 * Parses a standard Telegram Bot API file_id into raw MTProto file parameters:
 * File ID (document.id), Access Hash, File Reference, and Datacenter ID.
 * This allows direct MTProto download via InputDocumentFileLocation without requiring
 * personal account sessions or chat message lookups.
 */
export function parseTelegramFileId(fileId: string): ParsedFileId | null {
  if (!fileId || typeof fileId !== 'string') return null;

  try {
    const decoded = decodeFileId(fileId);
    if (!decoded) return null;

    const mediaId = decoded.id ? decoded.id.toString() : undefined;
    const accessHash = decoded.access_hash ? decoded.access_hash.toString() : undefined;
    const fileReference = decoded.fileReference || undefined;
    const dcId = typeof decoded.dcId === 'number' ? decoded.dcId : undefined;

    if (!mediaId || !accessHash) {
      return null;
    }

    return {
      mediaId,
      accessHash,
      fileReference,
      dcId,
      fileType: decoded.fileType !== undefined ? String(decoded.fileType) : undefined,
    };
  } catch (err: any) {
    logger.debug({ err: err.message, fileId: fileId.slice(0, 15) }, 'Unable to decode Telegram Bot API file_id');
    return null;
  }
}

/**
 * Enriches a TelegramMediaMetadata object with MTProto parameters (media_id, access_hash, file_reference, dc_id)
 * decoded from the file_id if they are not already populated.
 */
export function enrichTelegramMetadata(meta: TelegramMediaMetadata): TelegramMediaMetadata {
  if (!meta || !meta.file_id) return meta;

  if (!meta.media_id || !meta.access_hash || !meta.file_reference || !meta.dc_id) {
    const parsed = parseTelegramFileId(meta.file_id);
    if (parsed) {
      if (!meta.media_id) meta.media_id = parsed.mediaId;
      if (!meta.access_hash) meta.access_hash = parsed.accessHash;
      if (!meta.file_reference && parsed.fileReference) meta.file_reference = parsed.fileReference;
      if (!meta.dc_id && parsed.dcId) meta.dc_id = parsed.dcId;
    }
  }

  return meta;
}

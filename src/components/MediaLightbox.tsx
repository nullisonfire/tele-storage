import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Star,
  FolderInput,
  Edit3,
  Trash2,
  ZoomIn,
  ZoomOut,
  Info,
  FileText,
  Code2,
  Send,
} from 'lucide-react';
import { MediaItem } from '../types';
import { toggleFavorite, deleteFileItem, renameFile, moveFile } from '../clientApi';
import { formatSize } from '../utils';
import { getFilePreviewKind, PreviewKind } from './preview/previewTypes';
import { VideoPlayer } from './preview/VideoPlayer';
import { AudioPlayer } from './preview/AudioPlayer';
import { PdfPreview } from './preview/PdfPreview';
import { CodePreview } from './preview/CodePreview';
import { SpreadsheetPreview } from './preview/SpreadsheetPreview';
import { DocxPreview } from './preview/DocxPreview';
import { PptxPreview } from './preview/PptxPreview';
import { SendToTelegramModal } from './SendToTelegramModal';

interface MediaLightboxProps {
  file: MediaItem | null;
  allFiles: MediaItem[];
  onClose: () => void;
  onRefresh: () => void;
  onSelectFile: (file: MediaItem) => void;
  user?: any;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  file,
  allFiles,
  onClose,
  onRefresh,
  onSelectFile,
  user,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [newDirectory, setNewDirectory] = useState<string>('');
  const [previewError, setPreviewError] = useState<boolean>(false);
  const [forceTextMode, setForceTextMode] = useState<boolean>(false);
  const [showSendTelegram, setShowSendTelegram] = useState<boolean>(false);

  useEffect(() => {
    if (file) {
      setNewName(file.name);
      setNewDirectory(file.directory);
      setZoomLevel(1);
      setPreviewError(false);
      setForceTextMode(false);
    }
  }, [file]);

  // Keyboard navigation: Left/Right arrows, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!file) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!file) return null;

  const currentIndex = allFiles.findIndex((f) => f.id === file.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allFiles.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      onSelectFile(allFiles[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onSelectFile(allFiles[currentIndex + 1]);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      const res = await toggleFavorite(file.id);
      file.is_favorite = res.isFavorite;
      setStatusMessage(res.isFavorite ? 'Added to favorites' : 'Removed from favorites');
      setTimeout(() => setStatusMessage(null), 2500);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to remove "${file.name}"?`)) return;
    try {
      await deleteFileItem(file.id);
      onRefresh();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName === file.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await renameFile(file.id, newName.trim());
      file.name = newName.trim();
      setIsRenaming(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to rename');
    }
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDirectory.trim() || newDirectory === file.directory) {
      setIsMoving(false);
      return;
    }
    try {
      await moveFile(file.id, newDirectory.trim());
      file.directory = newDirectory.trim();
      setIsMoving(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to move');
    }
  };

  const naturalKind: PreviewKind = getFilePreviewKind(file.name, file.media_type, file.mime_type);
  const effectiveKind = forceTextMode ? 'code' : naturalKind;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between text-white backdrop-blur-md select-none">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between p-3 sm:px-6 bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate max-w-xs sm:max-w-md">{file.name}</h3>
            <p className="text-[11px] text-slate-400 truncate">
              {file.directory} · {formatSize(file.size)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls (for images) */}
          {effectiveKind === 'image' && (
            <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-xl p-1">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                className="p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-1">{Math.round(zoomLevel * 100)}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                className="p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Toggle raw text viewer for documents/scripts */}
          {naturalKind !== 'image' && naturalKind !== 'video' && naturalKind !== 'audio' && (
            <button
              onClick={() => setForceTextMode(!forceTextMode)}
              className={`p-2 rounded-xl transition cursor-pointer text-xs flex items-center gap-1.5 ${
                forceTextMode ? 'bg-emerald-600 text-white' : 'bg-white/10 hover:bg-white/20 text-slate-200'
              }`}
              title="Toggle Text/Code Inspector"
            >
              <Code2 className="w-4 h-4" />
              <span className="hidden sm:inline">{forceTextMode ? 'Viewer' : 'Text'}</span>
            </button>
          )}

          <button
            onClick={handleToggleFavorite}
            className={`p-2 rounded-xl transition cursor-pointer ${
              file.is_favorite ? 'bg-amber-500 text-slate-950' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Toggle Favorite"
          >
            <Star className={`w-4 h-4 ${file.is_favorite ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-xl transition cursor-pointer ${
              showInfo ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'
            }`}
            title="File Information"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewing Canvas */}
      <div className="relative flex-1 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        {/* Prev Arrow */}
        {hasPrev && (
          <button
            onClick={handlePrev}
            className="absolute left-2 sm:left-4 z-20 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-white/20 text-white transition backdrop-blur-md cursor-pointer shadow-lg"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next Arrow */}
        {hasNext && (
          <button
            onClick={handleNext}
            className="absolute right-2 sm:right-4 z-20 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-white/20 text-white transition backdrop-blur-md cursor-pointer shadow-lg"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Dynamic Universal File Previewer */}
        <div className="max-w-full max-h-full w-full flex items-center justify-center p-1 sm:p-2">
          {effectiveKind === 'image' && (
            !previewError ? (
              <img
                src={`/api/media/${file.id}/preview`}
                alt={file.name}
                style={{ transform: `scale(${zoomLevel})` }}
                onError={() => setPreviewError(true)}
                className="max-h-[72vh] max-w-full object-contain rounded-2xl shadow-2xl transition-transform duration-150 border border-slate-800"
              />
            ) : (
              <div
                style={{ transform: `scale(${zoomLevel})` }}
                className="w-80 sm:w-96 aspect-square max-h-[70vh] rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 border border-slate-700/60 shadow-2xl"
              >
                <div className="w-20 h-20 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4 ring-1 ring-sky-500/30">
                  <Download className="w-10 h-10" />
                </div>
                <p className="text-sm font-semibold text-center text-slate-200">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {file.telegram.width && file.telegram.height ? `${file.telegram.width} × ${file.telegram.height} pixels` : formatSize(file.size)}
                </p>
                <div className="mt-4 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-800 text-sky-300 text-xs">
                  Stored in Telegram
                </div>
              </div>
            )
          )}

          {effectiveKind === 'video' && (
            <VideoPlayer mediaId={file.id} fileName={file.name} />
          )}

          {effectiveKind === 'audio' && (
            <AudioPlayer mediaId={file.id} fileName={file.name} fileSize={file.size} />
          )}

          {effectiveKind === 'pdf' && (
            <PdfPreview mediaId={file.id} fileName={file.name} />
          )}

          {effectiveKind === 'code' && (
            <CodePreview mediaId={file.id} fileName={file.name} fileSize={file.size} />
          )}

          {effectiveKind === 'spreadsheet' && (
            <SpreadsheetPreview mediaId={file.id} fileName={file.name} />
          )}

          {effectiveKind === 'docx' && (
            <DocxPreview mediaId={file.id} fileName={file.name} />
          )}

          {effectiveKind === 'pptx' && (
            <PptxPreview mediaId={file.id} fileName={file.name} />
          )}

          {effectiveKind === 'generic_document' && (
            <div className="w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700/60 p-6 text-center shadow-2xl">
              <FileText className="w-16 h-16 text-amber-400 mx-auto mb-3" />
              <p className="text-sm font-semibold truncate text-white">{file.name}</p>
              <p className="text-xs text-slate-400 mt-1">{file.mime_type} · {formatSize(file.size)}</p>
              
              <div className="flex flex-col gap-2 mt-5">
                <button
                  onClick={() => setForceTextMode(true)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  <span>View File as Text</span>
                </button>
                <a
                  href={`/api/media/${file.id}/download`}
                  download={file.name}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Document</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* File Metadata Drawer */}
        {showInfo && (
          <div className="absolute right-4 top-4 bottom-4 w-72 bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md overflow-y-auto text-xs z-30">
            <h4 className="font-semibold text-sm text-white mb-3 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-blue-400" />
              <span>Media Details</span>
            </h4>
            <div className="space-y-3 text-slate-300">
              <div>
                <span className="text-slate-500 block text-[11px]">Filename</span>
                <span className="font-medium break-all text-slate-100">{file.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Preview Engine</span>
                <span className="font-mono text-emerald-300 capitalize">{effectiveKind} Viewer</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Directory</span>
                <span className="font-mono text-slate-200">{file.directory}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Type & MIME</span>
                <span className="capitalize">{file.media_type}</span> ({file.mime_type})
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Size</span>
                <span className="font-mono">{formatSize(file.size)} ({file.size.toLocaleString()} bytes)</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Download Route</span>
                {file.size > 20 * 1024 * 1024 ? (
                  <span className="font-mono text-amber-300 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                    MTProto Client (&gt;20MB)
                  </span>
                ) : (
                  <span className="font-mono text-sky-300 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block"></span>
                    Bot API (&le;20MB)
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Created</span>
                <span>{new Date(file.created_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Telegram File ID</span>
                <span className="font-mono text-[10px] text-slate-400 break-all">
                  {file.telegram.file_id}
                </span>
              </div>
              {file.telegram.media_id && (
                <div>
                  <span className="text-slate-500 block text-[11px]">MTProto Document ID</span>
                  <span className="font-mono text-[10px] text-slate-300 break-all">
                    {file.telegram.media_id}
                  </span>
                </div>
              )}
              {file.telegram.access_hash && (
                <div>
                  <span className="text-slate-500 block text-[11px]">MTProto Access Hash</span>
                  <span className="font-mono text-[10px] text-slate-300 break-all">
                    {file.telegram.access_hash}
                  </span>
                </div>
              )}
              {file.telegram.file_reference && (
                <div>
                  <span className="text-slate-500 block text-[11px]">File Reference</span>
                  <span className="font-mono text-[10px] text-slate-400 break-all">
                    {file.telegram.file_reference}
                  </span>
                </div>
              )}
              {file.telegram.dc_id && (
                <div>
                  <span className="text-slate-500 block text-[11px]">Datacenter</span>
                  <span className="font-mono text-[10px] text-slate-300">
                    DC {file.telegram.dc_id}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg">
          {statusMessage}
        </div>
      )}

      {/* Bottom Actions Bar */}
      <div className="p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent flex flex-wrap items-center justify-center gap-2 sm:gap-3 z-10">
        {/* Direct Download */}
        <a
          href={`/api/media/${file.id}/download`}
          download={file.name}
          className="px-3.5 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-medium flex items-center gap-2 shadow-md transition active:scale-95 cursor-pointer"
          title={file.size > 20 * 1024 * 1024 ? 'Download via MTProto client (>20MB)' : 'Download via Bot API (<=20MB)'}
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
          {file.size > 20 * 1024 * 1024 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-300/30 text-amber-200 text-[10px] font-mono">
              MTProto
            </span>
          )}
        </a>

        {/* Send to Telegram via MTProto */}
        <button
          onClick={() => setShowSendTelegram(true)}
          className="px-3.5 sm:px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-medium flex items-center gap-2 shadow-md transition active:scale-95 cursor-pointer"
          title="Send to Telegram immediately via MTProto session"
        >
          <Send className="w-4 h-4" />
          <span>Send to Telegram</span>
        </button>

        {/* Rename Button */}
        <button
          onClick={() => setIsRenaming(true)}
          className="px-3 sm:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium flex items-center gap-2 transition cursor-pointer"
        >
          <Edit3 className="w-4 h-4" />
          <span>Rename</span>
        </button>

        {/* Move Button */}
        <button
          onClick={() => setIsMoving(true)}
          className="px-3 sm:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium flex items-center gap-2 transition cursor-pointer"
        >
          <FolderInput className="w-4 h-4" />
          <span>Move</span>
        </button>

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="px-3 sm:px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs sm:text-sm font-medium flex items-center gap-2 transition cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Remove</span>
        </button>
      </div>

      {/* Rename Dialog */}
      {isRenaming && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full">
            <h4 className="text-sm font-semibold mb-3">Rename File</h4>
            <form onSubmit={handleRenameSubmit}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs hover:bg-blue-500"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Dialog */}
      {isMoving && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full">
            <h4 className="text-sm font-semibold mb-3">Move to Directory</h4>
            <form onSubmit={handleMoveSubmit}>
              <input
                type="text"
                value={newDirectory}
                onChange={(e) => setNewDirectory(e.target.value)}
                placeholder="/Photos"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMoving(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs hover:bg-blue-500"
                >
                  Move
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send to Telegram Modal */}
      {showSendTelegram && file && (
        <SendToTelegramModal
          isOpen={showSendTelegram}
          onClose={() => setShowSendTelegram(false)}
          files={[file]}
          user={user}
        />
      )}
    </div>
  );
};

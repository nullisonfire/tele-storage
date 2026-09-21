import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Music,
  Star,
  CheckSquare,
  Square,
  Play,
  Clock,
  Code2,
  Table,
  Presentation,
  BookOpen,
  Send,
} from 'lucide-react';
import { MediaItem } from '../types';
import { getFilePreviewKind, PreviewKind } from './preview/previewTypes';
import { formatSize, formatDuration } from '../utils';

interface FileGridProps {
  files: MediaItem[];
  viewMode: 'grid' | 'list';
  filterType: string;
  onFilterChange: (type: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenFile: (file: MediaItem) => void;
  onSendToTelegram?: (file: MediaItem) => void;
}

const ThumbnailStage: React.FC<{ file: MediaItem }> = ({ file }) => {
  const [imgError, setImgError] = useState(false);
  const kind: PreviewKind = getFilePreviewKind(file.name, file.media_type, file.mime_type);
  const ext = file.name.toLowerCase().split('.').pop() || '';

  if (kind === 'image') {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {!imgError ? (
          <img
            src={`/api/media/${file.id}/preview`}
            alt={file.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="text-center p-4">
            <ImageIcon className="w-10 h-10 text-sky-400/60 mx-auto mb-1.5" />
            <span className="text-[10px] text-slate-400 font-mono uppercase">{ext || 'IMG'}</span>
          </div>
        )}
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className="w-full h-full bg-slate-950 relative flex items-center justify-center overflow-hidden">
        {!imgError ? (
          <img
            src={`/api/media/${file.id}/thumbnail`}
            alt={file.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950" />
        )}

        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20 text-white shadow-lg group-hover:bg-blue-600 transition-colors">
            <Play className="w-4 h-4 fill-white translate-x-0.5" />
          </div>
        </div>

        {file.telegram.duration && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white flex items-center gap-1 z-10">
            <Clock className="w-2.5 h-2.5 text-slate-400" />
            <span>{formatDuration(file.telegram.duration)}</span>
          </div>
        )}
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-purple-950/30 flex flex-col items-center justify-center p-3">
        <Music className="w-12 h-12 text-purple-400/80 mb-2 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] text-purple-300/80 font-mono uppercase">{ext || 'AUDIO'}</span>
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-red-950/30 flex flex-col items-center justify-center p-3">
        <FileText className="w-12 h-12 text-red-400/80 mb-2 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-red-300 bg-red-950/60 px-2 py-0.5 rounded-full border border-red-800/40">
          PDF
        </span>
      </div>
    );
  }

  if (kind === 'code') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-emerald-950/30 flex flex-col items-center justify-center p-3">
        <Code2 className="w-12 h-12 text-emerald-400/80 mb-2 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
          {ext || 'CODE'}
        </span>
      </div>
    );
  }

  if (kind === 'spreadsheet') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-green-950/30 flex flex-col items-center justify-center p-3">
        <Table className="w-12 h-12 text-green-400/80 mb-2 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-green-300 bg-green-950/60 px-2 py-0.5 rounded-full border border-green-800/40">
          {ext || 'SHEET'}
        </span>
      </div>
    );
  }

  if (kind === 'docx') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-blue-950/30 flex flex-col items-center justify-center p-3">
        <BookOpen className="w-12 h-12 text-blue-400/80 mb-2 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-800/40">
          DOCX
        </span>
      </div>
    );
  }

  if (kind === 'pptx') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-amber-950/30 flex flex-col items-center justify-center p-3">
        <Presentation className="w-12 h-12 text-amber-400/80 mb-2 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/40">
          PPTX
        </span>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center p-3">
      <FileText className="w-12 h-12 text-slate-500 mb-2" />
      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
        {ext || 'FILE'}
      </span>
    </div>
  );
};

export const FileGrid: React.FC<FileGridProps> = ({
  files,
  viewMode,
  filterType,
  onFilterChange,
  sortBy,
  onSortChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenFile,
  onSendToTelegram,
}) => {
  const isSelected = (id: string) => selectedIds.includes(id);

  return (
    <div className="space-y-4">
      {/* View Options & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {['all', 'image', 'video', 'document', 'audio'].map((type) => (
            <button
              key={type}
              onClick={() => onFilterChange(type)}
              className={`px-3 py-1.5 rounded-xl capitalize transition font-medium cursor-pointer ${
                filterType === type
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <button
              onClick={selectedIds.length === files.length ? onClearSelection : onSelectAll}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              {selectedIds.length === files.length ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>{selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'Select All'}</span>
            </button>
          )}

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name (A-Z)</option>
            <option value="size">Size (Largest)</option>
            <option value="type">File Type</option>
          </select>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-16 px-4 bg-slate-900/40 border border-slate-800/60 rounded-2xl">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-300">No media in this directory</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Enable Storage Group Ingestion from the upload button to catalog photos, videos, and documents into this folder.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Dense Gallery Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {files.map((file) => {
            const selected = isSelected(file.id);

            return (
              <div
                key={file.id}
                onClick={() => onOpenFile(file)}
                className={`group relative bg-slate-900/90 rounded-2xl overflow-hidden border transition-all cursor-pointer shadow-sm hover:shadow-md hover:border-slate-700 flex flex-col ${
                  selected
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-slate-800/90'
                }`}
              >
                {/* Media Preview Stage with actual image / thumbnail */}
                <div className="relative aspect-square bg-slate-950 flex items-center justify-center overflow-hidden">
                  <ThumbnailStage file={file} />

                  {/* Multi-select checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(file.id);
                    }}
                    className={`absolute top-2 left-2 p-1 rounded-lg backdrop-blur-md transition cursor-pointer z-10 ${
                      selected
                        ? 'bg-blue-600 text-white'
                        : 'bg-black/40 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Send to Telegram button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendToTelegram?.(file);
                    }}
                    className={`absolute top-2 ${file.is_favorite ? 'right-9' : 'right-2'} p-1.5 rounded-lg bg-black/60 hover:bg-sky-600 text-slate-300 hover:text-white backdrop-blur-md transition cursor-pointer z-10 opacity-0 group-hover:opacity-100`}
                    title="Send to Telegram via MTProto"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>

                  {/* Favorite indicator */}
                  {file.is_favorite && (
                    <div className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-amber-400 z-10">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                    </div>
                  )}
                </div>

                {/* File Details footer */}
                <div className="p-2.5">
                  <p className="text-xs font-medium text-slate-200 truncate group-hover:text-white" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <div className="flex items-center gap-1.5">
                      <span>{formatSize(file.size)}</span>
                      {file.size > 20 * 1024 * 1024 && (
                        <span className="px-1 py-0.2 rounded bg-amber-950/60 border border-amber-800/40 text-amber-300 font-mono text-[9px]" title="Over 20MB: routed via MTProto">
                          MTProto
                        </span>
                      )}
                    </div>
                    <span className="capitalize">{file.media_type}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl divide-y divide-slate-800/60 overflow-hidden shadow-sm">
          {files.map((file) => {
            const selected = isSelected(file.id);
            const kind = getFilePreviewKind(file.name, file.media_type, file.mime_type);

            return (
              <div
                key={file.id}
                onClick={() => onOpenFile(file)}
                className={`flex items-center justify-between p-3 sm:px-4 hover:bg-slate-800/50 transition cursor-pointer ${
                  selected ? 'bg-blue-950/20' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(file.id);
                    }}
                    className="text-slate-500 hover:text-blue-400 cursor-pointer"
                  >
                    {selected ? (
                      <CheckSquare className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {kind === 'image' || kind === 'video' ? (
                      <img
                        src={`/api/media/${file.id}/thumbnail`}
                        alt={file.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : kind === 'pdf' ? (
                      <FileText className="w-4 h-4 text-red-400" />
                    ) : kind === 'code' ? (
                      <Code2 className="w-4 h-4 text-emerald-400" />
                    ) : kind === 'spreadsheet' ? (
                      <Table className="w-4 h-4 text-green-400" />
                    ) : kind === 'docx' ? (
                      <BookOpen className="w-4 h-4 text-blue-400" />
                    ) : kind === 'pptx' ? (
                      <Presentation className="w-4 h-4 text-amber-400" />
                    ) : kind === 'audio' ? (
                      <Music className="w-4 h-4 text-purple-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-200 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(file.created_at).toLocaleDateString()} · {file.directory}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right flex-shrink-0 text-xs text-slate-400">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendToTelegram?.(file);
                    }}
                    className="p-1.5 rounded-lg hover:bg-sky-500/20 text-slate-400 hover:text-sky-400 transition cursor-pointer"
                    title="Send to Telegram via MTProto"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  {file.is_favorite && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{formatSize(file.size)}</span>
                    {file.size > 20 * 1024 * 1024 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/40 text-amber-300 font-mono text-[10px]" title="Over 20MB: routed via MTProto">
                        MTProto
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

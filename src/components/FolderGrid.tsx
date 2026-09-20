import React, { useState } from 'react';
import { Folder, MoreVertical, Edit2, Trash2, Pin } from 'lucide-react';
import { DirectoryItem } from '../types';

interface FolderGridProps {
  directories: DirectoryItem[];
  onOpenFolder: (path: string) => void;
  onRenameFolder: (dir: DirectoryItem) => void;
  onDeleteFolder: (dir: DirectoryItem) => void;
  onTogglePin?: (dir: DirectoryItem) => void;
}

export const FolderGrid: React.FC<FolderGridProps> = ({
  directories,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onTogglePin,
}) => {
  const [activeMenuDirId, setActiveMenuDirId] = useState<string | null>(null);

  if (directories.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Folders ({directories.length})
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {directories.map((dir) => (
          <div
            key={dir.id}
            className="group relative bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-3 transition-all cursor-pointer shadow-sm flex flex-col justify-between"
            onClick={() => onOpenFolder(dir.path)}
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Folder className="w-5 h-5 fill-blue-400/20" />
              </div>

              {/* Context menu button */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setActiveMenuDirId(activeMenuDirId === dir.id ? null : dir.id)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {activeMenuDirId === dir.id && (
                  <div className="absolute right-0 top-6 z-20 w-36 bg-slate-950 border border-slate-800 rounded-xl shadow-xl py-1 text-xs text-slate-300">
                    <button
                      onClick={() => {
                        setActiveMenuDirId(null);
                        onRenameFolder(dir);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Rename</span>
                    </button>
                    {onTogglePin && (
                      <button
                        onClick={() => {
                          setActiveMenuDirId(null);
                          onTogglePin(dir);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Pin className="w-3 h-3 text-amber-400" />
                        <span>Pin Folder</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveMenuDirId(null);
                        onDeleteFolder(dir);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-red-950/50 text-red-400 flex items-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-slate-200 truncate group-hover:text-white">
                {dir.name}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Directory</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

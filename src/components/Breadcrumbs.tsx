import React, { useEffect } from 'react';
import { ChevronRight, FolderPlus, ArrowLeft, Home, Archive } from 'lucide-react';

interface BreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onNewFolderClick: () => void;
  onDownloadFolderZip?: () => void;
  hasFiles?: boolean;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  currentPath,
  onNavigate,
  onNewFolderClick,
  onDownloadFolderZip,
  hasFiles,
}) => {
  // Sync with official Telegram WebApp BackButton
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.BackButton) {
      if (currentPath !== '/') {
        tg.BackButton.show();
        const handleBack = () => {
          const segments = currentPath.split('/').filter(Boolean);
          segments.pop();
          const parent = segments.length > 0 ? '/' + segments.join('/') : '/';
          onNavigate(parent);
        };
        tg.BackButton.onClick(handleBack);
        return () => {
          tg.BackButton.offClick(handleBack);
        };
      } else {
        tg.BackButton.hide();
      }
    }
  }, [currentPath, onNavigate]);

  const segments = currentPath.split('/').filter(Boolean);

  const handleSegmentClick = (index: number) => {
    if (index === -1) {
      onNavigate('/');
      return;
    }
    const path = '/' + segments.slice(0, index + 1).join('/');
    onNavigate(path);
  };

  const handleBackStep = () => {
    if (segments.length === 0) return;
    const parent = segments.length === 1 ? '/' : '/' + segments.slice(0, -1).join('/');
    onNavigate(parent);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-3 px-3 sm:px-6 border-b border-slate-800/60 bg-slate-900/40 text-xs sm:text-sm">
      {/* Path Segments */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap py-1">
        {currentPath !== '/' && (
          <button
            onClick={handleBackStep}
            className="p-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-300 mr-1 transition cursor-pointer"
            title="Go back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => handleSegmentClick(-1)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition cursor-pointer ${
            currentPath === '/'
              ? 'text-white font-semibold bg-slate-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          <span>Home</span>
        </button>

        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              <button
                onClick={() => handleSegmentClick(idx)}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  isLast
                    ? 'text-white font-semibold bg-slate-800/80'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {seg}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasFiles && onDownloadFolderZip && (
          <button
            onClick={onDownloadFolderZip}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/50 transition cursor-pointer"
            title="Download all files in this folder as a ZIP archive"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Download ZIP</span>
            <span className="sm:hidden">ZIP</span>
          </button>
        )}

        {/* New Folder Action */}
        <button
          onClick={onNewFolderClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/50 transition cursor-pointer"
        >
          <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
          <span>New Folder</span>
        </button>
      </div>
    </div>
  );
};

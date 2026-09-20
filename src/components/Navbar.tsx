import React from 'react';
import {
  Send,
  Search,
  LayoutGrid,
  List,
  UploadCloud,
  Shield,
  LogOut,
  Sparkles,
} from 'lucide-react';

interface NavbarProps {
  userName: string;
  isAdmin: boolean;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenUpload: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  totalSizeMb?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  userName,
  isAdmin,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  onOpenUpload,
  onOpenAdmin,
  onLogout,
  totalSizeMb = 0,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-md px-3 sm:px-6 py-2.5 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-2.5 min-w-max">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/10">
            <Send className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white transform -rotate-12 translate-x-0.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm sm:text-base text-white tracking-tight">
                Media Library
              </span>
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700/50 px-1.5 py-0.5 rounded-full">
                  Admin
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Telegram Storage Node</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search files or folders..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/50 transition"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
          {/* Upload Button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-medium shadow-sm transition active:scale-95 cursor-pointer"
            title="Upload Files Assistant"
          >
            <UploadCloud className="w-4 h-4" />
            <span className="hidden md:inline">Upload</span>
          </button>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-0.5">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Admin Button */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-emerald-400 border border-emerald-800/40 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              title="Admin Panel"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden lg:inline">Admin</span>
            </button>
          )}

          {/* User Menu / Logout */}
          <button
            onClick={onLogout}
            className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-red-950/40 hover:text-red-300 text-slate-400 border border-slate-800 transition cursor-pointer"
            title={`Log out (${userName})`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

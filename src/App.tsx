import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchMe,
  authWithMiniApp,
  listDirectory,
  createFolder,
  renameDirectory,
  deleteDirectoryItem,
  deleteFileItem,
  moveFile,
  logoutUser,
  searchFiles,
  downloadSelectedZip,
  downloadFolderZip,
  getActiveUploadSession,
  completeUploadSession,
} from './clientApi';
import { DirectoryItem, MediaItem, UploadSession } from './types';
import { LoginScreen } from './components/LoginScreen';
import { AccessRequestScreen } from './components/AccessRequestScreen';
import { Navbar } from './components/Navbar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { FolderGrid } from './components/FolderGrid';
import { FileGrid } from './components/FileGrid';
import { MediaLightbox } from './components/MediaLightbox';
import { UploadModal } from './components/UploadModal';
import { AdminModal } from './components/AdminModal';
import { Trash2, FolderInput, X, Archive, CheckCircle2 } from 'lucide-react';

export function App() {
  // Authentication & Session State
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [authState, setAuthState] = useState<string>('unauthorized');
  const [isMiniApp, setIsMiniApp] = useState<boolean>(false);

  // File Manager State
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [files, setFiles] = useState<MediaItem[]>([]);
  const [loadingContent, setLoadingContent] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalFiles, setTotalFiles] = useState<number>(0);

  // Modals & Drawers
  const [activeLightboxFile, setActiveLightboxFile] = useState<MediaItem | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [renamingFolder, setRenamingFolder] = useState<DirectoryItem | null>(null);
  const [newDirNameInput, setNewDirNameInput] = useState<string>('');

  // Multi-Select
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isBatchMoving, setIsBatchMoving] = useState<boolean>(false);
  const [batchMoveTarget, setBatchMoveTarget] = useState<string>('');
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

  // Active Storage Group Upload Ingestion Session
  const [activeUploadSession, setActiveUploadSession] = useState<UploadSession | null>(null);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);

  // 1. Initial Telegram WebApp & Session Check
  const checkSession = useCallback(async () => {
    try {
      // Check for URL query parameters (OIDC callback or auth error)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlError = urlParams.get('auth_error') || urlParams.get('error_description') || urlParams.get('error');
        const authCode = urlParams.get('code');
        const authStateParam = urlParams.get('state');

        if (urlError) {
          setAuthErrorMessage(decodeURIComponent(urlError));
          window.history.replaceState({}, document.title, window.location.pathname === '/auth/callback' ? '/' : window.location.pathname);
        } else if (authCode && authStateParam) {
          // Client-side fallback if callback redirected to SPA page
          try {
            const exchangeRes = await fetch(
              `/api/auth/oidc/callback?code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(authStateParam)}`,
              {
                headers: { Accept: 'application/json' },
              }
            );
            const exchangeData = await exchangeRes.json();
            if (exchangeRes.ok && exchangeData.authenticated && exchangeData.user) {
              setAuthenticated(true);
              setUser(exchangeData.user);
              setAuthState(exchangeData.user.auth_state);
              setCurrentPath(exchangeData.user.current_directory || '/');
              window.history.replaceState({}, document.title, '/');
              setSessionLoading(false);
              return;
            } else {
              setAuthErrorMessage(exchangeData.error || 'Failed to complete Telegram login');
              window.history.replaceState({}, document.title, '/');
            }
          } catch (exchangeErr: any) {
            setAuthErrorMessage(exchangeErr.message || 'Telegram authentication exchange failed');
            window.history.replaceState({}, document.title, '/');
          }
        }
      }

      // Check if inside Telegram Mini App
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      if (tg && tg.initData) {
        setIsMiniApp(true);
        // Automatically validate with server
        const authRes = await authWithMiniApp(tg.initData);
        if (authRes.success) {
          setAuthenticated(true);
          setUser(authRes.user);
          setAuthState(authRes.user.auth_state);
          setCurrentPath(authRes.user.current_directory || '/');
          setSessionLoading(false);
          return;
        }
      }

      // Otherwise check cookie session
      const me = await fetchMe();
      if (me.authenticated && me.user) {
        setAuthenticated(true);
        setUser(me.user);
        setAuthState(me.user.auth_state);
        setCurrentPath(me.user.current_directory || '/');
      } else {
        setAuthenticated(false);
        setAuthState('unauthorized');
      }
    } catch (err) {
      console.error('Session check error:', err);
      setAuthenticated(false);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // 2. Load Directory Contents
  const loadDirectoryData = useCallback(async () => {
    if (!authenticated || authState !== 'approved') return;
    setLoadingContent(true);

    try {
      if (searchQuery.trim()) {
        const searchRes = await searchFiles(searchQuery.trim(), currentPage);
        setFiles(searchRes.results || []);
        setDirectories([]);
        setTotalPages(searchRes.totalPages || 1);
        setTotalFiles(searchRes.total || 0);
      } else {
        const data = await listDirectory(currentPath, currentPage, 30, sortBy, filterType);
        setDirectories(data.directories || []);
        setFiles(data.files || []);
        setTotalPages(data.total_pages || 1);
        setTotalFiles(data.total_files_in_dir || 0);
      }
    } catch (err: any) {
      console.error('Failed to load directory:', err);
    } finally {
      setLoadingContent(false);
    }
  }, [authenticated, authState, currentPath, currentPage, sortBy, filterType, searchQuery]);

  useEffect(() => {
    loadDirectoryData();
  }, [loadDirectoryData]);

  // Reset pagination on path or filter change
  const handleNavigate = (path: string) => {
    setSearchQuery('');
    setSelectedFileIds([]);
    setCurrentPage(1);
    setCurrentPath(path);
  };

  // Folder Operations
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const target = currentPath === '/' ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`;
      await createFolder(target);
      setIsCreatingFolder(false);
      setNewFolderName('');
      loadDirectoryData();
    } catch (err: any) {
      alert(err.message || 'Failed to create folder');
    }
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingFolder || !newDirNameInput.trim()) return;

    try {
      await renameDirectory(renamingFolder.path, newDirNameInput.trim());
      setRenamingFolder(null);
      setNewDirNameInput('');
      loadDirectoryData();
    } catch (err: any) {
      alert(err.message || 'Failed to rename directory');
    }
  };

  const handleDeleteFolder = async (dir: DirectoryItem) => {
    if (!window.confirm(`Delete folder "${dir.name}"? Subfolders and media records will also be removed.`)) {
      return;
    }
    try {
      await deleteDirectoryItem(dir.path);
      loadDirectoryData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete directory');
    }
  };

  // Multi-Select Operations
  const handleToggleSelect = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedFileIds(files.map((f) => f.id));
  };

  const handleClearSelection = () => {
    setSelectedFileIds([]);
  };

  const handleBatchDelete = async () => {
    if (!window.confirm(`Delete ${selectedFileIds.length} selected media items?`)) {
      return;
    }
    for (const id of selectedFileIds) {
      try {
        await deleteFileItem(id);
      } catch (e) {
        console.error(e);
      }
    }
    setSelectedFileIds([]);
    loadDirectoryData();
  };

  const handleBatchMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchMoveTarget.trim()) return;
    for (const id of selectedFileIds) {
      try {
        await moveFile(id, batchMoveTarget.trim());
      } catch (e) {
        console.error(e);
      }
    }
    setIsBatchMoving(false);
    setSelectedFileIds([]);
    setBatchMoveTarget('');
    loadDirectoryData();
  };

  // Poll active upload ingestion session
  useEffect(() => {
    if (!authenticated || authState !== 'approved') return;

    let isMounted = true;
    const fetchActiveSession = async () => {
      try {
        const res = await getActiveUploadSession();
        if (isMounted) {
          setActiveUploadSession(res.session);
        }
      } catch (err) {
        // ignore
      }
    };

    fetchActiveSession();
    const interval = setInterval(fetchActiveSession, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [authenticated, authState]);

  const handleCompleteUploadSessionFromBanner = async () => {
    try {
      const res = await completeUploadSession();
      const count = res.session?.files_count || 0;
      setActiveUploadSession(null);
      alert(`Upload complete! Successfully indexed ${count} file(s).`);
      loadDirectoryData();
    } catch (err: any) {
      alert(err.message || 'Failed to finish upload session');
    }
  };

  const handleDownloadSelectedZip = async () => {
    if (selectedFileIds.length === 0) return;
    setDownloadingZip(true);
    try {
      await downloadSelectedZip(selectedFileIds);
    } catch (err: any) {
      alert(err.message || 'Failed to download zip');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleDownloadFolderZip = async () => {
    setDownloadingZip(true);
    try {
      await downloadFolderZip(currentPath);
    } catch (err: any) {
      alert(err.message || 'Failed to download folder zip');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setAuthenticated(false);
    setUser(null);
    setAuthState('unauthorized');
  };

  // Render Loading Splash
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs tracking-wider uppercase">Loading Telegram Media Manager...</p>
      </div>
    );
  }

  // Render Login Screen if not authenticated
  if (!authenticated || authState === 'unauthorized') {
    return <LoginScreen onLoginSuccess={checkSession} isMiniApp={isMiniApp} initialError={authErrorMessage} />;
  }

  // Render Access Request Screen if unknown, pending, rejected, or banned
  if (authState !== 'approved') {
    return (
      <AccessRequestScreen
        status={authState as any}
        userId={user?.id}
        userName={user?.first_name}
        onStatusChange={checkSession}
        onLogout={handleLogout}
      />
    );
  }

  // Render Approved Media Manager Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <Navbar
        userName={user?.first_name || 'User'}
        isAdmin={user?.role === 'admin'}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenUpload={() => setShowUploadModal(true)}
        onOpenAdmin={() => setShowAdminModal(true)}
        onLogout={handleLogout}
      />

      {/* Path Breadcrumbs */}
      <Breadcrumbs
        currentPath={currentPath}
        onNavigate={handleNavigate}
        onNewFolderClick={() => {
          setNewFolderName('');
          setIsCreatingFolder(true);
        }}
        onDownloadFolderZip={handleDownloadFolderZip}
        hasFiles={files.length > 0}
      />

      {/* Active Ingestion Mode Banner */}
      {activeUploadSession && (
        <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-950/90 border-b border-emerald-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-300 font-medium">
              Storage Group Upload Mode Active: <strong className="font-mono text-white">{activeUploadSession.destination_directory}</strong> ({activeUploadSession.files_count} file{activeUploadSession.files_count === 1 ? '' : 's'} received)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCompleteUploadSessionFromBanner}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Done (Finish Upload)</span>
            </button>
          </div>
        </div>
      )}

      {/* Multi-Select Floating Action Bar */}
      {selectedFileIds.length > 0 && (
        <div className="sticky top-14 z-20 bg-blue-600 text-white px-4 py-2.5 shadow-lg flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{selectedFileIds.length} items selected</span>
            <button
              onClick={handleClearSelection}
              className="text-blue-200 hover:text-white underline cursor-pointer"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSelectedZip}
              disabled={downloadingZip}
              className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Download selected items as ZIP archive"
            >
              <Archive className="w-3.5 h-3.5 text-amber-300" />
              <span>{downloadingZip ? 'Building ZIP...' : 'Download ZIP'}</span>
            </button>
            <button
              onClick={() => setIsBatchMoving(true)}
              className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>Move Selected</span>
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-800 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6">
        {loadingContent ? (
          <div className="text-center py-24 text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading files...
          </div>
        ) : (
          <>
            {/* Subfolders Grid */}
            {!searchQuery && (
              <FolderGrid
                directories={directories}
                onOpenFolder={handleNavigate}
                onRenameFolder={(dir) => {
                  setRenamingFolder(dir);
                  setNewDirNameInput(dir.name);
                }}
                onDeleteFolder={handleDeleteFolder}
              />
            )}

            {/* Media Files */}
            <FileGrid
              files={files}
              viewMode={viewMode}
              filterType={filterType}
              onFilterChange={setFilterType}
              sortBy={sortBy}
              onSortChange={setSortBy}
              selectedIds={selectedFileIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              onOpenFile={(file) => setActiveLightboxFile(file)}
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2 text-xs">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-slate-500 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox / Media Viewer */}
      {activeLightboxFile && (
        <MediaLightbox
          file={activeLightboxFile}
          allFiles={files}
          onClose={() => setActiveLightboxFile(null)}
          onRefresh={loadDirectoryData}
          onSelectFile={(f) => setActiveLightboxFile(f)}
        />
      )}

      {/* Upload Assistant Modal */}
      {showUploadModal && (
        <UploadModal
          currentDirectory={currentPath}
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={loadDirectoryData}
        />
      )}

      {/* Admin Panel Modal */}
      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}

      {/* New Folder Modal */}
      {isCreatingFolder && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h4 className="text-sm font-semibold mb-1 text-white">Create New Folder</h4>
            <p className="text-xs text-slate-400 mb-3">Target: <span className="font-mono text-blue-400">{currentPath}</span></p>
            <form onSubmit={handleCreateFolder}>
              <input
                type="text"
                placeholder="Folder name (e.g. Vacation, Documents)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white mb-4 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-medium"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Directory Modal */}
      {renamingFolder && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h4 className="text-sm font-semibold mb-3 text-white">Rename Folder</h4>
            <form onSubmit={handleRenameFolder}>
              <input
                type="text"
                value={newDirNameInput}
                onChange={(e) => setNewDirNameInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white mb-4 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setRenamingFolder(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Move Modal */}
      {isBatchMoving && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h4 className="text-sm font-semibold mb-2 text-white">Move {selectedFileIds.length} Items</h4>
            <p className="text-xs text-slate-400 mb-3">Enter target directory path:</p>
            <form onSubmit={handleBatchMoveSubmit}>
              <input
                type="text"
                placeholder="/Cox Tour/Photos"
                value={batchMoveTarget}
                onChange={(e) => setBatchMoveTarget(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white mb-4 focus:outline-none focus:border-blue-500 font-mono"
                autoFocus
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsBatchMoving(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-medium"
                >
                  Move Items
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;

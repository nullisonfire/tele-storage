import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Shield,
  Users,
  HardDrive,
  CheckCircle,
  XCircle,
  Ban,
  Clock,
  PieChart,
  Folder,
  Database,
  Download,
  Upload,
  Send,
  RefreshCw,
  AlertTriangle,
  FileJson,
} from 'lucide-react';
import {
  fetchAdminStats,
  fetchAdminUsers,
  fetchPendingAccess,
  approveAccess,
  rejectAccess,
  banAccess,
  unbanAccess,
  triggerDatabaseBackup,
  restoreDatabaseJson,
} from '../clientApi';
import { StorageStats, UserRecord } from '../types';

interface AdminModalProps {
  onClose: () => void;
  onDatabaseRestored?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose, onDatabaseRestored }) => {
  const [tab, setTab] = useState<'requests' | 'users' | 'storage' | 'backup_restore'>('requests');
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [pending, setPending] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Backup & Restore state
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);
  const [backupErrorMessage, setBackupErrorMessage] = useState<string | null>(null);

  const [restoreJsonInput, setRestoreJsonInput] = useState<string>('');
  const [restoreSelectedFileName, setRestoreSelectedFileName] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(null);
  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, pendingRes] = await Promise.all([
        fetchAdminStats(),
        fetchAdminUsers(),
        fetchPendingAccess(),
      ]);
      setStats(statsRes.stats);
      setUsers(usersRes.users);
      setPending(pendingRes.pending);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (userId: number) => {
    await approveAccess(userId);
    loadData();
  };

  const handleReject = async (userId: number) => {
    await rejectAccess(userId);
    loadData();
  };

  const handleBan = async (userId: number) => {
    await banAccess(userId);
    loadData();
  };

  const handleUnban = async (userId: number) => {
    await unbanAccess(userId);
    loadData();
  };

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    setBackupStatusMessage(null);
    setBackupErrorMessage(null);
    try {
      const result = await triggerDatabaseBackup();
      setBackupStatusMessage(result.message);
    } catch (err: any) {
      setBackupErrorMessage(err.message || 'Failed to dispatch database backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreSelectedFileName(file.name);
    setRestoreErrorMessage(null);
    setRestoreStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        // Validate JSON
        JSON.parse(text);
        setRestoreJsonInput(text);
      } catch (err: any) {
        setRestoreErrorMessage(`Invalid JSON in selected file: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setRestoreErrorMessage('Failed to read file contents');
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!restoreJsonInput.trim()) {
      setRestoreErrorMessage('Please provide a backup JSON or upload a backup file');
      return;
    }

    setIsRestoring(true);
    setRestoreErrorMessage(null);
    setRestoreStatusMessage(null);

    try {
      const parsed = JSON.parse(restoreJsonInput);
      const res = await restoreDatabaseJson(parsed);
      setRestoreStatusMessage(res.message);
      setShowRestoreConfirmModal(false);
      // Reload admin data and notify parent
      await loadData();
      if (onDatabaseRestored) {
        onDatabaseRestored();
      }
    } catch (err: any) {
      setRestoreErrorMessage(err.message || 'Failed to restore database');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:px-6 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Administration Console</h3>
              <p className="text-[11px] text-slate-400">Access Control, Storage & Database Management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 sm:px-6 gap-2 pt-2 overflow-x-auto">
          <button
            onClick={() => setTab('requests')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === 'requests'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Requests</span>
            {pending.length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {pending.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === 'users'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users ({users.length})</span>
          </button>

          <button
            onClick={() => setTab('storage')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === 'storage'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage Health</span>
          </button>

          <button
            onClick={() => setTab('backup_restore')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === 'backup_restore'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup/Restore</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === 'requests' && (
            <div>
              {pending.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No pending access requests. All users have been reviewed.
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">
                            {u.first_name} {u.last_name || ''}
                          </span>
                          {u.username && (
                            <span className="text-xs text-blue-400">@{u.username}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          ID: <span className="font-mono text-slate-300">{u.id}</span> · Updated:{' '}
                          {u.updated_at ? new Date(u.updated_at).toLocaleTimeString() : 'Recently'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(u.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 transition"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleReject(u.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                        <button
                          onClick={() => handleBan(u.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs transition"
                          title="Ban User"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
              {users.map((u) => (
                <div key={u.id} className="p-3 sm:px-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200">
                        {u.first_name} {u.last_name || ''}
                      </span>
                      {u.username && <span className="text-slate-400">@{u.username}</span>}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                          u.auth_state === 'approved'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                            : u.auth_state === 'banned'
                            ? 'bg-red-950 text-red-400 border border-red-800/50'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                        }`}
                      >
                        {u.auth_state}
                      </span>
                      {u.role === 'admin' && (
                        <span className="text-[10px] bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      ID: {u.id} · Path: {u.current_directory}
                    </p>
                  </div>

                  <div>
                    {u.auth_state === 'banned' ? (
                      <button
                        onClick={() => handleUnban(u.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                      >
                        Unban
                      </button>
                    ) : u.role !== 'admin' ? (
                      <button
                        onClick={() => handleBan(u.id)}
                        className="px-2.5 py-1 rounded bg-red-950/50 text-red-300 hover:bg-red-900/50 border border-red-800/40"
                      >
                        Ban
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'storage' && stats && (
            <div className="space-y-6 text-xs">
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block mb-1">Total Size</span>
                  <span className="text-lg font-bold text-white">
                    {(stats.total_size_bytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block mb-1">Total Files</span>
                  <span className="text-lg font-bold text-white">{stats.total_files}</span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block mb-1">Directories</span>
                  <span className="text-lg font-bold text-white">{stats.total_directories}</span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block mb-1">Active Users</span>
                  <span className="text-lg font-bold text-white">{users.length}</span>
                </div>
              </div>

              {/* Type Breakdown */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
                <h4 className="font-semibold text-white mb-3 flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-blue-400" />
                  <span>Media Breakdown</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 bg-slate-900 rounded-lg">
                    <span className="text-slate-400 block">Images</span>
                    <span className="text-sm font-semibold text-sky-400">{stats.type_counts.image || 0}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg">
                    <span className="text-slate-400 block">Videos</span>
                    <span className="text-sm font-semibold text-indigo-400">{stats.type_counts.video || 0}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg">
                    <span className="text-slate-400 block">Audio</span>
                    <span className="text-sm font-semibold text-purple-400">{stats.type_counts.audio || 0}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg">
                    <span className="text-slate-400 block">Documents</span>
                    <span className="text-sm font-semibold text-amber-400">{stats.type_counts.document || 0}</span>
                  </div>
                </div>
              </div>

              {/* Largest Folders */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
                <h4 className="font-semibold text-white mb-3 flex items-center gap-1.5">
                  <Folder className="w-4 h-4 text-amber-400" />
                  <span>Largest Directories</span>
                </h4>
                <div className="space-y-2">
                  {stats.largest_directories.map((dir, i) => (
                    <div key={i} className="flex items-center justify-between text-slate-300">
                      <span className="font-mono text-slate-200">{dir.path}</span>
                      <span>
                        {dir.file_count} items · {(dir.total_size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Backup & Restore Tab */}
          {tab === 'backup_restore' && (
            <div className="space-y-6 text-xs">
              {/* Section 1: Backup Database */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 sm:p-5 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Send className="w-4 h-4 text-emerald-400" />
                      <span>Backup Database to Admin IDs</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Generates a complete JSON snapshot of all directories, media index items, and users, then dispatches the backup file directly to all configured admin Telegram IDs.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href="/api/admin/backup/download"
                      download
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                      title="Direct download database JSON to your computer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download JSON</span>
                    </a>

                    <button
                      onClick={handleTriggerBackup}
                      disabled={isBackingUp}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2 transition shadow-lg shadow-emerald-950/50 cursor-pointer"
                    >
                      {isBackingUp ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Dispatching Backup...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Backup & Send to Admins</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {backupStatusMessage && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-emerald-300 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{backupStatusMessage}</span>
                  </div>
                )}

                {backupErrorMessage && (
                  <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{backupErrorMessage}</span>
                  </div>
                )}
              </div>

              {/* Section 2: Restore Database */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 sm:p-5 rounded-xl space-y-4">
                <div className="border-b border-slate-800/80 pb-3">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-400" />
                    <span>Restore Database</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Upload or paste the backed-up database JSON. Clicking <strong>Import</strong> will validate the schema, preserve safety backups, and update the live database.
                  </p>
                </div>

                {/* File picker button and drag zone */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <FileJson className="w-4 h-4 text-blue-400" />
                    <span>Select Backup JSON File</span>
                  </button>

                  {restoreSelectedFileName && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-mono truncate max-w-xs">{restoreSelectedFileName}</span>
                      <button
                        onClick={() => {
                          setRestoreSelectedFileName(null);
                          setRestoreJsonInput('');
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-slate-500 hover:text-slate-300 ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* JSON Textarea */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1.5">
                    Backed Up Database JSON Content
                  </label>
                  <textarea
                    rows={7}
                    value={restoreJsonInput}
                    onChange={(e) => {
                      setRestoreJsonInput(e.target.value);
                      setRestoreErrorMessage(null);
                      setRestoreStatusMessage(null);
                    }}
                    placeholder={`Paste database.json content here or choose a file above...\n{\n  "version": 1,\n  "users": { ... },\n  "directories": { ... },\n  "media": { ... }\n}`}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                  />
                </div>

                {/* Import Action Button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] text-slate-500">
                    A safety snapshot of your current database will automatically be saved prior to importing.
                  </div>

                  <button
                    onClick={() => {
                      if (!restoreJsonInput.trim()) {
                        setRestoreErrorMessage('Please select a file or paste JSON before clicking Import.');
                        return;
                      }
                      try {
                        JSON.parse(restoreJsonInput);
                        setShowRestoreConfirmModal(true);
                      } catch (err: any) {
                        setRestoreErrorMessage(`Invalid JSON syntax: ${err.message}`);
                      }
                    }}
                    disabled={!restoreJsonInput.trim() || isRestoring}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-blue-950/50 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Database</span>
                  </button>
                </div>

                {restoreStatusMessage && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-emerald-300 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{restoreStatusMessage}</span>
                  </div>
                )}

                {restoreErrorMessage && (
                  <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{restoreErrorMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Database Restore */}
      {showRestoreConfirmModal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/60 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-800/50">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Confirm Database Restore</h4>
                <p className="text-xs text-red-300/80">This will overwrite the current database schema.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to import this database JSON? The current database will be archived in the backups directory, and the new data will be loaded immediately.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreConfirmModal(false)}
                disabled={isRestoring}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Yes, Import</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


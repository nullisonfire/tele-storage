import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  fetchAdminStats,
  fetchAdminUsers,
  fetchPendingAccess,
  approveAccess,
  rejectAccess,
  banAccess,
  unbanAccess,
} from '../clientApi';
import { StorageStats, UserRecord } from '../types';

interface AdminModalProps {
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const [tab, setTab] = useState<'requests' | 'users' | 'storage'>('requests');
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [pending, setPending] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
              <p className="text-[11px] text-slate-400">Access Control & Storage Analytics</p>
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
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 sm:px-6 gap-2 pt-2">
          <button
            onClick={() => setTab('requests')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
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
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
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
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
              tab === 'storage'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage Health</span>
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
        </div>
      </div>
    </div>
  );
};

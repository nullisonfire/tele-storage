import React, { useState } from 'react';
import { Lock, Clock, XCircle, Ban, ArrowRight, LogOut, CheckCircle2 } from 'lucide-react';
import { requestAccess, logoutUser } from '../clientApi';

interface AccessRequestScreenProps {
  status: 'unknown' | 'pending' | 'rejected' | 'banned';
  userId: number;
  userName?: string;
  onStatusChange: () => void;
  onLogout: () => void;
}

export const AccessRequestScreen: React.FC<AccessRequestScreenProps> = ({
  status,
  userId,
  userName,
  onStatusChange,
  onLogout,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRequest = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await requestAccess();
      setMessage(res.message);
      onStatusChange();
    } catch (err: any) {
      setMessage(err.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
        {/* Status Icon */}
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center ring-1 ring-white/10">
          {status === 'unknown' && (
            <div className="w-full h-full rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>
          )}
          {status === 'pending' && (
            <div className="w-full h-full rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center animate-pulse">
              <Clock className="w-8 h-8" />
            </div>
          )}
          {status === 'rejected' && (
            <div className="w-full h-full rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
              <XCircle className="w-8 h-8" />
            </div>
          )}
          {status === 'banned' && (
            <div className="w-full h-full rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
              <Ban className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* Status Header */}
        <h2 className="text-xl font-bold text-white mb-2">
          {status === 'unknown' && '🔒 Private Media Library'}
          {status === 'pending' && '⏳ Access Request Pending'}
          {status === 'rejected' && '❌ Access Request Rejected'}
          {status === 'banned' && '⛔ Access Blocked'}
        </h2>

        {/* Status Details */}
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {status === 'unknown' && (
            <>
              This Telegram personal media management system is private.
              <br />
              Please request access from the system administrator to browse or upload.
            </>
          )}
          {status === 'pending' && (
            <>
              Your access request has already been sent and is waiting for administrator approval.
              You will be notified as soon as it is reviewed.
            </>
          )}
          {status === 'rejected' && (
            <>
              Your previous access request was declined. You may submit a new request if this was an error.
            </>
          )}
          {status === 'banned' && (
            <>
              You have been permanently banned from this bot and media library.
              This account cannot request access again.
            </>
          )}
        </p>

        {/* User Card */}
        <div className="bg-slate-950/60 rounded-xl p-3 mb-6 text-xs text-slate-400 flex items-center justify-between border border-slate-800/60">
          <span>Logged in as: <strong className="text-slate-200">{userName || 'Telegram User'}</strong></span>
          <span className="font-mono text-[11px] bg-slate-800/80 px-2 py-0.5 rounded text-slate-300">ID: {userId}</span>
        </div>

        {message && (
          <div className="mb-5 p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-300 text-xs flex items-center gap-2 justify-center">
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            <span>{message}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {(status === 'unknown' || status === 'rejected') && (
            <button
              onClick={handleRequest}
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{submitting ? 'Submitting Request...' : 'Request Access'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {status === 'pending' && (
            <button
              onClick={onStatusChange}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition cursor-pointer"
            >
              Refresh Status
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Switch Account / Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

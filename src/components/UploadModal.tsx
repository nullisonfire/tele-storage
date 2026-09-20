import React, { useState, useEffect } from 'react';
import { X, UploadCloud, CheckCircle2, FolderCheck, Radio, AlertCircle } from 'lucide-react';
import { startUploadSession, getActiveUploadSession, completeUploadSession } from '../clientApi';
import { UploadSession } from '../types';

interface UploadModalProps {
  currentDirectory: string;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  currentDirectory,
  onClose,
  onUploadSuccess,
}) => {
  const [activeSession, setActiveSession] = useState<UploadSession | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Poll active upload session while modal is open
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const res = await getActiveUploadSession();
        if (isMounted) {
          setActiveSession(res.session);
        }
      } catch (err) {
        // ignore
      }
    };

    checkSession();
    const interval = setInterval(checkSession, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleStartSession = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await startUploadSession(currentDirectory);
      setActiveSession(res.session);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start upload session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteSession = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await completeUploadSession();
      const count = res.session?.files_count || 0;
      setActiveSession(null);
      onUploadSuccess();
      alert(`Upload complete! Successfully cataloged ${count} media file(s) into ${res.session?.destination_directory || currentDirectory}.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete session');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Media Ingestion</h3>
              <p className="text-xs text-slate-400">
                Target Folder: <span className="font-mono text-blue-300 font-medium">{currentDirectory}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-4">
          {activeSession ? (
            /* Active Upload Session Panel */
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Upload Mode Active
                  </span>
                </div>
                <span className="text-xs bg-emerald-950/80 text-emerald-300 font-mono px-2.5 py-1 rounded-lg border border-emerald-800/40 font-semibold">
                  {activeSession.files_count} file(s) captured
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  Destination Directory: <span className="font-mono text-emerald-300 font-medium">{activeSession.destination_directory}</span>
                </p>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 space-y-1.5 leading-relaxed">
                  <p>1. Send your photos, videos, audios, or documents to your Telegram Storage Group.</p>
                  <p>2. Files are automatically captured and cataloged in real-time.</p>
                  <p>3. When done, click the <strong>Done</strong> button below to lock and finalize.</p>
                </div>
              </div>

              {/* Primary Done Button */}
              <div className="pt-2">
                <button
                  onClick={handleCompleteSession}
                  disabled={actionLoading}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{actionLoading ? 'Finalizing Ingestion...' : 'Done (Finish & Save Media)'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Inactive Session: Prompt to Enable */
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FolderCheck className="w-4 h-4 text-blue-400" />
                  <span>Enable Storage Group Ingestion</span>
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Clicking enable sets <span className="font-mono text-blue-300 font-medium">{currentDirectory}</span> as the target upload directory. Any files sent to the Telegram storage group will be automatically cataloged here.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-900/30 text-xs text-blue-300 leading-relaxed">
                ⚡ <strong>Browser-driven workflow:</strong> Enable upload mode here, post media in the storage group, then click <em>Done</em> here when finished.
              </div>

              <button
                onClick={handleStartSession}
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{actionLoading ? 'Activating Session...' : `Enable Upload to "${currentDirectory}"`}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

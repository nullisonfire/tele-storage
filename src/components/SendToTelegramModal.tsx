import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  User,
  Bookmark,
  Hash,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { MediaItem } from '../types';
import { sendMediaToTelegram, sendBatchToTelegram } from '../clientApi';
import { formatSize } from '../utils';

interface SendToTelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: MediaItem[];
  user?: any;
  onSuccess?: () => void;
}

export const SendToTelegramModal: React.FC<SendToTelegramModalProps> = ({
  isOpen,
  onClose,
  files,
  user,
  onSuccess,
}) => {
  const [destinationType, setDestinationType] = useState<'my_account' | 'saved_messages' | 'custom'>('my_account');
  const [customTarget, setCustomTarget] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message?: string;
    details?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSendResult(null);
      setIsSending(false);
      if (files.length === 1) {
        setCaption(files[0].name);
      } else {
        setCaption('');
      }
      setDestinationType('my_account');
      setCustomTarget('');
    }
  }, [isOpen, files]);

  if (!isOpen || files.length === 0) return null;

  const isSingle = files.length === 1;
  const singleFile = files[0];
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const getTargetPeer = (): string | number => {
    if (destinationType === 'my_account') {
      return user?.id || 'me';
    }
    if (destinationType === 'saved_messages') {
      return 'me';
    }
    return customTarget.trim() || 'me';
  };

  const handleSend = async () => {
    const targetPeer = getTargetPeer();
    if (destinationType === 'custom' && !customTarget.trim()) {
      setSendResult({
        success: false,
        message: 'Please enter a target Chat ID or @username',
      });
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      if (isSingle) {
        const res = await sendMediaToTelegram(singleFile.id, {
          targetChat: targetPeer,
          caption: caption.trim() || singleFile.name,
        });
        setSendResult({
          success: true,
          message: `Successfully sent "${singleFile.name}" via MTProto!`,
          details: res.messageId ? `Telegram Message ID: #${res.messageId}` : undefined,
        });
        if (onSuccess) onSuccess();
      } else {
        const fileIds = files.map((f) => f.id);
        const res = await sendBatchToTelegram(fileIds, {
          targetChat: targetPeer,
          captionPrefix: caption.trim() || undefined,
        });
        setSendResult({
          success: res.success,
          message: `Sent ${res.sentCount} of ${res.totalCount} files via MTProto!`,
          details: res.sentCount < res.totalCount ? 'Some files failed to transmit' : undefined,
        });
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        message: err.message || 'Failed to send media via MTProto session',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-sky-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 text-sky-400 flex items-center justify-center">
              <Send className="w-5 h-5 translate-x-0.5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                Send to Telegram
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono border border-sky-400/20 font-normal">
                  MTProto Direct
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Transmit immediately using File ID, Access Hash & File Reference
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Files Summary Box */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5">
            {isSingle ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate">{singleFile.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {formatSize(singleFile.size)} · {singleFile.directory}
                  </p>
                  {/* MTProto Credentials Inspector */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] font-mono">
                    <div className="text-slate-400">
                      Doc ID: <span className="text-sky-300">{singleFile.telegram.media_id || 'Decoded from File ID'}</span>
                    </div>
                    <div className="text-slate-400">
                      Access Hash: <span className="text-sky-300 truncate inline-block max-w-[120px] align-bottom">{singleFile.telegram.access_hash || 'Present'}</span>
                    </div>
                    <div className="text-slate-400">
                      File Ref: <span className="text-emerald-400">{singleFile.telegram.file_reference ? 'Active Hex Ref' : 'Auto-derived'}</span>
                    </div>
                    <div className="text-slate-400">
                      Datacenter: <span className="text-slate-300">DC {singleFile.telegram.dc_id || 2}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-300">
                    {files.length} Files Selected ({formatSize(totalSize)})
                  </span>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-800/40">
                    MTProto Batch
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto divide-y divide-slate-800/50 space-y-1">
                  {files.slice(0, 5).map((f) => (
                    <div key={f.id} className="text-xs text-slate-400 py-1 flex items-center justify-between">
                      <span className="truncate max-w-[260px]">{f.name}</span>
                      <span className="font-mono text-[10px] text-slate-500">{formatSize(f.size)}</span>
                    </div>
                  ))}
                  {files.length > 5 && (
                    <div className="text-[11px] text-slate-500 pt-1 text-center font-medium">
                      + {files.length - 5} more files
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Destination Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Destination Chat / Recipient
            </label>
            <div className="space-y-2">
              {/* My Account Option */}
              <button
                type="button"
                onClick={() => setDestinationType('my_account')}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                  destinationType === 'my_account'
                    ? 'bg-sky-950/40 border-sky-500/60 text-white'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${destinationType === 'my_account' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium flex items-center gap-2">
                      <span>My Telegram Account</span>
                      {user?.username && (
                        <span className="text-[10px] text-sky-400 font-mono">@{user.username}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      User ID: {user?.id || 'Connected User'} · Direct bot delivery
                    </p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  destinationType === 'my_account' ? 'border-sky-500 bg-sky-500' : 'border-slate-600'
                }`}>
                  {destinationType === 'my_account' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              {/* Saved Messages Option */}
              <button
                type="button"
                onClick={() => setDestinationType('saved_messages')}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                  destinationType === 'saved_messages'
                    ? 'bg-sky-950/40 border-sky-500/60 text-white'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${destinationType === 'saved_messages' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Bookmark className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium">Saved Messages (me)</div>
                    <p className="text-[11px] text-slate-500">MTProto Cloud Storage bookmark chat</p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  destinationType === 'saved_messages' ? 'border-sky-500 bg-sky-500' : 'border-slate-600'
                }`}>
                  {destinationType === 'saved_messages' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              {/* Custom Destination Option */}
              <button
                type="button"
                onClick={() => setDestinationType('custom')}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                  destinationType === 'custom'
                    ? 'bg-sky-950/40 border-sky-500/60 text-white'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${destinationType === 'custom' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Hash className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium">Custom Chat ID or @Username</div>
                    <p className="text-[11px] text-slate-500">Send to a specific channel, group or contact</p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  destinationType === 'custom' ? 'border-sky-500 bg-sky-500' : 'border-slate-600'
                }`}>
                  {destinationType === 'custom' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            </div>

            {/* Custom Target Input */}
            {destinationType === 'custom' && (
              <div className="mt-2.5">
                <input
                  type="text"
                  value={customTarget}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  placeholder="@mychannel or -1001234567890 or user ID"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Caption Input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {isSingle ? 'Message Caption' : 'Caption / Tag (Optional)'}
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={isSingle ? singleFile.name : 'Optional prefix or notes'}
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Security & Protocol Notice */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Transmitted instantly via MTProto Telegram binary protocol with raw credentials.</span>
          </div>

          {/* Feedback banner */}
          {sendResult && (
            <div
              className={`p-3 rounded-2xl flex items-start gap-2.5 text-xs ${
                sendResult.success
                  ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/40 border border-red-500/40 text-red-200'
              }`}
            >
              {sendResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{sendResult.message}</p>
                {sendResult.details && (
                  <p className="text-[11px] opacity-80 font-mono mt-0.5">{sendResult.details}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
          >
            {sendResult?.success ? 'Close' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-sky-700/50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-sky-950/50 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Transmitting via MTProto...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>
                  {isSingle ? 'Send to Telegram' : `Send ${files.length} Files to Telegram`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

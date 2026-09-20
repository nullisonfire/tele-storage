import React, { useState } from 'react';
import { Music, AlertCircle, Download } from 'lucide-react';
import { formatSize } from '../../utils';

interface AudioPlayerProps {
  mediaId: string;
  fileName: string;
  fileSize: number;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ mediaId, fileName, fileSize }) => {
  const [error, setError] = useState(false);
  const audioUrl = `/api/media/${mediaId}/preview`;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 text-center max-w-md shadow-2xl">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <h4 className="text-sm font-semibold text-white">Audio Playback Error</h4>
        <p className="text-xs text-slate-400 mt-1 mb-4">Cannot play audio stream directly.</p>
        <a
          href={`/api/media/${mediaId}/download`}
          download={fileName}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
        >
          <Download className="w-4 h-4" />
          <span>Download Audio</span>
        </a>
      </div>
    );
  }

  return (
    <div className="w-80 sm:w-96 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700/60 p-6 text-center shadow-2xl">
      <div className="w-20 h-20 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-4 ring-1 ring-purple-500/20 shadow-inner">
        <Music className="w-10 h-10 animate-pulse" />
      </div>

      <h4 className="text-sm font-semibold text-white truncate max-w-full">{fileName}</h4>
      <p className="text-xs text-slate-400 mt-1 mb-5">Audio Recording · {formatSize(fileSize)}</p>

      <audio
        src={audioUrl}
        controls
        playsInline
        preload="metadata"
        onError={() => setError(true)}
        className="w-full rounded-xl"
      />
    </div>
  );
};

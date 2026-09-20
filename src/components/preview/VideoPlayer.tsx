import React, { useState, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, AlertCircle, Download, RotateCcw } from 'lucide-react';

interface VideoPlayerProps {
  mediaId: string;
  fileName: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ mediaId, fileName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const previewUrl = `/api/media/${mediaId}/preview`;
  const posterUrl = `/api/media/${mediaId}/thumbnail`;

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 text-center max-w-md shadow-2xl">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <h4 className="text-sm font-semibold text-white">Video Playback Error</h4>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          This video codec or format might not be supported directly by your browser engine.
        </p>
        <a
          href={`/api/media/${mediaId}/download`}
          download={fileName}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Download Video ({fileName})</span>
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl flex flex-col items-center justify-center">
      <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl border border-slate-800 group max-h-[72vh] flex items-center justify-center">
        <video
          ref={videoRef}
          src={previewUrl}
          poster={posterUrl}
          controls
          playsInline
          preload="metadata"
          onError={() => setError(true)}
          className="max-h-[70vh] max-w-full rounded-2xl"
        />
      </div>

      {/* Speed Selector bar under video */}
      <div className="flex items-center gap-2 mt-3 px-3 py-1 bg-slate-900/80 backdrop-blur-md rounded-full border border-slate-800 text-xs">
        <span className="text-slate-500 text-[11px] font-medium mr-1">Speed:</span>
        {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
          <button
            key={spd}
            onClick={() => handleSpeedChange(spd)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition cursor-pointer ${
              playbackSpeed === spd
                ? 'bg-blue-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {spd}x
          </button>
        ))}
      </div>
    </div>
  );
};

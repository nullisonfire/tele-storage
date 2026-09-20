import React, { useState } from 'react';
import { FileText, ExternalLink, Download, AlertCircle } from 'lucide-react';

interface PdfPreviewProps {
  mediaId: string;
  fileName: string;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({ mediaId, fileName }) => {
  const [loadError, setLoadError] = useState(false);
  const previewUrl = `/api/media/${mediaId}/preview#toolbar=1&view=FitH`;

  return (
    <div className="w-full max-w-5xl h-[78vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-red-400" />
          <span className="font-medium text-slate-200">{fileName}</span>
          <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-300 text-[10px] font-mono uppercase">
            PDF Document
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/media/${mediaId}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Tab</span>
          </a>
          <a
            href={`/api/media/${mediaId}/download`}
            download={fileName}
            className="p-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* PDF Viewport */}
      <div className="flex-1 w-full bg-slate-900/50 relative overflow-hidden flex items-center justify-center">
        {!loadError ? (
          <iframe
            src={previewUrl}
            title={fileName}
            className="w-full h-full rounded-b-xl border-none bg-white"
            onError={() => setLoadError(true)}
          />
        ) : (
          <div className="text-center p-8">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-200">Browser PDF Viewer blocked</h4>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Your browser does not support embedded PDF frames in this context.
            </p>
            <a
              href={`/api/media/${mediaId}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open PDF in New Window</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

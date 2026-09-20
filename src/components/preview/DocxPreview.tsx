import React, { useState, useEffect } from 'react';
import mammoth from 'mammoth';
import { FileText, Loader2, AlertCircle, BookOpen } from 'lucide-react';

interface DocxPreviewProps {
  mediaId: string;
  fileName: string;
}

export const DocxPreview: React.FC<DocxPreviewProps> = ({ mediaId, fileName }) => {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/media/${mediaId}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        if (!isMounted) return;
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          setHtmlContent(result.value || '<p><em>Empty Word document.</em></p>');
          setLoading(false);
        } catch (parseErr: any) {
          setError(parseErr.message || 'Failed to parse Word document');
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Failed to download document');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mediaId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-950/80 rounded-2xl border border-slate-800 w-full max-w-3xl min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
        <p className="text-sm font-medium">Extracting Word document layout...</p>
        <p className="text-xs text-slate-500 mt-1">{fileName}</p>
      </div>
    );
  }

  if (error || !htmlContent) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 text-center max-w-lg">
        <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
        <h4 className="text-sm font-semibold text-slate-200">Unable to preview document</h4>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error || 'Unable to parse formatted document.'}</p>
        <a
          href={`/api/media/${mediaId}/download`}
          download={fileName}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer"
        >
          Download File
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl h-[78vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span className="font-medium text-slate-200">{fileName}</span>
          <span className="px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 text-[10px] font-mono uppercase">
            Word Document
          </span>
        </div>
      </div>

      {/* Styled Document Reader Sheet */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-900/40 flex justify-center">
        <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-xl shadow-xl max-w-2xl w-full min-h-full font-serif leading-relaxed text-sm select-text prose prose-slate">
          <div
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            className="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-400 [&_th]:p-2 [&_th]:bg-slate-100"
          />
        </div>
      </div>
    </div>
  );
};

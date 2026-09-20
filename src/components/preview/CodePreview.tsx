import React, { useState, useEffect } from 'react';
import { Copy, Check, WrapText, Loader2, AlertCircle, FileCode, Search } from 'lucide-react';

interface CodePreviewProps {
  mediaId: string;
  fileName: string;
  fileSize: number;
}

export const CodePreview: React.FC<CodePreviewProps> = ({ mediaId, fileName, fileSize }) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const ext = fileName.toLowerCase().split('.').pop() || 'txt';

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/media/${mediaId}/text`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `Failed to load text (status ${res.status})` }));
          throw new Error(errData.error || 'Failed to load file text');
        }
        return res.text();
      })
      .then((text) => {
        if (isMounted) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Unable to preview file content');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mediaId]);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-950/80 rounded-2xl border border-slate-800 w-full max-w-3xl min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
        <p className="text-sm font-medium">Loading code & script content...</p>
        <p className="text-xs text-slate-500 mt-1">{fileName}</p>
      </div>
    );
  }

  if (error || content === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 text-center max-w-lg">
        <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
        <h4 className="text-sm font-semibold text-slate-200">Unable to preview text</h4>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error || 'This file may contain binary data.'}</p>
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

  const lines = content.split('\n');
  const lineCount = lines.length;

  return (
    <div className="w-full max-w-5xl h-[75vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Code Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs gap-2">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-slate-200 font-medium">{fileName}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono uppercase">
            {ext} · {lineCount} lines · {(content.length / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search filter in preview */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2 text-slate-500" />
            <input
              type="text"
              placeholder="Find text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-28 sm:w-36"
            />
          </div>

          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 text-[11px] ${
              wrapLines
                ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle Word Wrap"
          >
            <WrapText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Wrap</span>
          </button>

          <button
            onClick={handleCopy}
            className="p-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-[11px]"
            title="Copy all code to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Code Text Content with Line Numbers */}
      <div className="flex-1 overflow-auto font-mono text-xs text-slate-300 select-text p-3">
        <div className="min-w-full inline-block">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const matchesSearch = searchQuery.trim() !== '' && line.toLowerCase().includes(searchQuery.toLowerCase());

            return (
              <div
                key={idx}
                className={`flex hover:bg-slate-900/60 leading-5 ${
                  matchesSearch ? 'bg-amber-950/40 text-amber-200' : ''
                }`}
              >
                <span className="w-12 flex-shrink-0 text-right pr-4 text-slate-600 select-none text-[11px]">
                  {lineNum}
                </span>
                <span className={`flex-1 ${wrapLines ? 'break-all whitespace-pre-wrap' : 'whitespace-pre'}`}>
                  {line || ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

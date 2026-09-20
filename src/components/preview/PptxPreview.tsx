import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Presentation, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface PptxPreviewProps {
  mediaId: string;
  fileName: string;
}

interface SlideInfo {
  slideNumber: number;
  texts: string[];
}

export const PptxPreview: React.FC<PptxPreviewProps> = ({ mediaId, fileName }) => {
  const [slides, setSlides] = useState<SlideInfo[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
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
          const zip = await JSZip.loadAsync(buffer);
          const slideFiles = Object.keys(zip.files).filter((path) =>
            path.match(/ppt\/slides\/slide\d+\.xml$/i)
          );

          // Sort slides naturally: slide1, slide2, slide10
          slideFiles.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
            return numA - numB;
          });

          const extractedSlides: SlideInfo[] = [];

          for (let i = 0; i < slideFiles.length; i++) {
            const file = zip.file(slideFiles[i]);
            if (file) {
              const xmlText = await file.async('string');
              // Extract text inside <a:t>...</a:t>
              const matches = xmlText.match(/<a:t[^>]*>([^<]+)<\/a:t>/gi) || [];
              const texts = matches
                .map((m) => m.replace(/<[^>]+>/g, '').trim())
                .filter((t) => t.length > 0);

              extractedSlides.push({
                slideNumber: i + 1,
                texts: texts.length > 0 ? texts : ['[Empty slide / graphic slide]'],
              });
            }
          }

          if (extractedSlides.length === 0) {
            throw new Error('No slide XML entries found in presentation');
          }

          setSlides(extractedSlides);
          setLoading(false);
        } catch (err: any) {
          setError(err.message || 'Failed to read PowerPoint slides');
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Failed to download presentation');
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
        <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-3" />
        <p className="text-sm font-medium">Extracting PowerPoint slides...</p>
        <p className="text-xs text-slate-500 mt-1">{fileName}</p>
      </div>
    );
  }

  if (error || slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 text-center max-w-lg">
        <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
        <h4 className="text-sm font-semibold text-slate-200">Unable to preview presentation</h4>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error || 'Could not parse slides.'}</p>
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

  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="w-full max-w-4xl h-[78vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Presentation className="w-4 h-4 text-amber-400" />
          <span className="font-medium text-slate-200">{fileName}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 text-[10px] font-mono">
            {slides.length} Slide{slides.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Slide Navigation controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentSlideIndex((i) => Math.max(0, i - 1))}
            disabled={currentSlideIndex === 0}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer text-slate-200"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-slate-300">
            Slide {currentSlideIndex + 1} of {slides.length}
          </span>
          <button
            onClick={() => setCurrentSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
            disabled={currentSlideIndex === slides.length - 1}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer text-slate-200"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slide Canvas */}
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center bg-slate-900/60">
        <div className="w-full max-w-2xl aspect-[16/9] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/80 p-8 shadow-2xl flex flex-col justify-between select-text">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
            <span className="text-[11px] font-mono text-amber-400 uppercase tracking-widest font-semibold">
              Slide {currentSlide.slideNumber}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Presentation Preview</span>
          </div>

          <div className="space-y-3 my-auto py-4">
            {currentSlide.texts.map((text, tIdx) => (
              <p
                key={tIdx}
                className={`${
                  tIdx === 0
                    ? 'text-lg font-bold text-white tracking-tight'
                    : 'text-sm text-slate-200 leading-relaxed'
                }`}
              >
                {text}
              </p>
            ))}
          </div>

          <div className="text-[10px] text-slate-500 text-right">
            Slide {currentSlide.slideNumber} / {slides.length}
          </div>
        </div>
      </div>

      {/* Slide Thumbnail Strip */}
      <div className="flex items-center gap-2 p-2.5 bg-slate-900 border-t border-slate-800 overflow-x-auto">
        {slides.map((s, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSlideIndex(idx)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer whitespace-nowrap ${
              currentSlideIndex === idx
                ? 'bg-amber-600 border-amber-500 text-white font-bold'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            Slide {s.slideNumber}
          </button>
        ))}
      </div>
    </div>
  );
};

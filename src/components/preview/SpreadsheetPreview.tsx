import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Table, Loader2, AlertCircle, Search, Layers } from 'lucide-react';

interface SpreadsheetPreviewProps {
  mediaId: string;
  fileName: string;
}

export const SpreadsheetPreview: React.FC<SpreadsheetPreviewProps> = ({ mediaId, fileName }) => {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [sheetData, setSheetData] = useState<any[][]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/media/${mediaId}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (!isMounted) return;
        try {
          const wb = XLSX.read(buffer, { type: 'array' });
          setWorkbook(wb);
          if (wb.SheetNames.length > 0) {
            const firstSheet = wb.SheetNames[0];
            setActiveSheetName(firstSheet);
            const data: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '' });
            setSheetData(data);
          }
          setLoading(false);
        } catch (parseErr: any) {
          setError(parseErr.message || 'Failed to parse spreadsheet');
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Failed to load spreadsheet file');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mediaId]);

  const handleSelectSheet = (name: string) => {
    if (!workbook) return;
    setActiveSheetName(name);
    const data: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
    setSheetData(data);
  };

  // Convert column index to Excel column name (0 -> A, 1 -> B, 26 -> AA)
  const getColName = (idx: number): string => {
    let name = '';
    let num = idx;
    while (num >= 0) {
      name = String.fromCharCode((num % 26) + 65) + name;
      num = Math.floor(num / 26) - 1;
    }
    return name;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-950/80 rounded-2xl border border-slate-800 w-full max-w-3xl min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-green-400 mb-3" />
        <p className="text-sm font-medium">Parsing spreadsheet data...</p>
        <p className="text-xs text-slate-500 mt-1">{fileName}</p>
      </div>
    );
  }

  if (error || !workbook) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 text-center max-w-lg">
        <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
        <h4 className="text-sm font-semibold text-slate-200">Unable to preview spreadsheet</h4>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error || 'Corrupted or password-protected spreadsheet.'}</p>
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

  // Determine max columns for clean grid
  const maxCols = sheetData.reduce((max, row) => Math.max(max, row ? row.length : 0), 0);
  const rowsToDisplay = sheetData.slice(0, 500); // render first 500 rows for high responsiveness

  return (
    <div className="w-full max-w-6xl h-[78vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs gap-2">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-green-400" />
          <span className="font-mono text-slate-200 font-medium">{fileName}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400 font-mono text-[11px]">
            {sheetData.length} rows × {maxCols} columns
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search cells..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-green-500 w-32 sm:w-44"
            />
          </div>
        </div>
      </div>

      {/* Sheet Selector Tabs */}
      {workbook.SheetNames.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 overflow-x-auto text-xs">
          <Layers className="w-3.5 h-3.5 text-slate-500 mr-1 flex-shrink-0" />
          {workbook.SheetNames.map((name) => (
            <button
              key={name}
              onClick={() => handleSelectSheet(name)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeSheetName === name
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Spreadsheet Table View */}
      <div className="flex-1 overflow-auto bg-slate-950 text-xs font-sans">
        {sheetData.length === 0 ? (
          <div className="text-center py-20 text-slate-500">Sheet is empty</div>
        ) : (
          <table className="border-collapse text-left min-w-full">
            <thead className="bg-slate-900 sticky top-0 z-10 select-none shadow-sm">
              <tr>
                <th className="p-2 border-b border-r border-slate-800 text-center font-mono text-slate-500 text-[10px] w-12 min-w-[48px] bg-slate-900">
                  #
                </th>
                {Array.from({ length: maxCols }).map((_, cIdx) => (
                  <th
                    key={cIdx}
                    className="p-2 border-b border-r border-slate-800 font-mono text-slate-400 text-center text-[11px] font-semibold min-w-[120px] bg-slate-900"
                  >
                    {getColName(cIdx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {rowsToDisplay.map((row, rIdx) => {
                const rowMatches =
                  searchQuery.trim() !== '' &&
                  row?.some((cell) => String(cell || '').toLowerCase().includes(searchQuery.toLowerCase()));

                return (
                  <tr
                    key={rIdx}
                    className={`hover:bg-slate-900/50 ${rowMatches ? 'bg-amber-950/30' : ''}`}
                  >
                    <td className="p-1.5 px-2 border-r border-slate-900 text-center font-mono text-slate-500 text-[10px] bg-slate-950/90 select-none">
                      {rIdx + 1}
                    </td>
                    {Array.from({ length: maxCols }).map((_, cIdx) => {
                      const val = row ? row[cIdx] : '';
                      const cellStr = val !== undefined && val !== null ? String(val) : '';
                      const isHighlighted =
                        searchQuery.trim() !== '' && cellStr.toLowerCase().includes(searchQuery.toLowerCase());

                      return (
                        <td
                          key={cIdx}
                          className={`p-1.5 px-3 border-r border-slate-900 text-slate-300 font-normal truncate max-w-[280px] ${
                            isHighlighted ? 'bg-amber-500/20 text-amber-200 font-semibold' : ''
                          }`}
                          title={cellStr}
                        >
                          {cellStr || <span className="text-slate-700 select-none">-</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {sheetData.length > 500 && (
        <div className="p-2 bg-slate-900 border-t border-slate-800 text-[11px] text-center text-slate-400">
          Showing first 500 rows for preview performance. Total rows: {sheetData.length}.
        </div>
      )}
    </div>
  );
};

import { useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import { toCsv, toJson, toMarkdown, toXlsx } from '@/services/exportService';
import { downloadBlob } from '@/utils/download';
import { errorMessage } from '@/utils/logger';
import { useAppStore } from '@/store/useAppStore';

type Format = 'json' | 'md' | 'csv' | 'xlsx';

/** 선택된 프로젝트를 JSON/Markdown/CSV/XLSX로 내보내는 드롭다운 */
export function ExportMenu() {
  const { selectedProjectId, projects, setError } = useAppStore();
  const [open, setOpen] = useState(false);

  const project = projects.find((p) => p.id === selectedProjectId);

  const handleExport = async (format: Format) => {
    setOpen(false);
    if (!selectedProjectId || !project) return;
    try {
      const bundle = await sendRequest({
        type: 'GET_EXPORT_DATA',
        projectId: selectedProjectId,
      });
      const base = project.name.replace(/[^\w가-힣-]+/g, '_');
      switch (format) {
        case 'json':
          downloadBlob(toJson(bundle), `${base}-testcases.json`, 'application/json');
          break;
        case 'md':
          downloadBlob(toMarkdown(bundle), `${base}-testcases.md`, 'text/markdown');
          break;
        case 'csv':
          downloadBlob(toCsv(bundle), `${base}-testcases.csv`, 'text/csv;charset=utf-8');
          break;
        case 'xlsx':
          downloadBlob(
            toXlsx(bundle),
            `${base}-testcases.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          break;
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!selectedProjectId}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-36 rounded border border-slate-200 bg-white shadow-lg">
          {(['json', 'md', 'csv', 'xlsx'] as Format[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => handleExport(format)}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

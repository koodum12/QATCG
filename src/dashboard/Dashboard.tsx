import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ProjectList } from '@/components/ProjectList';
import { PageList } from '@/components/PageList';
import { TestCasePanel } from '@/components/TestCasePanel';
import { SearchBar } from '@/components/SearchBar';
import { ExportMenu } from '@/components/ExportMenu';
import { SettingsModal } from '@/components/SettingsModal';

/** 대시보드 루트: 헤더(검색/Export/설정) + 3단 레이아웃 */
export function Dashboard() {
  const { loadProjects, loadFolders, loadSettings, error, setError } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadProjects();
    loadFolders();
    loadSettings();
  }, [loadProjects, loadFolders, loadSettings]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-800">AI QA Test Case Generator</h1>
        <SearchBar />
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            설정
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            닫기
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        <ProjectList />
        <PageList />
        <TestCasePanel />
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

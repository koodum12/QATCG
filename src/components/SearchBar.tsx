import { useAppStore } from '@/store/useAppStore';

/** 상단 통합 검색바 + 결과 드롭다운 */
export function SearchBar() {
  const { searchQuery, searchResults, search, clearSearch, selectProject, selectPage, selectTestCase } =
    useAppStore();

  /** 검색 결과 클릭 시 해당 위치로 이동 */
  const handleResultClick = async (projectId: number, pageId: number, testCaseId: number | null) => {
    await selectProject(projectId);
    if (pageId) await selectPage(pageId);
    if (testCaseId) selectTestCase(testCaseId);
    clearSearch();
  };

  return (
    <div className="relative w-96">
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => search(e.target.value)}
        placeholder="URL, 기능, 테스트명, 입력값, 프로젝트명 검색"
        className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
      />
      {searchResults !== null && (
        <div className="absolute top-full z-40 mt-1 max-h-96 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
          {searchResults.length === 0 && (
            <p className="p-3 text-sm text-slate-400">검색 결과가 없습니다.</p>
          )}
          {searchResults.map((result, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleResultClick(result.projectId, result.pageId, result.testCaseId)}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {result.matchedIn}
              </span>
              <span className="font-medium">{result.projectName}</span>
              {result.tcId && <span className="ml-1 font-mono text-xs">{result.tcId}</span>}
              <div className="truncate text-xs text-slate-500">{result.snippet}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

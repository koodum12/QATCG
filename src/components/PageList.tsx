import { useAppStore } from '@/store/useAppStore';

/** 가운데 패널: 선택된 프로젝트의 분석된 페이지 목록 */
export function PageList() {
  const { pages, selectedProjectId, selectedPageId, selectPage, deletePage } = useAppStore();

  return (
    <section className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <h2 className="text-sm font-semibold text-slate-700">분석된 페이지</h2>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {selectedProjectId === null && (
          <li className="p-3 text-sm text-slate-400">프로젝트를 선택하세요.</li>
        )}
        {selectedProjectId !== null && pages.length === 0 && (
          <li className="p-3 text-sm text-slate-400">
            분석된 페이지가 없습니다. 팝업에서 Generate Test Case를 실행하세요.
          </li>
        )}
        {pages.map((page) => (
          <li key={page.id}>
            <button
              type="button"
              onClick={() => selectPage(page.id)}
              className={`group w-full px-3 py-2 text-left hover:bg-slate-50 ${
                selectedPageId === page.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">{page.title || '(제목 없음)'}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('이 페이지 분석 결과를 삭제할까요?')) deletePage(page.id);
                  }}
                  className="hidden shrink-0 text-xs text-slate-400 hover:text-red-500 group-hover:inline"
                >
                  삭제
                </span>
              </div>
              <div className="truncate text-xs text-slate-500">{page.url}</div>
              <div className="text-xs text-slate-400">{page.analyzedAt}</div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

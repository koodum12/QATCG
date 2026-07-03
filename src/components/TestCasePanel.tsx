import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { sendRequest } from '@/lib/messaging';
import { errorMessage } from '@/utils/logger';
import { CopyButton } from './CopyButton';
import type { TestCaseWithInputs } from '@/types/messages';
import type { TestType } from '@/types/models';

const PRIORITY_STYLE: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-600',
};

/** 난이도 배지 스타일 (우선순위의 빨강/노랑과 구분되는 색) */
const DIFFICULTY_STYLE: Record<string, string> = {
  Hard: 'bg-purple-100 text-purple-700',
  Medium: 'bg-blue-100 text-blue-700',
  Easy: 'bg-green-100 text-green-700',
};

const TEST_TYPE_LABEL: Record<string, string> = {
  functional: '기능',
  boundary: '경계값',
  exception: '예외',
  ui: 'UI',
};

type SortKey = 'tcId' | 'difficulty' | 'priority';

const DIFFICULTY_ORDER: Record<string, number> = { Hard: 0, Medium: 1, Easy: 2, '': 3 };
const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/** 우측 패널: 테스트케이스 목록(정렬/방식 필터) + 선택 시 상세 */
export function TestCasePanel() {
  const { testCases, selectedPageId, selectedTestCaseId, selectTestCase, selectPage, setError } =
    useAppStore();
  const [sortKey, setSortKey] = useState<SortKey>('tcId');
  const [typeFilter, setTypeFilter] = useState<TestType | 'all'>('all');
  const [classifying, setClassifying] = useState(false);
  const selected = testCases.find((tc) => tc.id === selectedTestCaseId) ?? null;

  /** 필터 → 정렬 적용된 목록 (미분류는 항상 뒤로) */
  const visible = useMemo(() => {
    const filtered =
      typeFilter === 'all' ? testCases : testCases.filter((tc) => tc.testType === typeFilter);
    return [...filtered].sort((a, b) => {
      if (sortKey === 'difficulty') {
        return (DIFFICULTY_ORDER[a.difficulty] ?? 3) - (DIFFICULTY_ORDER[b.difficulty] ?? 3);
      }
      if (sortKey === 'priority') {
        return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      }
      return a.tcId.localeCompare(b.tcId);
    });
  }, [testCases, sortKey, typeFilter]);

  const hasUnclassified = testCases.some((tc) => !tc.difficulty || !tc.testType);

  /** 기존 TC를 gpt-4o-mini로 (재)분류 후 목록 새로고침 */
  const handleClassify = async () => {
    if (selectedPageId === null) return;
    setClassifying(true);
    try {
      await sendRequest({ type: 'CLASSIFY_PAGE', pageId: selectedPageId });
      await selectPage(selectedPageId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClassifying(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-1 bg-slate-50">
      <div className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              테스트 케이스 {testCases.length > 0 && `(${visible.length}/${testCases.length})`}
            </h2>
            {selectedPageId !== null && testCases.length > 0 && hasUnclassified && (
              <button
                type="button"
                onClick={handleClassify}
                disabled={classifying}
                title="gpt-4o-mini로 난이도/테스트 방식 분류"
                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {classifying ? '분류 중…' : '난이도/방식 분류'}
              </button>
            )}
          </div>
          {testCases.length > 0 && (
            <>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
              >
                <option value="tcId">TC 번호순</option>
                <option value="difficulty">난이도순 (Hard → Easy)</option>
                <option value="priority">우선순위순 (High → Low)</option>
              </select>
              <div className="flex flex-wrap gap-1">
                {(['all', 'functional', 'boundary', 'exception', 'ui'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      typeFilter === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t === 'all' ? '전체' : TEST_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {selectedPageId === null && (
            <li className="p-3 text-sm text-slate-400">페이지를 선택하세요.</li>
          )}
          {selectedPageId !== null && testCases.length === 0 && (
            <li className="p-3 text-sm text-slate-400">테스트 케이스가 없습니다.</li>
          )}
          {selectedPageId !== null && testCases.length > 0 && visible.length === 0 && (
            <li className="p-3 text-sm text-slate-400">이 방식의 테스트 케이스가 없습니다.</li>
          )}
          {visible.map((tc) => (
            <li key={tc.id}>
              <button
                type="button"
                onClick={() => selectTestCase(tc.id)}
                className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${
                  selectedTestCaseId === tc.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-slate-500">{tc.tcId}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      PRIORITY_STYLE[tc.priority] ?? PRIORITY_STYLE.Low
                    }`}
                  >
                    {tc.priority}
                  </span>
                  {tc.difficulty && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        DIFFICULTY_STYLE[tc.difficulty] ?? ''
                      }`}
                    >
                      {tc.difficulty}
                    </span>
                  )}
                  {tc.testType && (
                    <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {TEST_TYPE_LABEL[tc.testType]}
                    </span>
                  )}
                </div>
                <div className="truncate text-sm font-medium">{tc.feature}</div>
                <div className="truncate text-xs text-slate-500">{tc.purpose}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {selected ? (
          <TestCaseDetail testCase={selected} />
        ) : (
          <p className="text-sm text-slate-400">테스트 케이스를 선택하면 상세가 표시됩니다.</p>
        )}
      </div>
    </section>
  );
}

/** 테스트케이스 상세 뷰 */
function TestCaseDetail({ testCase }: { testCase: TestCaseWithInputs }) {
  return (
    <article className="max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-center gap-3">
        <span className="font-mono text-sm text-slate-500">{testCase.tcId}</span>
        <h3 className="text-lg font-semibold">{testCase.feature}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            PRIORITY_STYLE[testCase.priority] ?? PRIORITY_STYLE.Low
          }`}
        >
          {testCase.priority}
        </span>
        {testCase.difficulty && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              DIFFICULTY_STYLE[testCase.difficulty] ?? ''
            }`}
          >
            난이도 {testCase.difficulty}
          </span>
        )}
        {testCase.testType && (
          <span className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
            {TEST_TYPE_LABEL[testCase.testType]}
          </span>
        )}
      </header>

      <section className="mb-4">
        <h4 className="mb-1 text-sm font-semibold text-slate-600">목적</h4>
        <p className="text-sm">{testCase.purpose}</p>
      </section>

      <section className="mb-4">
        <h4 className="mb-1 text-sm font-semibold text-slate-600">절차</h4>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {testCase.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      {testCase.inputs.length > 0 && (
        <section className="mb-4">
          <h4 className="mb-1 text-sm font-semibold text-slate-600">입력값</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">필드</th>
                <th className="py-1 pr-2">값</th>
                <th className="py-1 pr-2">분류</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {testCase.inputs.map((input) => (
                <tr key={input.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 font-medium">{input.field}</td>
                  <td className="break-all py-1.5 pr-2 font-mono text-xs">{input.value}</td>
                  <td className="py-1.5 pr-2 text-xs text-slate-500">{input.category}</td>
                  <td className="py-1.5 text-right">
                    <CopyButton value={input.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate-600">예상 결과</h4>
        <p className="rounded bg-slate-50 p-3 text-sm">{testCase.expectedResult}</p>
      </section>
    </article>
  );
}

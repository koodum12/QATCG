import { useAppStore } from '@/store/useAppStore';
import { CopyButton } from './CopyButton';
import type { TestCaseWithInputs } from '@/types/messages';

const PRIORITY_STYLE: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-600',
};

/** 우측 패널: 테스트케이스 목록 + 선택 시 상세(목적/절차/입력값/예상결과) */
export function TestCasePanel() {
  const { testCases, selectedPageId, selectedTestCaseId, selectTestCase } = useAppStore();
  const selected = testCases.find((tc) => tc.id === selectedTestCaseId) ?? null;

  return (
    <section className="flex min-w-0 flex-1 bg-slate-50">
      <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <h2 className="text-sm font-semibold text-slate-700">
            테스트 케이스 {testCases.length > 0 && `(${testCases.length})`}
          </h2>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {selectedPageId === null && (
            <li className="p-3 text-sm text-slate-400">페이지를 선택하세요.</li>
          )}
          {selectedPageId !== null && testCases.length === 0 && (
            <li className="p-3 text-sm text-slate-400">테스트 케이스가 없습니다.</li>
          )}
          {testCases.map((tc) => (
            <li key={tc.id}>
              <button
                type="button"
                onClick={() => selectTestCase(tc.id)}
                className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${
                  selectedTestCaseId === tc.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{tc.tcId}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      PRIORITY_STYLE[tc.priority] ?? PRIORITY_STYLE.Low
                    }`}
                  >
                    {tc.priority}
                  </span>
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

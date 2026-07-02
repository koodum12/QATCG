import { useEffect, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import { errorMessage } from '@/utils/logger';
import type { Project } from '@/types/models';

type Status =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

/**
 * 팝업 UI: 프로젝트 선택 → Generate Test Case 실행.
 * 결과 확인은 대시보드(새 탭)에서 한다.
 */
export function Popup() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [newName, setNewName] = useState('');
  const [deep, setDeep] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    (async () => {
      try {
        const [list, settings] = await Promise.all([
          sendRequest({ type: 'GET_PROJECTS' }),
          sendRequest({ type: 'GET_SETTINGS' }),
        ]);
        setProjects(list);
        if (list.length > 0) setProjectId(list[0].id);
        setHasApiKey(Boolean(settings.apiKey));
      } catch (err) {
        setStatus({ kind: 'error', message: errorMessage(err) });
      }
    })();
  }, []);

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    try {
      const project = await sendRequest({ type: 'CREATE_PROJECT', name: newName.trim() });
      const list = await sendRequest({ type: 'GET_PROJECTS' });
      setProjects(list);
      setProjectId(project.id);
      setNewName('');
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) });
    }
  };

  const handleGenerate = async () => {
    if (projectId === '') {
      setStatus({ kind: 'error', message: '프로젝트를 먼저 선택하세요.' });
      return;
    }
    setStatus({ kind: 'generating' });
    try {
      const result = await sendRequest({
        type: 'GENERATE_TEST_CASES',
        projectId,
        deep,
      });
      setStatus({ kind: 'done', count: result.testCaseCount });
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) });
    }
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  };

  return (
    <div className="p-4">
      <h1 className="mb-3 text-base font-bold text-slate-800">AI QA Test Case Generator</h1>

      {!hasApiKey && (
        <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-700">
          OpenAI API 키가 없습니다. 대시보드 → 설정에서 키를 입력하세요.
        </p>
      )}

      <label className="mb-1 block text-xs font-medium text-slate-600">프로젝트</label>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
        className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
      >
        {projects.length === 0 && <option value="">프로젝트 없음</option>}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <div className="mb-3 flex gap-1">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
          placeholder="새 프로젝트 이름"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={handleCreateProject}
          className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
        >
          추가
        </button>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
        심층 분석 (원본 HTML 포함 — 토큰 사용량 증가)
      </label>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={status.kind === 'generating'}
        className="mb-2 w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status.kind === 'generating' ? '분석 중… (최대 1분 소요)' : 'Generate Test Case'}
      </button>

      {status.kind === 'done' && (
        <p className="mb-2 rounded bg-green-50 p-2 text-xs text-green-700">
          테스트 케이스 {status.count}건 생성 완료! 대시보드에서 확인하세요.
        </p>
      )}
      {status.kind === 'error' && (
        <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{status.message}</p>
      )}

      <button
        type="button"
        onClick={openDashboard}
        className="w-full rounded border border-slate-300 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        대시보드 열기
      </button>
    </div>
  );
}

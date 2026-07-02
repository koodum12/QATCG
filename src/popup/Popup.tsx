import { useEffect, useRef, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import { errorMessage } from '@/utils/logger';
import { ProgressBar } from '@/components/ProgressBar';
import type { JobStatus } from '@/types/messages';
import type { Folder, Project } from '@/types/models';

/** 폴더 선택 값: 숫자(폴더 id) 또는 'unfiled'(미분류) */
type FolderSel = number | 'unfiled';

/**
 * 팝업 UI: 폴더 선택 → 프로젝트 선택 → Generate Test Case 실행.
 * 폴더/프로젝트 생성도 팝업에서 바로 가능하며, 새 프로젝트는 선택된 폴더 안에 생성된다.
 *
 * 생성은 서버 잡으로 진행되므로 팝업을 닫아도 계속된다. 팝업은 잡을 폴링해 진행 바를 그리고,
 * 다시 열었을 때 진행 중이던 잡이 있으면 자동으로 이어서 표시(GET_ACTIVE_JOB)한다.
 */
export function Popup() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderSel, setFolderSel] = useState<FolderSel>('unfiled');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [newName, setNewName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [deep, setDeep] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  /** 잡 폴링 시작 (완료/오류 시 자동 정지) */
  const startPolling = (jobId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const status = await sendRequest({ type: 'GET_JOB', jobId });
        setJob(status);
        if (status.status === 'done' || status.status === 'error') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        setError(errorMessage(err));
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 1000);
  };

  useEffect(() => {
    (async () => {
      try {
        const [list, folderList, settings, active] = await Promise.all([
          sendRequest({ type: 'GET_PROJECTS' }),
          sendRequest({ type: 'GET_FOLDERS' }),
          sendRequest({ type: 'GET_SETTINGS' }),
          sendRequest({ type: 'GET_ACTIVE_JOB' }),
        ]);
        setProjects(list);
        setFolders(folderList);
        // 기본 선택: 가장 최근 프로젝트와 그 소속 폴더
        if (list.length > 0) {
          setProjectId(list[0].id);
          setFolderSel(list[0].folderId ?? 'unfiled');
        }
        setHasApiKey(settings.hasApiKey);
        // 진행 중이던 잡 복원
        if (active && active.status !== 'done' && active.status !== 'error') {
          const activeProject = list.find((p) => p.id === active.projectId);
          if (activeProject) setFolderSel(activeProject.folderId ?? 'unfiled');
          setProjectId(active.projectId);
          setJob(active);
          startPolling(active.id);
        }
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  /** 선택된 폴더에 속한 프로젝트만 표시 */
  const filteredProjects = projects.filter((p) =>
    folderSel === 'unfiled' ? p.folderId === null : p.folderId === folderSel,
  );

  /** 폴더 변경 시 그 폴더의 첫 프로젝트를 자동 선택 */
  const handleFolderChange = (sel: FolderSel) => {
    setFolderSel(sel);
    const inFolder = projects.filter((p) =>
      sel === 'unfiled' ? p.folderId === null : p.folderId === sel,
    );
    setProjectId(inFolder.length > 0 ? inFolder[0].id : '');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const folder = await sendRequest({ type: 'CREATE_FOLDER', name: newFolderName.trim() });
      setFolders(await sendRequest({ type: 'GET_FOLDERS' }));
      setNewFolderName('');
      setShowNewFolder(false);
      handleFolderChange(folder.id); // 새 폴더를 바로 선택
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /** 새 프로젝트는 현재 선택된 폴더 안에 생성 */
  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    try {
      const project = await sendRequest({
        type: 'CREATE_PROJECT',
        name: newName.trim(),
        folderId: folderSel === 'unfiled' ? null : folderSel,
      });
      setProjects(await sendRequest({ type: 'GET_PROJECTS' }));
      setProjectId(project.id);
      setNewName('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleGenerate = async () => {
    setError(null);
    if (projectId === '') {
      setError('프로젝트를 먼저 선택하세요.');
      return;
    }
    setJob({ id: '', status: 'queued', stage: '페이지 수집 중', progress: 5, error: null, result: null });
    try {
      const { jobId } = await sendRequest({ type: 'GENERATE_TEST_CASES', projectId, deep });
      startPolling(jobId);
    } catch (err) {
      setError(errorMessage(err));
      setJob(null);
    }
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  };

  const isRunning = job !== null && job.status !== 'done' && job.status !== 'error';

  return (
    <div className="p-4">
      <h1 className="mb-3 text-base font-bold text-slate-800">AI QA Test Case Generator</h1>

      {!hasApiKey && (
        <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-700">
          서버에 OpenAI API 키가 없습니다. server/.env의 OPENAI_API_KEY를 설정하세요.
        </p>
      )}

      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-600">폴더</label>
        <button
          type="button"
          onClick={() => setShowNewFolder((v) => !v)}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          {showNewFolder ? '접기' : '＋ 새 폴더'}
        </button>
      </div>
      <select
        value={folderSel === 'unfiled' ? 'unfiled' : String(folderSel)}
        onChange={(e) =>
          handleFolderChange(e.target.value === 'unfiled' ? 'unfiled' : Number(e.target.value))
        }
        disabled={isRunning}
        className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
      >
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            📁 {folder.name}
          </option>
        ))}
        <option value="unfiled">(미분류)</option>
      </select>

      {showNewFolder && (
        <div className="mb-2 flex gap-1">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreateFolder()
            }
            placeholder="새 폴더 이름"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleCreateFolder}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            추가
          </button>
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-slate-600">프로젝트</label>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={isRunning}
        className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
      >
        {filteredProjects.length === 0 && <option value="">이 폴더에 프로젝트 없음</option>}
        {filteredProjects.map((project) => (
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
          onKeyDown={(e) =>
            e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreateProject()
          }
          placeholder="새 프로젝트 (선택한 폴더에 생성)"
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
        <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} disabled={isRunning} />
        심층 분석 (원본 HTML 포함 — 토큰 사용량 증가)
      </label>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isRunning}
        className="mb-2 w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isRunning ? '생성 중…' : 'Generate Test Case'}
      </button>

      {job && (job.status === 'queued' || job.status === 'running') && (
        <ProgressBar stage={job.stage} progress={job.progress} />
      )}
      {job && job.status === 'done' && job.result && (
        <p className="mb-2 rounded bg-green-50 p-2 text-xs text-green-700">
          테스트 케이스 {job.result.testCaseCount}건 생성 완료! 대시보드에서 확인하세요.
        </p>
      )}
      {job && job.status === 'error' && (
        <>
          <ProgressBar stage={job.stage} progress={100} error />
          <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{job.error}</p>
        </>
      )}
      {error && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      <p className="mb-2 text-[11px] text-slate-400">
        생성은 서버에서 진행됩니다. 이 팝업을 닫아도 계속되며, 다시 열면 진행 상황이 이어집니다.
      </p>

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

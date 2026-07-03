import { api } from '@/lib/api';
import { errorMessage, logger } from '@/utils/logger';
import type {
  ExportBundle,
  JobHandle,
  JobStatus,
  RuntimeRequest,
  RuntimeResponse,
  Settings,
  TestCaseWithInputs,
} from '@/types/messages';
import type { Folder, Page, Project, SearchResult } from '@/types/models';
import type { PageAnalysis } from '@/types/dom';

/**
 * background service worker.
 *
 * 데이터/생성은 로컬 Python 백엔드(REST)가 담당한다. 확장은 DOM 수집만 하고
 * 생성은 서버 잡으로 넘기므로, 팝업이 닫히거나 SW가 종료돼도 생성이 계속된다.
 * 진행 중 잡 id는 chrome.storage에 저장해 팝업 재접속 시 진행 바를 이어서 보여준다.
 */

const ACTIVE_JOB_KEY = 'activeJob';

/** 현재 활성 탭을 찾는다 (일반 웹 페이지만 허용) */
async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다.');
  if (!/^https?:/.test(tab.url ?? '')) {
    throw new Error('일반 웹 페이지에서만 분석할 수 있습니다. (chrome://, 확장 페이지 등 불가)');
  }
  return tab;
}

/** content script를 주입하고 페이지 분석 결과를 수집 */
async function collectFromTab(tabId: number, deep: boolean): Promise<PageAnalysis> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const response = (await chrome.tabs.sendMessage(tabId, {
    type: 'COLLECT_PAGE',
    deep,
  })) as RuntimeResponse<PageAnalysis>;
  if (!response?.ok) {
    throw new Error(response?.ok === false ? response.error : '페이지 수집에 실패했습니다.');
  }
  return response.data;
}

/** Generate 시작: 탭에서 DOM 수집 → 서버에 잡 생성 → 잡 id 저장 후 반환 */
async function startGenerate(projectId: number, deep: boolean): Promise<JobHandle> {
  const tab = await getActiveTab();
  logger.info('background', `분석 시작: ${tab.url} (deep=${deep})`);
  const analysis = await collectFromTab(tab.id!, deep);
  const { jobId } = await api.post<JobHandle>('/jobs/generate', {
    projectId,
    analysis,
    deep,
  });
  await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: { jobId, projectId } });
  logger.info('background', `잡 생성됨: ${jobId}`);
  return { jobId };
}

/** 잡 상태 조회. 완료/오류면 활성 잡 기록을 정리한다. */
async function getJob(jobId: string): Promise<JobStatus> {
  const job = await api.get<JobStatus>(`/jobs/${jobId}`);
  if (job.status === 'done' || job.status === 'error') {
    const stored = await chrome.storage.local.get(ACTIVE_JOB_KEY);
    if (stored[ACTIVE_JOB_KEY]?.jobId === jobId) {
      await chrome.storage.local.remove(ACTIVE_JOB_KEY);
    }
  }
  return job;
}

/** 팝업 재접속 시 진행 중이던 잡을 복원 */
async function getActiveJob(): Promise<(JobStatus & { projectId: number }) | null> {
  const stored = await chrome.storage.local.get(ACTIVE_JOB_KEY);
  const active = stored[ACTIVE_JOB_KEY] as { jobId: string; projectId: number } | undefined;
  if (!active) return null;
  try {
    const job = await getJob(active.jobId);
    return { ...job, projectId: active.projectId };
  } catch {
    // 서버 재시작 등으로 잡이 사라졌으면 기록 정리
    await chrome.storage.local.remove(ACTIVE_JOB_KEY);
    return null;
  }
}

/** 요청 타입별 라우팅 (대부분 서버 REST로 프록시) */
async function route(request: RuntimeRequest): Promise<unknown> {
  switch (request.type) {
    case 'GET_PROJECTS':
      return api.get<Project[]>('/projects');
    case 'CREATE_PROJECT':
      return api.post<Project>('/projects', {
        name: request.name,
        folderId: request.folderId ?? null,
      });
    case 'UPDATE_PROJECT':
      return api.patch<Project>(`/projects/${request.projectId}`, {
        context: request.context ?? null,
        folderId: request.folderId ?? null,
        setFolder: request.setFolder ?? false,
      });
    case 'DELETE_PROJECT':
      await api.del(`/projects/${request.projectId}`);
      return null;
    case 'GET_FOLDERS':
      return api.get<Folder[]>('/folders');
    case 'CREATE_FOLDER':
      return api.post<Folder>('/folders', { name: request.name });
    case 'UPDATE_FOLDER':
      return api.patch<Folder>(`/folders/${request.folderId}`, { context: request.context });
    case 'DELETE_FOLDER':
      await api.del(`/folders/${request.folderId}`);
      return null;
    case 'GET_PAGES':
      return api.get<Page[]>(`/projects/${request.projectId}/pages`);
    case 'DELETE_PAGE':
      await api.del(`/pages/${request.pageId}`);
      return null;
    case 'GET_TEST_CASES':
      return api.get<TestCaseWithInputs[]>(`/pages/${request.pageId}/testcases`);
    case 'CLASSIFY_PAGE':
      return api.post<{ classified: number }>(`/pages/${request.pageId}/classify`);
    case 'GENERATE_TEST_CASES':
      return startGenerate(request.projectId, request.deep);
    case 'GET_JOB':
      return getJob(request.jobId);
    case 'GET_ACTIVE_JOB':
      return getActiveJob();
    case 'SEARCH':
      return api.get<SearchResult[]>(`/search?q=${encodeURIComponent(request.query)}`);
    case 'GET_SETTINGS': {
      const health = await api.get<{
        model: string;
        reasoningEffort: Settings['reasoningEffort'];
        hasApiKey: boolean;
      }>('/health');
      return {
        model: health.model,
        reasoningEffort: health.reasoningEffort,
        hasApiKey: health.hasApiKey,
      } satisfies Settings;
    }
    case 'SAVE_SETTINGS':
      await api.post('/config', request.settings);
      return null;
    case 'GET_EXPORT_DATA':
      return api.get<ExportBundle>(`/projects/${request.projectId}/export`);
    default: {
      const unknown = request as { type?: string };
      throw new Error(`알 수 없는 요청: ${unknown.type}`);
    }
  }
}

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse) => {
    if (!request?.type) return undefined;
    route(request)
      .then((data) => sendResponse({ ok: true, data } satisfies RuntimeResponse))
      .catch((err) => {
        logger.error('background', `${request.type} 처리 실패`, err);
        sendResponse({ ok: false, error: errorMessage(err) } satisfies RuntimeResponse);
      });
    return true; // 비동기 응답 채널 유지
  },
);

logger.info('background', 'service worker 시작 (백엔드 프록시 모드)');

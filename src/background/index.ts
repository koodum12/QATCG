import { AppDb, IndexedDbAdapter } from '@/db/database';
import { Repositories } from '@/db/repositories';
import { generateTestCases } from '@/services/openaiService';
import { DEFAULT_MODEL } from '@/services/openaiService';
import { errorMessage, logger } from '@/utils/logger';
import type {
  RuntimeRequest,
  RuntimeResponse,
  Settings,
} from '@/types/messages';
import type { PageAnalysis } from '@/types/dom';

/**
 * background service worker.
 * - sql.js DB를 소유하고 IndexedDB에 영속화
 * - popup/dashboard의 요청을 라우팅
 * - Generate 파이프라인: content script 주입 → DOM 수집 → OpenAI → DB 저장
 */

let dbPromise: Promise<Repositories> | null = null;

/** DB 싱글턴 초기화 (service worker 재시작 시 IndexedDB에서 복원) */
function getRepositories(): Promise<Repositories> {
  if (!dbPromise) {
    dbPromise = AppDb.create({
      locateFile: (file) => chrome.runtime.getURL(file),
      persistence: new IndexedDbAdapter(),
    }).then((db) => new Repositories(db));
    dbPromise.catch((err) => {
      logger.error('background', 'DB 초기화 실패', err);
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** chrome.storage에서 설정 로드 */
async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(['apiKey', 'model']);
  return {
    apiKey: (stored.apiKey as string) ?? '',
    model: (stored.model as string) || DEFAULT_MODEL,
  };
}

async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    apiKey: settings.apiKey,
    model: settings.model,
  });
}

/** 현재 활성 탭을 찾는다 */
async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다.');
  const url = tab.url ?? '';
  if (!/^https?:/.test(url)) {
    throw new Error('일반 웹 페이지에서만 분석할 수 있습니다. (chrome://, 확장 페이지 등 불가)');
  }
  return tab;
}

/** content script를 주입하고 페이지 분석 결과를 수집 */
async function collectFromTab(tabId: number, deep: boolean): Promise<PageAnalysis> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
  const response = (await chrome.tabs.sendMessage(tabId, {
    type: 'COLLECT_PAGE',
    deep,
  })) as RuntimeResponse<PageAnalysis>;
  if (!response?.ok) {
    throw new Error(response?.ok === false ? response.error : '페이지 수집에 실패했습니다.');
  }
  return response.data;
}

/** Generate 파이프라인: 수집 → AI 생성 → 저장 */
async function handleGenerate(projectId: number, deep: boolean) {
  const repo = await getRepositories();
  const settings = await getSettings();
  const tab = await getActiveTab();

  logger.info('background', `분석 시작: ${tab.url} (deep=${deep})`);
  const analysis = await collectFromTab(tab.id!, deep);

  const output = await generateTestCases(analysis, {
    apiKey: settings.apiKey,
    model: settings.model,
  });

  await repo.savePromptHistory(output.prompt, output.rawResponse);
  const result = await repo.saveAnalysisResult({
    projectId,
    url: analysis.url,
    title: analysis.title,
    html: analysis.html,
    domJson: JSON.stringify({
      dom: analysis.dom,
      stats: analysis.stats,
      flags: analysis.flags,
      apiCalls: analysis.apiCalls,
    }),
    testCases: output.response.testCases,
  });
  logger.info('background', `저장 완료: page=${result.pageId}, TC ${result.testCaseCount}건`);
  return result;
}

/** 요청 타입별 라우팅 */
async function route(request: RuntimeRequest): Promise<unknown> {
  const repo = await getRepositories();
  switch (request.type) {
    case 'GET_PROJECTS':
      return repo.listProjects();
    case 'CREATE_PROJECT': {
      const name = request.name.trim();
      if (!name) throw new Error('프로젝트 이름을 입력하세요.');
      return repo.createProject(name);
    }
    case 'DELETE_PROJECT':
      await repo.deleteProject(request.projectId);
      return null;
    case 'GET_PAGES':
      return repo.listPages(request.projectId);
    case 'DELETE_PAGE':
      await repo.deletePage(request.pageId);
      return null;
    case 'GET_TEST_CASES':
      return repo.listTestCases(request.pageId);
    case 'GET_INPUT_DATA':
      return repo.listInputData(request.testcaseId);
    case 'GENERATE_TEST_CASES':
      return handleGenerate(request.projectId, request.deep);
    case 'SEARCH':
      return repo.search(request.query);
    case 'GET_SETTINGS':
      return getSettings();
    case 'SAVE_SETTINGS':
      await saveSettings(request.settings);
      return null;
    case 'GET_EXPORT_DATA':
      return repo.getExportBundle(request.projectId);
    default: {
      const unknown = request as { type?: string };
      throw new Error(`알 수 없는 요청: ${unknown.type}`);
    }
  }
}

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse) => {
    // content script의 COLLECT_PAGE 응답 등 다른 메시지는 무시
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

logger.info('background', 'service worker 시작');

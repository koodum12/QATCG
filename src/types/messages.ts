import type {
  Folder,
  InputData,
  Page,
  Project,
  SearchResult,
  TestCase,
} from './models';
import type { PageAnalysis } from './dom';

/** 확장 내부 메시지 프로토콜 (popup/dashboard ↔ background, background ↔ content) */

/** gpt-5.5 등 reasoning 모델의 추론 강도 (Responses API reasoning.effort) */
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/**
 * 설정. API 키는 서버 .env에서만 관리하므로 확장에는 노출하지 않고,
 * 키가 설정됐는지 여부(hasApiKey)만 전달한다.
 */
export interface Settings {
  model: string;
  reasoningEffort: ReasoningEffort;
  hasApiKey: boolean;
}

/** 서버 생성 잡 상태 (진행 바 표시용) */
export interface JobStatus {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  /** 사람이 읽는 현재 단계 */
  stage: string;
  /** 0~100 */
  progress: number;
  error: string | null;
  result: GenerateResult | null;
}

/** background로 보내는 요청 메시지 */
export type RuntimeRequest =
  | { type: 'GET_PROJECTS' }
  | { type: 'CREATE_PROJECT'; name: string; folderId?: number | null }
  | { type: 'UPDATE_PROJECT'; projectId: number; context?: string; folderId?: number | null; setFolder?: boolean }
  | { type: 'DELETE_PROJECT'; projectId: number }
  | { type: 'GET_FOLDERS' }
  | { type: 'CREATE_FOLDER'; name: string }
  | { type: 'UPDATE_FOLDER'; folderId: number; context: string }
  | { type: 'DELETE_FOLDER'; folderId: number }
  | { type: 'GET_PAGES'; projectId: number }
  | { type: 'DELETE_PAGE'; pageId: number }
  | { type: 'GET_TEST_CASES'; pageId: number }
  | { type: 'CLASSIFY_PAGE'; pageId: number }
  | { type: 'GENERATE_TEST_CASES'; projectId: number; deep: boolean }
  | { type: 'GET_JOB'; jobId: string }
  | { type: 'GET_ACTIVE_JOB' }
  | { type: 'SEARCH'; query: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Pick<Settings, 'model' | 'reasoningEffort'> }
  | { type: 'GET_EXPORT_DATA'; projectId: number };

/** content script로 보내는 수집 요청 */
export interface CollectRequest {
  type: 'COLLECT_PAGE';
  deep: boolean;
}

/** 테스트케이스 + 입력값을 묶은 뷰 모델 */
export interface TestCaseWithInputs extends TestCase {
  inputs: InputData[];
}

/** Export용으로 프로젝트 전체를 조인한 데이터 */
export interface ExportBundle {
  project: Project;
  pages: Array<{
    page: Page;
    testCases: TestCaseWithInputs[];
  }>;
}

/** 생성 완료 결과 */
export interface GenerateResult {
  pageId: number;
  testCaseCount: number;
}

/** Generate 요청 시작 응답: 서버 잡 id */
export interface JobHandle {
  jobId: string;
}

/** 모든 응답의 공통 봉투 */
export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** 요청 타입별 응답 데이터 매핑 */
export interface ResponseDataMap {
  GET_PROJECTS: Project[];
  CREATE_PROJECT: Project;
  UPDATE_PROJECT: Project;
  DELETE_PROJECT: null;
  GET_FOLDERS: Folder[];
  CREATE_FOLDER: Folder;
  UPDATE_FOLDER: Folder;
  DELETE_FOLDER: null;
  GET_PAGES: Page[];
  DELETE_PAGE: null;
  GET_TEST_CASES: TestCaseWithInputs[];
  CLASSIFY_PAGE: { classified: number };
  GENERATE_TEST_CASES: JobHandle;
  GET_JOB: JobStatus;
  GET_ACTIVE_JOB: (JobStatus & { projectId: number }) | null;
  SEARCH: SearchResult[];
  GET_SETTINGS: Settings;
  SAVE_SETTINGS: null;
  GET_EXPORT_DATA: ExportBundle;
}

export type { PageAnalysis };

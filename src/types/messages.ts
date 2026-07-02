import type {
  InputData,
  Page,
  Project,
  SearchResult,
  TestCase,
} from './models';
import type { PageAnalysis } from './dom';

/** 확장 내부 메시지 프로토콜 (popup/dashboard ↔ background, background ↔ content) */

export interface Settings {
  apiKey: string;
  model: string;
}

/** background로 보내는 요청 메시지 */
export type RuntimeRequest =
  | { type: 'GET_PROJECTS' }
  | { type: 'CREATE_PROJECT'; name: string }
  | { type: 'DELETE_PROJECT'; projectId: number }
  | { type: 'GET_PAGES'; projectId: number }
  | { type: 'DELETE_PAGE'; pageId: number }
  | { type: 'GET_TEST_CASES'; pageId: number }
  | { type: 'GET_INPUT_DATA'; testcaseId: number }
  | { type: 'GENERATE_TEST_CASES'; projectId: number; deep: boolean }
  | { type: 'SEARCH'; query: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Settings }
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

/** 생성 완료 응답 */
export interface GenerateResult {
  pageId: number;
  testCaseCount: number;
}

/** 모든 응답의 공통 봉투 */
export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** 요청 타입별 응답 데이터 매핑 */
export interface ResponseDataMap {
  GET_PROJECTS: Project[];
  CREATE_PROJECT: Project;
  DELETE_PROJECT: null;
  GET_PAGES: Page[];
  DELETE_PAGE: null;
  GET_TEST_CASES: TestCaseWithInputs[];
  GET_INPUT_DATA: InputData[];
  GENERATE_TEST_CASES: GenerateResult;
  SEARCH: SearchResult[];
  GET_SETTINGS: Settings;
  SAVE_SETTINGS: null;
  GET_EXPORT_DATA: ExportBundle;
}

export type { PageAnalysis };

/** SQLite에 저장되는 도메인 모델 정의 */

/** 프로젝트를 묶어서 관리하는 폴더 */
export interface Folder {
  id: number;
  name: string;
  /** 폴더 안 모든 프로젝트의 생성 시 AI에게 함께 전달되는 공통 정보 */
  context: string;
  createdAt: string;
}

export interface Project {
  id: number;
  name: string;
  /** 소속 폴더. null이면 미분류 */
  folderId: number | null;
  /** AI에게 매 생성마다 함께 전달되는 프로젝트 추가 정보 */
  context: string;
  createdAt: string;
}

export interface Page {
  id: number;
  projectId: number;
  url: string;
  title: string;
  /** 심층 분석 시에만 저장되는 원본 HTML (선택) */
  html: string | null;
  /** 구조화된 DOM 분석 결과(JSON 문자열) */
  domJson: string;
  analyzedAt: string;
}

export type Priority = 'High' | 'Medium' | 'Low';

/** gpt-4o-mini가 분류하는 난이도. ''는 미분류(분류 전) */
export type Difficulty = 'Easy' | 'Medium' | 'Hard' | '';

/** gpt-4o-mini가 분류하는 테스트 방식. ''는 미분류 */
export type TestType = 'functional' | 'boundary' | 'exception' | 'ui' | '';

export interface TestCase {
  id: number;
  pageId: number;
  /** TC-001 형식의 표시용 ID */
  tcId: string;
  feature: string;
  purpose: string;
  priority: Priority;
  /** 테스트 절차 목록 */
  steps: string[];
  expectedResult: string;
  difficulty: Difficulty;
  testType: TestType;
}

export interface InputData {
  id: number;
  testcaseId: number;
  field: string;
  value: string;
  /** normal | boundary | exception 등 입력값 분류 */
  category: string;
}

export interface PromptHistory {
  id: number;
  prompt: string;
  response: string;
  createdAt: string;
}

/** 검색 결과 한 건: 어떤 컨텍스트에서 매칭됐는지 함께 반환 */
export interface SearchResult {
  projectId: number;
  projectName: string;
  pageId: number;
  pageUrl: string;
  pageTitle: string;
  testCaseId: number | null;
  tcId: string | null;
  feature: string | null;
  matchedIn: 'project' | 'page' | 'testcase' | 'input';
  snippet: string;
}

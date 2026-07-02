/** SQLite에 저장되는 도메인 모델 정의 */

export interface Project {
  id: number;
  name: string;
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

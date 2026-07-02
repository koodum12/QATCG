/** content script가 수집하는 페이지 분석 결과 타입 */

/** 구조화된 DOM 트리 노드. 의미 있는 요소만 남기고 정제된 형태 */
export interface DomNode {
  tag: string;
  /** QA 관점에서 의미 있는 속성만 추출 */
  attrs: Record<string, string>;
  /** 요소의 대표 텍스트 (버튼 라벨, 링크 텍스트 등, 최대 80자) */
  text?: string;
  children?: DomNode[];
}

/** 페이지 내 요소 유형별 개수 집계 */
export interface ElementStats {
  inputs: number;
  buttons: number;
  links: number;
  forms: number;
  tables: number;
  selects: number;
  checkboxes: number;
  radios: number;
  textareas: number;
  dialogs: number;
  modals: number;
  navigations: number;
  breadcrumbs: number;
  tabs: number;
  accordions: number;
  paginations: number;
  scripts: number;
  iframes: number;
}

/** 페이지 특성 플래그 */
export interface PageFlags {
  hasInfiniteScrollHint: boolean;
  hasShadowDom: boolean;
  hasIframe: boolean;
}

/** content script → background 로 전달되는 전체 분석 페이로드 */
export interface PageAnalysis {
  url: string;
  title: string;
  /** 심층 분석 시에만 포함되는 원본 HTML */
  html: string | null;
  dom: DomNode;
  stats: ElementStats;
  flags: PageFlags;
  /** fetch/XHR 리소스 타이밍에서 감지한 API 호출 URL 목록 */
  apiCalls: string[];
}

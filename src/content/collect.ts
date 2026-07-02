import type {
  DomNode,
  ElementStats,
  PageAnalysis,
  PageFlags,
} from '@/types/dom';

/**
 * 페이지 DOM을 QA 분석용 구조화 JSON으로 변환하는 순수 함수 모음.
 * content script(index.ts)에서 호출되며, jsdom 환경에서 단위 테스트 가능하다.
 */

/** AI에게 의미 없는 태그 — 트리에서 완전히 제거 */
const SKIP_TAGS = new Set([
  'script',
  'style',
  'svg',
  'noscript',
  'meta',
  'link',
  'template',
  'br',
  'hr',
]);

/** QA 관점에서 항상 보존하는 인터랙티브/구조 태그 */
const INTERESTING_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'form',
  'table',
  'dialog',
  'nav',
  'iframe',
  'label',
  'option',
  'details',
  'summary',
]);

/** 요소에서 추출하는 QA 관련 속성 목록 */
const ATTRS_TO_KEEP = [
  'id',
  'name',
  'type',
  'placeholder',
  'aria-label',
  'role',
  'required',
  'maxlength',
  'minlength',
  'pattern',
  'readonly',
  'disabled',
  'href',
  'value',
  'checked',
  'action',
  'method',
  'for',
  'title',
  'alt',
];

const MAX_TEXT_LENGTH = 80;
const MAX_DEPTH = 25;
const MAX_CLASS_LENGTH = 100;

/** 요소에서 보존 대상 속성만 추출 */
export function extractAttrs(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const name of ATTRS_TO_KEEP) {
    const value = el.getAttribute(name);
    if (value !== null && value !== '') attrs[name] = value;
    // boolean 속성은 빈 문자열로 존재할 수 있으므로 존재 여부만 기록
    else if (value === '' && ['required', 'readonly', 'disabled', 'checked'].includes(name)) {
      attrs[name] = 'true';
    }
  }
  const cls = el.getAttribute('class');
  if (cls) attrs.class = cls.slice(0, MAX_CLASS_LENGTH);
  return attrs;
}

/** 요소의 직접 텍스트(자식 요소 텍스트 제외)를 추출 */
function directText(el: Element): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

/**
 * DOM 요소를 재귀적으로 순회하며 정제된 트리를 만든다.
 * - SKIP_TAGS 제거
 * - 의미 없는 래퍼(div/span 등, 속성·텍스트 없고 자식 1개)는 평탄화
 */
export function buildDomTree(el: Element, depth = 0): DomNode | null {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;
  if (depth > MAX_DEPTH) return null;

  const attrs = extractAttrs(el);
  const text = directText(el);

  const children: DomNode[] = [];
  for (const child of Array.from(el.children)) {
    const node = buildDomTree(child, depth + 1);
    if (node) children.push(node);
  }
  // Shadow DOM 내부도 순회
  const shadow = (el as HTMLElement).shadowRoot;
  if (shadow) {
    for (const child of Array.from(shadow.children)) {
      const node = buildDomTree(child, depth + 1);
      if (node) children.push(node);
    }
  }

  const isInteresting =
    INTERESTING_TAGS.has(tag) || Object.keys(attrs).length > 0 || text.length > 0;

  // 의미 없는 래퍼 평탄화: 자식이 하나뿐이면 자식으로 대체
  if (!isInteresting) {
    if (children.length === 1) return children[0];
    if (children.length === 0) return null;
  }

  const node: DomNode = { tag, attrs };
  if (text) node.text = text;
  if (children.length > 0) node.children = children;
  return node;
}

/** 요소 유형별 개수 집계 */
export function collectStats(doc: Document): ElementStats {
  const count = (selector: string): number => doc.querySelectorAll(selector).length;
  return {
    inputs: count('input'),
    buttons: count('button, input[type="button"], input[type="submit"], [role="button"]'),
    links: count('a[href]'),
    forms: count('form'),
    tables: count('table'),
    selects: count('select'),
    checkboxes: count('input[type="checkbox"]'),
    radios: count('input[type="radio"]'),
    textareas: count('textarea'),
    dialogs: count('dialog, [role="dialog"], [role="alertdialog"]'),
    modals: count('.modal, [class*="modal"], [aria-modal="true"]'),
    navigations: count('nav, [role="navigation"]'),
    breadcrumbs: count('[aria-label*="breadcrumb" i], .breadcrumb, [class*="breadcrumb"]'),
    tabs: count('[role="tablist"], [role="tab"]'),
    accordions: count('details, [aria-expanded], .accordion, [class*="accordion"]'),
    paginations: count('.pagination, [class*="pagination"], [aria-label*="pagination" i], [rel="next"], [rel="prev"]'),
    scripts: count('script'),
    iframes: count('iframe'),
  };
}

/** Shadow DOM 존재 여부 검사 (성능을 위해 최대 2000개 요소까지만) */
export function detectShadowDom(doc: Document): boolean {
  const all = doc.querySelectorAll('*');
  const limit = Math.min(all.length, 2000);
  for (let i = 0; i < limit; i++) {
    if ((all[i] as HTMLElement).shadowRoot) return true;
  }
  return false;
}

/** 무한 스크롤 힌트: 로딩 센티널/무한스크롤 클래스 존재 여부 휴리스틱 */
export function detectInfiniteScrollHint(doc: Document): boolean {
  return (
    doc.querySelector(
      '[class*="infinite"], [data-infinite-scroll], [class*="load-more"], [class*="loadmore"]',
    ) !== null
  );
}

/** 페이지 특성 플래그 수집 */
export function collectFlags(doc: Document): PageFlags {
  return {
    hasInfiniteScrollHint: detectInfiniteScrollHint(doc),
    hasShadowDom: detectShadowDom(doc),
    hasIframe: doc.querySelectorAll('iframe').length > 0,
  };
}

/** Performance API에서 fetch/XHR 호출 흔적 수집 (최대 30건) */
export function collectApiCalls(win: Window): string[] {
  try {
    const entries = win.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const calls = entries
      .filter((e) => e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')
      .map((e) => e.name);
    return Array.from(new Set(calls)).slice(0, 30);
  } catch {
    return [];
  }
}

/**
 * 페이지 전체 분석 수행.
 * @param deep true면 원본 HTML도 포함(심층 분석)
 */
export function collectPageAnalysis(doc: Document, win: Window, deep: boolean): PageAnalysis {
  const dom = buildDomTree(doc.body) ?? { tag: 'body', attrs: {} };
  return {
    url: win.location.href,
    title: doc.title,
    html: deep ? doc.documentElement.outerHTML : null,
    dom,
    stats: collectStats(doc),
    flags: collectFlags(doc),
    apiCalls: collectApiCalls(win),
  };
}

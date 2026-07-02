// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildDomTree,
  collectFlags,
  collectPageAnalysis,
  collectStats,
} from './collect';
import type { DomNode } from '@/types/dom';

/** 트리에서 조건에 맞는 노드를 찾는 헬퍼 */
function findNode(node: DomNode, pred: (n: DomNode) => boolean): DomNode | null {
  if (pred(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, pred);
    if (found) return found;
  }
  return null;
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('buildDomTree', () => {
  it('로그인 폼을 구조화하고 QA 속성을 보존한다', () => {
    setBody(`
      <form action="/login" method="post">
        <input type="email" name="email" placeholder="이메일" required maxlength="50" />
        <input type="password" name="password" required />
        <input type="checkbox" name="remember" />
        <button type="submit">로그인</button>
      </form>
      <a href="/signup">Sign Up</a>
    `);
    const tree = buildDomTree(document.body)!;

    const form = findNode(tree, (n) => n.tag === 'form')!;
    expect(form.attrs.action).toBe('/login');

    const email = findNode(tree, (n) => n.tag === 'input' && n.attrs.name === 'email')!;
    expect(email.attrs.type).toBe('email');
    expect(email.attrs.placeholder).toBe('이메일');
    expect(email.attrs.required).toBe('true');
    expect(email.attrs.maxlength).toBe('50');

    const button = findNode(tree, (n) => n.tag === 'button')!;
    expect(button.text).toBe('로그인');

    const link = findNode(tree, (n) => n.tag === 'a')!;
    expect(link.attrs.href).toBe('/signup');
    expect(link.text).toBe('Sign Up');
  });

  it('script/style/svg/noscript를 제거한다', () => {
    setBody(`
      <div>
        <script>alert(1)</script>
        <style>.a{}</style>
        <svg><circle /></svg>
        <noscript>no js</noscript>
        <button>OK</button>
      </div>
    `);
    const tree = buildDomTree(document.body)!;
    expect(findNode(tree, (n) => n.tag === 'script')).toBeNull();
    expect(findNode(tree, (n) => n.tag === 'style')).toBeNull();
    expect(findNode(tree, (n) => n.tag === 'svg')).toBeNull();
    expect(findNode(tree, (n) => n.tag === 'noscript')).toBeNull();
    expect(findNode(tree, (n) => n.tag === 'button')).not.toBeNull();
  });

  it('의미 없는 중첩 래퍼를 평탄화한다', () => {
    setBody(`<div><div><div><button>Buy</button></div></div></div>`);
    const tree = buildDomTree(document.body)!;
    // body 바로 아래가 button이 되어야 함 (래퍼 3단 제거)
    const button = findNode(tree, (n) => n.tag === 'button')!;
    expect(button.text).toBe('Buy');
    // 트리 깊이가 얕아졌는지 확인: body → button
    expect(tree.children?.[0].tag ?? tree.tag).toBe('button');
  });

  it('aria-label과 role을 보존한다', () => {
    setBody(`<div role="dialog" aria-label="확인 창"><p>계속할까요?</p></div>`);
    const tree = buildDomTree(document.body)!;
    const dialog = findNode(tree, (n) => n.attrs.role === 'dialog')!;
    expect(dialog.attrs['aria-label']).toBe('확인 창');
  });
});

describe('collectStats', () => {
  it('요소 유형별 개수를 집계한다', () => {
    setBody(`
      <form>
        <input type="text" /><input type="checkbox" /><input type="radio" />
        <select><option>1</option></select>
        <textarea></textarea>
        <button>Submit</button>
      </form>
      <a href="/a">A</a><a href="/b">B</a>
      <table><tr><td>1</td></tr></table>
      <nav>menu</nav>
      <div class="breadcrumb">home &gt; page</div>
      <div role="tablist"><div role="tab">T1</div></div>
      <div class="pagination">1 2 3</div>
      <iframe src="about:blank"></iframe>
    `);
    const stats = collectStats(document);
    expect(stats.inputs).toBe(3);
    expect(stats.checkboxes).toBe(1);
    expect(stats.radios).toBe(1);
    expect(stats.selects).toBe(1);
    expect(stats.textareas).toBe(1);
    expect(stats.buttons).toBe(1);
    expect(stats.links).toBe(2);
    expect(stats.tables).toBe(1);
    expect(stats.navigations).toBe(1);
    expect(stats.breadcrumbs).toBe(1);
    expect(stats.tabs).toBe(2);
    expect(stats.paginations).toBe(1);
    expect(stats.iframes).toBe(1);
  });
});

describe('collectFlags', () => {
  it('iframe과 무한스크롤 힌트를 감지한다', () => {
    setBody(`<div class="infinite-scroll-container"></div><iframe></iframe>`);
    const flags = collectFlags(document);
    expect(flags.hasIframe).toBe(true);
    expect(flags.hasInfiniteScrollHint).toBe(true);
  });

  it('없으면 false', () => {
    setBody(`<p>plain page</p>`);
    const flags = collectFlags(document);
    expect(flags.hasIframe).toBe(false);
    expect(flags.hasInfiniteScrollHint).toBe(false);
    expect(flags.hasShadowDom).toBe(false);
  });
});

describe('collectPageAnalysis', () => {
  it('deep=false면 html이 null, deep=true면 원본 HTML 포함', () => {
    setBody(`<button>OK</button>`);
    const shallow = collectPageAnalysis(document, window, false);
    expect(shallow.html).toBeNull();
    expect(shallow.url).toContain('localhost');
    expect(shallow.dom).toBeTruthy();

    const deep = collectPageAnalysis(document, window, true);
    expect(deep.html).toContain('<button>OK</button>');
  });
});

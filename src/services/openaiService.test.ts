import { describe, expect, it, vi } from 'vitest';
import { generateTestCases } from './openaiService';
import type { PageAnalysis } from '@/types/dom';

const ANALYSIS: PageAnalysis = {
  url: 'https://example.com/login',
  title: 'Login',
  html: null,
  dom: { tag: 'body', attrs: {}, children: [{ tag: 'form', attrs: { action: '/login' } }] },
  stats: {
    inputs: 2, buttons: 1, links: 2, forms: 1, tables: 0, selects: 0,
    checkboxes: 1, radios: 0, textareas: 0, dialogs: 0, modals: 0,
    navigations: 0, breadcrumbs: 0, tabs: 0, accordions: 0, paginations: 0,
    scripts: 3, iframes: 0,
  },
  flags: { hasInfiniteScrollHint: false, hasShadowDom: false, hasIframe: false },
  apiCalls: ['https://example.com/api/session'],
};

const AI_JSON = JSON.stringify({
  testCases: [
    {
      tcId: 'TC-001',
      feature: '로그인',
      purpose: '정상 로그인',
      priority: 'High',
      steps: ['입력', '클릭'],
      inputs: [{ field: 'email', value: 'a@a.com', category: 'normal' }],
      expectedResult: '성공',
    },
  ],
});

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('generateTestCases', () => {
  it('정상 응답을 파싱해 반환한다', async () => {
    const fetchFn = mockFetch(200, {
      choices: [{ message: { content: AI_JSON } }],
    });
    const out = await generateTestCases(ANALYSIS, { apiKey: 'sk-test', fetchFn });
    expect(out.response.testCases).toHaveLength(1);
    expect(out.prompt).toContain('https://example.com/login');
    expect(out.prompt).toContain('DOM 구조 (JSON)');
    expect(out.rawResponse).toBe(AI_JSON);
  });

  it('API 키가 없으면 에러', async () => {
    await expect(generateTestCases(ANALYSIS, { apiKey: '' })).rejects.toThrow(
      'API 키가 설정되지 않았습니다',
    );
  });

  it('401이면 키 오류 메시지', async () => {
    const fetchFn = mockFetch(401, { error: 'unauthorized' });
    await expect(
      generateTestCases(ANALYSIS, { apiKey: 'sk-bad', fetchFn }),
    ).rejects.toThrow('유효하지 않습니다');
  });

  it('429면 한도 초과 메시지', async () => {
    const fetchFn = mockFetch(429, {});
    await expect(
      generateTestCases(ANALYSIS, { apiKey: 'sk-test', fetchFn }),
    ).rejects.toThrow('한도를 초과');
  });

  it('심층 분석 시 HTML이 프롬프트에 포함된다', async () => {
    const fetchFn = mockFetch(200, {
      choices: [{ message: { content: AI_JSON } }],
    });
    const out = await generateTestCases(
      { ...ANALYSIS, html: '<html><body>deep</body></html>' },
      { apiKey: 'sk-test', fetchFn },
    );
    expect(out.prompt).toContain('원본 HTML (심층 분석)');
    expect(out.prompt).toContain('deep');
  });
});
